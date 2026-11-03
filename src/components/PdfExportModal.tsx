import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  X,
  FileDown,
  Sun,
  Moon,
  Loader2,
  Check,
  AlertCircle,
  Sliders,
  Sparkles
} from 'lucide-react';
import { DriveFileItem, NotebookDarkModeStyle, ParsedNotebook } from '../types';
import {
  isNotebookOriginallyDark,
  getPdfFilterString,
  generatePdfBlob,
  downloadBlob,
  loadAndParseNotebook,
  PdfExportProgress
} from '../lib/pdfExporter';
import { renderNotebookPageToCanvas } from '../lib/canvasRenderer';
import { getStoredNotebookTheme } from '../lib/theme';

interface PdfExportModalProps {
  notebook: DriveFileItem;
  parsedNotebook?: ParsedNotebook | null;
  onClose: () => void;
}

export const PdfExportModal: React.FC<PdfExportModalProps> = ({
  notebook,
  parsedNotebook,
  onClose
}) => {
  const [parsed, setParsed] = useState<ParsedNotebook | null>(parsedNotebook || null);
  const [loadingNotebook, setLoadingNotebook] = useState<boolean>(!parsedNotebook);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Selection state
  const [selectedMode, setSelectedMode] = useState<'original' | 'converted'>('original');
  const [darkStyle, setDarkStyle] = useState<NotebookDarkModeStyle>(() => getStoredNotebookTheme().style);
  const [invertCover, setInvertCover] = useState<boolean>(false);
  const [smartInvert, setSmartInvert] = useState<boolean>(true);
  const [quality, setQuality] = useState<'standard' | 'high'>('standard');
  const [showAdvanced, setShowAdvanced] = useState<boolean>(false);

  // Export progress state
  const [exporting, setExporting] = useState<boolean>(false);
  const [progress, setProgress] = useState<PdfExportProgress | null>(null);
  const [exportError, setExportError] = useState<string | null>(null);
  const [exportComplete, setExportComplete] = useState<boolean>(false);

  const abortControllerRef = useRef<AbortController | null>(null);
  const previewCanvasRef = useRef<HTMLCanvasElement | null>(null);

  // Load notebook if not provided
  useEffect(() => {
    if (parsedNotebook) {
      setParsed(parsedNotebook);
      setLoadingNotebook(false);
      return;
    }

    let isCancelled = false;
    setLoadingNotebook(true);
    setLoadError(null);

    loadAndParseNotebook(notebook)
      .then((data) => {
        if (!isCancelled) {
          setParsed(data);
          setLoadingNotebook(false);
        }
      })
      .catch((err: unknown) => {
        if (!isCancelled) {
          const msg = err instanceof Error ? err.message : String(err);
          setLoadError(msg);
          setLoadingNotebook(false);
        }
      });

    return () => {
      isCancelled = true;
    };
  }, [notebook, parsedNotebook]);

  // Determine if notebook is originally dark
  const isOriginallyDark = useMemo(() => {
    if (!parsed) return false;
    return isNotebookOriginallyDark(parsed.pages);
  }, [parsed]);

  // Choose sample page for live preview (prefer first content page, fallback to page 0)
  const samplePage = useMemo(() => {
    if (!parsed || parsed.pages.length === 0) return null;
    return parsed.pages.find((p) => !p.isCover) || parsed.pages[0];
  }, [parsed]);

  // Render preview canvas whenever samplePage is ready
  useEffect(() => {
    if (!samplePage || !parsed) return;
    const canvas = previewCanvasRef.current;
    if (!canvas) return;

    const abortCtrl = new AbortController();
    renderNotebookPageToCanvas(
      canvas,
      samplePage,
      parsed.pdfTemplates,
      parsed.resources,
      undefined,
      abortCtrl.signal
    );

    return () => {
      abortCtrl.abort();
    };
  }, [samplePage, parsed]);

  // Compute CSS filter for live preview thumbnail
  const previewFilter = useMemo(() => {
    if (!samplePage) return 'none';
    return getPdfFilterString(isOriginallyDark, selectedMode, samplePage, {
      invertCover,
      smartInvert,
      darkStyle
    });
  }, [isOriginallyDark, selectedMode, samplePage, invertCover, smartInvert, darkStyle]);

  // Handle Export Click
  const handleExport = async () => {
    if (!parsed || exporting) return;

    setExporting(true);
    setExportError(null);
    setExportComplete(false);
    setProgress({ current: 0, total: parsed.pages.length, percent: 0, status: 'Initializing PDF...' });

    const abortCtrl = new AbortController();
    abortControllerRef.current = abortCtrl;

    try {
      const blob = await generatePdfBlob(parsed, {
        isNotebookDark: isOriginallyDark,
        targetMode: selectedMode,
        darkStyle,
        invertCover,
        smartInvert,
        quality,
        signal: abortCtrl.signal,
        onProgress: (p) => setProgress(p)
      });

      // Construct descriptive filename
      const cleanTitle = notebook.name.replace(/\.nsa$/i, '');
      let suffix = '';
      if (selectedMode === 'converted') {
        suffix = isOriginallyDark ? ' (Light)' : ' (Dark)';
      }
      const filename = `${cleanTitle}${suffix}.pdf`;

      downloadBlob(blob, filename);
      setExportComplete(true);
    } catch (err: unknown) {
      if (abortCtrl.signal.aborted) {
        setExportError('Export was cancelled.');
      } else {
        const msg = err instanceof Error ? err.message : String(err);
        setExportError(msg);
      }
    } finally {
      setExporting(false);
      abortControllerRef.current = null;
    }
  };

  const handleCancelExport = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
  };

  const totalPages = parsed?.pages.length || 0;
  const cleanTitle = notebook.name.replace(/\.nsa$/i, '');

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-in fade-in duration-150">
      <div
        className="w-full max-w-lg bg-[#121316] border border-white/10 rounded-2xl shadow-2xl flex flex-col overflow-hidden text-zinc-100"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="px-5 py-4 border-b border-white/[0.08] flex items-center justify-between bg-[#16171B]">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-9 h-9 rounded-xl bg-indigo-600/20 border border-indigo-500/30 flex items-center justify-center text-indigo-400">
              <FileDown className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <h3 className="text-sm font-semibold text-white truncate">
                Download as PDF
              </h3>
              <p className="text-xs text-zinc-400 truncate">
                {cleanTitle} {totalPages > 0 ? `• ${totalPages} pages` : ''}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            disabled={exporting}
            className="p-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-white/10 disabled:opacity-40 transition-colors cursor-pointer"
            title="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-5 flex flex-col gap-4 max-h-[75vh] overflow-y-auto">
          {/* Loading Notebook State */}
          {loadingNotebook && (
            <div className="py-12 flex flex-col items-center justify-center gap-3 text-zinc-400">
              <Loader2 className="w-8 h-8 text-indigo-500 animate-spin" />
              <p className="text-xs font-medium">Downloading & parsing notebook structure...</p>
            </div>
          )}

          {/* Loading Error */}
          {loadError && (
            <div className="p-4 rounded-xl bg-red-950/30 border border-red-900/40 text-red-300 text-xs flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold text-red-200">Failed to load notebook</p>
                <p className="mt-0.5 text-zinc-400">{loadError}</p>
              </div>
            </div>
          )}

          {!loadingNotebook && !loadError && parsed && (
            <>
              {/* Context info banner */}
              <div className="flex items-center justify-between px-3 py-2 rounded-lg bg-zinc-900/80 border border-white/5 text-xs">
                <span className="text-zinc-400">Detected original notebook theme:</span>
                <span className="inline-flex items-center gap-1.5 font-medium px-2 py-0.5 rounded text-[11px] bg-zinc-800 text-zinc-200 border border-white/10">
                  {isOriginallyDark ? (
                    <>
                      <Moon className="w-3 h-3 text-indigo-400" />
                      Dark Paper
                    </>
                  ) : (
                    <>
                      <Sun className="w-3 h-3 text-amber-400" />
                      Light Paper
                    </>
                  )}
                </span>
              </div>

              {/* Mode Selection Section */}
              <div className="flex flex-col gap-2">
                <label className="text-xs font-medium text-zinc-300">
                  Export Theme Option
                </label>
                <div className="grid grid-cols-2 gap-3">
                  {/* Option 1: Original */}
                  <div
                    onClick={() => !exporting && setSelectedMode('original')}
                    className={`relative p-3.5 rounded-xl border cursor-pointer transition-all flex flex-col justify-between ${
                      selectedMode === 'original'
                        ? 'border-indigo-500 bg-indigo-500/10 ring-1 ring-indigo-500/30'
                        : 'border-white/10 hover:border-white/20 bg-zinc-900/40'
                    } ${exporting ? 'opacity-60 cursor-not-allowed' : ''}`}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        {isOriginallyDark ? (
                          <Moon className="w-4 h-4 text-zinc-300" />
                        ) : (
                          <Sun className="w-4 h-4 text-amber-400" />
                        )}
                        <span className="text-xs font-semibold text-white">Original</span>
                      </div>
                      <span className="text-[10px] px-1.5 py-0.2 rounded bg-zinc-800 text-zinc-300 border border-white/5 font-mono">
                        {isOriginallyDark ? 'Dark' : 'Light'}
                      </span>
                    </div>
                    <p className="text-[11px] text-zinc-400 leading-snug">
                      {isOriginallyDark
                        ? 'Preserve original dark paper background and ink'
                        : 'Preserve original bright paper background and ink'}
                    </p>
                  </div>

                  {/* Option 2: Converted (Light if originally dark, Dark if originally light) */}
                  <div
                    onClick={() => !exporting && setSelectedMode('converted')}
                    className={`relative p-3.5 rounded-xl border cursor-pointer transition-all flex flex-col justify-between ${
                      selectedMode === 'converted'
                        ? 'border-indigo-500 bg-indigo-500/10 ring-1 ring-indigo-500/30'
                        : 'border-white/10 hover:border-white/20 bg-zinc-900/40'
                    } ${exporting ? 'opacity-60 cursor-not-allowed' : ''}`}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        {isOriginallyDark ? (
                          <Sun className="w-4 h-4 text-amber-400" />
                        ) : (
                          <Moon className="w-4 h-4 text-indigo-400" />
                        )}
                        <span className="text-xs font-semibold text-white">
                          {isOriginallyDark ? 'Light' : 'Dark'}
                        </span>
                      </div>
                      <span className="text-[10px] px-1.5 py-0.2 rounded bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 font-medium">
                        Convert
                      </span>
                    </div>
                    <p className="text-[11px] text-zinc-400 leading-snug">
                      {isOriginallyDark
                        ? 'Invert dark paper to clean white paper (ideal for printing)'
                        : 'Invert bright paper to dark mode (gentle on eyes)'}
                    </p>
                  </div>
                </div>
              </div>

              {/* Live Preview Card */}
              <div className="flex items-center gap-3.5 p-3 rounded-xl bg-zinc-900/60 border border-white/5">
                <div className="relative w-16 h-22 rounded bg-zinc-950 overflow-hidden flex-shrink-0 border border-white/10 flex items-center justify-center shadow-inner">
                  <canvas
                    ref={previewCanvasRef}
                    style={{
                      maxWidth: '100%',
                      maxHeight: '100%',
                      filter: previewFilter,
                      transition: 'filter 0.2s ease',
                      display: 'block'
                    }}
                  />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <Sparkles className="w-3.5 h-3.5 text-indigo-400" />
                    <span className="text-[11px] font-semibold text-indigo-300">Live Preview</span>
                  </div>
                  <h4 className="text-xs font-medium text-white mt-0.5 truncate">
                    {selectedMode === 'original'
                      ? (isOriginallyDark ? 'Original Dark Theme' : 'Original Light Theme')
                      : (isOriginallyDark ? 'Converted Light Theme' : 'Converted Dark Theme')}
                  </h4>
                  <p className="text-[11px] text-zinc-400 mt-1 leading-relaxed line-clamp-2">
                    {selectedMode === 'original'
                      ? 'Exports document using exact colors as drawn.'
                      : (isOriginallyDark
                        ? 'Black paper turns to white paper; ink hues & highlighters are preserved.'
                        : 'White paper turns to dark tone; ink hues & highlighters are preserved.')}
                  </p>
                </div>
              </div>

              {/* Dark Tone Preset (Visible if target is Dark) */}
              {((isOriginallyDark && selectedMode === 'original') || (!isOriginallyDark && selectedMode === 'converted')) && (
                <div className="flex flex-col gap-1.5 pt-1">
                  <label className="text-xs font-medium text-zinc-300">
                    Dark Tone Preset
                  </label>
                  <div className="grid grid-cols-3 gap-2">
                    {(
                      [
                        { id: 'charcoal', label: 'Charcoal', desc: 'Soft Dark' },
                        { id: 'oled', label: 'OLED', desc: 'True Black' },
                        { id: 'warm', label: 'Warm', desc: 'Amber Shift' }
                      ] as const
                    ).map((style) => (
                      <button
                        key={style.id}
                        type="button"
                        disabled={exporting}
                        onClick={() => setDarkStyle(style.id)}
                        className={`flex flex-col items-center justify-center p-2 rounded-lg border text-center transition-all cursor-pointer ${
                          darkStyle === style.id
                            ? 'border-indigo-500 bg-indigo-500/15 text-white'
                            : 'border-white/5 hover:border-white/15 bg-zinc-900/60 text-zinc-400 hover:text-zinc-200'
                        }`}
                      >
                        <span className="text-xs font-medium">{style.label}</span>
                        <span className="text-[9px] text-zinc-500">{style.desc}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Advanced Options Accordion */}
              <div className="border-t border-white/5 pt-2">
                <button
                  type="button"
                  onClick={() => setShowAdvanced(!showAdvanced)}
                  className="flex items-center justify-between w-full text-xs text-zinc-400 hover:text-white transition-colors py-1 cursor-pointer"
                >
                  <span className="flex items-center gap-1.5">
                    <Sliders className="w-3.5 h-3.5" />
                    Advanced Conversion Options
                  </span>
                  <span className="text-[11px] text-zinc-500">
                    {showAdvanced ? 'Hide' : 'Show'}
                  </span>
                </button>

                {showAdvanced && (
                  <div className="mt-2.5 flex flex-col gap-2.5 pl-1 animate-in fade-in duration-100">
                    <label className="flex items-center gap-2 cursor-pointer text-xs text-zinc-300 hover:text-white">
                      <input
                        type="checkbox"
                        checked={!invertCover}
                        onChange={(e) => setInvertCover(!e.target.checked)}
                        disabled={exporting}
                        className="rounded border-zinc-700 bg-zinc-900 text-indigo-600 focus:ring-indigo-500/40 w-3.5 h-3.5 cursor-pointer"
                      />
                      <span>Keep cover page artwork original</span>
                    </label>

                    <label className="flex items-center gap-2 cursor-pointer text-xs text-zinc-300 hover:text-white">
                      <input
                        type="checkbox"
                        checked={smartInvert}
                        onChange={(e) => setSmartInvert(e.target.checked)}
                        disabled={exporting}
                        className="rounded border-zinc-700 bg-zinc-900 text-indigo-600 focus:ring-indigo-500/40 w-3.5 h-3.5 cursor-pointer"
                      />
                      <span>Smart Invert (skip pages already in target tone)</span>
                    </label>

                    <div className="flex items-center justify-between pt-1">
                      <span className="text-xs text-zinc-400">PDF Image Quality</span>
                      <div className="flex items-center bg-zinc-900 border border-white/10 rounded-lg p-0.5">
                        <button
                          type="button"
                          onClick={() => setQuality('standard')}
                          className={`px-2 py-1 text-[11px] rounded transition-colors cursor-pointer ${
                            quality === 'standard' ? 'bg-indigo-600 text-white' : 'text-zinc-400 hover:text-white'
                          }`}
                        >
                          Standard (Fast JPEG)
                        </button>
                        <button
                          type="button"
                          onClick={() => setQuality('high')}
                          className={`px-2 py-1 text-[11px] rounded transition-colors cursor-pointer ${
                            quality === 'high' ? 'bg-indigo-600 text-white' : 'text-zinc-400 hover:text-white'
                          }`}
                        >
                          High (Lossless PNG)
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Export Progress Bar */}
              {exporting && progress && (
                <div className="p-3.5 rounded-xl bg-zinc-900/90 border border-indigo-500/30 flex flex-col gap-2">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-medium text-zinc-200 flex items-center gap-2">
                      <Loader2 className="w-3.5 h-3.5 text-indigo-400 animate-spin" />
                      {progress.status}
                    </span>
                    <span className="font-mono text-indigo-400 font-semibold">{progress.percent}%</span>
                  </div>
                  <div className="w-full bg-zinc-800 rounded-full h-1.5 overflow-hidden">
                    <div
                      className="bg-indigo-500 h-full rounded-full transition-all duration-150"
                      style={{ width: `${progress.percent}%` }}
                    />
                  </div>
                </div>
              )}

              {/* Export Success Banner */}
              {exportComplete && (
                <div className="p-3 rounded-xl bg-emerald-950/30 border border-emerald-800/40 text-emerald-300 text-xs flex items-center gap-2.5">
                  <Check className="w-4 h-4 text-emerald-400 shrink-0" />
                  <span>PDF exported and downloaded successfully!</span>
                </div>
              )}

              {/* Export Error */}
              {exportError && (
                <div className="p-3 rounded-xl bg-red-950/30 border border-red-900/40 text-red-300 text-xs flex items-center gap-2.5">
                  <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />
                  <span>{exportError}</span>
                </div>
              )}
            </>
          )}
        </div>

        {/* Modal Footer */}
        <div className="px-5 py-3.5 border-t border-white/[0.08] bg-[#16171B] flex items-center justify-between">
          <button
            type="button"
            onClick={exporting ? handleCancelExport : onClose}
            className="px-3.5 py-1.5 rounded-lg border border-white/10 hover:bg-white/5 text-xs text-zinc-300 hover:text-white transition-colors cursor-pointer"
          >
            {exporting ? 'Cancel Export' : 'Close'}
          </button>

          {!loadingNotebook && !loadError && (
            <button
              type="button"
              disabled={exporting}
              onClick={handleExport}
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-xs font-semibold text-white shadow-md shadow-indigo-600/20 transition-all cursor-pointer"
            >
              {exporting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Exporting...</span>
                </>
              ) : (
                <>
                  <FileDown className="w-4 h-4" />
                  <span>
                    Download {selectedMode === 'converted' ? (isOriginallyDark ? 'Light PDF' : 'Dark PDF') : 'PDF'}
                  </span>
                </>
              )}
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
