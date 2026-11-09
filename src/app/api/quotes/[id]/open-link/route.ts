import { NextRequest, NextResponse } from 'next/server';
import { loadDb } from '@/lib/db';
import { signOpenLink } from '@/lib/open-link';
import { sanitizeFilenamePart } from '@/lib/pdf-generator';

export const dynamic = 'force-dynamic';

/** Aláírt, 15 percig érvényes link a mentett ajánlat .docx változatához (Word asztali megnyitáshoz) */
export async function GET(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const db = await loadDb();
  const quote = db.quotes.find((q) => q.id === id);
  if (!quote) return NextResponse.json({ ok: false, error: 'Árajánlat nem található' }, { status: 404 });
  const exp = Math.floor(Date.now() / 1000) + 15 * 60;
  const name = sanitizeFilenamePart(`Arajanlat-${quote.quoteNumber || ''}-${quote.customerName || ''}`) || 'Arajanlat';
  const host = req.headers.get('x-forwarded-host') || req.headers.get('host');
  const proto = (req.headers.get('x-forwarded-proto') || new URL(req.url).protocol.replace(':', '')).split(',')[0];
  const origin = host ? `${proto}://${host}` : new URL(req.url).origin;
  return NextResponse.json({ ok: true, url: `${origin}/api/open/${encodeURIComponent(id)}/${exp}/${signOpenLink(id, exp)}/${encodeURIComponent(name)}.docx` });
}
