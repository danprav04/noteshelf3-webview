import React, { useEffect, useState, useMemo, useCallback } from 'react';
import { DriveFileItem, DriveFolderItem, DriveTreeResult } from './types';
import { getStoredDriveUrl, setStoredDriveUrl, clearStoredDriveUrl, crawlDriveTree } from './lib/api';
import { Navbar } from './components/Navbar';
import { Sidebar } from './components/Sidebar';
import { Bookshelf } from './components/Bookshelf';
import { NotebookReader } from './components/NotebookReader';
import { SettingsModal } from './components/SettingsModal';
import { WelcomeSetup } from './components/WelcomeSetup';
import { AlertCircle } from 'lucide-react';

export const App: React.FC = () => {
  const [driveUrl, setDriveUrl] = useState<string | null>(() => getStoredDriveUrl());
  const [treeData, setTreeData] = useState<DriveTreeResult | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [syncing, setSyncing] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null);
  const [selectedFolderPath, setSelectedFolderPath] = useState<string | undefined>(undefined);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');

  const [openedNotebook, setOpenedNotebook] = useState<DriveFileItem | null>(null);
  const [showSettings, setShowSettings] = useState<boolean>(false);

  // Load tree whenever driveUrl changes
  const loadTree = useCallback(async (url: string, force = false) => {
    if (force) setSyncing(true);
    else setLoading(true);
    setError(null);

    try {
      const data = await crawlDriveTree(url, force);
      setTreeData(data);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg);
    } finally {
      setLoading(false);
      setSyncing(false);
    }
  }, []);

  useEffect(() => {
    if (driveUrl) {
      loadTree(driveUrl);
    } else {
      setTreeData(null);
    }
  }, [driveUrl, loadTree]);

  // Connect new URL from Welcome or Settings
  const handleConnect = (newUrl: string) => {
    setStoredDriveUrl(newUrl);
    setDriveUrl(newUrl);
    setSelectedFolderId(null);
    setSelectedFolderPath(undefined);
  };

  // Disconnect / Clear
  const handleClear = () => {
    clearStoredDriveUrl();
    setDriveUrl(null);
    setTreeData(null);
  };

  // Manual sync
  const handleSync = () => {
    if (driveUrl) {
      loadTree(driveUrl, true);
    }
  };

  // Find currently selected folder node in tree
  const currentFolder = useMemo<DriveFolderItem | null>(() => {
    if (!treeData || !selectedFolderId) return null;

    function findNode(node: DriveFolderItem): DriveFolderItem | null {
      if (node.id === selectedFolderId) return node;
      for (const child of node.folders) {
        const res = findNode(child);
        if (res) return res;
      }
      return null;
    }

    return findNode(treeData.tree);
  }, [treeData, selectedFolderId]);

  // Compute active notebooks list
  const activeNotebooks = useMemo<DriveFileItem[]>(() => {
    if (!treeData) return [];
    if (!selectedFolderId || !currentFolder) {
      return treeData.allNotebooks;
    }

    const list: DriveFileItem[] = [];
    function collect(node: DriveFolderItem) {
      list.push(...node.notebooks);
      for (const sub of node.folders) {
        collect(sub);
      }
    }
    collect(currentFolder);
    return list;
  }, [treeData, selectedFolderId, currentFolder]);

  function handleSelectFolder(id: string | null, path?: string) {
    setSelectedFolderId(id);
    setSelectedFolderPath(path);
  }

  // If no URL is set, show Welcome screen
  if (!driveUrl) {
    return <WelcomeSetup onConnect={handleConnect} />;
  }

  return (
    <div className="h-screen w-screen flex flex-col bg-[#08090A] text-zinc-100 overflow-hidden font-sans antialiased">
      {/* Top Navbar */}
      <Navbar
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        viewMode={viewMode}
        onViewModeChange={setViewMode}
        totalNotebooks={treeData?.totalNotebooks || 0}
        onOpenSettings={() => setShowSettings(true)}
      />

      {/* Error alert banner */}
      {error && (
        <div className="bg-red-950/60 border-b border-red-900/40 px-4 py-2 flex items-center justify-between text-xs text-red-200">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-red-400" />
            <span>Connection error: {error}</span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => handleSync()}
              className="px-2.5 py-0.5 rounded bg-red-900/40 hover:bg-red-800/40 text-red-200 text-xs font-medium cursor-pointer"
            >
              Retry
            </button>
            <button
              onClick={() => setShowSettings(true)}
              className="px-2.5 py-0.5 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-medium cursor-pointer"
            >
              Settings
            </button>
          </div>
        </div>
      )}

      {/* Main Split Layout */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left Tree Sidebar */}
        <Sidebar
          tree={treeData?.tree || null}
          selectedFolderId={selectedFolderId}
          onSelectFolder={handleSelectFolder}
          totalNotebooks={treeData?.totalNotebooks || 0}
          lastUpdated={treeData?.lastUpdated || 0}
          onSync={handleSync}
          syncing={syncing}
        />

        {/* Right Bookshelf View */}
        <Bookshelf
          notebooks={activeNotebooks}
          currentFolder={currentFolder}
          folderPath={selectedFolderPath}
          onSelectFolder={handleSelectFolder}
          onOpenNotebook={setOpenedNotebook}
          searchQuery={searchQuery}
          viewMode={viewMode}
          loading={loading}
        />
      </div>

      {/* Interactive Notebook Reader Modal */}
      {openedNotebook && (
        <NotebookReader
          notebook={openedNotebook}
          onClose={() => setOpenedNotebook(null)}
        />
      )}

      {/* Settings Modal */}
      {showSettings && (
        <SettingsModal
          currentUrl={driveUrl}
          onSave={(newUrl) => {
            handleConnect(newUrl);
            setShowSettings(false);
          }}
          onClear={() => {
            handleClear();
            setShowSettings(false);
          }}
          onClose={() => setShowSettings(false)}
        />
      )}
    </div>
  );
};
