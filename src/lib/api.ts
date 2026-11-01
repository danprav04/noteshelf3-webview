import { DriveFileItem, DriveFolderItem, DriveTreeResult } from '../types';

const STORAGE_KEY = 'noteshelf_drive_url';
const CACHE_KEY = 'noteshelf_tree_cache';

export function getStoredDriveUrl(): string | null {
  return localStorage.getItem(STORAGE_KEY);
}

export function setStoredDriveUrl(url: string): void {
  localStorage.setItem(STORAGE_KEY, url.trim());
  clearTreeCache();
}

export function clearStoredDriveUrl(): void {
  localStorage.removeItem(STORAGE_KEY);
  clearTreeCache();
}

export function clearTreeCache(): void {
  sessionStorage.removeItem(CACHE_KEY);
}

export function extractFolderId(input: string): string {
  if (!input) return '';
  const trimmed = input.trim();
  if (/^[a-zA-Z0-9_-]{25,}$/.test(trimmed)) {
    return trimmed;
  }
  const match = trimmed.match(/\/folders\/([a-zA-Z0-9_-]{25,})/);
  if (match) return match[1];
  const idParam = trimmed.match(/[?&]id=([a-zA-Z0-9_-]{25,})/);
  if (idParam) return idParam[1];
  return trimmed;
}

export async function fetchFolderContents(folderId: string): Promise<{ title: string; folders: { id: string; name: string }[]; files: { id: string; name: string }[] }> {
  const res = await fetch('/api/proxy-folder', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ folderId })
  });

  if (!res.ok) {
    throw new Error(`Failed to load Google Drive folder (HTTP ${res.status})`);
  }

  return res.json();
}

/**
 * Crawls the Google Drive folder hierarchy client-side.
 * Caches in sessionStorage for instant tab navigation.
 */
export async function crawlDriveTree(rootUrlOrId: string, forceRefresh = false): Promise<DriveTreeResult> {
  const rootFolderId = extractFolderId(rootUrlOrId);
  if (!rootFolderId) {
    throw new Error('Please enter a valid Google Drive folder link or ID');
  }

  if (!forceRefresh) {
    const cached = sessionStorage.getItem(`${CACHE_KEY}_${rootFolderId}`);
    if (cached) {
      try {
        const parsed = JSON.parse(cached);
        if (Date.now() - parsed.lastUpdated < 120 * 1000) {
          return parsed;
        }
      } catch {
        // ignore invalid cache
      }
    }
  }

  const allNotebooks: DriveFileItem[] = [];

  async function crawl(id: string, currentPath: string): Promise<DriveFolderItem> {
    const { title, folders, files } = await fetchFolderContents(id);

    const folderNode: DriveFolderItem = {
      id,
      name: currentPath ? currentPath.split('/').pop() || title : title,
      path: currentPath,
      folders: [],
      notebooks: []
    };

    for (const f of files) {
      const item: DriveFileItem = {
        id: f.id,
        name: f.name,
        path: currentPath ? `${currentPath}/${f.name}` : f.name,
        type: 'notebook',
        folderId: id
      };
      folderNode.notebooks.push(item);
      allNotebooks.push(item);
    }

    const subPromises = folders.map(async (sub) => {
      const subPath = currentPath ? `${currentPath}/${sub.name}` : sub.name;
      return crawl(sub.id, subPath);
    });

    folderNode.folders = await Promise.all(subPromises);
    return folderNode;
  }

  const rootNode = await crawl(rootFolderId, '');

  const result: DriveTreeResult = {
    rootId: rootFolderId,
    rootName: rootNode.name,
    lastUpdated: Date.now(),
    totalNotebooks: allNotebooks.length,
    tree: rootNode,
    allNotebooks
  };

  sessionStorage.setItem(`${CACHE_KEY}_${rootFolderId}`, JSON.stringify(result));
  return result;
}

export function getCoverUrl(fileId: string): string {
  return `/api/cover?id=${fileId}`;
}

export function getDownloadUrl(fileId: string, _name?: string): string {
  // Direct Google CDN link with CORS header support &confirm=t for large files
  return `https://drive.usercontent.google.com/download?id=${fileId}&export=download&confirm=t`;
}
