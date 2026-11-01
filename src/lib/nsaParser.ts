import * as zip from '@zip.js/zip.js';
import initSqlJs, { Database } from 'sql.js';
import { NotebookPage, ParsedNotebook, StrokeAnnotation, StrokeSegment } from '../types';

let sqlPromise: Promise<any> | null = null;

function getSqlJs() {
  if (!sqlPromise) {
    sqlPromise = initSqlJs({
      locateFile: () => 'https://sql.js.org/dist/sql-wasm.wasm'
    });
  }
  return sqlPromise;
}

/**
 * Parses Apple XML Plist string into a JavaScript object
 */
export function parsePlistXml(xmlStr: string): any {
  const parser = new DOMParser();
  const doc = parser.parseFromString(xmlStr, 'text/xml');
  const plistNode = doc.querySelector('plist');
  if (!plistNode || !plistNode.firstElementChild) return null;
  return parsePlistNode(plistNode.firstElementChild);
}

function parsePlistNode(node: Element): any {
  const tag = node.tagName.toLowerCase();
  switch (tag) {
    case 'dict': {
      const result: Record<string, any> = {};
      const children = Array.from(node.children);
      for (let i = 0; i < children.length; i += 2) {
        const keyNode = children[i];
        const valNode = children[i + 1];
        if (keyNode && valNode && keyNode.tagName.toLowerCase() === 'key') {
          const key = keyNode.textContent || '';
          result[key] = parsePlistNode(valNode);
        }
      }
      return result;
    }
    case 'array':
      return Array.from(node.children).map(parsePlistNode);
    case 'string':
      return node.textContent || '';
    case 'integer':
      return parseInt(node.textContent || '0', 10);
    case 'real':
      return parseFloat(node.textContent || '0');
    case 'true':
      return true;
    case 'false':
      return false;
    case 'data':
      return node.textContent || '';
    case 'date':
      return node.textContent || '';
    default:
      return node.textContent || null;
  }
}

/**
 * Parses a .nsa ZIP file buffer into a fully renderable ParsedNotebook
 */
export async function parseNsaFile(fileData: ArrayBuffer, title: string): Promise<ParsedNotebook> {
  const zipReader = new zip.ZipReader(new zip.Uint8ArrayReader(new Uint8Array(fileData)));
  const entries = await zipReader.getEntries();

  let documentPlistEntry: any | undefined;
  let coverEntry: any | undefined;
  let recognitionEntry: any | undefined;

  const annotationEntries = new Map<string, any>();
  const pdfTemplateEntries = new Map<string, any>();
  const resourceEntries = new Map<string, any>();

  for (const entry of entries) {
    if (entry.directory) continue;
    const filename = entry.filename;
    if (filename.endsWith('Document.plist')) {
      documentPlistEntry = entry;
    } else if (filename.endsWith('cover-shelf-image.png')) {
      coverEntry = entry;
    } else if (filename.includes('RecognitionFiles/') && filename.endsWith('.plist')) {
      recognitionEntry = entry;
    } else if (filename.includes('Annotations/') && !filename.endsWith('/')) {
      const uuid = filename.split('/').pop() || '';
      annotationEntries.set(uuid, entry);
    } else if (filename.includes('Templates/') && filename.endsWith('.ns_pdf')) {
      const pdfName = filename.split('/').pop() || '';
      pdfTemplateEntries.set(pdfName, entry);
    } else if (filename.includes('Resources/') && !filename.endsWith('/')) {
      const resName = filename.split('/').pop() || '';
      resourceEntries.set(resName, entry);
    }
  }

  // 1. Cover Image URL
  let coverImageUrl: string | undefined;
  if (coverEntry && typeof coverEntry.getData === 'function') {
    const blob = await coverEntry.getData(new zip.BlobWriter('image/png'));
    coverImageUrl = URL.createObjectURL(blob);
  }

  // 2. Parse OCR Recognition Text
  const ocrByPage = new Map<string, string>();
  if (recognitionEntry && typeof recognitionEntry.getData === 'function') {
    try {
      const text = await recognitionEntry.getData(new zip.TextWriter());
      const recPlist = parsePlistXml(text);
      if (recPlist && recPlist.pageRecognitionInfo) {
        for (const [uuid, info] of Object.entries<any>(recPlist.pageRecognitionInfo)) {
          if (info && info.recognisedText) {
            ocrByPage.set(uuid, info.recognisedText);
          }
        }
      }
    } catch {
      // ignore
    }
  }

  // 3. Extract Templates (PDFs)
  const pdfTemplates = new Map<string, Uint8Array>();
  for (const [pdfName, entry] of pdfTemplateEntries.entries()) {
    if (typeof entry.getData === 'function') {
      const bytes = await entry.getData(new zip.Uint8ArrayWriter());
      pdfTemplates.set(pdfName, bytes);
    }
  }

  // 4. Extract Resources
  const resources = new Map<string, Uint8Array>();
  for (const [resName, entry] of resourceEntries.entries()) {
    if (typeof entry.getData === 'function') {
      const bytes = await entry.getData(new zip.Uint8ArrayWriter());
      resources.set(resName, bytes);
    }
  }

  // 5. Parse Document.plist
  let rawPages: any[] = [];
  if (documentPlistEntry && typeof documentPlistEntry.getData === 'function') {
    const plistXml = await documentPlistEntry.getData(new zip.TextWriter());
    const docData = parsePlistXml(plistXml);
    if (docData && Array.isArray(docData.pages)) {
      rawPages = docData.pages;
    }
  }

  // 6. Initialize SQL.js for stroke parsing
  let SQL: any = null;
  try {
    SQL = await getSqlJs();
  } catch (err) {
    console.warn('Could not load SQL.js, strokes will not be rendered:', err);
  }

  const pages: NotebookPage[] = [];

  for (let i = 0; i < rawPages.length; i++) {
    const p = rawPages[i];
    const uuid: string = p.uuid || `page_${i}`;
    const isCover: boolean = !!p.isCover;
    let bgColor = (p.pageBGColor || 'FFFFFF').toUpperCase();
    if (!bgColor.startsWith('#')) bgColor = `#${bgColor}`;

    let width = 1600;
    let height = 2560;

    // Parse rect: {{0.0, 0.0}}, {1600.0, 2560.0}}
    if (p.pdfKitPageRect) {
      const m = p.pdfKitPageRect.match(/\{\s*([\d.]+)\s*,\s*([\d.]+)\s*\}\s*\}$/);
      if (m) {
        width = parseFloat(m[1]) || 1600;
        height = parseFloat(m[2]) || 2560;
      }
    }

    const associatedPDF = p.associatedPDFFileName;
    const associatedPageIndex = p.associatedPageIndex || 1;
    const ocrText = ocrByPage.get(uuid);

    // 7. Parse vector strokes from SQLite
    const annotations: StrokeAnnotation[] = [];
    const annotEntry = annotationEntries.get(uuid);

    if (annotEntry && typeof annotEntry.getData === 'function' && SQL) {
      try {
        const sqliteBytes = await annotEntry.getData(new zip.Uint8ArrayWriter());
        const db: Database = new SQL.Database(sqliteBytes);
        const query = 'SELECT id, strokeWidth, strokeColor, segmentCount, stroke_segments_v3, textHTMLForm, boundingRect_x, boundingRect_y, boundingRect_w, boundingRect_h FROM annotation';
        const rows = db.exec(query);

        if (rows.length > 0 && rows[0].values) {
          for (const row of rows[0].values) {
            const id = String(row[0]);
            const strokeWidth = Number(row[1]) || 2;
            const strokeColor = Number(row[2]) || 0;
            const segmentCount = Number(row[3]) || 0;
            const blob = row[4] as Uint8Array | null;
            const textHTMLForm = row[5] ? String(row[5]) : undefined;

            // Convert ARGB/RGB color integer to hex
            const r = (strokeColor >> 16) & 0xff;
            const g = (strokeColor >> 8) & 0xff;
            const b = strokeColor & 0xff;
            const hexColor = `#${((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1)}`;

            const segments: StrokeSegment[] = [];
            if (blob && segmentCount > 0) {
              const view = new DataView(blob.buffer, blob.byteOffset, blob.byteLength);
              for (let s = 0; s < segmentCount; s++) {
                const offset = s * 28;
                if (offset + 28 > blob.byteLength) break;
                const x = view.getFloat32(offset, true);
                const y = view.getFloat32(offset + 4, true);
                const nx = view.getFloat32(offset + 8, true);
                const ny = view.getFloat32(offset + 12, true);
                const w = view.getFloat32(offset + 16, true);
                const opacity = view.getFloat32(offset + 20, true);
                segments.push({ x, y, nx, ny, width: w, opacity });
              }
            }

            annotations.push({
              id,
              type: 0,
              strokeWidth,
              strokeColor,
              hexColor,
              segments,
              textHTMLForm,
              bounds: {
                x: Number(row[6]) || 0,
                y: Number(row[7]) || 0,
                w: Number(row[8]) || 0,
                h: Number(row[9]) || 0
              }
            });
          }
        }
        db.close();
      } catch (err) {
        console.warn(`Error reading annotations for page ${uuid}:`, err);
      }
    }

    pages.push({
      index: i,
      uuid,
      isCover,
      bgColor,
      width,
      height,
      associatedPDF,
      associatedPageIndex,
      annotations,
      ocrText
    });
  }

  await zipReader.close();

  return {
    title,
    pages,
    coverImageUrl,
    pdfTemplates,
    resources
  };
}
