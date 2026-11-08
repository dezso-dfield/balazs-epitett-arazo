import { NextRequest, NextResponse } from 'next/server';
import { loadDb } from '@/lib/db';
import {
  renderEditableQuotePdfBytes,
  sanitizeFilenamePart,
} from '@/lib/pdf-generator';

export const dynamic = 'force-dynamic';

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    const { searchParams } = new URL(req.url);
    const download = searchParams.get('download') === '1';

    const db = await loadDb();
    const quote = db.quotes.find((q) => q.id === id);

    if (!quote) {
      return new NextResponse('Árajánlat nem található', { status: 404 });
    }

    const pdfBytes = await renderEditableQuotePdfBytes(quote, db.config, db.categories);
    const safeName = sanitizeFilenamePart(quote.customerName || 'Ugyfel');
    const safeCity = sanitizeFilenamePart(quote.city || 'Budapest');
    const fileName =
      quote.filename || `${quote.quoteNumber}_${safeCity}_${safeName}.pdf`;

    return new NextResponse(Buffer.from(pdfBytes), {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `${
          download ? 'attachment' : 'inline'
        }; filename="${encodeURIComponent(fileName)}"`,
        'Cache-Control': 'no-store',
      },
    });
  } catch (err: any) {
    return new NextResponse(err?.message || 'PDF generálási hiba', {
      status: 500,
    });
  }
}
