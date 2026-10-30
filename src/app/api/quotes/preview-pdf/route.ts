import { NextRequest, NextResponse } from 'next/server';
import { loadDb } from '@/lib/db';
import { renderEditableQuotePdfBytes } from '@/lib/pdf-generator';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const db = await loadDb();
    const pdfBytes = await renderEditableQuotePdfBytes(body, db.config);

    // A szerkesztő bináris PDF-et kér (harmadával kisebb, mint a base64 JSON)
    if ((req.headers.get('accept') || '').includes('application/pdf')) {
      return new NextResponse(Buffer.from(pdfBytes), {
        headers: { 'Content-Type': 'application/pdf', 'Cache-Control': 'no-store' },
      });
    }

    const pdfBase64 = Buffer.from(pdfBytes).toString('base64');
    return NextResponse.json({
      ok: true,
      pdfBase64,
    });
  } catch (err: any) {
    return NextResponse.json(
      { ok: false, error: err?.message || 'Előnézeti PDF hiba' },
      { status: 500 }
    );
  }
}
