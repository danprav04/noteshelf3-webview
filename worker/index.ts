import { extractCoverFromDrive } from './zipRange';

export interface Env {
  ASSETS: {
    fetch: (request: Request) => Promise<Response>;
  };
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    // API Routes
    if (url.pathname.startsWith('/api/')) {
      const corsHeaders = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Range'
      };

      if (request.method === 'OPTIONS') {
        return new Response(null, { headers: corsHeaders });
      }

      // 1. Health & Privacy Check
      if (url.pathname === '/api/status') {
        return new Response(JSON.stringify({
          ok: true,
          mode: 'stateless-client-side',
          storage: 'none',
          logging: 'disabled'
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      // 2. Stateless CORS Proxy for Google Drive Folder View
      if (url.pathname === '/api/proxy-folder') {
        let folderId = url.searchParams.get('id');

        if (request.method === 'POST') {
          try {
            const body = await request.json() as { folderId?: string };
            if (body && body.folderId) {
              folderId = body.folderId;
            }
          } catch {
            // fallback
          }
        }

        if (!folderId || !/^[a-zA-Z0-9_-]{25,}$/.test(folderId)) {
          return new Response(JSON.stringify({ error: 'Valid folderId is required' }), {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });
        }

        try {
          const driveUrl = `https://drive.google.com/embeddedfolderview?id=${folderId}`;
          const gRes = await fetch(driveUrl, {
            headers: {
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
            }
          });

          if (!gRes.ok) {
            return new Response(JSON.stringify({ error: `Google Drive returned status ${gRes.status}` }), {
              status: gRes.status,
              headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            });
          }

          const html = await gRes.text();

          let title = 'Noteshelf';
          const titleMatch = html.match(/<title>([^<]+)<\/title>/i);
          if (titleMatch) {
            title = titleMatch[1].replace(/[\u202a\u202c\u200e\u200f]/g, '').trim();
          }

          const folders: { id: string; name: string }[] = [];
          const files: { id: string; name: string }[] = [];

          const linkRegex = /<a\s+[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
          let match: RegExpExecArray | null;

          while ((match = linkRegex.exec(html)) !== null) {
            const href = match[1];
            let rawText = match[2].replace(/<[^>]+>/g, '').trim();
            rawText = rawText.replace(/[\u202a\u202c\u200e\u200f]/g, '').trim();

            const folderMatch = href.match(/\/drive\/folders\/([a-zA-Z0-9_-]{25,})/);
            if (folderMatch) {
              const childId = folderMatch[1];
              if (childId !== folderId && !folders.some(f => f.id === childId)) {
                folders.push({ id: childId, name: rawText || 'Untitled Folder' });
              }
              continue;
            }

            const fileMatch = href.match(/\/file\/d\/([a-zA-Z0-9_-]{25,})\//);
            if (fileMatch) {
              const childId = fileMatch[1];
              if (!files.some(f => f.id === childId)) {
                files.push({ id: childId, name: rawText || 'Untitled Notebook' });
              }
            }
          }

          return new Response(JSON.stringify({ title, folders, files }), {
            headers: {
              ...corsHeaders,
              'Content-Type': 'application/json',
              'Cache-Control': 'no-store, max-age=0'
            }
          });
        } catch (err: unknown) {
          const message = err instanceof Error ? err.message : String(err);
          return new Response(JSON.stringify({ error: message }), {
            status: 500,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });
        }
      }

      // 3. Cover Extraction Relay
      if (url.pathname === '/api/cover') {
        const fileId = url.searchParams.get('id');
        if (!fileId) return new Response('Missing id', { status: 400 });

        try {
          const cover = await extractCoverFromDrive(fileId);
          if (cover) {
            return new Response(cover.data.buffer as ArrayBuffer, {
              headers: {
                ...corsHeaders,
                'Content-Type': cover.mimeType,
                'Cache-Control': 'public, max-age=86400'
              }
            });
          }
        } catch {
          // fallback
        }

        const fallbackPng = new Uint8Array([
          0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
          0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01, 0x08, 0x06, 0x00, 0x00, 0x00, 0x1f, 0x15, 0xc4,
          0x89, 0x00, 0x00, 0x00, 0x0a, 0x49, 0x44, 0x41, 0x54, 0x78, 0x9c, 0x63, 0x00, 0x01, 0x00, 0x00,
          0x05, 0x00, 0x01, 0x0d, 0x0a, 0x2d, 0xb4, 0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4e, 0x44, 0xae,
          0x42, 0x60, 0x82
        ]);
        return new Response(fallbackPng.buffer as ArrayBuffer, {
          headers: {
            ...corsHeaders,
            'Content-Type': 'image/png'
          }
        });
      }

      // 4. File Download Relay with Virus Scan Confirmation Support
      if (url.pathname === '/api/file') {
        const fileId = url.searchParams.get('id');
        const filename = url.searchParams.get('name') || 'notebook.nsa';
        if (!fileId) return new Response('Missing id', { status: 400 });

        const driveHeaders = new Headers();
        driveHeaders.set('User-Agent', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)');
        if (request.headers.has('Range')) {
          driveHeaders.set('Range', request.headers.get('Range')!);
        }

        // Always pass &confirm=t for virus scan bypass on files >50MB
        let driveUrl = `https://drive.usercontent.google.com/download?id=${fileId}&export=download&confirm=t`;
        let driveRes = await fetch(driveUrl, { headers: driveHeaders });

        // If response is HTML (warning page), parse the form and follow with uuid token
        const cType = driveRes.headers.get('content-type') || '';
        if (cType.includes('text/html')) {
          const html = await driveRes.text();
          const formMatch = html.match(/<form[^>]*action="([^"]+)"[^>]*>([\s\S]*?)<\/form>/i);
          if (formMatch) {
            const action = formMatch[1];
            const inputs = formMatch[2];
            const params = new URLSearchParams();
            const inputRegex = /<input[^>]*name="([^"]+)"[^>]*value="([^"]*)"/gi;
            let m;
            while ((m = inputRegex.exec(inputs)) !== null) {
              params.set(m[1], m[2]);
            }
            const confirmedUrl = `${action}?${params.toString()}`;
            driveRes = await fetch(confirmedUrl, { headers: driveHeaders });
          }
        }

        const resHeaders = new Headers(driveRes.headers);
        resHeaders.set('Access-Control-Allow-Origin', '*');
        resHeaders.set('Access-Control-Expose-Headers', 'Content-Range, Content-Length, Content-Disposition');
        resHeaders.set('Content-Disposition', `attachment; filename="${encodeURIComponent(filename)}"`);

        return new Response(driveRes.body, {
          status: driveRes.status,
          headers: resHeaders
        });
      }

      return new Response(JSON.stringify({ error: 'Endpoint not found' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Serve Static Assets from Vite build
    return env.ASSETS.fetch(request);
  }
};
