import { DriveFileItem, NotebookDarkModeStyle, NotebookPage, ParsedNotebook } from '../types';
import { isDarkColor } from './theme';
import { renderNotebookPageToCanvas } from './canvasRenderer';
import { parseNsaFile } from './nsaParser';

export interface PdfExportProgress {
  current: number;
  total: number;
  percent: number;
  status: string;
}

export interface PdfExportOptions {
  isNotebookDark: boolean;
  targetMode: 'original' | 'converted';
  darkStyle?: NotebookDarkModeStyle;
  invertCover?: boolean;
  smartInvert?: boolean;
  quality?: 'standard' | 'high';
  onProgress?: (progress: PdfExportProgress) => void;
  signal?: AbortSignal;
}

/**
 * Determines if a notebook is originally dark by inspecting its content pages.
 */
export function isNotebookOriginallyDark(pages: NotebookPage[]): boolean {
  if (!pages || pages.length === 0) return false;
  const contentPages = pages.filter((p) => !p.isCover);
  const targetPages = contentPages.length > 0 ? contentPages : pages;
  const darkCount = targetPages.filter((p) => isDarkColor(p.bgColor)).length;
  return darkCount > targetPages.length / 2;
}

/**
 * Computes the CSS filter string to apply when exporting a page to PDF.
 */
export function getPdfFilterString(
  isNotebookDark: boolean,
  targetMode: 'original' | 'converted',
  page: NotebookPage,
  options: {
    invertCover?: boolean;
    smartInvert?: boolean;
    darkStyle?: NotebookDarkModeStyle;
  }
): string {
  if (targetMode === 'original') {
    return 'none';
  }

  // Cover pages stay in original colors unless explicitly inverted
  if (page.isCover && !options.invertCover) {
    return 'none';
  }

  const isPageDark = isDarkColor(page.bgColor);

  if (isNotebookDark) {
    // Originally dark notebook -> convert to Light mode
    // If smart invert is enabled and page is already light, skip inversion
    if (options.smartInvert && !isPageDark) {
      return 'none';
    }
    // High-contrast clean white paper with preserved stroke hues
    return 'invert(1) hue-rotate(180deg)';
  } else {
    // Originally light notebook -> convert to Dark mode
    // If smart invert is enabled and page is already dark, skip inversion
    if (options.smartInvert && isPageDark) {
      return 'none';
    }
    switch (options.darkStyle) {
      case 'oled':
        return 'invert(1) hue-rotate(180deg)';
      case 'warm':
        return 'invert(0.90) sepia(0.35) hue-rotate(160deg) contrast(0.95)';
      case 'charcoal':
      default:
        return 'invert(0.92) hue-rotate(180deg) contrast(0.96)';
    }
  }
}

/**
 * Applies a CSS filter to a canvas by drawing it onto a new offscreen canvas.
 */
export function applyFilterToCanvas(
  sourceCanvas: HTMLCanvasElement,
  filter: string
): HTMLCanvasElement {
  if (!filter || filter === 'none') {
    return sourceCanvas;
  }

  const outputCanvas = document.createElement('canvas');
  outputCanvas.width = sourceCanvas.width;
  outputCanvas.height = sourceCanvas.height;
  const ctx = outputCanvas.getContext('2d');
  if (!ctx) return sourceCanvas;

  try {
    ctx.filter = filter;
    ctx.drawImage(sourceCanvas, 0, 0);

    // Fallback if browser ignored ctx.filter
    if (ctx.filter === 'none' && filter.startsWith('invert')) {
      const imgData = ctx.getImageData(0, 0, outputCanvas.width, outputCanvas.height);
      const d = imgData.data;
      for (let i = 0; i < d.length; i += 4) {
        d[i] = 255 - d[i];
        d[i + 1] = 255 - d[i + 1];
        d[i + 2] = 255 - d[i + 2];
      }
      ctx.putImageData(imgData, 0, 0);
    }
  } catch (err) {
    console.warn('Canvas filter failed, using raw output:', err);
    ctx.drawImage(sourceCanvas, 0, 0);
  }

  return outputCanvas;
}

/**
 * Downloads and parses a .nsa notebook file from Google Drive.
 */
export async function loadAndParseNotebook(notebook: DriveFileItem): Promise<ParsedNotebook> {
  const fileUrl = `/api/file?id=${notebook.id}&name=${encodeURIComponent(notebook.name)}`;
  const res = await fetch(fileUrl);
  if (!res.ok) {
    throw new Error(`Failed to download notebook (HTTP ${res.status})`);
  }
  let buffer = await res.arrayBuffer();

  // Check if response is accidentally a Google Drive virus scan warning page
  const prefix = new TextDecoder().decode(buffer.slice(0, 100));
  if (prefix.toLowerCase().includes('<!doctype') || prefix.toLowerCase().includes('<html')) {
    const html = new TextDecoder().decode(buffer);
    const formMatch = html.match(/<form[^>]*action="([^"]+)"[^>]*>([\s\S]*?)<\/form>/i);
    if (formMatch) {
      const action = formMatch[1];
      const inputs = formMatch[2];
      const params = new URLSearchParams();
      const inputRegex = /<input[^>]*name="([^"]+)"[^>]*value="([^"]*)"/gi;
      let m;
      while ((m = inputRegex.exec(inputs)) !== null) {
        params.set(m[1], m[2]);
      }
      const confirmedUrl = `${action}?${params.toString()}`;
      const confirmedRes = await fetch(confirmedUrl);
      if (!confirmedRes.ok) throw new Error('Google virus scan confirmation failed');
      buffer = await confirmedRes.arrayBuffer();
    }
  }

  const bytes = new Uint8Array(buffer);
  if (bytes[0] !== 0x50 || bytes[1] !== 0x4B) {
    throw new Error('Downloaded file is not a valid Noteshelf archive (.nsa)');
  }

  return parseNsaFile(buffer, notebook.name.replace(/\.nsa$/i, ''));
}

/**
 * Generates a multi-page PDF Blob from a ParsedNotebook with light/dark conversion support.
 */
export async function generatePdfBlob(
  parsed: ParsedNotebook,
  options: PdfExportOptions
): Promise<Blob> {
  const { PDFDocument } = await import('pdf-lib');
  const pdfDoc = await PDFDocument.create();

  const pdfDocCache = new Map<string, any>();
  const total = parsed.pages.length;

  for (let i = 0; i < total; i++) {
    if (options.signal?.aborted) {
      throw new Error('PDF export cancelled');
    }

    const page = parsed.pages[i];
    const pageNum = i + 1;
    const percent = Math.round(((pageNum - 1) / total) * 100);

    options.onProgress?.({
      current: pageNum,
      total,
      percent,
      status: `Rendering page ${pageNum} of ${total}...`
    });

    // 1. Render raw page to canvas
    const rawCanvas = document.createElement('canvas');
    await renderNotebookPageToCanvas(
      rawCanvas,
      page,
      parsed.pdfTemplates,
      parsed.resources,
      pdfDocCache,
      options.signal
    );

    if (options.signal?.aborted) {
      throw new Error('PDF export cancelled');
    }

    // 2. Apply theme filter if requested
    const filter = getPdfFilterString(options.isNotebookDark, options.targetMode, page, {
      invertCover: options.invertCover ?? false,
      smartInvert: options.smartInvert ?? true,
      darkStyle: options.darkStyle ?? 'charcoal'
    });

    const finalCanvas = applyFilterToCanvas(rawCanvas, filter);

    // 3. Compress to image Blob
    const isPng = options.quality === 'high';
    const mimeType = isPng ? 'image/png' : 'image/jpeg';
    const qualityParam = isPng ? undefined : 0.92;

    const imageBlob = await new Promise<Blob | null>((resolve) => {
      finalCanvas.toBlob((b) => resolve(b), mimeType, qualityParam);
    });

    if (!imageBlob) {
      throw new Error(`Failed to encode image for page ${pageNum}`);
    }

    const imageBytes = await imageBlob.arrayBuffer();

    // 4. Embed into PDF document
    const embeddedImage = isPng
      ? await pdfDoc.embedPng(imageBytes)
      : await pdfDoc.embedJpg(imageBytes);

    const pdfPage = pdfDoc.addPage([finalCanvas.width, finalCanvas.height]);
    pdfPage.drawImage(embeddedImage, {
      x: 0,
      y: 0,
      width: finalCanvas.width,
      height: finalCanvas.height
    });

    // Free canvas memory
    rawCanvas.width = 0;
    rawCanvas.height = 0;
    if (finalCanvas !== rawCanvas) {
      finalCanvas.width = 0;
      finalCanvas.height = 0;
    }

    // Yield to UI thread to keep UI responsive
    await new Promise((resolve) => setTimeout(resolve, 0));
  }

  options.onProgress?.({
    current: total,
    total,
    percent: 100,
    status: 'Compiling PDF document...'
  });

  const pdfBytes = await pdfDoc.save();
  const buffer = pdfBytes.buffer.slice(
    pdfBytes.byteOffset,
    pdfBytes.byteOffset + pdfBytes.byteLength
  ) as ArrayBuffer;
  return new Blob([buffer], { type: 'application/pdf' });
}

/**
 * Triggers a browser file download for a given Blob.
 */
export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}
