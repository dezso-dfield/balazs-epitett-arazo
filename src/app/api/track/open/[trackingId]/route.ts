import { NextRequest, NextResponse } from 'next/server';
import { loadDb, persistDb } from '@/lib/db';

export const dynamic = 'force-dynamic';

// 1×1 átlátszó GIF
const PIXEL = Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7', 'base64');

/**
 * E-mail megnyitás-követő pixel: csak ténylegesen kiküldött ajánlatnál számol,
 * és a "Kiküldve" státuszt "Megnyitva"-ra állítja.
 */
export async function GET(req: NextRequest, context: { params: Promise<{ trackingId: string }> }) {
  const { trackingId } = await context.params;
  const cleanId = trackingId.replace(/\.(gif|png)$/i, '');
  try {
    const db = await loadDb();
    const quote = db.quotes.find((q) => q.trackingId === cleanId);
    if (quote && (quote.sentCount || 0) > 0 && quote.sentToEmail) {
      const now = new Date().toISOString();
      quote.openCount = (quote.openCount || 0) + 1;
      quote.firstOpenedAt = quote.firstOpenedAt || now;
      quote.lastOpenedAt = now;
      if (quote.status === 'kikuldve' || quote.status === 'piszkozat') quote.status = 'megnyitva';
      db.trackingEvents.unshift({
        id: `evt-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        quoteId: quote.id,
        customerName: quote.customerName,
        email: quote.sentToEmail,
        openedAt: now,
        ipAddress: req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || req.headers.get('x-real-ip') || '',
        userAgent: req.headers.get('user-agent') || '',
      });
      db.trackingEvents = db.trackingEvents.slice(0, 500);
      await persistDb(db);
    }
  } catch (e) {
    console.error('Tracking pixel error:', e);
  }
  return new NextResponse(PIXEL, {
    status: 200,
    headers: {
      'Content-Type': 'image/gif',
      'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
      Pragma: 'no-cache',
      Expires: '0',
    },
  });
}
