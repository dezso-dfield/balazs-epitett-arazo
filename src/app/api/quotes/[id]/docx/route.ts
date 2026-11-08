import { NextRequest, NextResponse } from 'next/server';
import { loadDb } from '@/lib/db';
import { renderQuoteDocxBytes } from '@/lib/docx-generator';
import { sanitizeFilenamePart } from '@/lib/pdf-generator';

export const dynamic = 'force-dynamic';

/** A mentett ajánlat Word (.docx) változata, Wordben tovább szerkeszthető */
export async function GET(_req: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const db = await loadDb();
    const quote = db.quotes.find((q) => q.id === id);
    if (!quote) return new NextResponse('Árajánlat nem található', { status: 404 });
    const bytes = await renderQuoteDocxBytes(quote, db.config, db.categories);
    const fileName = (quote.filename || `${quote.quoteNumber}_${sanitizeFilenamePart(quote.city || 'Budapest')}_${sanitizeFilenamePart(quote.customerName || 'Ugyfel')}.pdf`).replace(/\.pdf$/i, '') + '.docx';
    return new NextResponse(new Uint8Array(bytes), {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'Content-Disposition': `attachment; filename="${encodeURIComponent(fileName)}"`,
        'Cache-Control': 'no-store',
      },
    });
  } catch (err: any) {
    return new NextResponse(err?.message || 'Word generálási hiba', { status: 500 });
  }
}
