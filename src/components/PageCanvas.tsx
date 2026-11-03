import React, { useEffect, useRef, useState, useMemo } from 'react';
import { NotebookPage, NotebookThemeSettings } from '../types';
import { getCanvasFilter, isDarkColor } from '../lib/theme';
import { renderNotebookPageToCanvas } from '../lib/canvasRenderer';

interface PageCanvasProps {
  page: NotebookPage;
  pdfTemplates: Map<string, Uint8Array>;
  resources?: Map<string, Uint8Array>;
  scale?: number;
  className?: string;
  themeSettings?: NotebookThemeSettings;
}

export const PageCanvas: React.FC<PageCanvasProps> = ({
  page,
  pdfTemplates,
  resources,
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
    const abortCtrl = new AbortController();

    async function renderPage() {
      const canvas = canvasRef.current;
      if (!canvas) return;

      setLoading(true);
      try {
        await renderNotebookPageToCanvas(
          canvas,
          page,
          pdfTemplates,
          resources,
          undefined,
          abortCtrl.signal
        );
      } catch (err) {
        console.warn('Page rendering error:', err);
      } finally {
        if (!isCancelled) {
          setLoading(false);
        }
      }
    }

    renderPage();

    return () => {
      isCancelled = true;
      abortCtrl.abort();
    };
  }, [page, pdfTemplates, resources]);

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
