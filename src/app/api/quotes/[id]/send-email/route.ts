import { NextRequest, NextResponse } from 'next/server';
import nodemailer from 'nodemailer';
import { suggestEmailTemplate } from '@/lib/constants';
import { loadDb, persistDb } from '@/lib/db';
import { buildEmailHtml, fillEmailTemplate } from '@/lib/email';
import { renderEditableQuotePdfBytes, sanitizeFilenamePart } from '@/lib/pdf-generator';

export const dynamic = 'force-dynamic';

/**
 * Árajánlat kiküldése e-mailben PDF melléklettel (+ opcionális megnyitás-követő pixel).
 * body: { to, subject?, message?, markOnly? } - markOnly: csak kiküldöttnek jelöli (pl. saját levelezőből küldte)
 */
export async function POST(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const body = await req.json();
    const db = await loadDb();
    const quote = db.quotes.find((q) => q.id === id);
    if (!quote) {
      return NextResponse.json({ ok: false, error: 'Az ajánlat nem található.' }, { status: 404 });
    }

    const to = String(body.to || quote.email || '').trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) {
      return NextResponse.json({ ok: false, error: 'Adj meg egy érvényes e-mail címet.' }, { status: 400 });
    }

    const cfg = db.config.emailSettings;
    const smtpReady = Boolean(cfg.smtpHost && cfg.smtpUser && cfg.smtpPass);

    // Régebbi ajánlatoknak még nincs követő azonosítója
    if (!quote.trackingId) {
      quote.trackingId = `trk-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
    }

    if (!body.markOnly) {
      if (!smtpReady) {
        return NextResponse.json(
          {
            ok: false,
            smtpMissing: true,
            error: 'Nincs beállítva SMTP (Beállítások → E-mail küldés), így a levél nem ment ki.',
          },
          { status: 400 }
        );
      }

      // A küldő ablakban szerkesztett szöveg az irányadó, különben a választott / státuszhoz illő sablon
      const template =
        cfg.templates.find((t) => t.id === body.templateId) ||
        suggestEmailTemplate(cfg, quote.status);
      const subject = fillEmailTemplate(body.subject || template?.subject || '', quote, db.config);
      const message = fillEmailTemplate(body.message || template?.body || '', quote, db.config);
      const baseUrl = (cfg.publicBaseUrl || req.nextUrl.origin).replace(/\/$/, '');
      const trackingPixelUrl = cfg.enableTrackingPixel
        ? `${baseUrl}/api/track/open/${quote.trackingId}.gif`
        : undefined;

      // Mindig a legfrissebb, szerkesztett blokkokból készül a melléklet
      const pdfBytes = await renderEditableQuotePdfBytes(quote, db.config, db.categories);
      const pdfName = `${sanitizeFilenamePart(quote.quoteNumber)}_${sanitizeFilenamePart(
        quote.customerName
      )}_arajanlat.pdf`;

      const transporter = nodemailer.createTransport({
        host: cfg.smtpHost,
        port: Number(cfg.smtpPort) || 587,
        secure: Number(cfg.smtpPort) === 465,
        auth: { user: cfg.smtpUser, pass: cfg.smtpPass },
      });
      await transporter.sendMail({
        from: `"${cfg.senderName || db.config.companyName}" <${cfg.senderEmail || cfg.smtpUser}>`,
        to,
        subject,
        text: message,
        html: buildEmailHtml({ message, quote, config: db.config, trackingPixelUrl }),
        attachments: [{ filename: pdfName, content: Buffer.from(pdfBytes), contentType: 'application/pdf' }],
      });
    }

    const now = new Date().toISOString();
    quote.email = to;
    quote.sentToEmail = to;
    quote.sentAt = now;
    quote.sentCount = (quote.sentCount || 0) + 1;
    quote.updatedAt = now;
    if (quote.status === 'piszkozat') quote.status = 'kikuldve';
    await persistDb(db);

    return NextResponse.json({ ok: true, sent: !body.markOnly, quote });
  } catch (err: any) {
    return NextResponse.json(
      { ok: false, error: `Nem sikerült elküldeni: ${err?.message || 'ismeretlen hiba'}` },
      { status: 500 }
    );
  }
}
