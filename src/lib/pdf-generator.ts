import fs from 'fs';
import os from 'os';
import path from 'path';
import fontkit from '@pdf-lib/fontkit';
import { degrees, PDFDocument, PDFFont, PDFImage, PDFPage, rgb } from 'pdf-lib';
import { formatDotNumber, replaceTemplateVariables } from './constants';
import { hasRich, parseRich, stripRich } from './richtext';
import { blockCategoryId, getDocDesign, LETTERHEAD_URL, photoMaxH, photoWidthPct, primaryCategory, type DocDesign } from './doc-design';
import { getDb, SAVED_PDFS_DIR } from './db';
import { blobEnabled, readUploadFromBlob } from './blob-store';
import { computeBlockTotals } from './pricing-engine';
import {
  ColorOption,
  PhotoCaptionBlock,
  ProductCategory,
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

/**
 * Kép bájtjai ugyanazokból a forrásokból, mint a PDF-nél (Blob, data URL, helyi feltöltés / PDF-re optimalizált másolat).
 * A Word (.docx) export használja.
 */
export async function loadImageBytes(urlOrData: string | undefined): Promise<{ bytes: Buffer; type: 'png' | 'jpg' } | null> {
  if (!urlOrData) return null;
  const trimmed = urlOrData.trim();
  const kind = (b: Buffer): 'png' | 'jpg' | null => (b[0] === 0x89 && b[1] === 0x50 ? 'png' : b[0] === 0xff && b[1] === 0xd8 ? 'jpg' : null);
  try {
    const mediaMatch = trimmed.split('?')[0].match(/^\/api\/media\/([^/]+)$/);
    if (mediaMatch && blobEnabled()) {
      const file = await readUploadFromBlob(decodeURIComponent(mediaMatch[1]));
      if (!file) return null;
      const bytes = Buffer.from(file.bytes);
      const t = kind(bytes);
      return t ? { bytes, type: t } : null;
    }
    if (trimmed.startsWith('data:image/')) {
      const bytes = Buffer.from(trimmed.slice(trimmed.indexOf(',') + 1), 'base64');
      const t = kind(bytes);
      return t ? { bytes, type: t } : null;
    }
    const originalPath = resolveLocalFileFromUrl(trimmed);
    const uploadsDir = path.join(process.cwd(), 'public', 'uploads');
    const optimizedPath = originalPath && originalPath.startsWith(uploadsDir) ? path.join(uploadsDir, '_pdf', `${path.relative(uploadsDir, originalPath)}.jpg`) : null;
    const localPath = optimizedPath && fs.existsSync(optimizedPath) ? optimizedPath : originalPath;
    if (localPath && fs.existsSync(localPath)) {
      const bytes = fs.readFileSync(localPath);
      const t = kind(bytes);
      return t ? { bytes, type: t } : null;
    }
  } catch {
    return null;
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
const BASE_C = {
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
  config: SystemConfig,
  categories: ProductCategory[] = []
): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.create();
  pdfDoc.registerFontkit(fontkit);
  // az általános dizájn sablon (Beállítások > Ajánlat > Dizájn) színei és méretei
  // a kategóriák saját dizájnja felülírja az általánost a saját termékeiknél; az oldal keretét a fő kategória adja
  const hexC = (h: string) => rgb(parseInt(h.slice(1, 3), 16) / 255, parseInt(h.slice(3, 5), 16) / 255, parseInt(h.slice(5, 7), 16) / 255);
  const palette = (d: DocDesign) => ({ ...BASE_C, ink: hexC(d.heading), body: hexC(d.text), muted: hexC(d.muted), navy: hexC(d.accent), navyText: hexC(d.accentText), headFill: hexC(d.tableHead) });
  const quoteBlocks: QuoteDocumentBlock[] = Array.isArray(quote.blocks) ? quote.blocks : [];
  const pageD = getDocDesign(config, primaryCategory(quoteBlocks, categories));
  let D = pageD;
  let C = palette(D);
  const useDesign = (d: DocDesign) => {
    D = d;
    C = palette(d);
  };
  const designOfBlock = (b: QuoteDocumentBlock) => {
    const cat = categories.find((c) => c.id === blockCategoryId(b));
    return cat ? getDocDesign(config, cat) : pageD;
  };

  const fontDir = path.join(process.cwd(), 'public', 'template-assets', 'fonts');
  // Csak a használt karakterek kerülnek a PDF-be (a teljes Arial ~1,5 MB lenne)
  const useCalibri = pageD.font !== 'arial';
  // ligatúrák (fi, ti) nélkül: a pdf-lib a ligatúrás jelek szélességét rosszul számolja (rések a szövegben)
  const embedTtf = (n: string) =>
    // a Carlito előre szűkített (latin + magyar, ~45 KB), a pdf-lib részhalmazolása ennél a betűnél hiányos jeleket ad
    pdfDoc.embedFont(fs.readFileSync(path.join(fontDir, n)), { subset: !/^Carlito/.test(n), features: { liga: false, clig: false, dlig: false, calt: false } });
  const fontRegular = await embedTtf(useCalibri ? 'Carlito-Regular.ttf' : 'arial.ttf');
  const fontBold = await embedTtf(useCalibri ? 'Carlito-Bold.ttf' : 'arialbd.ttf');
  const fontItalic = useCalibri ? await embedTtf('Carlito-Italic.ttf') : null;
  const fontBoldItalic = useCalibri ? await embedTtf('Carlito-BoldItalic.ttf') : null;
  /** betű a stílushoz; Arialnál nincs dőlt változat, ott ferdítéssel */
  const pickFont = (b?: boolean, i?: boolean): PDFFont => (i && b ? fontBoldItalic || fontBold : i ? fontItalic || fontRegular : b ? fontBold : fontRegular);
  const skewFor = (i?: boolean) => (i && !useCalibri ? { ySkew: degrees(11) } : {});

  const bgImg = await embedImageFromSource(pdfDoc, config.pdfPageBackgroundUrl || (pageD.letterhead ? LETTERHEAD_URL : ''));
  const logoImg = await embedImageFromSource(pdfDoc, config.pdfLogoUrl);
  const sigCardImg = await embedImageFromSource(pdfDoc, config.pdfSignatureCardUrl);

  const A4_W = 595.28;
  const A4_H = 841.89;
  const MARGIN_X = pageD.marginPt;
  const CONTENT_W = A4_W - MARGIN_X * 2;
  const RIGHT_X = MARGIN_X + CONTENT_W;
  const BOTTOM_Y = 76; // a sötét láblécsáv fölött (Word alsó margó: 2,5 cm)

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
      // a Word ajánlatban a fejléces kép 595,25 × 850,35 pt, a margóterülethez középre igazítva (7 pt-tal lejjebb, alul kilóg)
      page.drawImage(bgImg, { x: 0, y: A4_H - 7 - 850.35, width: A4_W, height: 850.35 });
      return { page, y: A4_H - 93 }; // Word felső margó: 3,29 cm
    }
    const top = A4_H - 34;
    if (logoImg) {
      const dims = logoImg.scale(1);
      const ratio = dims.height / Math.max(1, dims.width);
      const h = pages.length === 1 ? pageD.logoHeight : Math.round(pageD.logoHeight * 0.76);
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
      italic?: boolean;
      underline?: boolean;
      highlight?: string;
    }
  ) => {
    const resolved = replaceTemplateVariables(rawText, varCtx);
    if (!stripRich(resolved).trim()) return;
    if (hasRich(resolved)) return drawRichParagraph(resolved, opts);
    const f = pickFont(opts?.bold, opts?.italic);
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
      if (opts?.highlight) current.page.drawRectangle({ x: x - 1, y: current.y - sz * 0.24, width: lw + 2, height: sz * 1.18, color: hexC(opts.highlight) });
      current.page.drawText(line, { x, y: current.y, size: sz, font: f, color: opts?.color ?? C.body, ...skewFor(opts?.italic) });
      if (opts?.underline) current.page.drawRectangle({ x, y: current.y - 1.6, width: lw, height: 0.7, color: opts?.color ?? C.ink });
    }
  };

  /**
   * Formázott bekezdés (Word-szerű szerkesztőből): futamonként félkövér / dőlt / aláhúzott / szín / méret,
   * szavanként tördelve; a sor magassága a sor legnagyobb betűjéhez igazodik.
   */
  const drawRichParagraph = (
    text: string,
    opts?: { bold?: boolean; size?: number; color?: ReturnType<typeof rgb>; align?: 'left' | 'center' | 'right'; indentX?: number; maxWidth?: number; lineHeight?: number; italic?: boolean; underline?: boolean; highlight?: string }
  ) => {
    const base = opts?.size ?? 10;
    const indent = opts?.indentX ?? 0;
    const maxW = opts?.maxWidth ?? CONTENT_W - indent;
    const lhf = opts?.lineHeight ?? 1.5;
    type Tok = { t: string; f: PDFFont; sz: number; color: ReturnType<typeof rgb>; i: boolean; u: boolean; w: number; space: boolean };
    const hexRgb = (h: string) => rgb(parseInt(h.slice(1, 3), 16) / 255, parseInt(h.slice(3, 5), 16) / 255, parseInt(h.slice(5, 7), 16) / 255);
    const lines: Tok[][] = [[]];
    for (const r of parseRich(text)) {
      const f = pickFont(r.b || opts?.bold, r.i || opts?.italic);
      const sz = r.size ?? base;
      const color = r.color ? hexRgb(r.color) : opts?.color ?? C.body;
      for (const part of r.text.split(/(\n| +)/)) {
        if (!part) continue;
        if (part === '\n') {
          lines.push([]);
          continue;
        }
        lines[lines.length - 1].push({ t: part, f, sz, color, i: !!(r.i || opts?.italic), u: !!(r.u || opts?.underline), w: textW(part, f, sz), space: /^ +$/.test(part) });
      }
    }
    // tördelés: egy szó (szóközig tartó, akár többféle stílusú darab) együtt marad
    const wrapped: Tok[][] = [];
    for (const line of lines) {
      let cur: Tok[] = [];
      let w = 0;
      let i = 0;
      while (i < line.length) {
        if (line[i].space) {
          if (cur.length) {
            cur.push(line[i]);
            w += line[i].w;
          }
          i++;
          continue;
        }
        let j = i;
        let ww = 0;
        while (j < line.length && !line[j].space) ww += line[j++].w;
        if (w + ww > maxW && cur.length) {
          while (cur.length && cur[cur.length - 1].space) cur.pop();
          wrapped.push(cur);
          cur = [];
          w = 0;
        }
        for (let k = i; k < j; k++) cur.push(line[k]);
        w += ww;
        i = j;
      }
      while (cur.length && cur[cur.length - 1].space) cur.pop();
      wrapped.push(cur);
    }
    for (const line of wrapped) {
      const maxSz = line.reduce((a, t) => Math.max(a, t.sz), base);
      const lh = maxSz * lhf;
      ensureSpace(lh + 2);
      current.y -= lh;
      if (!line.length) continue;
      const lw = line.reduce((a, t) => a + t.w, 0);
      let x = MARGIN_X + indent;
      if (opts?.align === 'center') x += (maxW - lw) / 2;
      else if (opts?.align === 'right') x += maxW - lw;
      if (opts?.highlight) current.page.drawRectangle({ x: x - 1, y: current.y - maxSz * 0.24, width: lw + 2, height: maxSz * 1.18, color: hexC(opts.highlight) });
      for (const tk of line) {
        if (!tk.space) current.page.drawText(tk.t, { x, y: current.y, size: tk.sz, font: tk.f, color: tk.color, ...skewFor(tk.i) });
        if (tk.u) current.page.drawRectangle({ x, y: current.y - tk.sz * 0.16, width: tk.w, height: Math.max(0.5, tk.sz * 0.07), color: tk.color });
        x += tk.w;
      }
    }
  };

  /** Egy sor vegyes (normál + félkövér) darabokból, jobbra vagy balra igazítva; ha nem fér ki, tördelve */
  const drawMixedLine = (parts: [string, boolean, number?][], align: 'left' | 'right', indent = 0, baseSize = 10) => {
    const fOf = (b: boolean) => (b ? fontBold : fontRegular);
    const width = parts.reduce((a, [t, b, sz]) => a + textW(t, fOf(b), sz ?? baseSize), 0);
    const maxSz = Math.max(...parts.map(([, , sz]) => sz ?? baseSize));
    if (width > CONTENT_W - indent) {
      parts.forEach(([t, b, sz]) => drawTextParagraph(t, { bold: b, size: sz ?? baseSize, color: C.ink, indentX: indent, align, lineHeight: 1.35 }));
      return;
    }
    ensureSpace(maxSz * 1.6);
    current.y -= maxSz * 1.45;
    let x = align === 'right' ? RIGHT_X - width : MARGIN_X + indent;
    for (const [t, b, sz] of parts) {
      current.page.drawText(t, { x, y: current.y, size: sz ?? baseSize, font: fOf(b), color: C.ink });
      x += textW(t, fOf(b), sz ?? baseSize);
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
      const widthPct = Math.min(100, Math.max(20, Number(photoBlock.widthPct) || 75));
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
    const COLS = 5;
    const GAP = 0;
    const cellW = (CONTENT_W - GAP * (COLS - 1)) / COLS;
    const TILE_H = 40;
    const rows = Math.ceil(colors.length / COLS);
    const blockH = 20 + rows * (TILE_H + GAP);
    // egyben marad, ha egy oldalra kifér; különben legalább a cím + 2 sor együtt
    if (current.y - blockH < BOTTOM_Y && blockH < A4_H - 200) current = createNewPage();
    else ensureSpace(20 + Math.min(rows, 2) * (TILE_H + GAP));
    const t2 = title.replace(/[:\s]+$/, '');
    drawTextParagraph(colors.length > 4 ? `${t2}: ${colors.length} db alapszín` : `${t2}:`, { size: D.bodySize, color: C.ink, lineHeight: D.lineHeight });
    current.y -= D.bodySize;
    for (let i = 0; i < colors.length; i += COLS) {
      ensureSpace(TILE_H + GAP);
      const top = current.y;
      colors.slice(i, i + COLS).forEach((c, idx) => {
        const x = MARGIN_X + idx * (cellW + GAP);
        current.page.drawRectangle({ x, y: top - TILE_H, width: cellW, height: TILE_H, color: hexToRgb(c.hex) });
        const fg = lum(c.hex) > 0.6 ? C.ink : C.white;
        // mint a Word ajánlat RAL táblája: csak a kód (pl. „RAL 9016 MAT”), középen, kis félkövér betűvel
        const finish = /struktúr|structure/i.test(c.name || '') ? ' STRUKTÚR' : '';
        const code = wrapTextLines(`${c.code}${finish}`.toUpperCase(), fontBold, 6.5, cellW - 6)[0] || '';
        current.page.drawText(code, { x: x + (cellW - textW(code, fontBold, 6.5)) / 2, y: top - TILE_H / 2 - 2.5, size: 6.5, font: fontBold, color: fg });
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
        titleLines: title ? wrapTextLines(stripRich(title), fontBold, 8.5, widths[i]).slice(0, 2) : [],
        capLines: caption ? wrapTextLines(stripRich(caption), fontRegular, captionSize, widths[i]).slice(0, 4) : [],
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
    for (let i = 0; i < items.length; i += 3) drawJustifiedRow(items.slice(i, i + 3), 135, 10, 7.5);
  };

  // További képek: párosával egyforma magasságban; páratlan utolsó kép nagyban, középen
  const drawPhotoGrid = async (photos: PhotoCaptionBlock[]) => {
    const items = await loadAll(photos);
    for (let i = 0; i < items.length; i += 2) {
      const pair = items.slice(i, i + 2);
      if (pair.length === 1) await drawPhotoWithCaption(pair[0].p, 260);
      else drawJustifiedRow(pair, 200, 12);
    }
  };

  // ---- Cím és alapadatok (csak az első oldalon, ha a sablonban be van kapcsolva) ----
  if (!config.docShowTitleBlock) current.y -= 6;
  else {
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
      for (const line of wrapTextLines(stripRich(main), fontBold, 10.5, maxW)) {
        current.page.drawText(line, { x, y, size: 10.5, font: fontBold, color: C.ink });
        y -= 13;
      }
      for (const sub of subs) {
        for (const line of wrapTextLines(stripRich(sub), fontRegular, 8.5, maxW)) {
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

  /** Egy termék szakasz (vagy a fő szerkezethez csatolt kiegészítő táblázat) rajzolása */
  const drawSection = async (block: QuoteDocumentBlock, attached = false): Promise<void> => {
    // ---- Termék szekció ----
    // attached: kiegészítő (ZIP, üvegfal) táblázata a fő szerkezet alatt, cím, leírás és fotók nélkül (mint a Word ajánlatokban)
    if (attached) {
      ensureSpace(80);
      const at = replaceTemplateVariables(block.attachTitle || '', varCtx).trim();
      if (at) drawTextParagraph(at, { bold: true, size: D.bodySize, color: C.ink, lineHeight: D.lineHeight, indentX: 30 });
    } else ensureSpace(120);
    if (!attached && block.sectionTitle) {
      // a Word ajánlatokban: „1. SOLARE 550 …:” és alatta „Méretek: 470 cm hosszú x 558 cm széles (kinyúlás) x 270 cm magas (belső)”
      const raw = replaceTemplateVariables(block.sectionTitle, varCtx);
      const sz = raw.match(/\((\d+)\s*[×x]\s*(\d+)\s*[×x]\s*(\d+)\s*cm(?:\s*-\s*([^)]*))?\)\s*$/);
      const title = raw.replace(/\s*\(\d+\s*[×x]\s*\d+[^)]*\)\s*$/, '').replace(/:\s*$/, '');
      ensureSpace(D.headingSize * 5);
      drawTextParagraph(`${title}:`, { bold: true, size: D.headingSize, color: C.ink, lineHeight: D.lineHeight, highlight: D.highlight || undefined });
      if (sz) {
        const line = replaceTemplateVariables(
          config.docSizeLine || 'Méretek: {{szelesseg}} cm hosszú x {{kinyulas}} cm széles (kinyúlás) x {{magassag}} cm magas (belső) – {{beepites}}',
          { ...varCtx, widthCm: Number(sz[1]), projectionCm: Number(sz[2]), heightCm: Number(sz[3]), mountType: (sz[4] || varCtx.mountType).trim() }
        );
        const cut = line.indexOf(':');
        const marked = cut > 0 && cut < 20 ? `[b]${line.slice(0, cut + 1)}[/b] [b][i]${line.slice(cut + 1).trim()}[/i][/b]` : `[b][i]${line}[/i][/b]`;
        drawTextParagraph(marked, { size: D.bodySize, color: C.ink, lineHeight: D.lineHeight });
      }
    }
    if (!attached && block.sectionSubtitle) {
      drawTextParagraph(block.sectionSubtitle, { size: Math.max(8, D.bodySize - 2), color: C.muted, italic: true, lineHeight: D.lineHeight });
    }
    if (!attached && block.sectionIntroText) {
      drawTextParagraph(block.sectionIntroText, { size: D.bodySize, color: C.body, lineHeight: D.lineHeight });
    }
    if (!attached) current.y -= D.bodySize * D.lineHeight;

    // Termékfotók: az első nagyban, a többi 2 oszlopos rácsban
    const sectionPhotos = attached ? [] : (block.sectionPhotos || []).filter((sp) => sp.imageUrl);
    if (sectionPhotos.length > 0 && D.photoLayout === 'stacked') {
      // a Word ajánlatokban kb. 3 fotó a táblázat előtt, a többi (opciók, színek, részletek) utána
      for (const ph of sectionPhotos.slice(0, D.photosBeforeTable)) {
        await drawPhotoWithCaption({ ...ph, widthPct: photoWidthPct(ph) }, photoMaxH(ph));
        const subs = (ph.subPhotos || []).filter((p) => p.imageUrl);
        if (subs.length) await drawSubPhotoRow(subs);
      }
    } else if (sectionPhotos.length > 0) {
      await drawPhotoWithCaption(sectionPhotos[0], 290);
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
      // Táblázat pontosan a Word ajánlatok szerint:
      // Megnevezés | Listaár (EUR) | Kedvezményes ár: -20% (EUR) | megjegyzés (fejléc nélkül);
      // a számok jobbra, a sor aljára igazítva, ezres tagolás nélkül; a kedvezményes ár és a megjegyzés félkövér
      const discountLabel = (block.tableHeaders?.[3] || '').match(/\(([^)]*%[^)]*)\)/)?.[1] || config.defaultDiscountLabel || '';
      const TBL_W = D.tableWide ? Math.min(531, A4_W - 40) : CONTENT_W;
      const TBL_X = D.tableWide ? (A4_W - TBL_W) / 2 : MARGIN_X;
      const TBL_R = TBL_X + TBL_W;
      const COLW = [4160, 1780, 2960, 1720].map((tw) => (tw / 10620) * TBL_W);
      const COLX = COLW.map((_, i) => TBL_X + COLW.slice(0, i).reduce((a2, w) => a2 + w, 0));
      const PAD = 3.5;
      const SZ = D.tableSize;
      const LH = SZ * 1.22;
      const border = hexC(D.tableBorder);
      const cellLines = (top: number, bottom: number) => {
        for (const x of [...COLX, TBL_R]) current.page.drawRectangle({ x: x - 0.25, y: bottom, width: 0.5, height: top - bottom, color: border });
        current.page.drawRectangle({ x: TBL_X, y: bottom - 0.25, width: TBL_W, height: 0.5, color: border });
      };
      const plain = (n: number) => String(Math.round(n));

      const drawTableHeader = () => {
        ensureSpace(90);
        const labels = ['Megnevezés', 'Listaár (EUR)', discountLabel ? `Kedvezményes ár: ${discountLabel} (EUR)` : 'Ár (EUR)', ''];
        const lines = labels.map((l, i) => (l ? wrapTextLines(l, fontBold, SZ, COLW[i] - PAD * 2) : []));
        const h = Math.max(14.5, Math.max(1, ...lines.map((l) => l.length)) * LH + 3);
        const top = current.y;
        current.page.drawRectangle({ x: TBL_X, y: top - h, width: TBL_W, height: h, color: C.headFill });
        // „Megnevezés” középre, a többi balra (mint a Wordben)
        lines.forEach((ls, i) =>
          ls.forEach((l, j) =>
            current.page.drawText(l, { x: i === 0 ? COLX[0] + (COLW[0] - textW(l, fontBold, SZ)) / 2 : COLX[i] + PAD, y: top - 1.5 - LH * (j + 1) + SZ * 0.25, size: SZ, font: fontBold, color: C.ink })
          )
        );
        current.page.drawRectangle({ x: TBL_X, y: top - 0.25, width: TBL_W, height: 0.5, color: border });
        cellLines(top, top - h);
        current.y = top - h;
      };

      const drawRow = (row: { name: string; list?: string; listLabel?: string; price: string; note?: string; strong?: boolean }) => {
        const SZr = row.strong ? SZ + 1 : SZ; // az Összesen sor nagyobb, félkövér
        const nameLines = wrapTextLines(row.name, fontRegular, SZ, COLW[0] - PAD * 2);
        const noteLines = row.note ? wrapTextLines(row.note, fontBold, SZ, COLW[3] - PAD * 2) : [];
        const n = Math.max(nameLines.length, noteLines.length, 1);
        const h = Math.max(row.strong ? 17 : 14.5, n * LH + 3);
        if (current.y - h < BOTTOM_Y) {
          current = createNewPage();
          drawTableHeader();
        }
        const top = current.y;
        // Összesen sor: halvány kiemelés, vastagabb felső vonal, félkövér felirat és összeg
        if (row.strong) current.page.drawRectangle({ x: TBL_X, y: top - h, width: TBL_W, height: h, color: C.headFill });
        const lineY = (j: number) => top - h + 2 + SZ * 0.22 + LH * (n - 1 - j);
        nameLines.forEach((l, j) => current.page.drawText(l, { x: COLX[0] + PAD, y: lineY(j), size: SZ, font: fontRegular, color: C.ink }));
        const bottomY = lineY(n - 1);
        if (row.listLabel) current.page.drawText(row.listLabel, { x: COLX[1] + PAD, y: bottomY, size: SZr, font: row.strong ? fontBold : fontRegular, color: C.ink });
        if (row.list) drawRight(current.page, row.list, bottomY, SZ, fontRegular, C.ink, COLX[1] + COLW[1] - PAD);
        if (row.price) drawRight(current.page, row.price, bottomY, SZr, fontBold, C.ink, COLX[2] + COLW[2] - PAD);
        noteLines.forEach((l, j) => current.page.drawText(l, { x: COLX[3] + PAD, y: lineY(j + n - noteLines.length), size: SZ, font: fontBold, color: C.ink }));
        cellLines(top, top - h);
        if (row.strong) {
          current.page.drawRectangle({ x: TBL_X, y: top - 0.75, width: TBL_W, height: 1.5, color: border });
          current.page.drawRectangle({ x: TBL_X, y: top - h - 0.75, width: TBL_W, height: 1.5, color: border });
        }
        current.y = top - h;
      };

      const eurRate = Number(quote.eurHufRate || config.defaultEurHufRate || 400);
      const blockTotals = computeBlockTotals(block, eurRate);
      const baseRows = activeRows.filter((r) => r.itemRole === 'base' || r.itemRole === 'gift');
      const optionalRows = activeRows.filter((r) => r.itemRole === 'optional');
      // A vevő elől rejtett árkorrekció az első alaptétel árába olvad bele
      const hiddenAdjTargetId = baseRows.find((r) => r.itemRole === 'base' && r.discountPriceEur > 0)?.id;
      const withQty = (name: string, qty?: string) => {
        const q = (qty || '').trim();
        if (!q || name.includes(q)) return name;
        return /\d\s*[×x]\s*\d/.test(q) ? `${name} (${q})` : `${name} – ${q.replace(/\s+/g, '')}`;
      };

      current.y -= attached ? 2 : 6;
      drawTableHeader();
      for (const r of baseRows) {
        const hiddenAdj = r.id === hiddenAdjTargetId ? blockTotals.hiddenAdjustmentsEur : 0;
        const price = (Number(r.discountPriceEur) || 0) + hiddenAdj;
        const list = r.listPriceEur > 0 && r.discountPriceEur > 0 ? Math.round((r.listPriceEur / r.discountPriceEur) * price) : Number(r.listPriceEur) || 0;
        const isGift = r.itemRole === 'gift' || price === 0;
        const note = (r.note || '').trim();
        drawRow({
          name: withQty(stripRich(replaceTemplateVariables(r.name, varCtx)), r.quantityLabel),
          // listaár csak ha nagyobb a kedvezményesnél (a szerelésnél üres, mint a Word ajánlatban)
          list: list > price || (isGift && list > 0) ? plain(list) : '',
          price: plain(isGift ? 0 : price),
          note: isGift
            ? 'Ajándék'
            : note && note !== discountLabel && !/aj[aá]nd[eé]k/i.test(note)
              ? note
              : attached && list > price
                ? 'Opció'
                : undefined,
        });
      }
      for (const adj of (block.adjustments || []).filter((a2) => a2.visibleToCustomer && Number(a2.amountEur) !== 0)) {
        const amount = Number(adj.amountEur) || 0;
        drawRow({ name: replaceTemplateVariables(adj.label || 'Árkorrekció', varCtx), price: `${amount > 0 ? '' : '-'}${plain(Math.abs(amount))}` });
      }
      drawRow({ name: '', listLabel: (block.sumLabel || 'Összesen:').trim(), price: plain(blockTotals.totalEur), strong: true });
      for (const r of optionalRows) {
        drawRow({
          name: withQty(stripRich(replaceTemplateVariables(r.name, varCtx)), r.quantityLabel),
          list: r.listPriceEur > r.discountPriceEur ? plain(r.listPriceEur) : '',
          price: plain(r.discountPriceEur),
          note: (r.note || '').trim() && r.note !== discountLabel ? r.note : 'Opció',
        });
      }

      // Összesítő sorok jobbra igazítva, mint a Word ajánlatokban
      current.y -= 8;
      const dot = (n: number) => formatDotNumber(Math.round(n));
      const totalLabel = (block.totalLabel || config.docTotalLabel || 'Az alapszerkezet szereléssel Összesen:').trim();
      const plus = /^opci/i.test(totalLabel) ? '+ ' : '';
      const hufLine = replaceTemplateVariables(config.docHufLine || 'Az ajánlat írásának napján, {{arfolyam}} Ft/EUR árfolyamon az összeg:', { ...varCtx, eurHufRate: eurRate });
      if (plus) {
        // „- Opció: A két … oldal beépítése … szereléssel: + 7.252 EUR (+Áfa)” balra, mint az opció sorok
        drawMixedLine([[`-   ${totalLabel} `, false, D.bodySize], [`+ ${dot(blockTotals.totalEur)} EUR (+Áfa)`, true, D.bodySize]], 'left', 18);
        drawMixedLine([[`${hufLine} `, false, D.bodySize - 2], [`${dot(blockTotals.totalHuf)} Ft (+Áfa)`, true, D.bodySize - 2]], 'left', 36);
      } else {
        drawMixedLine([[`${totalLabel} `, false, D.bodySize], [`${dot(blockTotals.totalEur)} EUR (+ Áfa)`, true, D.bodySize]], 'right');
        drawMixedLine([[`${hufLine} `, false, D.bodySize - 2], [`${dot(blockTotals.totalHuf)} Ft (+Áfa)`, true, D.bodySize - 2]], 'right');
      }
      current.y -= 6;

      // Opciók: „- Opció: név: + X EUR (+Áfa)” és alatta a forint
      for (const r of optionalRows) {
        const huf = Math.round(((Number(r.discountPriceEur) || 0) * eurRate) / 1000) * 1000;
        drawMixedLine([[`-   ${config.docOptionLabel || 'Opció:'} ${stripRich(replaceTemplateVariables(r.name, varCtx))}: `, false, D.bodySize], [`+ ${dot(r.discountPriceEur)} EUR (+Áfa)`, true, D.bodySize]], 'left', 18);
        drawMixedLine([[`${hufLine} `, false, D.bodySize - 2], [`${dot(huf)} Ft (+Áfa)`, true, D.bodySize - 2]], 'left', 36);
        current.y -= 4;
      }
      current.y -= 8;
    }

    if (attached) {
      current.y -= D.bodySize * D.lineHeight;
      return;
    }
    const BLs = D.bodySize * D.lineHeight;
    const closingParas = replaceTemplateVariables(block.sectionClosingText || '', varCtx)
      .split(/\n\s*\n/)
      .map((t) => t.replace(/^\s+|\s+$/g, ''))
      .filter(Boolean);
    const isPromo = (t: string) => /^ha\s/i.test(stripRich(t));
    for (const t of closingParas.filter(isPromo)) {
      drawTextParagraph(t, { bold: true, size: D.bodySize, color: C.ink, lineHeight: D.lineHeight, indentX: 30 });
      current.y -= BLs;
    }
    // a fő szerkezethez csatolt kiegészítők (oldalsó árnyékoló, üvegfal) táblázatai
    const mainD = D;
    for (const att of blocks.filter((b) => b.attachedTo === block.id && b.type === 'template_section')) {
      useDesign(designOfBlock(att));
      await drawSection(att, true);
    }
    useDesign(mainD);
    if (D.photoLayout === 'stacked') {
      for (const ph of sectionPhotos.slice(D.photosBeforeTable)) {
        await drawPhotoWithCaption({ ...ph, widthPct: photoWidthPct(ph) }, photoMaxH(ph));
        const subs = (ph.subPhotos || []).filter((p) => p.imageUrl);
        if (subs.length) await drawSubPhotoRow(subs);
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

    {
      // a Word ajánlatokban a táblázat utáni szöveg normál méretű: „+Opcionálisan rendelhető…” félkövér,
      // szürke kiemeléssel, alatta a lista (az akció „Ha …” fentebb, a táblázat után)
      const BL = BLs;
      for (const t of closingParas.filter((x) => !isPromo(x))) {
        const plain = stripRich(t);
        if (/^\+\s*opcion/i.test(plain)) {
          const [first, ...rest] = t.split('\n');
          drawTextParagraph(first, { bold: true, size: D.bodySize, color: C.ink, lineHeight: D.lineHeight, highlight: D.highlight || undefined });
          rest.forEach((l) => drawTextParagraph(l.replace(/^\s*•\s*/, '- '), { size: D.bodySize, color: C.body, lineHeight: D.lineHeight }));
        } else drawTextParagraph(t, { size: D.bodySize, color: C.body, lineHeight: D.lineHeight });
        current.y -= BL;
      }
    }
    current.y -= 30;
  };

  for (const block of blocks) {
    useDesign(designOfBlock(block));
    if (block.type === 'page_break') {
      current = createNewPage();
      continue;
    }

    if (block.type === 'text_box') {
      const style = block.textStyle || 'normal';
      const title = replaceTemplateVariables(block.title || '', varCtx).trim();
      const content = block.content || '';
      // a Word ajánlatokban a bekezdések között egy üres sor van (egyszeres sorköz, térköz nélkül)
      const BL = D.bodySize * D.lineHeight;
      const hl = D.highlight || undefined;
      if (style === 'category_heading') {
        ensureSpace(BL * 4);
        drawTextParagraph(title || content, { bold: true, size: D.bodySize, color: C.ink, underline: true, lineHeight: D.lineHeight });
        current.y -= BL;
        continue;
      }
      if (style === 'promo') {
        drawTextParagraph(title ? `${title} ${content}` : content, { bold: true, size: D.bodySize, color: C.ink, lineHeight: D.lineHeight });
        current.y -= BL;
        continue;
      }
      if (style === 'options') {
        // „+Opcionálisan rendelhető … termékhez:” félkövér, szürke kiemeléssel; alatta a lista
        const lines = replaceTemplateVariables(content, varCtx).split('\n');
        ensureSpace(BL * 3);
        if (title) drawTextParagraph(title, { bold: true, size: D.bodySize, color: C.ink, lineHeight: D.lineHeight, highlight: hl });
        lines.forEach((l, i) =>
          drawTextParagraph(l.replace(/^\s*•\s*/, '- '), { bold: !title && i === 0, size: D.bodySize, color: i === 0 && !title ? C.ink : C.body, lineHeight: D.lineHeight, highlight: !title && i === 0 ? hl : undefined })
        );
        current.y -= BL;
        continue;
      }
      if (style === 'footer_info') {
        // „Információ:” félkövér, szürke kiemeléssel; „Ha …-ig” akció félkövér; „Megjegyzés” dőlt, 8 pt
        if (title) {
          ensureSpace(BL * 4);
          drawTextParagraph(title, { bold: true, size: D.bodySize, color: C.ink, lineHeight: D.lineHeight, highlight: hl });
        }
        const paras = replaceTemplateVariables(content, varCtx).split(/\n\s*\n/);
        for (const para of paras) {
          const t = para.trim();
          if (!t) continue;
          if (/^megjegyz/i.test(stripRich(t))) drawTextParagraph(t, { size: 8, color: C.muted, italic: true, lineHeight: D.lineHeight });
          else if (/^ha\s/i.test(stripRich(t))) drawTextParagraph(t, { bold: true, size: D.bodySize, color: C.ink, lineHeight: D.lineHeight });
          else drawTextParagraph(t.replace(/^\s*•\s*/gm, '- '), { size: D.bodySize, color: C.body, lineHeight: D.lineHeight });
          current.y -= BL;
        }
        continue;
      }
      if (title) {
        const gsz = style === 'greeting' ? D.greetingSize : D.bodySize;
        ensureSpace(gsz * 3);
        drawTextParagraph(title, { bold: style === 'greeting' ? D.greetingBold : true, size: gsz, color: C.ink, lineHeight: D.lineHeight });
        current.y -= BL;
      }
      if (content) {
        drawTextParagraph(content, {
          bold: Boolean(block.bold) || style === 'highlight',
          size: D.bodySize,
          color: C.body,
          align: block.align || 'left',
          lineHeight: D.lineHeight,
        });
      }
      current.y -= BL;
      continue;
    }

    if (block.type === 'photo_box' && block.photo) {
      await drawPhotoWithCaption({ ...block.photo, widthPct: block.photo.sizePct || block.photo.widthPct }, block.photo.sizePct ? 640 : 300);
      const subs = (block.photo.subPhotos || []).filter((p) => p.imageUrl);
      if (subs.length) await drawSubPhotoRow(subs);
      continue;
    }

    if (block.type !== 'template_section') continue;

    if (block.attachedTo && blocks.some((b) => b.id === block.attachedTo)) continue; // a fő szerkezetnél rajzoltuk
    await drawSection(block);
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

  useDesign(pageD);
  // Lábléc: sötétkék sáv a weboldallal (mint a Word ajánlatokban), mellette elérhetőség és oldalszám
  if (!bgImg) {
    const site = (config.companyWebsite || 'www.openskypergola.hu').replace(/^https?:\/\//, '');
    const siteText = D.footerText.trim() || (site.startsWith('www.') ? site : `www.${site}`);
    const contact = [config.companyPhone, config.companyEmail].filter(Boolean).join('  ·  ');
    pages.forEach((p, i) => {
      p.drawRectangle({ x: 0, y: 0, width: A4_W, height: 46, color: C.navy });
      p.drawText(siteText, { x: (A4_W - textW(siteText, fontRegular, 10)) / 2, y: 22, size: 10, font: fontRegular, color: C.white });
      if (contact) p.drawText(contact, { x: (A4_W - textW(contact, fontRegular, 7)) / 2, y: 10, size: 7, font: fontRegular, color: C.navyText });
      if (D.showPageNumbers) drawRight(p, `${i + 1} / ${pages.length}`, 22, 8, fontRegular, C.navyText, A4_W - 28);
      drawRight(p, `Árajánlat ${quoteNumber}  ·  ${issueDate}`, A4_H - 24, 7.5, fontRegular, C.faint);
    });
  }

  return await pdfDoc.save();
}

export async function generateAndSaveQuotePdf(
  quote: QuoteRecord
): Promise<{ filename: string; bytes: Uint8Array }> {
  const db = getDb();
  const bytes = await renderEditableQuotePdfBytes(quote, db.config, db.categories);

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
