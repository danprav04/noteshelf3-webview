import React, { useState } from 'react';
import { BookMarked, ShieldCheck, ArrowRight, RefreshCw, AlertCircle } from 'lucide-react';
import { extractFolderId, fetchFolderContents } from '../lib/api';

interface WelcomeSetupProps {
  onConnect: (url: string) => void;
}

export const WelcomeSetup: React.FC<WelcomeSetupProps> = ({ onConnect }) => {
  const [url, setUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const folderId = extractFolderId(url);
    if (!folderId) {
      setError('Please enter a valid Google Drive folder URL or ID.');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      await fetchFolderContents(folderId);
      onConnect(url);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(`Could not access folder: ${msg}. Please ensure sharing is set to "Anyone with the link can view".`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen w-screen flex flex-col items-center justify-center bg-[#08090A] text-zinc-100 p-4 select-none">
      <div className="w-full max-w-md bg-[#141518] border border-white/10 rounded-2xl shadow-2xl p-7 flex flex-col gap-6">
        {/* Brand Header */}
        <div className="flex flex-col items-center text-center gap-3">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-indigo-600 to-violet-500 flex items-center justify-center text-white shadow-lg shadow-indigo-500/25">
            <BookMarked className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight text-white">
              Noteshelf 3 Web Viewer
            </h1>
            <p className="text-xs text-zinc-400 mt-1">
              Browse, search, and view your digital notebooks directly from your Google Drive backup.
            </p>
          </div>
        </div>

        {/* Input Form */}
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold uppercase tracking-wider text-zinc-400">
              Google Drive Folder Link
            </label>
            <input
              type="text"
              value={url}
              onChange={(e) => {
                setUrl(e.target.value);
                setError(null);
              }}
              placeholder="https://drive.google.com/drive/folders/..."
              autoFocus
              className="w-full bg-[#0E0F12] border border-white/10 focus:border-indigo-500/60 rounded-xl px-3.5 py-2.5 text-xs text-white placeholder-zinc-600 focus:outline-none focus:ring-1 focus:ring-indigo-500/50 font-mono transition-all"
            />
          </div>

          {error && (
            <div className="p-3 rounded-xl bg-red-950/30 border border-red-800/40 text-red-300 text-xs flex items-start gap-2">
              <AlertCircle className="w-4 h-4 text-red-400 flex-shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          <button
            type="submit"
            disabled={loading || !url.trim()}
            className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-xs font-semibold bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-white shadow-lg shadow-indigo-600/25 transition-all cursor-pointer"
          >
            {loading ? (
              <>
                <RefreshCw className="w-4 h-4 animate-spin" />
                <span>Connecting...</span>
              </>
            ) : (
              <>
                <span>Connect Backup</span>
                <ArrowRight className="w-4 h-4" />
              </>
            )}
          </button>
        </form>

        {/* Privacy Note */}
        <div className="p-3 rounded-xl bg-zinc-900/40 border border-white/5 flex items-start gap-2.5 text-[11px] text-zinc-500 leading-relaxed">
          <ShieldCheck className="w-4 h-4 text-indigo-400 flex-shrink-0 mt-0.5" />
          <span>
            <strong className="text-zinc-300">100% Client-Side Privacy:</strong> Your link is stored only in this browser's <code className="text-zinc-400 font-mono">localStorage</code>. No server saves or logs your backup.
          </span>
        </div>
      </div>
    </div>
  );
};
