export interface DriveFileItem {
  id: string;
  name: string;
  path: string;
  type: 'notebook' | 'folder';
  folderId: string;
}

export interface DriveFolderItem {
  id: string;
  name: string;
  path: string;
  folders: DriveFolderItem[];
  notebooks: DriveFileItem[];
}

export interface DriveTreeResult {
  rootId: string;
  rootName: string;
  lastUpdated: number;
  totalNotebooks: number;
  tree: DriveFolderItem;
  allNotebooks: DriveFileItem[];
}

export function extractFolderId(input: string): string {
  if (!input) return '';
  const trimmed = input.trim();
  // If it's already an ID
  if (/^[a-zA-Z0-9_-]{25,}$/.test(trimmed)) {
    return trimmed;
  }
  // Try matching folders/ID
  const match = trimmed.match(/\/folders\/([a-zA-Z0-9_-]{25,})/);
  if (match) return match[1];
  const idParam = trimmed.match(/[?&]id=([a-zA-Z0-9_-]{25,})/);
  if (idParam) return idParam[1];
  return trimmed;
}

export async function fetchEmbeddedFolder(folderId: string): Promise<{ title: string; folders: { id: string; name: string }[]; files: { id: string; name: string }[] }> {
  const url = `https://drive.google.com/embeddedfolderview?id=${folderId}`;
  const res = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    }
  });

  if (!res.ok) {
    throw new Error(`Failed to fetch Google Drive folder ${folderId} (HTTP ${res.status})`);
  }

  const html = await res.text();

  // Extract title
  let title = 'Noteshelf';
  const titleMatch = html.match(/<title>([^<]+)<\/title>/i);
  if (titleMatch) {
    title = titleMatch[1].replace(/[\u202a\u202c\u200e\u200f]/g, '').trim();
  }

  const folders: { id: string; name: string }[] = [];
  const files: { id: string; name: string }[] = [];

  // Parse <a> tags
  const linkRegex = /<a\s+[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
  let match: RegExpExecArray | null;

  while ((match = linkRegex.exec(html)) !== null) {
    const href = match[1];
    let rawText = match[2].replace(/<[^>]+>/g, '').trim();
    rawText = rawText.replace(/[\u202a\u202c\u200e\u200f]/g, '').trim();

    // Check if folder
    const folderMatch = href.match(/\/drive\/folders\/([a-zA-Z0-9_-]{25,})/);
    if (folderMatch) {
      const childId = folderMatch[1];
      if (childId !== folderId && !folders.some(f => f.id === childId)) {
        folders.push({ id: childId, name: rawText || 'Untitled Folder' });
      }
      continue;
    }

    // Check if file
    const fileMatch = href.match(/\/file\/d\/([a-zA-Z0-9_-]{25,})\//);
    if (fileMatch) {
      const childId = fileMatch[1];
      if (!files.some(f => f.id === childId)) {
        files.push({ id: childId, name: rawText || 'Untitled Notebook' });
      }
    }
  }

  return { title, folders, files };
}

// In-memory cache in the Cloudflare Worker isolate
let cachedTree: DriveTreeResult | null = null;
let lastCacheTime = 0;
const CACHE_TTL_MS = 60 * 1000; // 60 seconds TTL

export async function getDriveTree(rootFolderId: string, forceRefresh = false): Promise<DriveTreeResult> {
  const now = Date.now();
  if (!forceRefresh && cachedTree && cachedTree.rootId === rootFolderId && (now - lastCacheTime < CACHE_TTL_MS)) {
    return cachedTree;
  }

  const allNotebooks: DriveFileItem[] = [];

  async function crawlFolder(id: string, currentPath: string): Promise<DriveFolderItem> {
    const { title, folders, files } = await fetchEmbeddedFolder(id);

    const folderNode: DriveFolderItem = {
      id,
      name: currentPath ? currentPath.split('/').pop() || title : title,
      path: currentPath,
      folders: [],
      notebooks: []
    };

    // Add notebooks
    for (const f of files) {
      const notebookItem: DriveFileItem = {
        id: f.id,
        name: f.name,
        path: currentPath ? `${currentPath}/${f.name}` : f.name,
        type: 'notebook',
        folderId: id
      };
      folderNode.notebooks.push(notebookItem);
      allNotebooks.push(notebookItem);
    }

    // Recursively crawl subfolders in parallel
    const subfolderPromises = folders.map(async sub => {
      const subPath = currentPath ? `${currentPath}/${sub.name}` : sub.name;
      return crawlFolder(sub.id, subPath);
    });

    folderNode.folders = await Promise.all(subfolderPromises);
    return folderNode;
  }

  const rootFolderNode = await crawlFolder(rootFolderId, '');

  const result: DriveTreeResult = {
    rootId: rootFolderId,
    rootName: rootFolderNode.name,
    lastUpdated: now,
    totalNotebooks: allNotebooks.length,
    tree: rootFolderNode,
    allNotebooks
  };

  cachedTree = result;
  lastCacheTime = now;

  return result;
}

export function invalidateCache(): void {
  cachedTree = null;
  lastCacheTime = 0;
}
