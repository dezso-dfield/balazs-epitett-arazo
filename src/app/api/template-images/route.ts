import fs from 'fs';
import path from 'path';
import { NextRequest, NextResponse } from 'next/server';
import { loadDb, persistDb } from '@/lib/db';
import { UploadedMediaItem } from '@/lib/types';
import { blobEnabled, deleteUploadFromBlob, writeUploadToBlob } from '@/lib/blob-store';

export const dynamic = 'force-dynamic';

export async function GET() {
  const db = await loadDb();
  return NextResponse.json({
    ok: true,
    images: db.mediaLibrary || [],
  });
}

export async function POST(req: NextRequest) {
  try {
    const contentType = req.headers.get('content-type') || '';
    let originalName = 'feltoltott_kep.jpg';
    let buffer: Buffer | null = null;
    let mimeType = 'image/jpeg';

    if (contentType.includes('multipart/form-data')) {
      const formData = await req.formData();
      const file = formData.get('file') as File | null;
      if (!file) {
        return NextResponse.json(
          { ok: false, error: 'Nincs kiválasztott fájl' },
          { status: 400 }
        );
      }
      originalName = file.name || 'kep.jpg';
      mimeType = file.type || 'image/jpeg';
      const arrayBuf = await file.arrayBuffer();
      buffer = Buffer.from(arrayBuf);
    } else {
      const body = await req.json();
      originalName = body.filename || 'kep.jpg';
      const dataUrl: string = body.dataUrl || '';
      const commaIdx = dataUrl.indexOf(',');
      if (commaIdx !== -1) {
        const meta = dataUrl.slice(0, commaIdx);
        const m = meta.match(/data:([^;]+)/);
        if (m) mimeType = m[1];
        buffer = Buffer.from(dataUrl.slice(commaIdx + 1), 'base64');
      }
    }

    if (!buffer || buffer.length === 0) {
      return NextResponse.json(
        { ok: false, error: 'Üres képfájl' },
        { status: 400 }
      );
    }

    const ext =
      path.extname(originalName).toLowerCase() ||
      (mimeType.includes('png') ? '.png' : '.jpg');
    const baseSafe = path
      .basename(originalName, path.extname(originalName))
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-zA-Z0-9_-]+/g, '_')
      .slice(0, 40);

    const uniqueName = `${Date.now()}_${baseSafe || 'foto'}${ext}`;

    let url: string;
    if (blobEnabled()) {
      // Vercelen a public mappa csak olvasható: a kép a tartós tárolóba kerül
      url = await writeUploadToBlob(uniqueName, buffer, mimeType);
    } else {
      const publicUploadsDir = path.join(process.cwd(), 'public', 'uploads');
      fs.mkdirSync(publicUploadsDir, { recursive: true });
      fs.writeFileSync(path.join(publicUploadsDir, uniqueName), buffer);
      url = `/uploads/${uniqueName}`;
    }
    const item: UploadedMediaItem = {
      id: `media_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      filename: uniqueName,
      originalName,
      url,
      uploadedAt: new Date().toISOString(),
    };

    const db = await loadDb();
    db.mediaLibrary = [item, ...(db.mediaLibrary || [])];
    await persistDb(db);

    return NextResponse.json({
      ok: true,
      url,
      item,
    });
  } catch (err: any) {
    return NextResponse.json(
      { ok: false, error: err?.message || 'Képfeltöltési hiba' },
      { status: 500 }
    );
  }
}

export async function DELETE(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const id = searchParams.get('id');
  if (!id) {
    return NextResponse.json({ ok: false, error: 'Hiányzó ID' }, { status: 400 });
  }
  const db = await loadDb();
  const target = (db.mediaLibrary || []).find((m) => m.id === id);
  if (target && blobEnabled()) {
    await deleteUploadFromBlob(target.filename).catch(() => undefined);
  } else if (target) {
    const pubPath = path.join(process.cwd(), 'public', 'uploads', target.filename);
    try {
      if (fs.existsSync(pubPath)) fs.unlinkSync(pubPath);
    } catch {
      // ignore
    }
  }
  db.mediaLibrary = (db.mediaLibrary || []).filter((m) => m.id !== id);
  await persistDb(db);
  return NextResponse.json({ ok: true, mediaLibrary: db.mediaLibrary });
}
