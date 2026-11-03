import React, { useMemo, useState } from 'react';
import {
  Folder,
  ArrowUpDown,
  Search
} from 'lucide-react';
import { DriveFileItem, DriveFolderItem } from '../types';
import { NotebookCard } from './NotebookCard';

interface BookshelfProps {
  notebooks: DriveFileItem[];
  currentFolder: DriveFolderItem | null;
  folderPath?: string;
  onSelectFolder: (folderId: string | null, folderPath?: string) => void;
  onOpenNotebook: (notebook: DriveFileItem) => void;
  onDownloadPdf?: (notebook: DriveFileItem) => void;
  searchQuery: string;
  viewMode: 'grid' | 'list';
  loading: boolean;
}

export const Bookshelf: React.FC<BookshelfProps> = ({
  notebooks,
  currentFolder,
  folderPath,
  onSelectFolder,
  onOpenNotebook,
  onDownloadPdf,
  searchQuery,
  viewMode,
  loading
}) => {
  const [sortBy, setSortBy] = useState<'name-asc' | 'name-desc' | 'subject'>('name-asc');
  const [selectedTag, setSelectedTag] = useState<string | null>(null);

  // Extract common tags/subjects
  const availableTags = useMemo(() => {
    const set = new Set<string>();
    for (const nb of notebooks) {
      const parts = nb.path.split('/');
      if (parts.length > 2) {
        set.add(parts[parts.length - 2]);
      } else if (parts.length > 1) {
        set.add(parts[0]);
      }
    }
    return Array.from(set).slice(0, 8);
  }, [notebooks]);

  // Filter & Sort
  const filteredNotebooks = useMemo(() => {
    let result = [...notebooks];

    // Search query filter
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(
        (nb) => nb.name.toLowerCase().includes(q) || nb.path.toLowerCase().includes(q)
      );
    }

    // Tag filter
    if (selectedTag) {
      result = result.filter((nb) => nb.path.includes(selectedTag));
    }

    // Sort
    result.sort((a, b) => {
      if (sortBy === 'name-asc') {
        return a.name.localeCompare(b.name, undefined, { numeric: true });
      }
      if (sortBy === 'name-desc') {
        return b.name.localeCompare(a.name, undefined, { numeric: true });
      }
      if (sortBy === 'subject') {
        return a.path.localeCompare(b.path);
      }
      return 0;
    });

    return result;
  }, [notebooks, searchQuery, selectedTag, sortBy]);

  // Breadcrumbs segments
  const pathParts = useMemo(() => {
    if (!folderPath) return [];
    return folderPath.split('/').filter(Boolean);
  }, [folderPath]);

  return (
    <main className="flex-1 overflow-y-auto p-6 bg-[#08090A] flex flex-col gap-6">
      {/* Top Header & Breadcrumbs */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-white/[0.06]">
        <div>
          {/* Breadcrumbs */}
          <div className="flex items-center gap-1.5 text-xs text-zinc-500 mb-1 flex-wrap">
            <span
              onClick={() => onSelectFolder(null)}
              className="hover:text-zinc-300 cursor-pointer transition-colors"
            >
              All Notebooks
            </span>
            {pathParts.map((part, idx) => (
              <React.Fragment key={idx}>
                <span>/</span>
                <span className={idx === pathParts.length - 1 ? 'text-zinc-200 font-medium' : 'hover:text-zinc-300 cursor-pointer'}>
                  {part}
                </span>
              </React.Fragment>
            ))}
          </div>

          <h2 className="text-xl font-semibold text-white tracking-tight flex items-center gap-2">
            <span>{currentFolder ? currentFolder.name : 'All Notebooks'}</span>
            <span className="text-xs font-mono font-normal px-2 py-0.5 rounded-full bg-zinc-800 text-zinc-400">
              {filteredNotebooks.length}
            </span>
          </h2>
        </div>

        {/* Sort Controls */}
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5 bg-[#141518] border border-white/[0.08] rounded-lg px-2.5 py-1 text-xs text-zinc-300">
            <ArrowUpDown className="w-3.5 h-3.5 text-zinc-500" />
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as any)}
              className="bg-transparent text-xs text-zinc-200 focus:outline-none cursor-pointer"
            >
              <option value="name-asc" className="bg-zinc-900">Name (A to Z)</option>
              <option value="name-desc" className="bg-zinc-900">Name (Z to A)</option>
              <option value="subject" className="bg-zinc-900">Subject / Path</option>
            </select>
          </div>
        </div>
      </div>

      {/* Filter Subject Pills */}
      {availableTags.length > 0 && !searchQuery && (
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 no-scrollbar select-none">
          <button
            onClick={() => setSelectedTag(null)}
            className={`px-3 py-1 rounded-full text-xs font-medium transition-all ${
              selectedTag === null
                ? 'bg-indigo-600 text-white shadow-xs'
                : 'bg-zinc-900/80 hover:bg-zinc-800 text-zinc-400 hover:text-zinc-200 border border-white/5'
            }`}
          >
            All
          </button>
          {availableTags.map((tag) => (
            <button
              key={tag}
              onClick={() => setSelectedTag(selectedTag === tag ? null : tag)}
              className={`px-3 py-1 rounded-full text-xs font-medium transition-all whitespace-nowrap ${
                selectedTag === tag
                  ? 'bg-indigo-600 text-white shadow-xs'
                  : 'bg-zinc-900/80 hover:bg-zinc-800 text-zinc-400 hover:text-zinc-200 border border-white/5'
              }`}
            >
              {tag}
            </button>
          ))}
        </div>
      )}

      {/* Subfolders Grid (if inside a folder that has subfolders) */}
      {currentFolder && currentFolder.folders.length > 0 && !searchQuery && !selectedTag && (
        <div className="flex flex-col gap-2.5">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-zinc-500">
            Subfolders
          </h3>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
            {currentFolder.folders.map((sub) => (
              <div
                key={sub.id}
                onClick={() => onSelectFolder(sub.id, sub.path)}
                className="group p-3 rounded-lg border border-white/[0.07] bg-[#141518] hover:bg-[#1A1B1F] hover:border-indigo-500/30 transition-all cursor-pointer flex items-center gap-2.5 shadow-sm"
              >
                <Folder className="w-5 h-5 text-indigo-400 group-hover:scale-105 transition-transform flex-shrink-0" />
                <div className="min-w-0">
                  <p className="text-xs font-medium text-zinc-200 group-hover:text-white truncate">
                    {sub.name}
                  </p>
                  <p className="text-[10px] text-zinc-500 font-mono">
                    {sub.notebooks.length} files
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Shimmer Loading State */}
      {loading && (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-5">
          {Array.from({ length: 12 }).map((_, i) => (
            <div
              key={i}
              className="aspect-[3/4] rounded-xl bg-zinc-900/60 border border-white/5 animate-pulse flex flex-col justify-end p-3 gap-2"
            >
              <div className="h-3 w-3/4 rounded bg-zinc-800" />
              <div className="h-2 w-1/2 rounded bg-zinc-800" />
            </div>
          ))}
        </div>
      )}

      {/* Empty State */}
      {!loading && filteredNotebooks.length === 0 && (
        <div className="flex-1 flex flex-col items-center justify-center py-16 text-center max-w-sm mx-auto">
          <div className="w-12 h-12 rounded-full bg-zinc-900 border border-white/10 flex items-center justify-center text-zinc-500 mb-3">
            <Search className="w-5 h-5" />
          </div>
          <h3 className="text-sm font-semibold text-zinc-200">No notebooks found</h3>
          <p className="text-xs text-zinc-500 mt-1">
            {searchQuery
              ? `No notebooks matching "${searchQuery}". Try a different keyword.`
              : 'This folder does not contain any notebooks yet.'}
          </p>
        </div>
      )}

      {/* Notebook Cards (Grid / List) */}
      {!loading && filteredNotebooks.length > 0 && (
        <div>
          {viewMode === 'grid' ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-5">
              {filteredNotebooks.map((nb) => (
                <NotebookCard
                  key={nb.id}
                  notebook={nb}
                  onOpen={onOpenNotebook}
                  onDownloadPdf={onDownloadPdf}
                  viewMode="grid"
                />
              ))}
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              {filteredNotebooks.map((nb) => (
                <NotebookCard
                  key={nb.id}
                  notebook={nb}
                  onOpen={onOpenNotebook}
                  onDownloadPdf={onDownloadPdf}
                  viewMode="list"
                />
              ))}
            </div>
          )}
        </div>
      )}
    </main>
  );
};
