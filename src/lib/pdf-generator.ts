import fs from 'fs';
import os from 'os';
import path from 'path';
import fontkit from '@pdf-lib/fontkit';
import { PDFDocument, PDFFont, PDFImage, PDFPage, rgb } from 'pdf-lib';
import { formatDotNumber, replaceTemplateVariables } from './constants';
import { getDb, SAVED_PDFS_DIR } from './db';
import { blobEnabled, readUploadFromBlob } from './blob-store';
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

  // 0. Tartós tárolóba (Vercel Blob) feltöltött kép: /api/media/<fájlnév>
  const mediaMatch = trimmed.split('?')[0].match(/^\/api\/media\/([^/]+)$/);
  if (mediaMatch && blobEnabled()) {
    try {
      const file = await readUploadFromBlob(decodeURIComponent(mediaMatch[1]));
      if (!file) return null;
      const bytes = Buffer.from(file.bytes);
      try {
        return file.contentType.includes('png') ? await pdfDoc.embedPng(bytes) : await pdfDoc.embedJpg(bytes);
      } catch {
        return await pdfDoc.embedPng(bytes).catch(() => pdfDoc.embedJpg(bytes));
      }
    } catch {
      return null;
    }
  }

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
  // az OpenSky saját Word ajánlataiból: sötétkék láblécsáv, szürke táblázatfejléc, vékony rácsvonal
  navy: rgb(0.204, 0.227, 0.333),
  navyText: rgb(0.86, 0.88, 0.94),
  headFill: rgb(0.85, 0.86, 0.88),
  totalFill: rgb(0.94, 0.945, 0.955),
  grid: rgb(0.72, 0.73, 0.76),
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
  const BOTTOM_Y = 84; // a sötét láblécsáv fölött

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
    const top = A4_H - 34;
    if (logoImg) {
      const dims = logoImg.scale(1);
      const ratio = dims.height / Math.max(1, dims.width);
      const h = pages.length === 1 ? 34 : 26;
      const w = Math.min(190, h / ratio);
      page.drawImage(logoImg, { x: (A4_W - w) / 2, y: top - h, width: w, height: h });
      let y = top - h - 8;
      if (pages.length === 1 && config.companySubtitle) {
        const st = config.companySubtitle;
        page.drawText(st, { x: (A4_W - textW(st, fontRegular, 7.5)) / 2, y: y - 6, size: 7.5, font: fontRegular, color: C.muted });
        y -= 14;
      }
      return { page, y: y - 14 };
    }
    // logó nélkül: cégnév középen
    const sz = pages.length === 1 ? 16 : 12;
    page.drawText(companyName, { x: (A4_W - textW(companyName, fontBold, sz)) / 2, y: top - sz, size: sz, font: fontBold, color: C.ink });
    return { page, y: top - sz - 22 };
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
      // a Word ajánlatokhoz hasonlóan nagy, középre igazított kép
      const widthPct = Math.min(100, Math.max(60, Number(photoBlock.widthPct) || 85));
      let targetW = CONTENT_W * (widthPct / 100);
      let targetH = targetW * ratio;
      if (targetH > maxHeightPt) {
        targetH = maxHeightPt;
        targetW = targetH / ratio;
      }
      const capH = captionBelow ? 28 : 8;
      const room = current.y - BOTTOM_Y - capH;
      if (room < targetH) {
        if (room >= targetH * 0.45 && room > 120) {
          targetH = room;
          targetW = targetH / ratio;
        } else current = createNewPage();
      }
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
  const lum = (hex: string) => {
    const m = /^#?([0-9a-f]{6})$/i.exec((hex || '').trim());
    const n = m ? parseInt(m[1], 16) : 0xcccccc;
    return (0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255;
  };
  const drawColorSwatches = (title: string, colors: ColorOption[]) => {
    if (!colors.length) return;
    // a Word ajánlatok színtáblája: kitöltött csempék, bennük a kód és a név
    const COLS = 6;
    const GAP = 4;
    const cellW = (CONTENT_W - GAP * (COLS - 1)) / COLS;
    const TILE_H = 34;
    const rows = Math.ceil(colors.length / COLS);
    const blockH = 20 + rows * (TILE_H + GAP);
    // egyben marad, ha egy oldalra kifér; különben legalább a cím + 2 sor együtt
    if (current.y - blockH < BOTTOM_Y && blockH < A4_H - 200) current = createNewPage();
    else ensureSpace(20 + Math.min(rows, 2) * (TILE_H + GAP));
    drawTextParagraph(title, { bold: true, size: 9.5, color: C.ink, lineHeight: 1.3 });
    current.y -= 6;
    for (let i = 0; i < colors.length; i += COLS) {
      ensureSpace(TILE_H + GAP);
      const top = current.y;
      colors.slice(i, i + COLS).forEach((c, idx) => {
        const x = MARGIN_X + idx * (cellW + GAP);
        current.page.drawRectangle({ x, y: top - TILE_H, width: cellW, height: TILE_H, color: hexToRgb(c.hex), borderColor: C.grid, borderWidth: 0.4 });
        const fg = lum(c.hex) > 0.6 ? C.ink : C.white;
        const code = wrapTextLines(c.code, fontBold, 7, cellW - 8)[0] || '';
        current.page.drawText(code, { x: x + (cellW - textW(code, fontBold, 7)) / 2, y: top - TILE_H / 2 + (c.name ? 2 : -2.5), size: 7, font: fontBold, color: fg });
        if (c.name) {
          const nm = wrapTextLines(c.name, fontRegular, 6, cellW - 8)[0] || '';
          current.page.drawText(nm, { x: x + (cellW - textW(nm, fontRegular, 6)) / 2, y: top - TILE_H / 2 - 7, size: 6, font: fontRegular, color: fg });
        }
      });
      current.y = top - TILE_H - GAP;
    }
    current.y -= 10;
  };

  /**
   * Képsor egyforma magassággal, a teljes szélességet kitöltve (nincs „lyukas”, balra lógó rács):
   * a sor magassága úgy adódik, hogy a képek szélessége + rések = tartalomszélesség (felső korláttal).
   */
  type Loaded = { p: PhotoCaptionBlock; img: PDFImage };
  const drawJustifiedRow = (row: Loaded[], maxH: number, gap: number, captionSize = 8) => {
    const ratios = row.map(({ img }) => {
      const d = img.scale(1);
      return d.width / Math.max(1, d.height);
    });
    let h = (CONTENT_W - gap * (row.length - 1)) / ratios.reduce((a, r) => a + r, 0);
    h = Math.min(h, maxH);
    const widths = ratios.map((r) => r * h);
    const total = widths.reduce((a, w) => a + w, 0) + gap * (row.length - 1);
    let x = MARGIN_X + (CONTENT_W - total) / 2;
    const cells = row.map(({ p }, i) => {
      const title = replaceTemplateVariables(p.titleAbove || '', varCtx).trim();
      const caption = replaceTemplateVariables(p.captionBelow || '', varCtx).trim();
      return {
        w: widths[i],
        titleLines: title ? wrapTextLines(title, fontBold, 8.5, widths[i]).slice(0, 2) : [],
        capLines: caption ? wrapTextLines(caption, fontRegular, captionSize, widths[i]).slice(0, 4) : [],
      };
    });
    const titleH = Math.max(0, ...cells.map((c) => c.titleLines.length * 11 + (c.titleLines.length ? 3 : 0)));
    const capH = Math.max(0, ...cells.map((c) => (c.capLines.length ? c.capLines.length * (captionSize + 2.5) + 5 : 0)));
    let rowH = titleH + h + capH;
    const room = current.y - BOTTOM_Y - 10;
    if (room < rowH) {
      // ha a hely 60%-a elég, kicsinyítjük a sort, különben új oldal
      if (room - titleH - capH >= Math.max(90, h * 0.5)) {
        const k = (room - titleH - capH) / h;
        h *= k;
        cells.forEach((c, i) => (c.w = widths[i] * k));
        x = MARGIN_X + (CONTENT_W - (cells.reduce((a, c) => a + c.w, 0) + gap * (row.length - 1))) / 2;
        rowH = titleH + h + capH;
      } else current = createNewPage();
    }
    const top = current.y;
    row.forEach(({ img }, i) => {
      const c = cells[i];
      let y = top;
      for (const tl of c.titleLines) {
        y -= 9;
        current.page.drawText(tl, { x, y, size: 8.5, font: fontBold, color: C.ink });
        y -= 2;
      }
      y = top - titleH;
      current.page.drawImage(img, { x, y: y - h, width: c.w, height: h });
      y -= h + 4;
      for (const cl of c.capLines) {
        y -= captionSize;
        current.page.drawText(cl, { x, y, size: captionSize, font: fontRegular, color: C.muted });
        y -= 2.5;
      }
      x += c.w + gap;
    });
    current.y = top - rowH - 14;
  };
  const loadAll = async (photos: PhotoCaptionBlock[]): Promise<Loaded[]> =>
    (await Promise.all(photos.map(async (p) => ({ p, img: await embedImageFromSource(pdfDoc, p.imageUrl) })))).filter(
      (x): x is Loaded => Boolean(x.img)
    );

  // Részletképek: 3 egy sorban, egyforma magassággal
  const drawSubPhotoRow = async (subs: PhotoCaptionBlock[]) => {
    const items = await loadAll(subs);
    for (let i = 0; i < items.length; i += 3) drawJustifiedRow(items.slice(i, i + 3), 150, 10, 7.5);
  };

  // További képek: párosával egyforma magasságban; páratlan utolsó kép nagyban, középen
  const drawPhotoGrid = async (photos: PhotoCaptionBlock[]) => {
    const items = await loadAll(photos);
    for (let i = 0; i < items.length; i += 2) {
      const pair = items.slice(i, i + 2);
      if (pair.length === 1) await drawPhotoWithCaption(pair[0].p, 260);
      else drawJustifiedRow(pair, 230, 14);
    }
  };

  // ---- Cím és alapadatok (csak az első oldalon) ----
  {
    current.y -= 26;
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
      await drawPhotoWithCaption(block.photo, 300);
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
      await drawPhotoWithCaption(sectionPhotos[0], 300);
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
      // Rácsos táblázat a Word ajánlatok mintájára: Megnevezés | Mennyiség | Listaár | Kedvezményes ár
      const discountLabel = (block.tableHeaders?.[3] || '').match(/\(([^)]*%[^)]*)\)/)?.[1];
      const COLW = [0.43, 0.17, 0.17, 0.23].map((f) => f * CONTENT_W);
      const COLX = COLW.map((_, i) => MARGIN_X + COLW.slice(0, i).reduce((a2, w) => a2 + w, 0));
      const PAD = 6;
      const vLines = (top: number, bottom: number) => {
        for (const x of [...COLX, RIGHT_X]) current.page.drawRectangle({ x: x - 0.25, y: bottom, width: 0.5, height: top - bottom, color: C.grid });
      };
      const gridLine = (y: number) => current.page.drawRectangle({ x: MARGIN_X, y: y - 0.25, width: CONTENT_W, height: 0.5, color: C.grid });

      const drawTableHeader = () => {
        ensureSpace(80);
        const labels = ['Megnevezés', 'Mennyiség', 'Listaár (EUR)', discountLabel ? `Kedvezményes ár (${discountLabel})` : 'Ár (EUR)'];
        const lines = labels.map((l, i) => wrapTextLines(l, fontBold, 8, COLW[i] - PAD * 2));
        const h = Math.max(...lines.map((l) => l.length)) * 10 + 10;
        const top = current.y;
        current.page.drawRectangle({ x: MARGIN_X, y: top - h, width: CONTENT_W, height: h, color: C.headFill });
        lines.forEach((ls, i) =>
          ls.forEach((l, j) => {
            const y = top - 13 - j * 10;
            if (i >= 2) current.page.drawText(l, { x: COLX[i] + COLW[i] - PAD - textW(l, fontBold, 8), y, size: 8, font: fontBold, color: C.ink });
            else current.page.drawText(l, { x: COLX[i] + PAD, y, size: 8, font: fontBold, color: C.ink });
          })
        );
        gridLine(top);
        gridLine(top - h);
        vLines(top, top - h);
        current.y = top - h;
      };

      const drawRow = (row: {
        name: string;
        description?: string;
        qty: string;
        price: string;
        list?: string;
        note?: string;
        fill?: ReturnType<typeof rgb>;
        bold?: boolean;
      }) => {
        const nameLines = wrapTextLines(row.name, fontBold, 9.3, COLW[0] - PAD * 2);
        const descLines = row.description ? wrapTextLines(row.description, fontRegular, 7.8, COLW[0] - PAD * 2) : [];
        const qtyLines = row.qty ? wrapTextLines(row.qty, fontRegular, 8.8, COLW[1] - PAD * 2) : [];
        const noteLines = row.note ? wrapTextLines(row.note, fontRegular, 7.5, COLW[3] - PAD * 2) : [];
        const leftH = nameLines.length * 12 + descLines.length * 10;
        const rightH = 12 + noteLines.length * 9.5;
        const rowH = Math.max(leftH, rightH, qtyLines.length * 11) + 12;
        if (current.y - rowH < BOTTOM_Y) {
          current = createNewPage();
          drawTableHeader();
        }
        const top = current.y;
        if (row.fill) current.page.drawRectangle({ x: MARGIN_X, y: top - rowH, width: CONTENT_W, height: rowH, color: row.fill });
        let ly = top - 6;
        for (const nl of nameLines) {
          ly -= 9.5;
          current.page.drawText(nl, { x: COLX[0] + PAD, y: ly, size: 9.3, font: fontBold, color: C.ink });
          ly -= 2.5;
        }
        for (const dl of descLines) {
          ly -= 8;
          current.page.drawText(dl, { x: COLX[0] + PAD, y: ly, size: 7.8, font: fontRegular, color: C.muted });
          ly -= 2;
        }
        qtyLines.forEach((ql, qi) => current.page.drawText(ql, { x: COLX[1] + PAD, y: top - 15.5 - qi * 11, size: 8.8, font: fontRegular, color: C.body }));
        if (row.list) drawRight(current.page, row.list, top - 15.5, 8.8, fontRegular, C.muted, COLX[2] + COLW[2] - PAD);
        drawRight(current.page, row.price, top - 15.5, 9.8, fontBold, C.ink, RIGHT_X - PAD);
        noteLines.forEach((nl, ni) => drawRight(current.page, nl, top - 27 - ni * 9.5, 7.5, fontRegular, C.muted, RIGHT_X - PAD));
        current.y = top - rowH;
        gridLine(current.y);
        vLines(top, current.y);
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
          list: list > 0 ? `${formatDotNumber(list)}` : isGift ? '' : `${formatDotNumber(price)}`,
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
        drawRow({ name: 'Szerkezet összesen', qty: '', price: `${formatDotNumber(sub)} EUR`, fill: C.totalFill });
        current.y -= 16;
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

      // ---- Végösszeg: összesítő sor + jobbra igazított összeg forintban is ----
      const listTotal = baseRows.reduce((sum, r) => sum + (Number(r.listPriceEur) || 0), 0);
      drawRow({
        name: 'Összesen',
        qty: '',
        list: listTotal > blockTotals.totalEur ? formatDotNumber(listTotal) : '',
        price: `${formatDotNumber(blockTotals.totalEur)} EUR`,
        fill: C.totalFill,
      });
      ensureSpace(48);
      const totalTop = current.y - 8;
      drawRight(current.page, `${formatDotNumber(blockTotals.totalEur)} EUR (+ ÁFA)`, totalTop - 16, 15, fontBold, C.ink);
      drawRight(current.page, `Az ajánlat írásának napján, ${eurRate} Ft/EUR árfolyammal: ${formatDotNumber(blockTotals.totalHuf)} Ft (+ ÁFA)`, totalTop - 31, 8.5, fontRegular, C.muted);
      current.y = totalTop - 44;

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
            list: r.listPriceEur > 0 ? formatDotNumber(r.listPriceEur) : '',
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
    // az aláírás ne kerüljön egyedül új oldalra: ha kell, kisebb lesz
    const room = current.y - BOTTOM_Y - 10;
    if (room < h && room >= 60) {
      w *= room / h;
      h = room;
    }
    ensureSpace(h + 10);
    current.page.drawImage(sigCardImg, { x: MARGIN_X, y: current.y - h, width: w, height: h });
    current.y -= h + 10;
  }

  // Lábléc: sötétkék sáv a weboldallal (mint a Word ajánlatokban), mellette elérhetőség és oldalszám
  if (!bgImg) {
    const site = (config.companyWebsite || 'www.openskypergola.hu').replace(/^https?:\/\//, '');
    const siteText = site.startsWith('www.') ? site : `www.${site}`;
    const contact = [config.companyPhone, config.companyEmail].filter(Boolean).join('  ·  ');
    pages.forEach((p, i) => {
      p.drawRectangle({ x: 0, y: 0, width: A4_W, height: 46, color: C.navy });
      p.drawText(siteText, { x: (A4_W - textW(siteText, fontRegular, 10)) / 2, y: 22, size: 10, font: fontRegular, color: C.white });
      if (contact) p.drawText(contact, { x: (A4_W - textW(contact, fontRegular, 7)) / 2, y: 10, size: 7, font: fontRegular, color: C.navyText });
      drawRight(p, `${i + 1} / ${pages.length}`, 22, 8, fontRegular, C.navyText, A4_W - 28);
      if (i > 0) drawRight(p, `Árajánlat ${quoteNumber}`, A4_H - 24, 7.5, fontRegular, C.faint);
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
