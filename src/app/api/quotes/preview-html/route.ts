import { NextRequest, NextResponse } from 'next/server';
import { loadDb } from '@/lib/db';
import { renderQuoteHtml } from '@/lib/html-generator';

export const dynamic = 'force-dynamic';

/** A szerkesztőben lévő ajánlat HTML-je (Google Dokumentumokba illesztéshez) */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const db = await loadDb({ maxAgeMs: 30_000 });
    const html = await renderQuoteHtml(body, db.config, db.categories);
    return new NextResponse(html, { headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' } });
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err?.message || 'HTML hiba' }, { status: 500 });
  }
}
