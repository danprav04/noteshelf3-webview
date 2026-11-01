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

export interface StrokeSegment {
  x: number;
  y: number;
  nx: number;
  ny: number;
  width: number;
  opacity: number;
}

export interface StrokeAnnotation {
  id: string;
  type: number;
  strokeWidth: number;
  strokeColor: number;
  hexColor: string;
  segments: StrokeSegment[];
  textHTMLForm?: string;
  bounds?: {
    x: number;
    y: number;
    w: number;
    h: number;
  };
}

export interface NotebookPage {
  index: number;
  uuid: string;
  isCover: boolean;
  bgColor: string;
  width: number;
  height: number;
  associatedPDF?: string;
  associatedPageIndex?: number;
  annotations: StrokeAnnotation[];
  ocrText?: string;
}

export interface ParsedNotebook {
  title: string;
  pages: NotebookPage[];
  coverImageUrl?: string;
  pdfTemplates: Map<string, Uint8Array>;
  resources: Map<string, Uint8Array>;
}
