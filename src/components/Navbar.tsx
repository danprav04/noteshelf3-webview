import React from 'react';
import { BookMarked, Search, LayoutGrid, List, Settings } from 'lucide-react';

interface NavbarProps {
  searchQuery: string;
  onSearchChange: (query: string) => void;
  viewMode: 'grid' | 'list';
  onViewModeChange: (mode: 'grid' | 'list') => void;
  totalNotebooks: number;
  onOpenSettings: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({
  searchQuery,
  onSearchChange,
  viewMode,
  onViewModeChange,
  totalNotebooks,
  onOpenSettings
}) => {
  return (
    <header className="h-14 border-b border-white/[0.08] bg-[#0A0B0D]/80 backdrop-blur-md px-4 flex items-center justify-between sticky top-0 z-20 select-none">
      {/* Brand */}
      <div className="flex items-center gap-3">
        <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-indigo-600 to-violet-500 flex items-center justify-center text-white shadow-md shadow-indigo-500/20">
          <BookMarked className="w-4 h-4" />
        </div>
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-sm font-semibold tracking-tight text-white">
              Noteshelf 3
            </h1>
            <span className="text-[10px] font-mono uppercase px-1.5 py-0.2 rounded bg-indigo-500/15 border border-indigo-500/30 text-indigo-300">
              Web Viewer
            </span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
            <span className="text-[11px] text-zinc-400">
              Local Browser Storage
            </span>
          </div>
        </div>
      </div>

      {/* Global Search Bar */}
      <div className="flex-1 max-w-md mx-6">
        <div className="relative">
          <Search className="w-4 h-4 absolute left-3 top-2.5 text-zinc-500 pointer-events-none" />
          <input
            type="text"
            placeholder={`Search ${totalNotebooks} notebooks... (Press /)`}
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            className="w-full bg-[#141518] hover:bg-[#18191D] focus:bg-[#1A1B1F] border border-white/[0.08] focus:border-indigo-500/60 rounded-lg pl-9 pr-8 py-1.5 text-xs text-white placeholder-zinc-500 transition-all focus:outline-none focus:ring-1 focus:ring-indigo-500/50"
          />
          {searchQuery && (
            <button
              onClick={() => onSearchChange('')}
              className="absolute right-2.5 top-2.5 text-zinc-500 hover:text-zinc-300 text-xs font-mono"
            >
              ✕
            </button>
          )}
        </div>
      </div>

      {/* Right Controls */}
      <div className="flex items-center gap-2">
        {/* View Mode Toggle */}
        <div className="flex items-center bg-[#141518] border border-white/[0.08] rounded-lg p-0.5">
          <button
            onClick={() => onViewModeChange('grid')}
            className={`p-1.5 rounded-md transition-colors ${
              viewMode === 'grid'
                ? 'bg-indigo-600 text-white shadow-xs'
                : 'text-zinc-400 hover:text-white'
            }`}
            title="Grid view"
          >
            <LayoutGrid className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => onViewModeChange('list')}
            className={`p-1.5 rounded-md transition-colors ${
              viewMode === 'list'
                ? 'bg-indigo-600 text-white shadow-xs'
                : 'text-zinc-400 hover:text-white'
            }`}
            title="List view"
          >
            <List className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Settings Button */}
        <button
          onClick={onOpenSettings}
          className="p-2 rounded-lg bg-[#141518] hover:bg-[#1A1B1F] border border-white/[0.08] text-zinc-400 hover:text-white transition-colors"
          title="App Settings"
        >
          <Settings className="w-4 h-4" />
        </button>
      </div>
    </header>
  );
};
