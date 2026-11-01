import React, { useState } from 'react';
import { BookOpen, Download } from 'lucide-react';
import { DriveFileItem } from '../types';
import { getCoverUrl, getDownloadUrl } from '../lib/api';

interface NotebookCardProps {
  notebook: DriveFileItem;
  onOpen: (notebook: DriveFileItem) => void;
  viewMode?: 'grid' | 'list';
}

export const NotebookCard: React.FC<NotebookCardProps> = ({
  notebook,
  onOpen,
  viewMode = 'grid'
}) => {
  const [imgFailed, setImgFailed] = useState(false);

  // Derive folder / subject tag from path
  const pathParts = notebook.path.split('/');
  const subject = pathParts.length > 2 ? pathParts[pathParts.length - 2] : pathParts[0] || 'Notebook';
  const cleanTitle = notebook.name.replace(/\.nsa$/i, '');

  if (viewMode === 'list') {
    return (
      <div
        onClick={() => onOpen(notebook)}
        className="group flex items-center justify-between p-3.5 rounded-lg border border-white/5 bg-[#141518] hover:bg-[#1A1B1F] hover:border-white/10 transition-all cursor-pointer shadow-sm hover:shadow-md"
      >
        <div className="flex items-center gap-3.5 min-w-0">
          <div className="w-9 h-12 rounded bg-zinc-800 border border-white/10 flex-shrink-0 overflow-hidden relative shadow-inner">
            {!imgFailed ? (
              <img
                src={getCoverUrl(notebook.id)}
                alt={cleanTitle}
                onError={() => setImgFailed(true)}
                className="w-full h-full object-cover"
                loading="lazy"
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-indigo-950/60 to-zinc-900 text-indigo-400">
                <BookOpen className="w-4 h-4 opacity-70" />
              </div>
            )}
          </div>
          <div className="min-w-0">
            <h4 className="text-sm font-medium text-zinc-200 group-hover:text-white truncate">
              {cleanTitle}
            </h4>
            <div className="flex items-center gap-2 mt-0.5">
              <span className="text-xs px-1.5 py-0.5 rounded bg-indigo-500/10 border border-indigo-500/20 text-indigo-300 font-mono text-[11px]">
                {subject}
              </span>
              <span className="text-xs text-zinc-500 truncate max-w-[200px] sm:max-w-[400px]">
                {notebook.path}
              </span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 opacity-80 group-hover:opacity-100 transition-opacity">
          <button
            onClick={(e) => {
              e.stopPropagation();
              onOpen(notebook);
            }}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium bg-indigo-600 hover:bg-indigo-500 text-white transition-colors"
          >
            <BookOpen className="w-3.5 h-3.5" />
            <span>Open</span>
          </button>
          <a
            href={getDownloadUrl(notebook.id, notebook.name)}
            onClick={(e) => e.stopPropagation()}
            title="Download .nsa backup file"
            className="p-1.5 rounded-md text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 transition-colors"
          >
            <Download className="w-4 h-4" />
          </a>
        </div>
      </div>
    );
  }

  return (
    <div
      onClick={() => onOpen(notebook)}
      className="group relative flex flex-col rounded-xl border border-white/[0.07] bg-[#141518] hover:bg-[#1A1B1F] hover:border-white/15 transition-all duration-200 cursor-pointer shadow-lg hover:shadow-2xl hover:-translate-y-1 overflow-hidden"
    >
      {/* Notebook Cover Area */}
      <div className="relative aspect-[3/4] w-full bg-[#0E0F12] overflow-hidden flex items-center justify-center p-3">
        {/* Realistic Notebook Spine styling on left */}
        <div className="absolute left-0 top-0 bottom-0 w-3 bg-gradient-to-r from-black/40 via-white/5 to-transparent z-10 pointer-events-none" />

        {!imgFailed ? (
          <img
            src={getCoverUrl(notebook.id)}
            alt={cleanTitle}
            onError={() => setImgFailed(true)}
            className="w-full h-full object-cover rounded-md shadow-md group-hover:scale-102 transition-transform duration-300"
            loading="lazy"
          />
        ) : (
          /* Stylized Fallback Cover */
          <div className="w-full h-full rounded-md bg-gradient-to-br from-zinc-800 via-zinc-900 to-black p-4 flex flex-col justify-between border border-white/5 shadow-inner">
            <div className="w-6 h-1 rounded-full bg-indigo-500/50" />
            <div>
              <p className="text-xs uppercase tracking-wider text-indigo-400 font-semibold mb-1">
                {subject}
              </p>
              <h4 className="text-sm font-semibold text-zinc-200 line-clamp-3">
                {cleanTitle}
              </h4>
            </div>
            <div className="text-[10px] text-zinc-500 font-mono">
              Noteshelf 3
            </div>
          </div>
        )}

        {/* Hover overlay button */}
        <div className="absolute inset-0 bg-black/40 backdrop-blur-[2px] opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
          <span className="px-3.5 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-medium text-xs flex items-center gap-1.5 shadow-lg transform translate-y-1 group-hover:translate-y-0 transition-transform">
            <BookOpen className="w-4 h-4" />
            Read Notebook
          </span>
        </div>
      </div>

      {/* Metadata Bottom Section */}
      <div className="p-3.5 flex flex-col justify-between flex-1 gap-2 border-t border-white/[0.05]">
        <div>
          <h4
            className="text-sm font-medium text-zinc-200 group-hover:text-white line-clamp-2 leading-snug"
            title={cleanTitle}
          >
            {cleanTitle}
          </h4>
          <p className="text-[11px] text-zinc-500 truncate mt-1">
            {subject}
          </p>
        </div>

        <div className="flex items-center justify-between pt-1">
          <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-zinc-800/80 text-zinc-400 border border-white/5">
            .nsa
          </span>
          <a
            href={getDownloadUrl(notebook.id, notebook.name)}
            onClick={(e) => e.stopPropagation()}
            title="Download .nsa backup file"
            className="text-zinc-500 hover:text-indigo-400 p-1 rounded hover:bg-zinc-800/80 transition-colors"
          >
            <Download className="w-3.5 h-3.5" />
          </a>
        </div>
      </div>
    </div>
  );
};
