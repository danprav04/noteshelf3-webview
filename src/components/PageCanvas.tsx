import React, { useEffect, useRef, useState, useMemo } from 'react';
import * as pdfjsLib from 'pdfjs-dist';
import { NotebookPage, NotebookThemeSettings } from '../types';
import { getCanvasFilter, isDarkColor } from '../lib/theme';

// Set up PDF.js worker
pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.10.38/pdf.worker.min.mjs';

interface PageCanvasProps {
  page: NotebookPage;
  pdfTemplates: Map<string, Uint8Array>;
  scale?: number;
  className?: string;
  themeSettings?: NotebookThemeSettings;
}

export const PageCanvas: React.FC<PageCanvasProps> = ({
  page,
  pdfTemplates,
  scale = 1,
  className = '',
  themeSettings
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [loading, setLoading] = useState<boolean>(true);

  const filterStyle = useMemo(() => {
    if (!themeSettings) return 'none';
    return getCanvasFilter(themeSettings, page.isCover, page.bgColor);
  }, [themeSettings, page.isCover, page.bgColor]);

  const isDarkEffective = filterStyle !== 'none' || isDarkColor(page.bgColor);


  useEffect(() => {
    let isCancelled = false;

    async function renderPage() {
      const canvas = canvasRef.current;
      if (!canvas) return;

      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      setLoading(true);

      const targetWidth = page.width || 1600;
      const targetHeight = page.height || 2560;

      canvas.width = targetWidth;
      canvas.height = targetHeight;

      // 1. Draw Background Fill
      ctx.fillStyle = page.bgColor || '#111111';
      ctx.fillRect(0, 0, targetWidth, targetHeight);

      // 2. Render Associated PDF Template (if present)
      if (page.associatedPDF && pdfTemplates.has(page.associatedPDF)) {
        try {
          const pdfBytes = pdfTemplates.get(page.associatedPDF)!;
          // Load document with pdfjs
          const loadingTask = pdfjsLib.getDocument({ data: pdfBytes.slice(0) });
          const pdfDoc = await loadingTask.promise;

          if (!isCancelled) {
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

              if (!isCancelled) {
                ctx.drawImage(offscreen, 0, 0);
              }
            }
          }
        } catch (err) {
          console.warn('Failed to render PDF template for page:', err);
        }
      }

      if (isCancelled) return;

      // 3. Render Vector Inks
      for (const annot of page.annotations) {
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
          }
          ctx.lineTo(seg.nx, seg.ny);
        }
        ctx.stroke();
      }

      if (!isCancelled) {
        setLoading(false);
      }
    }

    renderPage();

    return () => {
      isCancelled = true;
    };
  }, [page, pdfTemplates]);

  return (
    <div
      className={`relative flex items-center justify-center select-none rounded-sm overflow-hidden transition-all duration-200 ${
        isDarkEffective
          ? 'ring-1 ring-white/10 shadow-2xl shadow-black/80'
          : 'shadow-2xl shadow-black/50'
      } ${className}`}
    >
      {loading && (
        <div className="absolute inset-0 flex items-center justify-center bg-zinc-950/70 z-10 backdrop-blur-xs">
          <div className="w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
        </div>
      )}
      <canvas
        ref={canvasRef}
        style={{
          width: `${(page.width || 1600) * scale * 0.45}px`,
          height: `${(page.height || 2560) * scale * 0.45}px`,
          maxWidth: '100%',
          display: 'block',
          filter: filterStyle,
          transition: 'filter 0.2s ease'
        }}
        className="transition-all duration-75"
      />
    </div>
  );
};
