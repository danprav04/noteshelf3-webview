import React, { useEffect, useState, useCallback, useRef } from 'react';
import {
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  ZoomIn,
  ZoomOut,
  Maximize2,
  Minimize2,
  Download,
  Printer,
  Search,
  LayoutGrid,
  X,
  FileText
} from 'lucide-react';
import { DriveFileItem, ParsedNotebook } from '../types';
import { parseNsaFile } from '../lib/nsaParser';
import { PageCanvas } from './PageCanvas';
import { getDownloadUrl } from '../lib/api';

interface NotebookReaderProps {
  notebook: DriveFileItem;
  onClose: () => void;
}

export const NotebookReader: React.FC<NotebookReaderProps> = ({ notebook, onClose }) => {
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [parsed, setParsed] = useState<ParsedNotebook | null>(null);
  const [currentPage, setCurrentPage] = useState<number>(0);
  const [scale, setScale] = useState<number>(1.0);
  const [showThumbnails, setShowThumbnails] = useState<boolean>(false);
  const [showSearch, setShowSearch] = useState<boolean>(false);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [isFullscreen, setIsFullscreen] = useState<boolean>(false);

  const containerRef = useRef<HTMLDivElement | null>(null);

  // Fetch & Parse .nsa
  useEffect(() => {
    let active = true;

    async function loadNotebook() {
      setLoading(true);
      setError(null);
      try {
        const fileUrl = `/api/file?id=${notebook.id}&name=${encodeURIComponent(notebook.name)}`;
        const res = await fetch(fileUrl);
        if (!res.ok) {
          throw new Error(`Failed to download notebook (HTTP ${res.status})`);
        }
        let buffer = await res.arrayBuffer();

        // Check if response is accidentally an HTML virus scan warning page
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

        // Verify valid ZIP signature (PK)
        const bytes = new Uint8Array(buffer);
        if (bytes[0] !== 0x50 || bytes[1] !== 0x4B) {
          throw new Error('Downloaded file is not a valid Noteshelf archive (.nsa)');
        }

        if (!active) return;

        const result = await parseNsaFile(buffer, notebook.name.replace(/\.nsa$/i, ''));
        if (!active) return;

        setParsed(result);
        setCurrentPage(0);
      } catch (err: unknown) {
        if (!active) return;
        const msg = err instanceof Error ? err.message : String(err);
        setError(msg);
      } finally {
        if (active) setLoading(false);
      }
    }

    loadNotebook();

    return () => {
      active = false;
    };
  }, [notebook]);

  const totalPages = parsed?.pages.length || 0;

  const goToPrev = useCallback(() => {
    setCurrentPage((prev) => Math.max(0, prev - 1));
  }, []);

  const goToNext = useCallback(() => {
    setCurrentPage((prev) => Math.min(totalPages - 1, prev + 1));
  }, [totalPages]);

  // Keyboard navigation
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

      if (e.key === 'ArrowLeft' || e.key === 'PageUp' || e.key === '[') {
        goToPrev();
      } else if (e.key === 'ArrowRight' || e.key === 'PageDown' || e.key === ']' || e.key === ' ') {
        goToNext();
      } else if (e.key === 'Escape') {
        if (showSearch) setShowSearch(false);
        else if (showThumbnails) setShowThumbnails(false);
        else onClose();
      } else if (e.key === '+' || e.key === '=') {
        setScale((s) => Math.min(2.5, s + 0.15));
      } else if (e.key === '-') {
        setScale((s) => Math.max(0.5, s - 0.15));
      } else if (e.key === '0') {
        setScale(1.0);
      } else if (e.key === 'f' || e.key === 'F') {
        toggleFullscreen();
      }
    }

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [goToPrev, goToNext, onClose, showSearch, showThumbnails]);

  function toggleFullscreen() {
    if (!document.fullscreenElement) {
      containerRef.current?.requestFullscreen?.();
      setIsFullscreen(true);
    } else {
      document.exitFullscreen?.();
      setIsFullscreen(false);
    }
  }

  // Search in OCR text
  const searchResults = React.useMemo(() => {
    if (!parsed || !searchQuery.trim()) return [];
    const q = searchQuery.toLowerCase();
    const matches: { pageIndex: number; preview: string }[] = [];

    parsed.pages.forEach((page, idx) => {
      if (page.ocrText && page.ocrText.toLowerCase().includes(q)) {
        const matchIdx = page.ocrText.toLowerCase().indexOf(q);
        const start = Math.max(0, matchIdx - 30);
        const end = Math.min(page.ocrText.length, matchIdx + q.length + 40);
        matches.push({
          pageIndex: idx,
          preview: page.ocrText.slice(start, end).replace(/\n/g, ' ')
        });
      }
    });

    return matches;
  }, [parsed, searchQuery]);

  return (
    <div
      ref={containerRef}
      className="fixed inset-0 z-50 bg-[#08090A] text-zinc-100 flex flex-col select-none overflow-hidden"
    >
      {/* Top Navigation Bar */}
      <header className="h-14 border-b border-white/[0.08] bg-[#0E0F12]/90 backdrop-blur-md px-4 flex items-center justify-between z-20">
        <div className="flex items-center gap-3 min-w-0">
          <button
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-white/10 text-zinc-400 hover:text-white transition-colors"
            title="Back to library (Esc)"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div className="min-w-0">
            <h2 className="text-sm font-semibold text-white truncate max-w-[200px] sm:max-w-md">
              {notebook.name.replace(/\.nsa$/i, '')}
            </h2>
            <p className="text-[11px] text-zinc-400 truncate">
              {notebook.path}
            </p>
          </div>
        </div>

        {/* Center Page Controls */}
        {totalPages > 0 && (
          <div className="flex items-center gap-2 bg-[#1A1B1F] border border-white/10 rounded-lg px-2.5 py-1">
            <button
              onClick={goToPrev}
              disabled={currentPage <= 0}
              className="p-1 rounded hover:bg-white/10 disabled:opacity-30 disabled:hover:bg-transparent transition-colors"
              title="Previous page (Left arrow)"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <span className="text-xs font-mono font-medium text-zinc-200 min-w-[70px] text-center">
              {currentPage + 1} / {totalPages}
            </span>
            <button
              onClick={goToNext}
              disabled={currentPage >= totalPages - 1}
              className="p-1 rounded hover:bg-white/10 disabled:opacity-30 disabled:hover:bg-transparent transition-colors"
              title="Next page (Right arrow)"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* Right Tools */}
        <div className="flex items-center gap-1.5">
          {/* Zoom Controls */}
          <div className="hidden sm:flex items-center gap-1 bg-[#1A1B1F] border border-white/10 rounded-lg px-1.5 py-0.5">
            <button
              onClick={() => setScale((s) => Math.max(0.5, s - 0.15))}
              className="p-1.5 rounded hover:bg-white/10 text-zinc-300"
              title="Zoom out (-)"
            >
              <ZoomOut className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => setScale(1.0)}
              className="px-2 text-xs font-mono text-zinc-400 hover:text-white"
              title="Reset zoom (0)"
            >
              {Math.round(scale * 100)}%
            </button>
            <button
              onClick={() => setScale((s) => Math.min(2.5, s + 0.15))}
              className="p-1.5 rounded hover:bg-white/10 text-zinc-300"
              title="Zoom in (+)"
            >
              <ZoomIn className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Search in OCR */}
          <button
            onClick={() => setShowSearch(!showSearch)}
            className={`p-2 rounded-lg transition-colors ${showSearch ? 'bg-indigo-600 text-white' : 'hover:bg-white/10 text-zinc-400 hover:text-white'}`}
            title="Search notes"
          >
            <Search className="w-4 h-4" />
          </button>

          {/* Thumbnails overview */}
          <button
            onClick={() => setShowThumbnails(!showThumbnails)}
            className={`p-2 rounded-lg transition-colors ${showThumbnails ? 'bg-indigo-600 text-white' : 'hover:bg-white/10 text-zinc-400 hover:text-white'}`}
            title="Page thumbnails"
          >
            <LayoutGrid className="w-4 h-4" />
          </button>

          {/* Print / Save to PDF */}
          <button
            onClick={() => window.print()}
            className="p-2 rounded-lg hover:bg-white/10 text-zinc-400 hover:text-white transition-colors"
            title="Print / Save as PDF"
          >
            <Printer className="w-4 h-4" />
          </button>

          {/* Download Original .nsa */}
          <a
            href={getDownloadUrl(notebook.id, notebook.name)}
            className="p-2 rounded-lg hover:bg-white/10 text-zinc-400 hover:text-white transition-colors"
            title="Download .nsa file"
          >
            <Download className="w-4 h-4" />
          </a>

          {/* Fullscreen */}
          <button
            onClick={toggleFullscreen}
            className="p-2 rounded-lg hover:bg-white/10 text-zinc-400 hover:text-white transition-colors"
            title="Fullscreen (F)"
          >
            {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
          </button>
        </div>
      </header>

      {/* Main Content Area */}
      <div className="flex-1 relative flex overflow-hidden">
        {/* Left Thumbnails Drawer (optional) */}
        {showThumbnails && parsed && (
          <aside className="w-64 border-r border-white/10 bg-[#0F1012] p-4 overflow-y-auto flex flex-col gap-3 z-10 animate-in slide-in-from-left duration-200">
            <div className="flex items-center justify-between pb-2 border-b border-white/5">
              <span className="text-xs font-semibold uppercase tracking-wider text-zinc-400">
                Pages ({totalPages})
              </span>
              <button
                onClick={() => setShowThumbnails(false)}
                className="p-1 rounded hover:bg-white/10 text-zinc-400"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="grid grid-cols-2 gap-2.5">
              {parsed.pages.map((p, idx) => (
                <div
                  key={p.uuid}
                  onClick={() => setCurrentPage(idx)}
                  className={`group relative rounded-md border p-1 cursor-pointer transition-all ${currentPage === idx ? 'border-indigo-500 bg-indigo-500/10' : 'border-white/10 hover:border-white/20 bg-zinc-900'}`}
                >
                  <div className="aspect-[3/4] bg-zinc-950 rounded flex items-center justify-center overflow-hidden">
                    <span className="text-xs text-zinc-600 font-mono">
                      p. {idx + 1}
                    </span>
                  </div>
                  <div className="mt-1 text-center text-[10px] font-mono text-zinc-400">
                    {p.isCover ? 'Cover' : `Page ${idx + 1}`}
                  </div>
                </div>
              ))}
            </div>
          </aside>
        )}

        {/* Right Search Drawer (optional) */}
        {showSearch && parsed && (
          <aside className="w-72 border-r border-white/10 bg-[#0F1012] p-4 overflow-y-auto flex flex-col gap-3 z-10 animate-in slide-in-from-left duration-200">
            <div className="flex items-center justify-between pb-2 border-b border-white/5">
              <span className="text-xs font-semibold uppercase tracking-wider text-zinc-400">
                OCR Search
              </span>
              <button
                onClick={() => setShowSearch(false)}
                className="p-1 rounded hover:bg-white/10 text-zinc-400"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="relative">
              <Search className="w-4 h-4 absolute left-2.5 top-2.5 text-zinc-500" />
              <input
                type="text"
                placeholder="Search recognized handwriting..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                autoFocus
                className="w-full bg-[#18191D] border border-white/10 rounded-lg pl-8 pr-3 py-1.5 text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-indigo-500"
              />
            </div>

            <div className="flex-1 overflow-y-auto flex flex-col gap-2 mt-2">
              {searchQuery && searchResults.length === 0 && (
                <p className="text-xs text-zinc-500 text-center py-4">No text matches found.</p>
              )}
              {searchResults.map((match, i) => (
                <div
                  key={i}
                  onClick={() => setCurrentPage(match.pageIndex)}
                  className={`p-2.5 rounded-lg border text-left cursor-pointer transition-colors ${currentPage === match.pageIndex ? 'border-indigo-500 bg-indigo-500/10' : 'border-white/5 hover:border-white/15 bg-zinc-900/60'}`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-semibold text-indigo-400 font-mono">
                      Page {match.pageIndex + 1}
                    </span>
                  </div>
                  <p className="text-xs text-zinc-300 line-clamp-2">
                    ...{match.preview}...
                  </p>
                </div>
              ))}
            </div>
          </aside>
        )}

        {/* Stage Wrapper (fixed viewport container for centered navigation) */}
        <div className="flex-1 relative flex flex-col min-w-0 overflow-hidden">
          {/* Scrollable Stage */}
          <main className="flex-1 overflow-auto p-4 bg-[#08090A]">
            {loading && (
              <div className="min-w-full min-h-full flex flex-col items-center justify-center gap-3 text-zinc-400 py-12">
                <div className="w-10 h-10 border-3 border-indigo-500 border-t-transparent rounded-full animate-spin" />
                <p className="text-xs font-medium tracking-wide">Downloading & rendering notebook...</p>
              </div>
            )}

            {error && (
              <div className="min-w-full min-h-full flex items-center justify-center py-12">
                <div className="flex flex-col items-center gap-3 text-red-400 max-w-md text-center p-6 bg-red-950/20 border border-red-900/30 rounded-xl">
                  <FileText className="w-8 h-8 text-red-400" />
                  <p className="text-sm font-semibold">Could not open notebook</p>
                  <p className="text-xs text-zinc-400">{error}</p>
                  <button
                    onClick={onClose}
                    className="mt-2 px-4 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-xs font-medium text-white cursor-pointer"
                  >
                    Close
                  </button>
                </div>
              </div>
            )}

            {!loading && !error && parsed && parsed.pages.length > 0 && (
              <div className="min-w-full min-h-full flex items-center justify-center py-6">
                <div className="m-auto transition-transform flex items-center justify-center">
                  <PageCanvas
                    page={parsed.pages[currentPage]}
                    pdfTemplates={parsed.pdfTemplates}
                    scale={scale}
                  />
                </div>
              </div>
            )}
          </main>

          {/* Floating Chevrons for Quick Page Turn - Fixed to viewport center */}
          {totalPages > 1 && !loading && (
            <div className="pointer-events-none absolute inset-0 flex items-center justify-between px-6 z-20">
              <button
                onClick={goToPrev}
                disabled={currentPage <= 0}
                className="pointer-events-auto w-11 h-11 rounded-full bg-zinc-900/80 hover:bg-zinc-800 border border-white/10 text-white backdrop-blur-md flex items-center justify-center shadow-xl disabled:opacity-0 disabled:pointer-events-none transition-all cursor-pointer"
                title="Previous page (Left arrow)"
              >
                <ChevronLeft className="w-6 h-6" />
              </button>
              <button
                onClick={goToNext}
                disabled={currentPage >= totalPages - 1}
                className="pointer-events-auto w-11 h-11 rounded-full bg-zinc-900/80 hover:bg-zinc-800 border border-white/10 text-white backdrop-blur-md flex items-center justify-center shadow-xl disabled:opacity-0 disabled:pointer-events-none transition-all cursor-pointer"
                title="Next page (Right arrow)"
              >
                <ChevronRight className="w-6 h-6" />
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
