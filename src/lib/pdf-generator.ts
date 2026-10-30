import fs from 'fs';
import os from 'os';
import path from 'path';
import fontkit from '@pdf-lib/fontkit';
import { PDFDocument, PDFFont, PDFImage, PDFPage, rgb } from 'pdf-lib';
import { formatDotNumber, replaceTemplateVariables } from './constants';
import { getDb, SAVED_PDFS_DIR } from './db';
import { computeBlockTotals } from './pricing-engine';
import {
  ColorOption,
  PhotoCaptionBlock,
  QuoteDocumentBlock,
  QuoteRecord,
  SystemConfig,
} from './types';

export const TMP_PDF_DIR = path.join(os.tmpdir(), 'custom-pricer-pdfs');

export function sanitizeFilenamePart(str: string): string {
  return (
    (str || '')
      .trim()
      .replace(/[\\/:*?"<>|]+/g, '')
      .replace(/\s+/g, '-') || 'Ajanlat'
  );
}

function resolveLocalFileFromUrl(urlOrData: string | undefined): string | null {
  if (!urlOrData) return null;
  const clean = urlOrData.trim().split('?')[0];
  if (clean.startsWith('/uploads/')) {
    const rel = decodeURIComponent(clean.replace(/^\/+/, ''));
    const pubPath = path.join(process.cwd(), 'public', rel);
    if (fs.existsSync(pubPath)) return pubPath;
    const tmpPath = path.join(os.tmpdir(), 'custom-pricer-uploads', path.basename(rel));
    if (fs.existsSync(tmpPath)) return tmpPath;
  }
  if (clean.startsWith('/api/media/file/')) {
    const fname = decodeURIComponent(clean.replace('/api/media/file/', ''));
    const pubPath = path.join(process.cwd(), 'public', 'uploads', fname);
    if (fs.existsSync(pubPath)) return pubPath;
    const tmpPath = path.join(os.tmpdir(), 'custom-pricer-uploads', fname);
    if (fs.existsSync(tmpPath)) return tmpPath;
  }
  return null;
}

async function embedImageFromSource(
  pdfDoc: PDFDocument,
  urlOrData: string | undefined
): Promise<PDFImage | null> {
  if (!urlOrData) return null;
  const trimmed = urlOrData.trim();

  // 1. Base64 Data URL
  if (trimmed.startsWith('data:image/')) {
    try {
      const commaIdx = trimmed.indexOf(',');
      if (commaIdx === -1) return null;
      const b64 = trimmed.slice(commaIdx + 1);
      const bytes = Buffer.from(b64, 'base64');
      if (trimmed.startsWith('data:image/png')) {
        try {
          return await pdfDoc.embedPng(bytes);
        } catch {
          return await pdfDoc.embedJpg(bytes);
        }
      }
      try {
        return await pdfDoc.embedJpg(bytes);
      } catch {
        return await pdfDoc.embedPng(bytes);
      }
    } catch {
      return null;
    }
  }

  // 2. Local file in public/uploads or tmp - ha van kisebb, PDF-re optimalizált másolata
  // (public/uploads/_pdf/<útvonal>.jpg, lásd scripts/optimize-pdf-images.py), azt használjuk
  const originalPath = resolveLocalFileFromUrl(trimmed);
  const uploadsDir = path.join(process.cwd(), 'public', 'uploads');
  const optimizedPath =
    originalPath && originalPath.startsWith(uploadsDir)
      ? path.join(uploadsDir, '_pdf', `${path.relative(uploadsDir, originalPath)}.jpg`)
      : null;
  const localPath =
    optimizedPath && fs.existsSync(optimizedPath) ? optimizedPath : originalPath;
  if (localPath && fs.existsSync(localPath)) {
    try {
      const bytes = fs.readFileSync(localPath);
      const ext = path.extname(localPath).toLowerCase();
      if (ext === '.png') {
        try {
          return await pdfDoc.embedPng(bytes);
        } catch {
          return await pdfDoc.embedJpg(bytes);
        }
      }
      try {
        return await pdfDoc.embedJpg(bytes);
      } catch {
        return await pdfDoc.embedPng(bytes);
      }
    } catch {
      return null;
    }
  }

  return null;
}

function wrapTextLines(
  text: string,
  font: PDFFont,
  fontSize: number,
  maxWidth: number
): string[] {
  const paragraphs = String(text || '').split(/\r?\n/);
  const lines: string[] = [];
  for (const para of paragraphs) {
    const words = para.split(/\s+/).filter(Boolean);
    if (words.length === 0) {
      lines.push('');
      continue;
    }
    let current = words[0];
    for (let i = 1; i < words.length; i++) {
      const candidate = `${current} ${words[i]}`;
      if (font.widthOfTextAtSize(candidate, fontSize) <= maxWidth) {
        current = candidate;
      } else {
        lines.push(current);
        current = words[i];
      }
    }
    lines.push(current);
  }
  return lines;
}

// Az alkalmazással azonos, visszafogott fekete-fehér paletta
const C = {
  ink: rgb(0.04, 0.04, 0.04),
  body: rgb(0.2, 0.2, 0.2),
  muted: rgb(0.4, 0.4, 0.4),
  faint: rgb(0.6, 0.6, 0.6),
  line: rgb(0.9, 0.9, 0.9),
  brand: rgb(0.067, 0.067, 0.067),
  white: rgb(1, 1, 1),
};

/**
 * Lekerekített téglalap (a pdf-lib-ben nincs rádiusz): `top` a felső él y koordinátája.
 */
function drawRoundedRect(
  page: PDFPage,
  x: number,
  top: number,
  w: number,
  h: number,
  r: number,
  fill: ReturnType<typeof rgb>
) {
  const rr = Math.min(r, w / 2, h / 2);
  const d = `M ${rr} 0 H ${w - rr} Q ${w} 0 ${w} ${rr} V ${h - rr} Q ${w} ${h} ${w - rr} ${h} H ${rr} Q 0 ${h} 0 ${h - rr} V ${rr} Q 0 0 ${rr} 0 Z`;
  page.drawSvgPath(d, { x, y: top, color: fill, borderWidth: 0 });
}

/**
 * Egyszerű, áttekinthető árajánlat PDF:
 * fejléc (logó + cég + elérhetőség) → "Árajánlat" cím és alapadatok → megszólítás →
 * termékenként: cím, szöveg, fotó, 3 oszlopos ártáblázat, végösszeg, extrák → feltételek.
 */
export async function renderEditableQuotePdfBytes(
  quote: Partial<QuoteRecord>,
  config: SystemConfig
): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.create();
  pdfDoc.registerFontkit(fontkit);

  const fontDir = path.join(process.cwd(), 'public', 'template-assets', 'fonts');
  // Csak a használt karakterek kerülnek a PDF-be (a teljes Arial ~1,5 MB lenne)
  const fontRegular = await pdfDoc.embedFont(fs.readFileSync(path.join(fontDir, 'arial.ttf')), { subset: true });
  const fontBold = await pdfDoc.embedFont(fs.readFileSync(path.join(fontDir, 'arialbd.ttf')), { subset: true });

  const bgImg = await embedImageFromSource(pdfDoc, config.pdfPageBackgroundUrl);
  const logoImg = await embedImageFromSource(pdfDoc, config.pdfLogoUrl);
  const sigCardImg = await embedImageFromSource(pdfDoc, config.pdfSignatureCardUrl);

  const A4_W = 595.28;
  const A4_H = 841.89;
  const MARGIN_X = 52;
  const CONTENT_W = A4_W - MARGIN_X * 2;
  const RIGHT_X = MARGIN_X + CONTENT_W;
  const BOTTOM_Y = 70;

  const companyName = config.companyName || 'OpenSky Pergola Kft.';
  const quoteNumber = quote.quoteNumber || 'ELŐNÉZET';
  const issueDate = new Date(quote.createdAt || Date.now()).toLocaleDateString('hu-HU');
  const contactLine = [config.companyPhone, config.companyEmail, config.companyWebsite]
    .filter(Boolean)
    .join('  ·  ');

  const pages: PDFPage[] = [];
  const textW = (t: string, f: PDFFont, sz: number) => f.widthOfTextAtSize(t, sz);
  const drawRight = (page: PDFPage, t: string, y: number, sz: number, f: PDFFont, color = C.ink, rightX = RIGHT_X) =>
    page.drawText(t, { x: rightX - textW(t, f, sz), y, size: sz, font: f, color });
  const hLine = (page: PDFPage, y: number, thickness = 0.7, color = C.line) =>
    page.drawRectangle({ x: MARGIN_X, y, width: CONTENT_W, height: thickness, color });

  // Logó: feltöltött kép, vagy fekete négyzet a cégnév kezdőbetűjével (mint az app oldalsávja)
  const drawLogo = (page: PDFPage, x: number, top: number, size: number) => {
    if (logoImg) {
      const dims = logoImg.scale(1);
      const ratio = dims.height / Math.max(1, dims.width);
      const w = Math.min(130, size / ratio);
      page.drawImage(logoImg, { x, y: top - size, width: w, height: size });
      return w;
    }
    drawRoundedRect(page, x, top, size, size, 6, C.brand);
    const initial = companyName.charAt(0).toUpperCase();
    const isz = size * 0.52;
    page.drawText(initial, {
      x: x + (size - textW(initial, fontBold, isz)) / 2,
      y: top - size / 2 - isz * 0.36,
      size: isz,
      font: fontBold,
      color: C.white,
    });
    return size;
  };

  const createNewPage = (): { page: PDFPage; y: number } => {
    const page = pdfDoc.addPage([A4_W, A4_H]);
    pages.push(page);
    if (bgImg) {
      page.drawImage(bgImg, { x: 0, y: 0, width: A4_W, height: A4_H });
      return { page, y: A4_H - 100 };
    }
    const top = A4_H - 46;
    if (pages.length === 1) {
      if (logoImg) {
        // Saját logó (a cégnevet tartalmazza): csak a logó, alatta a tevékenységek
        drawLogo(page, MARGIN_X, top + 2, 24);
        if (config.companySubtitle) {
          page.drawText(config.companySubtitle, { x: MARGIN_X, y: top - 33, size: 8, font: fontRegular, color: C.muted });
        }
      } else {
        const logoW = drawLogo(page, MARGIN_X, top, 30);
        const tx = MARGIN_X + logoW + 10;
        page.drawText(companyName, { x: tx, y: top - 13, size: 12.5, font: fontBold, color: C.ink });
        if (config.companySubtitle) {
          page.drawText(config.companySubtitle, { x: tx, y: top - 26, size: 8, font: fontRegular, color: C.muted });
        }
      }
      if (config.companyEmail) drawRight(page, config.companyEmail, top - 11, 8.5, fontRegular, C.muted);
      const secondary = [config.companyWebsite, config.companyPhone].filter(Boolean).join('  ·  ');
      if (secondary) drawRight(page, secondary, top - 24, 8.5, fontRegular, C.muted);
      hLine(page, top - 44);
      return { page, y: top - 44 };
    }
    page.drawText(companyName, { x: MARGIN_X, y: top - 8, size: 9, font: fontBold, color: C.ink });
    drawRight(page, `Árajánlat ${quoteNumber}`, top - 8, 8.5, fontRegular, C.muted);
    hLine(page, top - 20);
    return { page, y: top - 34 };
  };

  let current = createNewPage();

  const ensureSpace = (neededHeight: number) => {
    if (current.y - neededHeight < BOTTOM_Y) current = createNewPage();
  };

  const varCtx = {
    customerName: quote.customerName || 'Ügyfél',
    greetingName: quote.greetingName || quote.customerName || 'Érdeklődő',
    city: quote.city || 'Budapest',
    widthCm: quote.widthCm || 600,
    projectionCm: quote.projectionCm || 400,
    heightCm: quote.heightCm || 250,
    mountType: quote.mountType || 'Épülethez rögzített',
    eurHufRate: quote.eurHufRate || config.defaultEurHufRate || 400,
    deliveryFeeHuf: quote.deliveryFeeHuf ?? config.defaultDeliveryFeeHuf ?? 40000,
  };

  const drawTextParagraph = (
    rawText: string,
    opts?: {
      bold?: boolean;
      size?: number;
      color?: ReturnType<typeof rgb>;
      align?: 'left' | 'center' | 'right';
      indentX?: number;
      maxWidth?: number;
      lineHeight?: number;
    }
  ) => {
    const resolved = replaceTemplateVariables(rawText, varCtx);
    if (!resolved.trim()) return;
    const f = opts?.bold ? fontBold : fontRegular;
    const sz = opts?.size ?? 10;
    const indent = opts?.indentX ?? 0;
    const maxW = opts?.maxWidth ?? CONTENT_W - indent;
    const lines = wrapTextLines(resolved, f, sz, maxW);
    const lh = sz * (opts?.lineHeight ?? 1.5);
    for (const line of lines) {
      ensureSpace(lh + 2);
      current.y -= lh;
      if (!line) continue;
      const lw = textW(line, f, sz);
      let x = MARGIN_X + indent;
      if (opts?.align === 'center') x = MARGIN_X + indent + (maxW - lw) / 2;
      else if (opts?.align === 'right') x = MARGIN_X + indent + maxW - lw;
      current.page.drawText(line, { x, y: current.y, size: sz, font: f, color: opts?.color ?? C.body });
    }
  };

  const drawHeading = (text: string, size: number) => {
    ensureSpace(size * 3);
    drawTextParagraph(text, { bold: true, size, color: C.ink, lineHeight: 1.3 });
  };

  const drawPhotoWithCaption = async (photoBlock: PhotoCaptionBlock, maxHeightPt = 190) => {
    if (!photoBlock) return;
    const titleAbove = replaceTemplateVariables(photoBlock.titleAbove || '', varCtx).trim();
    const captionBelow = replaceTemplateVariables(photoBlock.captionBelow || '', varCtx).trim();
    const img = await embedImageFromSource(pdfDoc, photoBlock.imageUrl);

    if (titleAbove) {
      ensureSpace(40);
      drawTextParagraph(titleAbove, { bold: true, size: 9.5, color: C.ink });
      current.y -= 4;
    }
    if (img) {
      const dims = img.scale(1);
      const ratio = dims.height / Math.max(1, dims.width);
      const widthPct = Math.min(100, Math.max(30, Number(photoBlock.widthPct) || 75));
      let targetW = CONTENT_W * (widthPct / 100);
      let targetH = targetW * ratio;
      if (targetH > maxHeightPt) {
        targetH = maxHeightPt;
        targetW = targetH / ratio;
      }
      ensureSpace(targetH + (captionBelow ? 28 : 8));
      let x = MARGIN_X + (CONTENT_W - targetW) / 2;
      if (photoBlock.align === 'left') x = MARGIN_X;
      if (photoBlock.align === 'right') x = RIGHT_X - targetW;
      const imgY = current.y - targetH;
      current.page.drawImage(img, { x, y: imgY, width: targetW, height: targetH });
      current.y = imgY - 2;
      if (captionBelow) {
        drawTextParagraph(captionBelow, {
          size: 8.5,
          color: C.muted,
          align: photoBlock.align === 'left' ? 'left' : 'center',
          indentX: x - MARGIN_X,
          maxWidth: targetW,
        });
      }
    } else if (captionBelow) {
      drawTextParagraph(captionBelow, { size: 9, color: C.muted });
    }
    current.y -= 14;
  };

  // Színminták: kitöltött négyzet + kód + felület, 7 egy sorban
  const hexToRgb = (hex: string) => {
    const m = /^#?([0-9a-f]{6})$/i.exec((hex || '').trim());
    const n = m ? parseInt(m[1], 16) : 0xcccccc;
    return rgb(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255);
  };
  const drawColorSwatches = (title: string, colors: ColorOption[]) => {
    if (!colors.length) return;
    const COLS = 7;
    const GAP = 8;
    const cellW = (CONTENT_W - GAP * (COLS - 1)) / COLS;
    const SW = 26;
    ensureSpace(70);
    drawTextParagraph(title, { bold: true, size: 9, color: C.ink, lineHeight: 1.3 });
    current.y -= 6;
    for (let i = 0; i < colors.length; i += COLS) {
      const cells = colors.slice(i, i + COLS).map((c) => ({
        c,
        codeLines: wrapTextLines(c.code, fontBold, 7.5, cellW).slice(0, 2),
        nameLines: c.name ? wrapTextLines(c.name, fontRegular, 7, cellW).slice(0, 2) : [],
      }));
      const rowH = SW + 6 + Math.max(...cells.map((x) => x.codeLines.length * 9 + x.nameLines.length * 8.5));
      ensureSpace(rowH + 8);
      const top = current.y;
      cells.forEach(({ c, codeLines, nameLines }, idx) => {
        const x = MARGIN_X + idx * (cellW + GAP);
        drawRoundedRect(current.page, x, top, SW, SW, 4, hexToRgb(c.hex));
        // Világos színeknél is látszó keret
        current.page.drawSvgPath(
          `M 4 0 H ${SW - 4} Q ${SW} 0 ${SW} 4 V ${SW - 4} Q ${SW} ${SW} ${SW - 4} ${SW} H 4 Q 0 ${SW} 0 ${SW - 4} V 4 Q 0 0 4 0 Z`,
          { x, y: top, borderColor: C.line, borderWidth: 0.8 }
        );
        let y = top - SW - 9;
        for (const cl of codeLines) {
          current.page.drawText(cl, { x, y, size: 7.5, font: fontBold, color: C.ink });
          y -= 9;
        }
        for (const nl of nameLines) {
          current.page.drawText(nl, { x, y, size: 7, font: fontRegular, color: C.muted });
          y -= 8.5;
        }
      });
      current.y = top - rowH - 8;
    }
    current.y -= 4;
  };

  // Részletképek kis sorokban (4 egy sorban), rövid felirattal
  const drawSubPhotoRow = async (subs: PhotoCaptionBlock[], maxCellH = 82) => {
    const COLS = 4;
    const GAP = 10;
    const cellW = (CONTENT_W - GAP * (COLS - 1)) / COLS;
    const loaded = (
      await Promise.all(subs.map(async (p) => ({ p, img: await embedImageFromSource(pdfDoc, p.imageUrl) })))
    ).filter((x) => x.img);
    for (let i = 0; i < loaded.length; i += COLS) {
      const cells = loaded.slice(i, i + COLS).map(({ p, img }) => {
        const dims = img!.scale(1);
        const ratio = dims.height / Math.max(1, dims.width);
        let w = cellW;
        let h = w * ratio;
        if (h > maxCellH) {
          h = maxCellH;
          w = h / ratio;
        }
        const caption = replaceTemplateVariables(p.captionBelow || p.titleAbove || '', varCtx).trim();
        const capLines = caption ? wrapTextLines(caption, fontRegular, 7.5, cellW).slice(0, 3) : [];
        return { img: img!, w, h, capLines };
      });
      const rowH = Math.max(...cells.map((c) => c.h + (c.capLines.length ? c.capLines.length * 9.5 + 3 : 0)));
      ensureSpace(rowH + 10);
      const top = current.y;
      cells.forEach((c, idx) => {
        const x = MARGIN_X + idx * (cellW + GAP);
        current.page.drawImage(c.img, { x, y: top - c.h, width: c.w, height: c.h });
        let y = top - c.h - 3;
        for (const cl of c.capLines) {
          y -= 7.5;
          current.page.drawText(cl, { x, y, size: 7.5, font: fontRegular, color: C.muted });
          y -= 2;
        }
      });
      current.y = top - rowH - 10;
    }
  };

  // Képek 2 oszlopban: cím a kép fölött, felirat alatta; soronként a magasabb kép szabja a sor magasságát
  const drawPhotoGrid = async (photos: PhotoCaptionBlock[], maxCellH = 150) => {
    const GAP = 14;
    const cellW = (CONTENT_W - GAP) / 2;
    const loaded = await Promise.all(
      photos.map(async (p) => ({ p, img: await embedImageFromSource(pdfDoc, p.imageUrl) }))
    );
    const items = loaded.filter((x) => x.img);
    for (let i = 0; i < items.length; i += 2) {
      const pair = items.slice(i, i + 2).map(({ p, img }) => {
        const dims = img!.scale(1);
        const ratio = dims.height / Math.max(1, dims.width);
        let w = cellW;
        let h = w * ratio;
        if (h > maxCellH) {
          h = maxCellH;
          w = h / ratio;
        }
        const title = replaceTemplateVariables(p.titleAbove || '', varCtx).trim();
        const caption = replaceTemplateVariables(p.captionBelow || '', varCtx).trim();
        const titleLines = title ? wrapTextLines(title, fontBold, 8.5, cellW).slice(0, 2) : [];
        const capLines = caption ? wrapTextLines(caption, fontRegular, 8, cellW).slice(0, 4) : [];
        return { img: img!, w, h, titleLines, capLines };
      });
      const rowH = Math.max(
        ...pair.map((c) => c.titleLines.length * 11 + c.h + (c.capLines.length ? c.capLines.length * 10.5 + 4 : 0))
      );
      ensureSpace(rowH + 16);
      const top = current.y;
      pair.forEach((c, idx) => {
        const x = MARGIN_X + idx * (cellW + GAP);
        let y = top;
        for (const tl of c.titleLines) {
          y -= 9;
          current.page.drawText(tl, { x, y, size: 8.5, font: fontBold, color: C.ink });
          y -= 2;
        }
        if (c.titleLines.length) y -= 3;
        current.page.drawImage(c.img, { x, y: y - c.h, width: c.w, height: c.h });
        y -= c.h + 4;
        for (const cl of c.capLines) {
          y -= 8;
          current.page.drawText(cl, { x, y, size: 8, font: fontRegular, color: C.muted });
          y -= 2.5;
        }
      });
      current.y = top - rowH - 14;
    }
  };

  // ---- Cím és alapadatok (csak az első oldalon) ----
  {
    current.y -= 34;
    current.page.drawText('Árajánlat', { x: MARGIN_X, y: current.y, size: 24, font: fontBold, color: C.ink });
    current.y -= 18;
    current.page.drawText(`${quoteNumber}   ·   ${issueDate}   ·   Érvényes 30 napig`, {
      x: MARGIN_X, y: current.y, size: 9, font: fontRegular, color: C.muted,
    });
    current.y -= 28;

    const m2 = ((Number(varCtx.widthCm) / 100) * (Number(varCtx.projectionCm) / 100)).toFixed(1).replace('.', ',');
    // Minden adat teljes hosszában, sortöréssel (nincs „…” rövidítés)
    const facts: [string, string, string[]][] = [
      ['Ügyfél', varCtx.customerName, [quote.city, quote.phone, quote.email].filter(Boolean) as string[]],
      ['Méret', `${varCtx.widthCm} × ${varCtx.projectionCm} × ${varCtx.heightCm} cm`, [`${m2} m²`]],
      ['Beépítés', varCtx.mountType, []],
    ];
    const colW = CONTENT_W / 3;
    const factsTop = current.y;
    let factsBottom = current.y;
    facts.forEach(([label, main, subs], i) => {
      const x = MARGIN_X + colW * i;
      const maxW = colW - 14;
      let y = factsTop;
      current.page.drawText(label, { x, y, size: 8, font: fontRegular, color: C.faint });
      y -= 15;
      for (const line of wrapTextLines(main, fontBold, 10.5, maxW)) {
        current.page.drawText(line, { x, y, size: 10.5, font: fontBold, color: C.ink });
        y -= 13;
      }
      for (const sub of subs) {
        for (const line of wrapTextLines(sub, fontRegular, 8.5, maxW)) {
          current.page.drawText(line, { x, y, size: 8.5, font: fontRegular, color: C.muted });
          y -= 11;
        }
      }
      factsBottom = Math.min(factsBottom, y);
    });
    current.y = factsBottom - 6;
    hLine(current.page, current.y);
    current.y -= 26;
  }

  const blocks: QuoteDocumentBlock[] = Array.isArray(quote.blocks) ? quote.blocks : [];

  for (const block of blocks) {
    if (block.type === 'page_break') {
      current = createNewPage();
      continue;
    }

    if (block.type === 'text_box') {
      const isTerms = block.textStyle === 'footer_info';
      if (block.title) {
        drawHeading(replaceTemplateVariables(block.title, varCtx), block.textStyle === 'greeting' ? 13 : 11);
        current.y -= 2;
      }
      if (block.content) {
        drawTextParagraph(block.content, {
          bold: Boolean(block.bold),
          size: isTerms ? 9 : 10,
          color: isTerms ? C.muted : C.body,
          align: block.align || 'left',
        });
      }
      current.y -= 20;
      continue;
    }

    if (block.type === 'photo_box' && block.photo) {
      await drawPhotoWithCaption(block.photo, 230);
      const subs = (block.photo.subPhotos || []).filter((p) => p.imageUrl);
      if (subs.length) await drawSubPhotoRow(subs);
      continue;
    }

    if (block.type !== 'template_section') continue;

    // ---- Termék szekció ----
    ensureSpace(120);
    if (block.sectionTitle) {
      // A "1. Sablon (600×400×250 cm - …)" előtagot és méretet az alapadatok már mutatják
      const title = replaceTemplateVariables(block.sectionTitle, varCtx)
        .replace(/^\d+\.\s*/, '')
        .replace(/\s*\(\d+\s*[×x]\s*\d+[^)]*\)\s*$/, '');
      drawHeading(title, 15);
    }
    if (block.sectionSubtitle) {
      drawTextParagraph(block.sectionSubtitle, { size: 9.5, color: C.muted });
    }
    current.y -= 8;
    if (block.sectionIntroText) {
      drawTextParagraph(block.sectionIntroText, { size: 10 });
      current.y -= 12;
    }

    // Termékfotók: az első nagyban, a többi 2 oszlopos rácsban
    const sectionPhotos = (block.sectionPhotos || []).filter((sp) => sp.imageUrl);
    if (sectionPhotos.length > 0) {
      await drawPhotoWithCaption(sectionPhotos[0], 200);
      const heroSubs = (sectionPhotos[0].subPhotos || []).filter((p) => p.imageUrl);
      if (heroSubs.length) await drawSubPhotoRow(heroSubs);
      if (sectionPhotos.length > 1) {
        await drawPhotoGrid(sectionPhotos.slice(1));
        const restSubs = sectionPhotos.slice(1).flatMap((p) => (p.subPhotos || []).filter((x) => x.imageUrl));
        if (restSubs.length) await drawSubPhotoRow(restSubs);
      }
    }

    const activeRows = (block.rows || []).filter((r) => r.included !== false);

    if (activeRows.length > 0) {
      // 3 oszlop: Tétel | Mennyiség | Ár (a listaár kicsiben, áthúzva az ár fölött)
      const QTY_X = MARGIN_X + CONTENT_W * 0.58;
      const NAME_W = CONTENT_W * 0.55;
      const discountLabel = (block.tableHeaders?.[3] || '').match(/\(([^)]*%[^)]*)\)/)?.[1];

      const drawTableHeader = () => {
        ensureSpace(70);
        current.page.drawText('Tétel', { x: MARGIN_X, y: current.y - 10, size: 8, font: fontRegular, color: C.faint });
        current.page.drawText('Mennyiség', { x: QTY_X, y: current.y - 10, size: 8, font: fontRegular, color: C.faint });
        drawRight(current.page, discountLabel ? `Ár (${discountLabel})` : 'Ár', current.y - 10, 8, fontRegular, C.faint);
        current.y -= 18;
        hLine(current.page, current.y, 0.9, C.ink);
      };

      const drawRow = (row: {
        name: string;
        description?: string;
        qty: string;
        price: string;
        list?: string;
        note?: string;
      }) => {
        const nameLines = wrapTextLines(row.name, fontBold, 9.8, NAME_W);
        const descLines = row.description ? wrapTextLines(row.description, fontRegular, 8.5, NAME_W) : [];
        // Mennyiség és megjegyzés teljes hosszában, tördelve
        const qtyLines = row.qty ? wrapTextLines(row.qty, fontRegular, 9.5, RIGHT_X - QTY_X - 90) : [];
        const noteLines = row.note ? wrapTextLines(row.note, fontRegular, 8, 120) : [];
        const leftH = nameLines.length * 13 + descLines.length * 11.5;
        const rightH = (row.list ? 11 : 0) + 13 + noteLines.length * 10;
        const rowH = Math.max(leftH, rightH, qtyLines.length * 12) + 18;
        if (current.y - rowH < BOTTOM_Y) {
          current = createNewPage();
          drawTableHeader();
        }
        const top = current.y;
        let ly = top - 9;
        for (const nl of nameLines) {
          ly -= 10;
          current.page.drawText(nl, { x: MARGIN_X, y: ly, size: 9.8, font: fontBold, color: C.ink });
          ly -= 3;
        }
        for (const dl of descLines) {
          ly -= 9;
          current.page.drawText(dl, { x: MARGIN_X, y: ly, size: 8.5, font: fontRegular, color: C.muted });
          ly -= 2.5;
        }
        qtyLines.forEach((ql, qi) =>
          current.page.drawText(ql, { x: QTY_X, y: top - 19 - qi * 12, size: 9.5, font: fontRegular, color: C.muted })
        );
        let ry = top - 19;
        if (row.list) {
          const lw = textW(row.list, fontRegular, 8);
          drawRight(current.page, row.list, top - 16, 8, fontRegular, C.faint);
          current.page.drawRectangle({ x: RIGHT_X - lw, y: top - 13.2, width: lw, height: 0.5, color: C.faint });
          ry = top - 29;
        }
        drawRight(current.page, row.price, ry, 10.5, fontBold, C.ink);
        noteLines.forEach((nl, ni) => drawRight(current.page, nl, ry - 12 - ni * 10, 8, fontRegular, C.muted));
        current.y = top - rowH;
        hLine(current.page, current.y);
      };

      const eurRate = Number(quote.eurHufRate || config.defaultEurHufRate || 400);
      const blockTotals = computeBlockTotals(block, eurRate);
      const baseRows = activeRows.filter((r) => r.itemRole === 'base' || r.itemRole === 'gift');
      // Szerkezet (alaptételek, ajándékok) és a kiválasztott extrák külön csoportban
      const structureRows = baseRows.filter((r) => !r.chosenExtra);
      const chosenExtraRows = baseRows.filter((r) => r.chosenExtra);
      const optionalRows = activeRows.filter((r) => r.itemRole === 'optional');
      // A vevő elől rejtett árkorrekció az első alaptétel árába olvad bele
      const hiddenAdjTargetId = (structureRows.length ? structureRows : baseRows).find(
        (r) => r.itemRole === 'base' && r.discountPriceEur > 0
      )?.id;

      current.y -= 4;
      drawTableHeader();

      const drawBaseRow = (r: (typeof baseRows)[number]) => {
        const hiddenAdj = r.id === hiddenAdjTargetId ? blockTotals.hiddenAdjustmentsEur : 0;
        const price = (Number(r.discountPriceEur) || 0) + hiddenAdj;
        const list =
          r.listPriceEur > 0 && r.discountPriceEur > 0
            ? Math.round((r.listPriceEur / r.discountPriceEur) * price)
            : r.listPriceEur;
        const isGift = r.itemRole === 'gift' || price === 0;
        const note = (r.note || '').trim();
        drawRow({
          name: replaceTemplateVariables(r.name, varCtx),
          description: replaceTemplateVariables(r.description || '', varCtx),
          qty: r.quantityLabel || '1 db',
          price: isGift ? 'Ajándék' : `${formatDotNumber(price)} EUR`,
          list: !isGift && list > price ? `${formatDotNumber(list)} EUR` : undefined,
          // Az általános kedvezménycímke már a fejlécben van, nem ismételjük soronként
          note: note && note !== discountLabel && !/aj[aá]nd[eé]k/i.test(note) ? note : undefined,
        });
      };
      const rowPrice = (r: (typeof baseRows)[number]) =>
        (Number(r.discountPriceEur) || 0) + (r.id === hiddenAdjTargetId ? blockTotals.hiddenAdjustmentsEur : 0);

      structureRows.forEach(drawBaseRow);

      // Részösszeg a szerkezetre, ha vannak kiválasztott extrák
      if (chosenExtraRows.length > 0 && structureRows.length > 0) {
        const sub = structureRows.reduce((sum, r) => sum + (r.itemRole === 'gift' ? 0 : rowPrice(r)), 0);
        ensureSpace(40);
        const top = current.y;
        current.page.drawText('Szerkezet összesen', { x: MARGIN_X, y: top - 17, size: 10, font: fontBold, color: C.ink });
        drawRight(current.page, `${formatDotNumber(sub)} EUR`, top - 17, 11, fontBold, C.ink);
        current.y = top - 28;
        hLine(current.page, current.y, 0.9, C.ink);
        current.y -= 14;
        drawHeading('Kiválasztott extrák', 11);
        current.y -= 2;
        drawTableHeader();
      }
      chosenExtraRows.forEach(drawBaseRow);

      for (const adj of (block.adjustments || []).filter((a) => a.visibleToCustomer && Number(a.amountEur) !== 0)) {
        const amount = Number(adj.amountEur) || 0;
        drawRow({
          name: replaceTemplateVariables(adj.label || 'Árkorrekció', varCtx),
          description: replaceTemplateVariables(adj.reason || '', varCtx),
          qty: '',
          price: `${amount > 0 ? '+' : '−'} ${formatDotNumber(Math.abs(amount))} EUR`,
        });
      }

      // ---- Végösszeg ----
      ensureSpace(64);
      current.y -= 2;
      hLine(current.page, current.y, 1.4, C.ink);
      const totalTop = current.y;
      current.page.drawText('Összesen', { x: MARGIN_X, y: totalTop - 22, size: 12, font: fontBold, color: C.ink });
      current.page.drawText(`nettó ár  ·  ${eurRate} Ft/EUR`, {
        x: MARGIN_X, y: totalTop - 36, size: 8.5, font: fontRegular, color: C.muted,
      });
      drawRight(current.page, `${formatDotNumber(blockTotals.totalEur)} EUR (+ ÁFA)`, totalTop - 24, 18, fontBold, C.ink);
      drawRight(current.page, `${formatDotNumber(blockTotals.totalHuf)} Ft (+ ÁFA)`, totalTop - 38, 9.5, fontRegular, C.muted);
      current.y = totalTop - 56;

      // ---- Választható extrák ----
      if (optionalRows.length > 0) {
        current.y -= 8;
        drawHeading('Választható extrák', 11);
        drawTextParagraph('Igény esetén a fenti összegen felül.', { size: 8.5, color: C.muted });
        current.y -= 4;
        drawTableHeader();
        for (const r of optionalRows) {
          const huf = Math.round(((Number(r.discountPriceEur) || 0) * eurRate) / 1000) * 1000;
          drawRow({
            name: replaceTemplateVariables(r.name, varCtx),
            description: replaceTemplateVariables(r.description || '', varCtx),
            qty: r.quantityLabel || '',
            price: `+ ${formatDotNumber(r.discountPriceEur)} EUR`,
            list: r.listPriceEur > r.discountPriceEur ? `${formatDotNumber(r.listPriceEur)} EUR` : undefined,
            note: `${formatDotNumber(huf)} Ft`,
          });
        }
        current.y -= 10;
      }
    }

    // A kiválasztott tételek (pl. LED, RAL színek, ZIP, üvegfal) képei a táblázat után
    const rowPhotos = activeRows.flatMap((row) =>
      (row.photos || [])
        .filter((rp) => rp.imageUrl)
        .map((rp) => ({ ...rp, titleAbove: rp.titleAbove || row.name }))
    );
    if (rowPhotos.length > 0) {
      current.y -= 6;
      await drawPhotoGrid(rowPhotos);
      const rowSubs = rowPhotos.flatMap((p) => (p.subPhotos || []).filter((x) => x.imageUrl));
      if (rowSubs.length) await drawSubPhotoRow(rowSubs);
    }

    // Színválaszték a bekerült tételeknél (alapszínek, választható RAL színek)
    for (const row of activeRows) {
      const colors = row.algorithm?.colorOptions || [];
      if (colors.length) {
        drawColorSwatches(row.algorithm?.colorTitle || row.name, colors);
      }
    }

    if (block.sectionClosingText) {
      current.y -= 4;
      drawTextParagraph(block.sectionClosingText, { size: 9, color: C.muted });
    }
    current.y -= 30;
  }

  if (sigCardImg) {
    const dims = sigCardImg.scale(1);
    const ratio = dims.height / Math.max(1, dims.width);
    let w = 210;
    let h = w * ratio;
    if (h > 95) {
      h = 95;
      w = h / ratio;
    }
    ensureSpace(h + 15);
    current.page.drawImage(sigCardImg, { x: MARGIN_X, y: current.y - h, width: w, height: h });
    current.y -= h + 10;
  }

  // Lábléc: cégnév + elérhetőség, oldalszám
  if (!bgImg) {
    const footer = [companyName, contactLine].filter(Boolean).join('  ·  ');
    pages.forEach((p, i) => {
      hLine(p, 46);
      p.drawText(footer, { x: MARGIN_X, y: 32, size: 7.8, font: fontRegular, color: C.faint });
      drawRight(p, `${i + 1} / ${pages.length}`, 32, 7.8, fontRegular, C.faint);
    });
  }

  return await pdfDoc.save();
}

export async function generateAndSaveQuotePdf(
  quote: QuoteRecord
): Promise<{ filename: string; bytes: Uint8Array }> {
  const db = getDb();
  const bytes = await renderEditableQuotePdfBytes(quote, db.config);

  const datePart = (quote.createdAt || new Date().toISOString()).slice(0, 10).replace(/-/g, '');
  const citySafe = sanitizeFilenamePart(quote.city || 'Budapest');
  const nameSafe = sanitizeFilenamePart(quote.customerName || 'Ugyfel');
  const suffix = quote.isEditedAfterGeneration ? 'arajanlat-szerkesztett' : 'arajanlat';
  const filename = `${datePart}_${citySafe}_${nameSafe}_${quote.quoteNumber || quote.id}_${suffix}.pdf`;

  try {
    fs.mkdirSync(SAVED_PDFS_DIR, { recursive: true });
    fs.writeFileSync(path.join(SAVED_PDFS_DIR, filename), bytes);
  } catch {
    // fallback to tmp
  }

  try {
    fs.mkdirSync(TMP_PDF_DIR, { recursive: true });
    fs.writeFileSync(path.join(TMP_PDF_DIR, filename), bytes);
  } catch {
    // ignore
  }

  return { filename, bytes };
}
