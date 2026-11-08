import { NextRequest, NextResponse } from 'next/server';
import { loadDb } from '@/lib/db';
import { renderQuoteDocxBytes } from '@/lib/docx-generator';

export const dynamic = 'force-dynamic';

/** A szerkesztőben lévő (akár még nem mentett) ajánlat Word (.docx) változata */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const db = await loadDb({ maxAgeMs: 30_000 });
    const bytes = await renderQuoteDocxBytes(body, db.config, db.categories);
    return new NextResponse(new Uint8Array(bytes), {
      headers: { 'Content-Type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'Cache-Control': 'no-store' },
    });
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err?.message || 'Word generálási hiba' }, { status: 500 });
  }
}
