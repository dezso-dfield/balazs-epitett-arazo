import { NextRequest, NextResponse } from 'next/server';
import { loadDb, persistDb } from '@/lib/db';
import { generateAndSaveQuotePdf } from '@/lib/pdf-generator';
import { QuoteRecord } from '@/lib/types';

export const dynamic = 'force-dynamic';

export async function GET(
  _req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params;
  const db = await loadDb();
  const quote = db.quotes.find((q) => q.id === id);
  if (!quote) {
    return NextResponse.json({ ok: false, error: 'Nem található' }, { status: 404 });
  }
  return NextResponse.json({ ok: true, quote });
}

export async function PUT(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    const body = await req.json();
    const db = await loadDb();
    const idx = db.quotes.findIndex((q) => q.id === id);

    if (idx === -1) {
      return NextResponse.json(
        { ok: false, error: 'Árajánlat nem található' },
        { status: 404 }
      );
    }

    const current = db.quotes[idx];
    const blocks = Array.isArray(body.blocks) ? body.blocks : current.blocks;
    const firstTemplateBlock = blocks.find((b: any) => b.type === 'template_section');
    const eurHufRate = Number(body.eurHufRate ?? current.eurHufRate ?? 400);

    const primaryTotalEur =
      body.primaryTotalEur !== undefined
        ? Number(body.primaryTotalEur)
        : firstTemplateBlock?.customTotalBaseEur !== undefined
        ? Number(firstTemplateBlock.customTotalBaseEur)
        : current.primaryTotalEur;

    const primaryTotalHuf =
      body.primaryTotalHuf !== undefined
        ? Number(body.primaryTotalHuf)
        : firstTemplateBlock?.customTotalBaseHuf !== undefined
        ? Number(firstTemplateBlock.customTotalBaseHuf)
        : Math.round((primaryTotalEur * eurHufRate) / 1000) * 1000;

    const updated: QuoteRecord = {
      ...current,
      ...body,
      id: current.id,
      quoteNumber: body.quoteNumber || current.quoteNumber,
      updatedAt: new Date().toISOString(),
      blocks,
      eurHufRate,
      primaryTotalEur,
      primaryTotalHuf,
      isEditedAfterGeneration: true,
      acceptedAt:
        body.status === 'elfogadva' && current.status !== 'elfogadva'
          ? new Date().toISOString()
          : current.acceptedAt,
    };

    const { filename, bytes } = await generateAndSaveQuotePdf(updated);
    updated.filename = filename;

    db.quotes[idx] = updated;
    await persistDb(db);

    return NextResponse.json({
      ok: true,
      quote: updated,
      pdfBase64: Buffer.from(bytes).toString('base64'),
    });
  } catch (err: any) {
    return NextResponse.json(
      { ok: false, error: err?.message || 'Hiba a módosítás mentésekor' },
      { status: 500 }
    );
  }
}

export async function DELETE(
  _req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params;
  const db = await loadDb();
  db.quotes = db.quotes.filter((q) => q.id !== id);
  await persistDb(db);
  return NextResponse.json({ ok: true });
}
