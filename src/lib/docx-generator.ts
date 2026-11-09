import {
  AlignmentType,
  BorderStyle,
  Document,
  Footer,
  Header,
  HorizontalPositionRelativeFrom,
  HeightRule,
  ImageRun,
  Packer,
  PageNumber,
  Paragraph,
  ShadingType,
  Table,
  TableCell,
  TableLayoutType,
  TableRow,
  TextRun,
  VerticalAlign,
  VerticalPositionRelativeFrom,
  WidthType,
} from 'docx';
import { PDFDocument } from 'pdf-lib';
import { formatDotNumber, replaceTemplateVariables } from './constants';
import { blockCategoryId, getDocDesign, LETTERHEAD_URL, primaryCategory, type DocDesign } from './doc-design';
import { loadImageBytes } from './pdf-generator';
import { computeBlockTotals } from './pricing-engine';
import { parseRich, stripRich } from './richtext';
import type { PhotoCaptionBlock, ProductCategory, QuoteDocumentBlock, QuoteRecord, SystemConfig } from './types';

/**
 * Az ajánlat Word (.docx) változata, a PDF-fel azonos felépítéssel: középre igazított logó, megszólítás és
 * bevezető, kategória szövegek, termékek (cím, Méretek sor, leírás, fotók, ártáblázat, összesítő), Információ,
 * sötét láblécsáv. A formázás (félkövér, dőlt, aláhúzott, szín, méret) a szerkesztőből jön.
 * Wordben tovább szerkeszthető, és onnan PDF-be menthető.
 */

// A4, a PDF-fel azonos margók (52 pt)
const PT = 20; // twip / pt
const PAGE_W = 595.28;
const MARGIN = 70.85; // Word ajánlatok: 2,5 cm (1417 twip)
/** a renderelés elején állítjuk a dizájn szerint (Calibri a Word ajánlatokban) */
const FONT = { name: 'Calibri' };
const CONTENT_PT = PAGE_W - MARGIN * 2;
const CONTENT_TW = Math.round(CONTENT_PT * PT);
const px = (pt: number) => Math.round((pt * 96) / 72); // docx képméret: pixel (96 dpi)
const hex = (c: string) => c.replace('#', '').toUpperCase();
const lineOf = (lh: number) => Math.max(240, Math.round((240 * lh) / 1.22)); // Word „egyszeres” sorköz Calibrival ≈ 1,22 × betűméret

type ParaOpts = {
  size?: number;
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  color?: string;
  align?: 'left' | 'center' | 'right';
  after?: number; // pt
  before?: number;
  lineHeight?: number;
  indent?: number; // pt
  shade?: string; // kiemelő háttér a szöveg mögött (mint a Word ajánlatok szürke kiemelése)
};

const ALIGN = { left: AlignmentType.LEFT, center: AlignmentType.CENTER, right: AlignmentType.RIGHT } as const;

/** Formázott (jelölős) szöveg → TextRun-ok; a \n sortörés ugyanabban a bekezdésben */
function runs(text: string, o: ParaOpts): TextRun[] {
  const out: TextRun[] = [];
  for (const r of parseRich(text)) {
    r.text.split('\n').forEach((part, i) => {
      out.push(
        new TextRun({
          text: part,
          break: i > 0 ? 1 : undefined,
          font: FONT.name,
          size: Math.round((r.size ?? o.size ?? 10) * 2),
          bold: r.b || o.bold,
          italics: r.i || o.italic,
          underline: r.u || o.underline ? {} : undefined,
          color: hex(r.color || o.color || '#000000'),
          shading: o.shade ? { type: ShadingType.CLEAR, color: 'auto', fill: hex(o.shade) } : undefined,
        })
      );
    });
  }
  return out;
}

function para(text: string, o: ParaOpts = {}): Paragraph {
  return new Paragraph({
    alignment: ALIGN[o.align || 'left'],
    spacing: { after: Math.round((o.after ?? 0) * PT), before: Math.round((o.before ?? 0) * PT), line: lineOf(o.lineHeight ?? 1.22) },
    indent: o.indent ? { left: Math.round(o.indent * PT) } : undefined,
    children: runs(text, o),
  });
}

/**
 * Többsoros szöveg Word bekezdésekként (Enterrel tagolva, ahogy Wordben írnák); az üres sor bekezdés-köz lesz.
 * A formázás a sorokon átnyúlhat (pl. félkövér két soron át): soronként újranyitjuk.
 */
function paras(text: string, o: ParaOpts = {}): Paragraph[] {
  const lines = String(text || '').split('\n');
  const out: Paragraph[] = [];
  let carry = '';
  lines.forEach((ln, i) => {
    const t = carry + ln;
    // a sor végén nyitva maradt jelölők a következő sorban folytatódnak
    const open: string[] = [];
    for (const m of t.matchAll(/\[(\/?)(b|i|u|c|s)(=[^\]]+)?\]/g)) {
      if (m[1]) {
        const k = open.map((x) => x.slice(1, 2)).lastIndexOf(m[2]);
        if (k >= 0) open.splice(k, 1);
      } else open.push(m[0]);
    }
    carry = open.join('');
    const last = i === lines.length - 1;
    const nextEmpty = !last && !lines[i + 1].trim();
    if (!ln.trim() && i > 0) return; // az üres sor a előző bekezdés utáni köz
    out.push(para(t, { ...o, after: last ? o.after : nextEmpty ? (o.size ?? 12) * 1.22 : 0 }));
  });
  return out;
}

/** Vegyes sor: [szöveg, félkövér, méret] darabok (összesítő sorok) */
function mixed(parts: [string, boolean, number][], align: 'left' | 'right', color: string, indent = 0, after = 2): Paragraph {
  return new Paragraph({
    alignment: ALIGN[align],
    indent: indent ? { left: Math.round(indent * PT) } : undefined,
    spacing: { after: Math.round(after * PT), line: 240 },
    children: parts.map(([t, b, sz]) => new TextRun({ text: t, bold: b, size: Math.round(sz * 2), font: FONT.name, color: hex(color) })),
  });
}

const NONE = { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' };
const noBorders = { top: NONE, bottom: NONE, left: NONE, right: NONE, insideHorizontal: NONE, insideVertical: NONE };

export async function renderQuoteDocxBytes(quote: Partial<QuoteRecord>, config: SystemConfig, categories: ProductCategory[] = []): Promise<Buffer> {
  const blocks: QuoteDocumentBlock[] = Array.isArray(quote.blocks) ? quote.blocks : [];
  const pageD = getDocDesign(config, primaryCategory(blocks, categories));
  FONT.name = pageD.font === 'arial' ? 'Arial' : 'Calibri';
  const designOf = (b: QuoteDocumentBlock): DocDesign => {
    const cat = categories.find((c) => c.id === blockCategoryId(b));
    return cat ? getDocDesign(config, cat) : pageD;
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
  const fill = (t: string) => replaceTemplateVariables(t || '', varCtx);

  // képek: bájtok + méret (a méretarányhoz)
  const sizer = await PDFDocument.create();
  const img = async (url?: string) => {
    const f = await loadImageBytes(url);
    if (!f) return null;
    try {
      const e = f.type === 'png' ? await sizer.embedPng(f.bytes) : await sizer.embedJpg(f.bytes);
      return { ...f, w: e.width, h: e.height };
    } catch {
      return null;
    }
  };
  const imageRun = (im: { bytes: Buffer; type: 'png' | 'jpg'; w: number; h: number }, maxW: number, maxH: number) => {
    let w = maxW;
    let h = (w * im.h) / Math.max(1, im.w);
    if (h > maxH) {
      h = maxH;
      w = (h * im.w) / Math.max(1, im.h);
    }
    return new ImageRun({ type: im.type, data: im.bytes, transformation: { width: px(w), height: px(h) } });
  };

  const body: (Paragraph | Table)[] = [];
  let pendingPageBreak = false;
  const push = (x: Paragraph | Table | (Paragraph | Table)[]) => {
    for (const el of Array.isArray(x) ? x : [x]) {
      if (pendingPageBreak) body.push(new Paragraph({ pageBreakBefore: true, spacing: { after: 0 }, children: [] }));
      pendingPageBreak = false;
      body.push(el);
    }
  };

  const photo = async (p: PhotoCaptionBlock, maxW: number, maxH: number, D: DocDesign) => {
    const im = await img(p.imageUrl);
    if (!im) return [] as Paragraph[];
    const out: Paragraph[] = [];
    if (p.titleAbove) out.push(para(stripRich(fill(p.titleAbove)), { size: 9.5, bold: true, color: D.heading, align: 'center', after: 2 }));
    out.push(new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 2 * PT }, children: [imageRun(im, maxW, maxH)] }));
    if (p.captionBelow) out.push(para(stripRich(fill(p.captionBelow)), { size: 8.5, color: D.muted, align: 'center', after: 8 }));
    return out;
  };
  /** Képek rácsban (keret nélküli táblázat), soronként `cols` kép */
  const photoGrid = async (photos: PhotoCaptionBlock[], cols: number, maxH: number, D: DocDesign) => {
    const cellW = (CONTENT_PT - (cols - 1) * 8) / cols;
    for (let i = 0; i < photos.length; i += cols) {
      const row = photos.slice(i, i + cols);
      if (row.length === 1 && cols === 2) {
        (await photo(row[0], CONTENT_PT, 290, D)).forEach(push);
        continue;
      }
      const cells = await Promise.all(
        row.map(async (p) => {
          const ps = await photo(p, cellW - 4, maxH, D);
          return new TableCell({ width: { size: Math.round(cellW * PT), type: WidthType.DXA }, borders: noBorders, children: ps.length ? ps : [new Paragraph('')] });
        })
      );
      while (cells.length < cols) cells.push(new TableCell({ width: { size: Math.round(cellW * PT), type: WidthType.DXA }, borders: noBorders, children: [new Paragraph('')] }));
      push(new Table({ width: { size: CONTENT_TW, type: WidthType.DXA }, columnWidths: Array(cols).fill(Math.round(cellW * PT)), layout: TableLayoutType.FIXED, borders: noBorders, rows: [new TableRow({ children: cells })] }));
      push(para('', { after: 4 }));
    }
  };

  /** Egy termék szakasz, vagy a fő szerkezethez csatolt kiegészítő táblázat */
  const drawSection = async (block: QuoteDocumentBlock, D: DocDesign, attached = false): Promise<void> => {
    // ---- Termék szakasz ----
    // attached: kiegészítő (ZIP, üvegfal) táblázata a fő szerkezet alatt, cím, leírás és fotók nélkül
    if (attached) {
      const at = fill(block.attachTitle || '').trim();
      if (at) push(para(at, { size: D.bodySize, bold: true, color: D.heading, indent: 30 }));
    }
    if (!attached && block.sectionTitle) {
      const raw = fill(block.sectionTitle);
      const sz = raw.match(/\((\d+)\s*[×x]\s*(\d+)\s*[×x]\s*(\d+)\s*cm(?:\s*-\s*([^)]*))?\)\s*$/);
      const title = raw.replace(/\s*\(\d+\s*[×x]\s*\d+[^)]*\)\s*$/, '').replace(/:\s*$/, '');
      push(para(`${title}:`, { size: D.headingSize, bold: true, color: D.heading, shade: D.highlight || undefined }));
      if (sz) {
        const line = replaceTemplateVariables(
          config.docSizeLine || 'Méretek: {{szelesseg}} cm hosszú x {{kinyulas}} cm széles (kinyúlás) x {{magassag}} cm magas (belső) – {{beepites}}',
          { ...varCtx, widthCm: Number(sz[1]), projectionCm: Number(sz[2]), heightCm: Number(sz[3]), mountType: (sz[4] || varCtx.mountType).trim() }
        );
        const cut = line.indexOf(':');
        push(para(cut > 0 && cut < 20 ? `[b]${line.slice(0, cut + 1)}[/b] [b][i]${line.slice(cut + 1).trim()}[/i][/b]` : `[b][i]${line}[/i][/b]`, { size: D.bodySize, color: D.heading }));
      }
    }
    if (!attached && block.sectionSubtitle) push(para(fill(block.sectionSubtitle), { size: Math.max(8, D.bodySize - 2), italic: true, color: D.muted }));
    if (!attached && block.sectionIntroText) push(paras(fill(block.sectionIntroText), { size: D.bodySize, color: D.text, lineHeight: D.lineHeight }));
    if (!attached) push(para('', { size: D.bodySize }));

    const photos = attached ? [] : (block.sectionPhotos || []).filter((p) => p.imageUrl);
    if (photos.length && D.photoLayout === 'stacked') {
      for (const ph of photos) {
        (await photo(ph, CONTENT_PT, 330, D)).forEach(push);
        const subs = (ph.subPhotos || []).filter((p) => p.imageUrl);
        if (subs.length) await photoGrid(subs, 3, 135, D);
      }
    } else if (photos.length) {
      (await photo(photos[0], CONTENT_PT * 0.75, 290, D)).forEach(push);
      const heroSubs = (photos[0].subPhotos || []).filter((p) => p.imageUrl);
      if (heroSubs.length) await photoGrid(heroSubs, 3, 135, D);
      if (photos.length > 1) await photoGrid(photos.slice(1), 2, 200, D);
    }

    const active = (block.rows || []).filter((r) => r.included !== false);
    if (active.length) {
      const discountLabel = (block.tableHeaders?.[3] || '').match(/\(([^)]*%[^)]*)\)/)?.[1] || config.defaultDiscountLabel || '';
      const TBL_TW = D.tableWide ? 10620 : CONTENT_TW;
      const COLW = [4160, 1780, 2960, 1720].map((tw) => Math.round((tw / 10620) * TBL_TW));
      const border = { style: BorderStyle.SINGLE, size: 4, color: hex(D.tableBorder) };
      const borders = { top: border, bottom: border, left: border, right: border };
      // Összesen sor: halvány kiemelés, vastagabb felső vonal (a fejléc színének világosabb árnyalata)
      const sumFill = (() => {
        const h = D.tableHead.replace('#', '');
        const ch = [0, 2, 4].map((i) => Math.round(255 - (255 - parseInt(h.slice(i, i + 2), 16)) * 0.55));
        return ch.map((c) => c.toString(16).padStart(2, '0')).join('').toUpperCase();
      })();
      const strongTop = { style: BorderStyle.SINGLE, size: 12, color: hex(D.tableBorder) };
      const cell = (text: string, i: number, o: { bold?: boolean; right?: boolean; head?: boolean; strong?: boolean } = {}) =>
        new TableCell({
          width: { size: COLW[i], type: WidthType.DXA },
          borders: o.strong ? { ...borders, top: strongTop } : borders,
          verticalAlign: o.head ? VerticalAlign.TOP : VerticalAlign.BOTTOM,
          shading: o.head ? { type: ShadingType.CLEAR, color: 'auto', fill: hex(D.tableHead) } : o.strong ? { type: ShadingType.CLEAR, color: 'auto', fill: sumFill } : undefined,
          margins: { left: 70, right: 70, top: 0, bottom: 0 },
          children: [
            new Paragraph({
              alignment: o.right ? AlignmentType.RIGHT : o.head && i === 0 ? AlignmentType.CENTER : AlignmentType.LEFT,
              spacing: { after: 0, line: 240 },
              children: [new TextRun({ text, bold: o.bold || o.head, size: Math.round(D.tableSize * 2), font: FONT.name, color: hex(D.heading) })],
            }),
          ],
        });
      const row = (r: { name: string; list?: string; listLabel?: string; price: string; note?: string; strong?: boolean }) =>
        new TableRow({
          height: { value: 290, rule: HeightRule.ATLEAST },
          children: [
            cell(r.name, 0, { strong: r.strong }),
            r.listLabel ? cell(r.listLabel, 1, { strong: r.strong, bold: r.strong }) : cell(r.list || '', 1, { right: true, strong: r.strong }),
            cell(r.price, 2, { bold: true, right: true, strong: r.strong }),
            cell(r.note || '', 3, { bold: true, strong: r.strong }),
          ],
        });

      const rate = Number(quote.eurHufRate || config.defaultEurHufRate || 400);
      const totals = computeBlockTotals(block, rate);
      const baseRows = active.filter((r) => r.itemRole === 'base' || r.itemRole === 'gift');
      const optRows = active.filter((r) => r.itemRole === 'optional');
      const hiddenAdjTargetId = baseRows.find((r) => r.itemRole === 'base' && r.discountPriceEur > 0)?.id;
      const plain = (n: number) => String(Math.round(n));
      const withQty = (name: string, qty?: string) => {
        const q = (qty || '').trim();
        if (!q || name.includes(q)) return name;
        return /\d\s*[×x]\s*\d/.test(q) ? `${name} (${q})` : `${name} – ${q.replace(/\s+/g, '')}`;
      };
      const rows: TableRow[] = [
        new TableRow({
          tableHeader: true,
          height: { value: 290, rule: HeightRule.ATLEAST },
          children: ['Megnevezés', 'Listaár (EUR)', discountLabel ? `Kedvezményes ár: ${discountLabel} (EUR)` : 'Ár (EUR)', ''].map((l, i) => cell(l, i, { head: true })),
        }),
      ];
      for (const r of baseRows) {
        const price = (Number(r.discountPriceEur) || 0) + (r.id === hiddenAdjTargetId ? totals.hiddenAdjustmentsEur : 0);
        const list = r.listPriceEur > 0 && r.discountPriceEur > 0 ? Math.round((r.listPriceEur / r.discountPriceEur) * price) : Number(r.listPriceEur) || 0;
        const gift = r.itemRole === 'gift' || price === 0;
        const note = (r.note || '').trim();
        rows.push(
          row({
            name: withQty(stripRich(fill(r.name)), r.quantityLabel),
            list: list > price || (gift && list > 0) ? plain(list) : '',
            price: plain(gift ? 0 : price),
            note: gift ? 'Ajándék' : note && note !== discountLabel && !/aj[aá]nd[eé]k/i.test(note) ? note : attached && list > 0 ? 'Opció' : undefined,
          })
        );
      }
      for (const adj of (block.adjustments || []).filter((a) => a.visibleToCustomer && Number(a.amountEur) !== 0)) {
        const amount = Number(adj.amountEur) || 0;
        rows.push(row({ name: fill(adj.label || 'Árkorrekció'), price: `${amount > 0 ? '' : '-'}${plain(Math.abs(amount))}` }));
      }
      rows.push(row({ name: '', listLabel: (block.sumLabel || 'Összesen:').trim(), price: plain(totals.totalEur), strong: true }));
      for (const r of optRows)
        rows.push(
          row({
            name: withQty(stripRich(fill(r.name)), r.quantityLabel),
            list: r.listPriceEur > r.discountPriceEur ? plain(r.listPriceEur) : '',
            price: plain(r.discountPriceEur),
            note: (r.note || '').trim() && r.note !== discountLabel ? r.note : 'Opció',
          })
        );
      push(para('', { after: 2 }));
      push(new Table({ width: { size: TBL_TW, type: WidthType.DXA }, columnWidths: COLW, layout: TableLayoutType.FIXED, alignment: AlignmentType.CENTER, rows }));

      const dot = (n: number) => formatDotNumber(Math.round(n));
      const label = (block.totalLabel || config.docTotalLabel || 'Az alapszerkezet szereléssel Összesen:').trim();
      const plus = /^opci/i.test(label) ? '+ ' : '';
      const hufLine = replaceTemplateVariables(config.docHufLine || 'Az ajánlat írásának napján, {{arfolyam}} Ft/EUR árfolyamon az összeg:', { ...varCtx, eurHufRate: rate });
      push(para('', { after: 2 }));
      if (plus) {
        push(mixed([[`-   ${label} `, false, D.bodySize], [`+ ${dot(totals.totalEur)} EUR (+Áfa)`, true, D.bodySize]], 'left', D.heading, 18, 0));
        push(mixed([[`${hufLine} `, false, D.bodySize - 2], [`${dot(totals.totalHuf)} Ft (+Áfa)`, true, D.bodySize - 2]], 'left', D.heading, 36, D.bodySize * 1.22));
      } else {
        push(mixed([[`${label} `, false, D.bodySize], [`${dot(totals.totalEur)} EUR (+ Áfa)`, true, D.bodySize]], 'right', D.heading, 0, 0));
        push(mixed([[`${hufLine} `, false, D.bodySize - 2], [`${dot(totals.totalHuf)} Ft (+Áfa)`, true, D.bodySize - 2]], 'right', D.heading, 0, D.bodySize * 1.22));
      }
      for (const r of optRows) {
        const huf = Math.round(((Number(r.discountPriceEur) || 0) * rate) / 1000) * 1000;
        push(mixed([[`-   ${config.docOptionLabel || 'Opció:'} ${stripRich(fill(r.name))}: `, false, D.bodySize], [`+ ${dot(r.discountPriceEur)} EUR (+Áfa)`, true, D.bodySize]], 'left', D.heading, 18, 0));
        push(mixed([[`${hufLine} `, false, D.bodySize - 2], [`${dot(huf)} Ft (+Áfa)`, true, D.bodySize - 2]], 'left', D.heading, 36, D.bodySize * 1.22));
      }
    }

    if (attached) return;
    // akció („Ha …”) a táblázat után, majd a csatolt kiegészítők, utána a színek és a többi záró szöveg
    const gap0 = D.bodySize * 1.22;
    const closing = fill(block.sectionClosingText || '').split(/\n\s*\n/).map((t) => t.replace(/^\s+|\s+$/g, '')).filter(Boolean);
    const isPromo = (t: string) => /^ha\s/i.test(stripRich(t));
    for (const t of closing.filter(isPromo)) push(paras(t, { size: D.bodySize, bold: true, color: D.heading, after: gap0, indent: 30 }));
    for (const att of blocks.filter((b) => b.attachedTo === block.id && b.type === 'template_section')) await drawSection(att, designOf(att), true);

    // tételek képei (LED, színek, ZIP…) és a színválaszték
    const rowPhotos = active.flatMap((r) => (r.photos || []).filter((p) => p.imageUrl).map((p) => ({ ...p, titleAbove: p.titleAbove || r.name })));
    if (rowPhotos.length) await photoGrid(rowPhotos, 2, 200, D);
    for (const r of active) {
      const colors = r.algorithm?.colorOptions || [];
      if (!colors.length) continue;
      const t2 = stripRich(r.algorithm?.colorTitle || r.name);
      push(para(colors.length > 4 ? `${t2}: ${colors.length} db alapszín` : `${t2}:`, { size: D.bodySize, color: D.heading, after: D.bodySize }));
      const cw = Math.round(CONTENT_TW / 5);
      const trs: TableRow[] = [];
      for (let i = 0; i < colors.length; i += 5) {
        const cs = colors.slice(i, i + 5).map(
          (c) =>
            new TableCell({
              width: { size: cw, type: WidthType.DXA },
              borders: noBorders,
              shading: { type: ShadingType.CLEAR, color: 'auto', fill: hex(c.hex || '#cccccc') },
              verticalAlign: VerticalAlign.CENTER,
              children: [
                new Paragraph({
                  alignment: AlignmentType.CENTER,
                  spacing: { after: 0 },
                  children: [
                    new TextRun({
                      text: `${c.code || ''}${/struktúr|structure/i.test(c.name || '') ? ' STRUKTÚR' : ''}`.toUpperCase(),
                      bold: true,
                      size: 13,
                      font: FONT.name,
                      color: isDark(c.hex) ? 'FFFFFF' : '111111',
                    }),
                  ],
                }),
              ],
            })
        );
        while (cs.length < 5) cs.push(new TableCell({ width: { size: cw, type: WidthType.DXA }, borders: noBorders, children: [new Paragraph('')] }));
        trs.push(new TableRow({ height: { value: 800, rule: HeightRule.EXACT }, children: cs }));
      }
      push(new Table({ width: { size: CONTENT_TW, type: WidthType.DXA }, columnWidths: Array(5).fill(cw), layout: TableLayoutType.FIXED, borders: noBorders, rows: trs }));
      push(para('', { size: D.bodySize }));
    }
    if (closing.some((t) => !isPromo(t))) {
      for (const t of closing.filter((x) => !isPromo(x))) {
        const plain = stripRich(t);
        const gap = gap0;
        if (/^\+\s*opcion/i.test(plain)) {
          const [first, ...rest] = t.split('\n');
          push(para(first, { size: D.bodySize, bold: true, color: D.heading, shade: D.highlight || undefined }));
          rest.forEach((l, i) => push(para(l.replace(/^\s*•\s*/, '- '), { size: D.bodySize, color: D.text, after: i === rest.length - 1 ? gap : 0 })));
        } else push(paras(t, { size: D.bodySize, color: D.text, after: gap }));
      }
    } else push(para('', { size: D.bodySize }));
  };

  for (const block of blocks) {
    const D = designOf(block);
    if (block.type === 'page_break') {
      pendingPageBreak = true;
      continue;
    }

    if (block.type === 'text_box') {
      const st = block.textStyle || 'normal';
      const title = fill(block.title || '').trim();
      const content = fill(block.content || '');
      if (st === 'category_heading') {
        push(para(title || content, { size: D.bodySize, bold: true, underline: true, color: D.heading, after: D.bodySize * 1.22 }));
        continue;
      }
      if (st === 'promo') {
        push(paras(title ? `${title} ${content}` : content, { size: D.bodySize, bold: true, color: D.heading, after: D.bodySize * 1.22 }));
        continue;
      }
      if (st === 'options') {
        if (title) push(para(title, { size: D.bodySize, bold: true, color: D.heading, shade: D.highlight || undefined }));
        content.split('\n').forEach((l, i) =>
          push(para(l.replace(/^\s*•\s*/, '- '), { size: D.bodySize, bold: !title && i === 0, color: i === 0 && !title ? D.heading : D.text, shade: !title && i === 0 ? D.highlight || undefined : undefined }))
        );
        push(para('', { size: D.bodySize }));
        continue;
      }
      if (st === 'footer_info') {
        if (title) push(para(title, { size: D.bodySize, bold: true, color: D.heading, shade: D.highlight || undefined }));
        for (const raw of content.split(/\n\s*\n/)) {
          const t = raw.trim();
          if (!t) continue;
          const gap = D.bodySize * 1.22;
          if (/^megjegyz/i.test(stripRich(t))) push(para(t, { size: 8, italic: true, color: D.muted, after: gap }));
          else if (/^ha\s/i.test(stripRich(t))) push(para(t, { size: D.bodySize, bold: true, color: D.heading, after: gap }));
          else push(paras(t.replace(/^\s*•\s*/gm, '- '), { size: D.bodySize, color: D.text, after: gap }));
        }
        continue;
      }
      if (title) push(para(title, { size: st === 'greeting' ? D.greetingSize : D.bodySize, bold: st === 'greeting' ? D.greetingBold : true, color: D.heading, after: D.bodySize * 1.22 }));
      if (content.trim())
        push(paras(content, { size: D.bodySize, bold: Boolean(block.bold) || st === 'highlight', color: D.text, align: block.align || 'left', lineHeight: D.lineHeight, after: D.bodySize * 1.22 }));
      continue;
    }

    if (block.type === 'photo_box' && block.photo) {
      (await photo(block.photo, CONTENT_PT, 330, D)).forEach(push);
      const subs = (block.photo.subPhotos || []).filter((p) => p.imageUrl);
      if (subs.length) await photoGrid(subs, 3, 135, D);
      continue;
    }
    if (block.type !== 'template_section') continue;

    if (block.attachedTo && blocks.some((b) => b.id === block.attachedTo)) continue;
    await drawSection(block, D);
  }

  const sig = await img(config.pdfSignatureCardUrl);
  if (sig) push(new Paragraph({ children: [imageRun(sig, 210, 95)] }));

  // fejléc: középre igazított logó + sorszám jobbra; lábléc: színes sáv a weboldallal és oldalszámmal
  const logo = await img(config.pdfLogoUrl);
  const issueDate = new Date(quote.createdAt || Date.now()).toLocaleDateString('hu-HU');
  // a saját fejléces papír (mint a Word ajánlatokban): teljes oldalas kép a szöveg mögött, 7 pt-tal lejjebb
  const lh = await img(config.pdfPageBackgroundUrl || (pageD.letterhead ? LETTERHEAD_URL : ''));
  const letterheadHeader = lh
    ? new Header({
        children: [
          new Paragraph({
            children: [
              new ImageRun({
                type: lh.type,
                data: lh.bytes,
                transformation: { width: px(595.25), height: px(850.35) },
                floating: {
                  horizontalPosition: { relative: HorizontalPositionRelativeFrom.PAGE, offset: 0 },
                  verticalPosition: { relative: VerticalPositionRelativeFrom.PAGE, offset: Math.round(7 * 12700) },
                  behindDocument: true,
                  allowOverlap: true,
                },
              }),
            ],
          }),
        ],
      })
    : null;
  const header = new Header({
    children: [
      para(`Árajánlat ${quote.quoteNumber || 'ELŐNÉZET'}  ·  ${issueDate}`, { size: 7.5, color: '#999999', align: 'right', after: 0 }),
      logo
        ? new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 4 * PT }, children: [imageRun(logo, 190, pageD.logoHeight)] })
        : para(config.companyName || 'OpenSky Pergola Kft.', { size: 16, bold: true, align: 'center', color: pageD.heading }),
      ...(config.companySubtitle ? [para(config.companySubtitle, { size: 7.5, color: pageD.muted, align: 'center', after: 10 })] : []),
    ],
  });
  const site = (config.companyWebsite || 'www.openskypergola.hu').replace(/^https?:\/\//, '');
  const siteText = pageD.footerText.trim() || (site.startsWith('www.') ? site : `www.${site}`);
  const contact = [config.companyPhone, config.companyEmail].filter(Boolean).join('  ·  ');
  const footer = new Footer({
    children: [
      new Table({
        width: { size: CONTENT_TW, type: WidthType.DXA },
        columnWidths: [CONTENT_TW],
        layout: TableLayoutType.FIXED,
        borders: noBorders,
        rows: [
          new TableRow({
            children: [
              new TableCell({
                width: { size: CONTENT_TW, type: WidthType.DXA },
                borders: noBorders,
                shading: { type: ShadingType.CLEAR, color: 'auto', fill: hex(pageD.accent) },
                margins: { top: 120, bottom: 120 },
                children: [
                  new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: siteText, size: 20, font: FONT.name, color: 'FFFFFF' })] }),
                  new Paragraph({
                    alignment: AlignmentType.CENTER,
                    children: [
                      new TextRun({ text: contact, size: 14, font: FONT.name, color: hex(pageD.accentText) }),
                      ...(pageD.showPageNumbers
                        ? [new TextRun({ children: ['    ', PageNumber.CURRENT, ' / ', PageNumber.TOTAL_PAGES], size: 14, font: FONT.name, color: hex(pageD.accentText) })]
                        : []),
                    ],
                  }),
                ],
              }),
            ],
          }),
        ],
      }),
    ],
  });

  const doc = new Document({
    creator: config.companyName || 'OpenSky Pergola Kft.',
    title: `Árajánlat ${quote.quoteNumber || ''}`.trim(),
    styles: { default: { document: { run: { font: FONT.name, size: Math.round(pageD.bodySize * 2) } } } },
    sections: [
      {
        properties: {
          page: {
            size: { width: Math.round(PAGE_W * PT), height: Math.round(841.89 * PT) },
            // Word ajánlatok: felső 1865, alsó 1418, bal/jobb 1417 twip
            margin: { top: 1865, bottom: 1418, left: Math.round(MARGIN * PT), right: Math.round(MARGIN * PT), header: 708, footer: 708 },
          },
        },
        headers: { default: letterheadHeader || header },
        ...(letterheadHeader ? {} : { footers: { default: footer } }),
        children: body.length ? body : [new Paragraph('')],
      },
    ],
  });
  return Packer.toBuffer(doc);
}

function isDark(h?: string) {
  const m = (h || '').match(/^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i);
  if (!m) return false;
  const [r, g, b] = [m[1], m[2], m[3]].map((x) => parseInt(x, 16));
  return r * 0.299 + g * 0.587 + b * 0.114 < 140;
}
