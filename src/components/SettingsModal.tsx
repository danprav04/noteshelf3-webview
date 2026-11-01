import React, { useState } from 'react';
import { X, ShieldCheck, CheckCircle2, AlertCircle, RefreshCw, Trash2 } from 'lucide-react';
import { extractFolderId, fetchFolderContents } from '../lib/api';

interface SettingsModalProps {
  currentUrl: string;
  onSave: (newUrl: string) => void;
  onClear: () => void;
  onClose: () => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  currentUrl,
  onSave,
  onClear,
  onClose
}) => {
  const [inputUrl, setInputUrl] = useState(currentUrl);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);

  const handleTestAndSave = async () => {
    const folderId = extractFolderId(inputUrl);
    if (!folderId) {
      setTestResult({
        success: false,
        message: 'Please enter a valid Google Drive folder URL or ID.'
      });
      return;
    }

    setTesting(true);
    setTestResult(null);

    try {
      const data = await fetchFolderContents(folderId);
      const totalItems = data.folders.length + data.files.length;
      setTestResult({
        success: true,
        message: `Connected successfully to "${data.title}" (${totalItems} items found).`
      });
      onSave(inputUrl);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setTestResult({
        success: false,
        message: `Connection failed: ${msg}. Make sure the folder sharing is set to "Anyone with the link can view".`
      });
    } finally {
      setTesting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 select-none animate-in fade-in duration-150">
      <div className="w-full max-w-lg bg-[#141518] border border-white/10 rounded-2xl shadow-2xl overflow-hidden flex flex-col">
        {/* Modal Header */}
        <div className="px-6 py-4 border-b border-white/[0.08] flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <h3 className="text-base font-semibold text-white">App Settings</h3>
            <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-indigo-500/15 text-indigo-300 border border-indigo-500/25">
              Client-Side
            </span>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg hover:bg-white/10 text-zinc-400 hover:text-white transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 flex flex-col gap-5">
          {/* URL Input */}
          <div className="flex flex-col gap-2">
            <label className="text-xs font-semibold uppercase tracking-wider text-zinc-400">
              Google Drive Backup URL
            </label>
            <p className="text-xs text-zinc-500">
              Paste the view-only Google Drive folder link containing your Noteshelf 3 backup.
            </p>
            <input
              type="text"
              value={inputUrl}
              onChange={(e) => {
                setInputUrl(e.target.value);
                setTestResult(null);
              }}
              placeholder="https://drive.google.com/drive/folders/..."
              className="w-full bg-[#0E0F12] border border-white/10 focus:border-indigo-500/60 rounded-xl px-3.5 py-2.5 text-xs text-white placeholder-zinc-600 focus:outline-none focus:ring-1 focus:ring-indigo-500/50 font-mono transition-all"
            />
          </div>

          {/* Test Status Banner */}
          {testResult && (
            <div
              className={`p-3 rounded-xl border text-xs flex items-start gap-2.5 ${
                testResult.success
                  ? 'bg-emerald-950/30 border-emerald-800/40 text-emerald-300'
                  : 'bg-red-950/30 border-red-800/40 text-red-300'
              }`}
            >
              {testResult.success ? (
                <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0 mt-0.5" />
              ) : (
                <AlertCircle className="w-4 h-4 text-red-400 flex-shrink-0 mt-0.5" />
              )}
              <span>{testResult.message}</span>
            </div>
          )}

          {/* Zero-Knowledge Privacy Guarantee Box */}
          <div className="p-3.5 rounded-xl bg-zinc-900/60 border border-white/5 flex items-start gap-3">
            <ShieldCheck className="w-5 h-5 text-indigo-400 flex-shrink-0 mt-0.5" />
            <div className="text-xs text-zinc-400 leading-relaxed">
              <span className="font-semibold text-zinc-200">Zero-Knowledge Storage:</span> Your Google Drive link is stored strictly in your browser's local memory (<code className="text-indigo-300 bg-white/5 px-1 py-0.5 rounded font-mono text-[11px]">localStorage</code>). It is never sent to, recorded on, or saved to any server database.
            </div>
          </div>
        </div>

        {/* Modal Footer */}
        <div className="px-6 py-4 bg-[#0E0F12] border-t border-white/[0.08] flex items-center justify-between">
          <button
            onClick={() => {
              if (confirm('Are you sure you want to disconnect and clear your local settings?')) {
                onClear();
                onClose();
              }
            }}
            className="flex items-center gap-1.5 text-xs text-red-400 hover:text-red-300 transition-colors"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span>Clear Settings</span>
          </button>

          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              className="px-4 py-2 rounded-xl text-xs font-medium text-zinc-400 hover:text-zinc-200 hover:bg-white/5 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleTestAndSave}
              disabled={testing || !inputUrl.trim()}
              className="flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-white shadow-md shadow-indigo-600/20 transition-all cursor-pointer"
            >
              {testing && <RefreshCw className="w-3.5 h-3.5 animate-spin" />}
              <span>{testing ? 'Testing...' : 'Save & Connect'}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
