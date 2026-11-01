/**
 * Range-based remote zip reader.
 * Extracts specific files (like cover-shelf-image.png) from a remote .nsa (ZIP) archive
 * using minimal HTTP Range requests without downloading the entire notebook.
 */

interface ZipEntry {
  filename: string;
  compMethod: number;
  compSize: number;
  uncompSize: number;
  localOffset: number;
}

export async function extractCoverFromDrive(fileId: string): Promise<{ data: Uint8Array; mimeType: string } | null> {
  // &confirm=t bypasses Google Drive's "virus scan warning" on large files (>50MB)
  const downloadUrl = `https://drive.usercontent.google.com/download?id=${fileId}&export=download&confirm=t`;

  // 1. Get file size via Range: bytes=0-0
  const headRes = await fetch(downloadUrl, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
      Range: 'bytes=0-0'
    }
  });

  if (!headRes.ok && headRes.status !== 206) {
    return null;
  }

  const contentRange = headRes.headers.get('content-range');
  if (!contentRange) {
    return null;
  }

  const totalSizeMatch = contentRange.match(/\/(\d+)$/);
  if (!totalSizeMatch) return null;
  const totalSize = parseInt(totalSizeMatch[1], 10);
  if (isNaN(totalSize) || totalSize < 100) return null;

  // 2. Fetch last 4096 bytes to find EOCD (End of Central Directory)
  const tailStart = Math.max(0, totalSize - 4096);
  const tailRes = await fetch(downloadUrl, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
      Range: `bytes=${tailStart}-${totalSize - 1}`
    }
  });

  if (!tailRes.ok && tailRes.status !== 206) return null;
  const tailBuf = await tailRes.arrayBuffer();
  const tailBytes = new Uint8Array(tailBuf);

  // Search for EOCD signature: 0x06054b50 (PK\x05\x06)
  let eocdOffsetInTail = -1;
  for (let i = tailBytes.length - 22; i >= 0; i--) {
    if (tailBytes[i] === 0x50 && tailBytes[i + 1] === 0x4b && tailBytes[i + 2] === 0x05 && tailBytes[i + 3] === 0x06) {
      eocdOffsetInTail = i;
      break;
    }
  }

  if (eocdOffsetInTail === -1) return null;

  const view = new DataView(tailBuf, eocdOffsetInTail);
  const cdSize = view.getUint32(12, true);
  const cdOffset = view.getUint32(16, true);

  if (cdSize <= 0 || cdOffset <= 0 || cdOffset + cdSize > totalSize) return null;

  // 3. Fetch Central Directory
  const cdRes = await fetch(downloadUrl, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
      Range: `bytes=${cdOffset}-${cdOffset + cdSize - 1}`
    }
  });

  if (!cdRes.ok && cdRes.status !== 206) return null;
  const cdBuf = await cdRes.arrayBuffer();
  const cdView = new DataView(cdBuf);
  const cdBytes = new Uint8Array(cdBuf);

  let pos = 0;
  const entries: ZipEntry[] = [];
  const textDecoder = new TextDecoder('utf-8');

  while (pos + 46 <= cdBuf.byteLength) {
    if (cdBytes[pos] !== 0x50 || cdBytes[pos + 1] !== 0x4b || cdBytes[pos + 2] !== 0x01 || cdBytes[pos + 3] !== 0x02) {
      break;
    }

    const compMethod = cdView.getUint16(pos + 10, true);
    const compSize = cdView.getUint32(pos + 20, true);
    const uncompSize = cdView.getUint32(pos + 24, true);
    const fnLen = cdView.getUint16(pos + 28, true);
    const extraLen = cdView.getUint16(pos + 30, true);
    const commLen = cdView.getUint16(pos + 32, true);
    const localOffset = cdView.getUint32(pos + 42, true);

    const fnBytes = cdBytes.subarray(pos + 46, pos + 46 + fnLen);
    const filename = textDecoder.decode(fnBytes);

    entries.push({
      filename,
      compMethod,
      compSize,
      uncompSize,
      localOffset
    });

    pos += 46 + fnLen + extraLen + commLen;
  }

  // 4. Find cover image
  const coverEntry = entries.find(e => e.filename.toLowerCase().endsWith('cover-shelf-image.png') || e.filename.toLowerCase().endsWith('.png'));
  if (!coverEntry) return null;

  // 5. Read local header to calculate data payload offset
  const localHeaderRes = await fetch(downloadUrl, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
      Range: `bytes=${coverEntry.localOffset}-${coverEntry.localOffset + 60}`
    }
  });

  if (!localHeaderRes.ok && localHeaderRes.status !== 206) return null;
  const localBuf = await localHeaderRes.arrayBuffer();
  const localView = new DataView(localBuf);
  const localFnLen = localView.getUint16(26, true);
  const localExtraLen = localView.getUint16(28, true);

  const dataStart = coverEntry.localOffset + 30 + localFnLen + localExtraLen;
  const dataEnd = dataStart + coverEntry.compSize - 1;

  // 6. Fetch raw compressed data
  const dataRes = await fetch(downloadUrl, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
      Range: `bytes=${dataStart}-${dataEnd}`
    }
  });

  if (!dataRes.ok && dataRes.status !== 206) return null;
  const rawData = await dataRes.arrayBuffer();

  // 7. Decompress if method 8 (Deflate)
  if (coverEntry.compMethod === 8) {
    try {
      const ds = new DecompressionStream('deflate-raw');
      const writer = ds.writable.getWriter();
      writer.write(new Uint8Array(rawData));
      writer.close();

      const response = new Response(ds.readable);
      const decompressedBuf = await response.arrayBuffer();
      return {
        data: new Uint8Array(decompressedBuf),
        mimeType: 'image/png'
      };
    } catch {
      return null;
    }
  } else if (coverEntry.compMethod === 0) {
    return {
      data: new Uint8Array(rawData),
      mimeType: 'image/png'
    };
  }

  return null;
}
