import { NextRequest, NextResponse } from 'next/server';
import { nextQuoteNumber } from '@/lib/constants';
import { loadDb, persistDb } from '@/lib/db';
import { generateAndSaveQuotePdf } from '@/lib/pdf-generator';
import { QuoteRecord } from '@/lib/types';

export const dynamic = 'force-dynamic';

export async function GET() {
  const db = await loadDb();
  return NextResponse.json({
    ok: true,
    quotes: db.quotes,
  });
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const db = await loadDb();

    const now = new Date();
    // A Beállításokban megadott előtag és formátum szerint (alapból OSP-ÉÉÉÉ-NNN)
    const quoteNumber =
      body.quoteNumber ||
      nextQuoteNumber(db.config, (db.quotes || []).map((q) => q.quoteNumber), now);
    const id = body.id || `quote_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;

    const blocks = Array.isArray(body.blocks) ? body.blocks : [];
    const firstTemplateBlock = blocks.find((b: any) => b.type === 'template_section');
    const eurHufRate = Number(body.eurHufRate || db.config.defaultEurHufRate || 400);

    const primaryTotalEur =
      body.primaryTotalEur !== undefined
        ? Number(body.primaryTotalEur)
        : Number(firstTemplateBlock?.customTotalBaseEur || 0);

    const primaryTotalHuf =
      body.primaryTotalHuf !== undefined
        ? Number(body.primaryTotalHuf)
        : Number(
            firstTemplateBlock?.customTotalBaseHuf ||
              Math.round((primaryTotalEur * eurHufRate) / 1000) * 1000
          );

    const newQuote: QuoteRecord = {
      id,
      quoteNumber,
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
      status: body.status || 'piszkozat',
      customerName: (body.customerName || 'Ügyfél').trim(),
      greetingName: (body.greetingName || body.customerName || 'Érdeklődő').trim(),
      email: (body.email || '').trim(),
      phone: (body.phone || '').trim(),
      city: (body.city || 'Budapest').trim(),
      inquiryNotes: body.inquiryNotes || '',
      widthCm: Number(body.widthCm || 600),
      projectionCm: Number(body.projectionCm || 400),
      heightCm: Number(body.heightCm || 250),
      mountType: body.mountType || 'Épülethez rögzített',
      eurHufRate,
      deliveryFeeHuf: Number(body.deliveryFeeHuf ?? db.config.defaultDeliveryFeeHuf ?? 40000),
      selectedCategoryIds: Array.isArray(body.selectedCategoryIds) ? body.selectedCategoryIds : [],
      selectedTemplateIds: Array.isArray(body.selectedTemplateIds) ? body.selectedTemplateIds : [],
      blocks,
      primaryTotalEur,
      primaryTotalHuf,
      isEditedAfterGeneration: Boolean(body.isEditedAfterGeneration),
      trackingId: `trk-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
      sentCount: 0,
      openCount: 0,
    };

    const { filename, bytes } = await generateAndSaveQuotePdf(newQuote);
    newQuote.filename = filename;

    db.quotes = [newQuote, ...(db.quotes || [])];
    await persistDb(db);

    return NextResponse.json({
      ok: true,
      quote: newQuote,
      pdfBase64: Buffer.from(bytes).toString('base64'),
    });
  } catch (err: any) {
    return NextResponse.json(
      { ok: false, error: err?.message || 'Hiba az árajánlat mentésekor' },
      { status: 500 }
    );
  }
}
