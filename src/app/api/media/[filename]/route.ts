import fs from 'fs';
import path from 'path';
import { NextRequest, NextResponse } from 'next/server';
import { blobEnabled, readUploadFromBlob } from '@/lib/blob-store';

export const dynamic = 'force-dynamic';

/** Feltöltött kép kiszolgálása a privát tárolóból (helyben a public/uploads mappából) */
export async function GET(_req: NextRequest, context: { params: Promise<{ filename: string }> }) {
  const { filename } = await context.params;
  const safeName = path.basename(decodeURIComponent(filename));
  const headers = { 'Cache-Control': 'private, max-age=31536000, immutable' };

  if (blobEnabled()) {
    const file = await readUploadFromBlob(safeName);
    if (!file) return new NextResponse('Not found', { status: 404 });
    return new NextResponse(Buffer.from(file.bytes), { headers: { ...headers, 'Content-Type': file.contentType } });
  }

  const local = path.join(process.cwd(), 'public', 'uploads', safeName);
  if (!fs.existsSync(local)) return new NextResponse('Not found', { status: 404 });
  const ext = path.extname(safeName).toLowerCase();
  const type = ext === '.png' ? 'image/png' : ext === '.webp' ? 'image/webp' : 'image/jpeg';
  return new NextResponse(fs.readFileSync(local), { headers: { ...headers, 'Content-Type': type } });
}
