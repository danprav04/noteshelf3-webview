import React, { useState } from 'react';
import {
  Folder,
  FolderOpen,
  ChevronRight,
  ChevronDown,
  Layers,
  RefreshCw,
  HardDrive
} from 'lucide-react';
import { DriveFolderItem } from '../types';

interface SidebarProps {
  tree: DriveFolderItem | null;
  selectedFolderId: string | null;
  onSelectFolder: (folderId: string | null, folderPath?: string) => void;
  totalNotebooks: number;
  lastUpdated: number;
  onSync: () => void;
  syncing: boolean;
}

export const Sidebar: React.FC<SidebarProps> = ({
  tree,
  selectedFolderId,
  onSelectFolder,
  totalNotebooks,
  lastUpdated,
  onSync,
  syncing
}) => {
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  const toggleExpand = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setExpanded((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const renderFolderNode = (node: DriveFolderItem, level = 0) => {
    const isExpanded = expanded[node.id] ?? (level < 1);
    const isSelected = selectedFolderId === node.id;
    const hasChildren = node.folders.length > 0;
    const count = countNotebooks(node);

    return (
      <div key={node.id} className="select-none">
        <div
          onClick={() => onSelectFolder(node.id, node.path)}
          style={{ paddingLeft: `${12 + level * 16}px` }}
          className={`group flex items-center justify-between py-1.5 pr-2.5 rounded-lg text-xs font-medium cursor-pointer transition-colors ${
            isSelected
              ? 'bg-indigo-600/15 text-indigo-300 font-semibold border border-indigo-500/20'
              : 'text-zinc-400 hover:text-zinc-100 hover:bg-white/[0.04]'
          }`}
        >
          <div className="flex items-center gap-2 min-w-0">
            {hasChildren ? (
              <button
                onClick={(e) => toggleExpand(node.id, e)}
                className="p-0.5 rounded hover:bg-white/10 text-zinc-500 hover:text-zinc-300"
              >
                {isExpanded ? (
                  <ChevronDown className="w-3.5 h-3.5" />
                ) : (
                  <ChevronRight className="w-3.5 h-3.5" />
                )}
              </button>
            ) : (
              <span className="w-4.5" />
            )}

            {isExpanded ? (
              <FolderOpen className={`w-4 h-4 flex-shrink-0 ${isSelected ? 'text-indigo-400' : 'text-zinc-500'}`} />
            ) : (
              <Folder className={`w-4 h-4 flex-shrink-0 ${isSelected ? 'text-indigo-400' : 'text-zinc-500'}`} />
            )}

            <span className="truncate">{node.name}</span>
          </div>

          <span
            className={`text-[10px] font-mono px-1.5 py-0.2 rounded-full ${
              isSelected ? 'bg-indigo-500/30 text-indigo-200' : 'text-zinc-500 group-hover:text-zinc-400'
            }`}
          >
            {count}
          </span>
        </div>

        {hasChildren && isExpanded && (
          <div className="mt-0.5 flex flex-col gap-0.5">
            {node.folders.map((child) => renderFolderNode(child, level + 1))}
          </div>
        )}
      </div>
    );
  };

  function countNotebooks(folder: DriveFolderItem): number {
    let sum = folder.notebooks.length;
    for (const sub of folder.folders) {
      sum += countNotebooks(sub);
    }
    return sum;
  }

  const formatLastSync = (timestamp: number) => {
    if (!timestamp) return 'Never';
    const seconds = Math.floor((Date.now() - timestamp) / 1000);
    if (seconds < 60) return 'Just now';
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    return `${hours}h ago`;
  };

  return (
    <aside className="w-64 flex-shrink-0 border-r border-white/[0.07] bg-[#0C0D0F] flex flex-col justify-between p-3 select-none">
      <div className="flex-1 overflow-y-auto pr-1">
        {/* All Notebooks Root Item */}
        <div
          onClick={() => onSelectFolder(null)}
          className={`flex items-center justify-between px-3 py-2 rounded-lg text-xs font-medium cursor-pointer transition-colors mb-3 ${
            selectedFolderId === null
              ? 'bg-indigo-600/15 text-indigo-300 font-semibold border border-indigo-500/20'
              : 'text-zinc-400 hover:text-zinc-100 hover:bg-white/[0.04]'
          }`}
        >
          <div className="flex items-center gap-2.5">
            <Layers className="w-4 h-4 text-indigo-400" />
            <span>All Notebooks</span>
          </div>
          <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-zinc-800 text-zinc-400">
            {totalNotebooks}
          </span>
        </div>

        {/* Categories Header */}
        <div className="px-3 py-1.5 text-[11px] font-semibold tracking-wider uppercase text-zinc-500 flex items-center justify-between">
          <span>Categories</span>
        </div>

        {/* Tree Nodes */}
        <div className="mt-1 flex flex-col gap-0.5">
          {tree ? (
            tree.folders.map((f) => renderFolderNode(f, 0))
          ) : (
            <div className="p-4 text-center text-xs text-zinc-600">
              Loading courses...
            </div>
          )}
        </div>
      </div>

      {/* Footer Info & Sync Action */}
      <div className="pt-3 border-t border-white/[0.07] flex flex-col gap-2.5">
        <div className="flex items-center justify-between px-2 text-[11px] text-zinc-500">
          <div className="flex items-center gap-1.5">
            <HardDrive className="w-3.5 h-3.5 text-zinc-400" />
            <span>Auto-Backup</span>
          </div>
          <span className="font-mono text-zinc-400">
            {formatLastSync(lastUpdated)}
          </span>
        </div>

        <button
          onClick={onSync}
          disabled={syncing}
          className="w-full flex items-center justify-center gap-2 py-2 px-3 rounded-lg bg-[#18191D] hover:bg-[#202126] border border-white/10 text-xs font-medium text-zinc-200 hover:text-white transition-all shadow-xs disabled:opacity-50"
        >
          <RefreshCw className={`w-3.5 h-3.5 text-indigo-400 ${syncing ? 'animate-spin' : ''}`} />
          <span>{syncing ? 'Syncing Drive...' : 'Sync with Drive'}</span>
        </button>
      </div>
    </aside>
  );
};
