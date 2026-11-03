import * as pdfjsLib from 'pdfjs-dist';
import { NotebookPage } from '../types';

// Ensure PDF.js worker is initialized
if (!pdfjsLib.GlobalWorkerOptions.workerSrc) {
  pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.10.38/pdf.worker.min.mjs';
}

/**
 * Renders a full-resolution notebook page (background, PDF template, images, and vector strokes)
 * onto the provided HTMLCanvasElement.
 */
export async function renderNotebookPageToCanvas(
  canvas: HTMLCanvasElement,
  page: NotebookPage,
  pdfTemplates: Map<string, Uint8Array>,
  resources?: Map<string, Uint8Array>,
  pdfDocCache?: Map<string, any>,
  signal?: AbortSignal
): Promise<void> {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const targetWidth = page.width || 1600;
  const targetHeight = page.height || 2560;

  canvas.width = targetWidth;
  canvas.height = targetHeight;

  // 1. Draw Background Fill
  ctx.fillStyle = page.bgColor || '#FFFFFF';
  ctx.fillRect(0, 0, targetWidth, targetHeight);

  if (signal?.aborted) return;

  // 2. Render Associated PDF Template (if present)
  if (page.associatedPDF && pdfTemplates.has(page.associatedPDF)) {
    try {
      let pdfDoc = pdfDocCache?.get(page.associatedPDF);
      if (!pdfDoc) {
        const pdfBytes = pdfTemplates.get(page.associatedPDF)!;
        const loadingTask = pdfjsLib.getDocument({ data: pdfBytes.slice(0) });
        pdfDoc = await loadingTask.promise;
        pdfDocCache?.set(page.associatedPDF, pdfDoc);
      }

      if (signal?.aborted) return;

      const pageIndex = Math.min(page.associatedPageIndex || 1, pdfDoc.numPages);
      const pdfPage = await pdfDoc.getPage(pageIndex);

      // Compute viewport scaling to match target dimensions
      const unscaledViewport = pdfPage.getViewport({ scale: 1 });
      const scaleX = targetWidth / unscaledViewport.width;
      const scaleY = targetHeight / unscaledViewport.height;
      const pdfScale = Math.min(scaleX, scaleY);

      const viewport = pdfPage.getViewport({ scale: pdfScale });

      // Create offscreen canvas for PDF rendering
      const offscreen = document.createElement('canvas');
      offscreen.width = targetWidth;
      offscreen.height = targetHeight;
      const offscreenCtx = offscreen.getContext('2d');

      if (offscreenCtx) {
        await pdfPage.render({
          canvasContext: offscreenCtx,
          viewport
        }).promise;

        if (!signal?.aborted) {
          ctx.drawImage(offscreen, 0, 0);
        }
      }
    } catch (err) {
      console.warn('Failed to render PDF template for page:', err);
    }
  }

  if (signal?.aborted) return;

  // 2.5. Render Embedded Images (annotationType = 2)
  if (resources) {
    for (const annot of page.annotations) {
      if (signal?.aborted) return;

      if (annot.type === 2 && annot.imageResourceName && annot.bounds) {
        const imgBytes = resources.get(annot.imageResourceName);
        if (imgBytes) {
          try {
            const blob = new Blob([imgBytes.buffer as ArrayBuffer], { type: 'image/png' });
            const blobUrl = URL.createObjectURL(blob);
            const img = new Image();
            await new Promise<void>((resolve, reject) => {
              img.onload = () => resolve();
              img.onerror = () => reject();
              img.src = blobUrl;
            });
            if (!signal?.aborted) {
              ctx.drawImage(img, annot.bounds.x, annot.bounds.y, annot.bounds.w, annot.bounds.h);
            }
            URL.revokeObjectURL(blobUrl);
          } catch (err) {
            console.warn('Failed to render embedded image annotation:', err);
          }
        }
      }
    }
  }

  if (signal?.aborted) return;

  // 3. Render Vector Inks
  for (const annot of page.annotations) {
    if (signal?.aborted) return;
    if (!annot.segments || annot.segments.length === 0) continue;

    ctx.strokeStyle = annot.hexColor;
    ctx.lineWidth = (annot.strokeWidth || 2) * 1.4;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    ctx.beginPath();
    for (let i = 0; i < annot.segments.length; i++) {
      const seg = annot.segments[i];
      if (i === 0) {
        ctx.moveTo(seg.x, seg.y);
      } else {
        const prev = annot.segments[i - 1];
        if (Math.abs(seg.x - prev.nx) > 1.0 || Math.abs(seg.y - prev.ny) > 1.0) {
          ctx.moveTo(seg.x, seg.y);
        }
      }
      if (seg.x === seg.nx && seg.y === seg.ny) {
        ctx.lineTo(seg.nx + 0.1, seg.ny);
      } else {
        ctx.lineTo(seg.nx, seg.ny);
      }
    }
    ctx.stroke();
  }
}
