import { NextRequest, NextResponse } from 'next/server';
import { loadDb } from '@/lib/db';
import { renderQuoteDocxBytes } from '@/lib/docx-generator';
import { verifyOpenLink } from '@/lib/open-link';

export const dynamic = 'force-dynamic';

/** A Word asztali alkalmazás innen tölti le az ajánlatot (aláírt, lejáró link; bejelentkezés nélkül) */
export async function GET(_req: NextRequest, context: { params: Promise<{ id: string; exp: string; sig: string; name: string }> }) {
  const { id, exp, sig, name } = await context.params;
  if (!verifyOpenLink(decodeURIComponent(id), exp, sig)) return new NextResponse('A link lejárt vagy érvénytelen', { status: 403 });
  const db = await loadDb();
  const quote = db.quotes.find((q) => q.id === decodeURIComponent(id));
  if (!quote) return new NextResponse('Árajánlat nem található', { status: 404 });
  const bytes = await renderQuoteDocxBytes(quote, db.config, db.categories);
  return new NextResponse(new Uint8Array(bytes), {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'Content-Disposition': `inline; filename="${decodeURIComponent(name).replace(/[^\w.\-]+/g, '_')}"`,
      'Cache-Control': 'no-store',
    },
  });
}
