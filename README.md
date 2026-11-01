# Noteshelf 3 Web Viewer

A fast, private, self-hostable web viewer for **Noteshelf 3** digital notebooks. Point it at a shared Google Drive folder containing your `.nsa` notebook files and browse your entire shelf — folders, covers, vector ink, PDF templates, and even OCR'd handwriting text — entirely in the browser.

Built as a [React 18](https://react.dev) + [Vite](https://vite.dev) SPA served by a stateless [Cloudflare Worker](https://workers.cloudflare.com). No backend database, no accounts, no server-side storage — your notes never leave the connection between Google Drive, the Worker, and your browser.

---

## ✨ Features

### Bookshelf
- **Google Drive folder sync** — paste any publicly shared Drive folder link (or raw folder ID); the app recursively crawls subfolders and indexes every `.nsa` notebook.
- **Folder tree sidebar** — navigate nested folder hierarchies, see per-shelf notebook counts, and manually re-sync.
- **Grid & list views** — visual bookshelf with real cover thumbnails, or a compact list.
- **Global search** — instant filtering across all indexed notebooks (`/` shortcut).
- **Live cover extraction** — covers are pulled out of remote `.nsa` archives *without downloading the whole file*, using HTTP `Range` requests and raw ZIP central-directory parsing.
- **Session caching** — the crawled folder tree is cached in `sessionStorage` (120s TTL) for instant navigation between tabs.

### Notebook Reader
- **Vector ink rendering** — handwritten strokes stored in each page's SQLite annotation database are decoded (via [sql.js](https://sql.js.org) WASM) and rendered to canvas: per-segment position, width, opacity and color.
- **PDF paper templates** — pages backed by PDF templates (`Templates/*.ns_pdf`) are rendered with [pdf.js](https://mozilla.github.io/pdf.js/) and composited under the ink layer.
- **Page navigation & thumbnails** — jump between pages or use the thumbnail rail.
- **Zoom & fullscreen** — scale to fit or zoom in/out, distraction-free fullscreen mode.
- **In-notebook text search** — searches Noteshelf's embedded OCR recognition files (`RecognitionFiles/*.plist`), so you can find handwritten text.
- **Download & print** — grab the original `.nsa` or print the current view.

### Privacy
- **Stateless by design** — the Worker keeps no storage, no KV, no D1, no analytics. `observability` (logging) is disabled in `wrangler.jsonc`. Ask `/api/status` and it will happily confirm: `{"mode":"stateless-client-side","storage":"none","logging":"disabled"}`.
- **Local-only state** — your Drive folder selection lives in `localStorage`, the tree cache in `sessionStorage`. Clearing site data wipes everything.
- **Thin CORS proxy only** — the Worker relays Google Drive data; it stores nothing it sees.

---

## 🧩 The `.nsa` Format

A Noteshelf 3 notebook (`.nsa`) is a ZIP archive with an Apple-ish internal layout:

| Entry | Contents |
|---|---|
| `Document.plist` | Apple XML plist — page list, per-page UUIDs, background color, page rect (`pdfKitPageRect`), associated PDF template + page index |
| `cover-shelf-image.png` | The bookshelf cover preview |
| `Annotations/<uuid>` | SQLite database per page; the `annotation` table holds stroke color (integer), width, bounds, and a `stroke_segments_v3` BLOB of packed little-endian `float32` segments (`x, y, nx, ny, width, opacity`) |
| `Templates/<name>.ns_pdf` | PDF template used as page paper (imported PDFs, templates) |
| `RecognitionFiles/*.plist` | Per-notebook OCR index: `pageRecognitionInfo[uuid].recognisedText` |
| `Resources/*` | Images and other embedded assets |

`src/lib/nsaParser.ts` parses all of this entirely client-side — plist → DOMParser, SQLite → sql.js, ZIP → `@zip.js/zip.js`, and integer stroke colors converted to `#RRGGBB` hex.

---

## 🏗 Architecture

```
┌──────────────────────────── Browser ─────────────────────────────┐
│  React SPA (Vite build, Tailwind 4)                              │
│  ├─ App state: localStorage (Drive URL) + sessionStorage (tree)  │
│  ├─ Bookshelf: folder tree, covers, search, grid/list            │
│  └─ Reader: nsaParser (zip.js + sql.js) → PageCanvas (pdf.js)     │
└──────────────────────────────┬───────────────────────────────────┘
                               │ same-origin /api/*
┌──────────────────────────────▼───────────────────────────────────┐
│  Cloudflare Worker (worker/index.ts) — stateless relay           │
│  ├─ /api/status        Health & privacy declaration              │
│  ├─ /api/proxy-folder  Scrapes Drive's embedded folder view →    │
│  │                     { title, folders[], files[] }             │
│  ├─ /api/cover         Range-requests a remote .nsa, finds the  │
│  │                     ZIP central directory, inflates only the  │
│  │                     cover PNG (zipRange.ts)                   │
│  └─ /api/file          Streams the full .nsa from Google's CDN,  │
│                        auto-confirming big-file virus-scan       │
└──────────────────────────────┬───────────────────────────────────┘
                               │
                    Google Drive (public folder, view-only link)
```

**Large-file handling:** Google Drive interposes a "virus scan warning" page on downloads over 50 MB. The Worker requests `&confirm=t` and, if Drive still answers with an HTML interstitial, parses the form's hidden fields and re-requests with the confirmation token. The client re-checks the payload signature (`PK\x03\x04`) and retries the same dance before refusing to parse.

---

## 🚀 Self-Hosting

### Prerequisites
- Node.js 18+
- npm
- A [Cloudflare](https://dash.cloudflare.com) account (free tier is fine)
- A **publicly shared** Google Drive folder ("Anyone with the link → Viewer")
- Noteshelf 3 notebook files (`.nsa`) in that folder

### Local development

```bash
npm install

# Terminal 1 — Cloudflare Worker on http://127.0.0.1:8787
npm run worker:dev

# Terminal 2 — Vite dev server on http://localhost:5173 (proxies /api → 8787)
npm run dev
```

Open `http://localhost:5173`, paste your Drive folder link, and you're off.

> `sql.js` is deliberately excluded from Vite's dependency pre-bundling (`optimizeDeps.exclude`) and loads its WASM binary from the official CDN at runtime; pdf.js's worker is loaded from cdnjs.

### Deploy to Cloudflare Workers

```bash
# Build (tsc + vite) and deploy with wrangler
npm run deploy
```

The included `wrangler.jsonc` serves the `dist/` SPA assets through the Worker with SPA-style not-found handling, so no extra static hosting is needed and `/api/*` reaches the Worker directly.

Requirements for the Drive side:

1. Back up / sync your Noteshelf notebooks to Google Drive (or upload the `.nsa` files manually).
2. Share the containing folder as **"Anyone with the link can view."**
3. Copy the folder URL — anything like `https://drive.google.com/drive/folders/<ID>` — or just `<ID>`.

---

## 📁 Project Structure

```
├─ worker/
│  ├─ index.ts          API routes: status / proxy-folder / cover / file
│  ├─ zipRange.ts       Range-request ZIP reader (remote cover extraction)
│  └─ gdrive.ts         Drive helpers used by the worker
├─ src/
│  ├─ components/
│  │  ├─ WelcomeSetup.tsx    Initial connect screen (paste Drive link)
│  │  ├─ Navbar.tsx          Brand, global search, view mode, settings
│  │  ├─ Sidebar.tsx         Folder tree + sync controls
│  │  ├─ Bookshelf.tsx       Grid/list bookshelf with contextual breadcrumb
│  │  ├─ NotebookCard.tsx    Cover card
│  │  ├─ NotebookReader.tsx  Full-screen reader, pages, search, zoom
│  │  ├─ PageCanvas.tsx      Canvas compositing: bg → PDF template → ink
│  │  └─ SettingsModal.tsx   Change / disconnect Drive source
│  ├─ lib/
│  │  ├─ api.ts              Folder crawling + sessionStorage cache
│  │  └─ nsaParser.ts        .nsa parsing (plist, ZIP, SQLite strokes, OCR)
│  ├─ types.ts               Shared interfaces
│  ├─ App.tsx                Top-level layout & state
│  └─ index.css              Tailwind + theme
├─ vite.config.ts        Dev server /api proxy → 127.0.0.1:8787
├─ wrangler.jsonc        Worker + static assets config
└─ tsconfig.json
```

---

## 🛠 Tech Stack

| Layer | Choice |
|---|---|
| UI | React 18, Tailwind CSS 4, lucide-react |
| Build | Vite 6, TypeScript 5 |
| Runtime | Cloudflare Workers (`nodejs_compat`) |
| ZIP | `@zip.js/zip.js` |
| SQLite (ink) | `sql.js` (WASM) |
| PDF templates | `pdfjs-dist` |
| Plists | Hand-rolled Apple XML plist parser (`DOMParser`) |

## ⚠️ Notes & Limitations

- Folders must be **publicly shared**; the sync path is unauthenticated by design.
- Drive's embedded folder view is unofficial; if Google changes its markup, `/api/proxy-folder` may need updating.
- Covers/fonts/resources render where the format exposes them; extremely exotic notebooks (e.g., some embedded-media cases) may degrade gracefully.
- OCR search depends on Noteshelf's recognition files being included in your export.
- This is an independent viewer for personal backups — not affiliated with Noteshelf / Fluid Touch.

## 🤝 Contributing

Issues and pull requests are welcome. For larger changes, please open an issue first to discuss what you'd like to change.

## 📄 License

Released under the [MIT License](LICENSE). © 2026 Daniel Pravutiner.
