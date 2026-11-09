import { formatDotNumber, replaceTemplateVariables } from './constants';
import { blockCategoryId, getDocDesign, photoWidthPct, primaryCategory, type DocDesign } from './doc-design';
import { loadImageBytes } from './pdf-generator';
import { computeBlockTotals } from './pricing-engine';
import { parseRich, stripRich } from './richtext';
import type { PhotoCaptionBlock, ProductCategory, QuoteDocumentBlock, QuoteRecord, SystemConfig } from './types';

/**
 * Az ajánlat HTML változata Google Dokumentumokba illesztéshez (vágólapon át): ugyanaz a felépítés, mint a PDF-ben
 * és a Word exportban (Calibri, szürke kiemelés, táblázat, Összesen sor, fotók, színcsempék). A képek beágyazva
 * (data URL), hogy bejelentkezés nélkül is bekerüljenek a dokumentumba.
 */
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function rich(text: string): string {
  return parseRich(text)
    .map((r) => {
      let h = esc(r.text).replace(/\n/g, '<br>');
      if (r.u) h = `<u>${h}</u>`;
      if (r.i) h = `<i>${h}</i>`;
      if (r.b) h = `<b>${h}</b>`;
      const css = [r.color ? `color:${r.color}` : '', r.size ? `font-size:${r.size}pt` : ''].filter(Boolean).join(';');
      return css ? `<span style="${css}">${h}</span>` : h;
    })
    .join('');
}

export async function renderQuoteHtml(quote: Partial<QuoteRecord>, config: SystemConfig, categories: ProductCategory[] = []): Promise<string> {
  const blocks: QuoteDocumentBlock[] = Array.isArray(quote.blocks) ? quote.blocks : [];
  const pageD = getDocDesign(config, primaryCategory(blocks, categories));
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
  const fill = (t?: string) => replaceTemplateVariables(t || '', varCtx);
  const font = pageD.font === 'arial' ? 'Arial' : 'Calibri';
  const CONTENT_PT = 595.28 - pageD.marginPt * 2;

  const imgCache = new Map<string, string>();
  const dataUrl = async (url?: string) => {
    if (!url) return '';
    if (imgCache.has(url)) return imgCache.get(url)!;
    const f = await loadImageBytes(url);
    const d = f ? `data:image/${f.type === 'png' ? 'png' : 'jpeg'};base64,${f.bytes.toString('base64')}` : '';
    imgCache.set(url, d);
    return d;
  };

  const out: string[] = [];
  const p = (html: string, style = '') => out.push(`<p style="margin:0;${style}">${html || '&nbsp;'}</p>`);
  const blank = () => p('&nbsp;');
  const hl = (D: DocDesign, html: string) => (D.highlight ? `<span style="background-color:${D.highlight}">${html}</span>` : html);
  const body = (D: DocDesign) => `font-size:${D.bodySize}pt;color:${D.text};line-height:1.15`;

  const photo = async (ph: PhotoCaptionBlock, pct: number) => {
    const src = await dataUrl(ph.imageUrl);
    if (!src) return;
    const w = Math.round((CONTENT_PT * pct) / 100 * 1.333); // pt → px
    const align = ph.align === 'left' ? 'left' : ph.align === 'right' ? 'right' : 'center';
    if (ph.titleAbove) p(`<b>${esc(stripRich(fill(ph.titleAbove)))}</b>`, `text-align:${align};font-size:9.5pt`);
    p(`<img src="${src}" width="${w}" style="width:${w}px;max-width:100%">`, `text-align:${align}`);
    if (ph.captionBelow) p(esc(stripRich(fill(ph.captionBelow))), `text-align:${align};font-size:8.5pt;color:#555`);
  };

  const section = async (block: QuoteDocumentBlock, attached = false) => {
    const D = designOf(block);
    if (attached) {
      const at = fill(block.attachTitle).trim();
      if (at) p(`<b>${rich(at)}</b>`, `${body(D)};margin-left:30pt`);
    } else {
      const raw = fill(block.sectionTitle);
      const sz = raw.match(/\((\d+)\s*[×x]\s*(\d+)\s*[×x]\s*(\d+)\s*cm(?:\s*-\s*([^)]*))?\)\s*$/);
      const title = raw.replace(/\s*\(\d+\s*[×x]\s*\d+[^)]*\)\s*$/, '').replace(/:\s*$/, '');
      if (title) p(`<b>${hl(D, esc(stripRich(title)) + ':')}</b>`, `font-size:${D.headingSize}pt`);
      if (sz) {
        const line = replaceTemplateVariables(
          config.docSizeLine || 'Méretek: {{szelesseg}} cm hosszú x {{kinyulas}} cm széles (kinyúlás) x {{magassag}} cm magas (belső) – {{beepites}}',
          { ...varCtx, widthCm: Number(sz[1]), projectionCm: Number(sz[2]), heightCm: Number(sz[3]), mountType: (sz[4] || varCtx.mountType).trim() }
        );
        const cut = line.indexOf(':');
        p(cut > 0 && cut < 20 ? `<b>${esc(line.slice(0, cut + 1))}</b> <b><i>${esc(line.slice(cut + 1).trim())}</i></b>` : `<b><i>${esc(line)}</i></b>`, body(D));
      }
      if (block.sectionSubtitle) p(`<i>${rich(fill(block.sectionSubtitle))}</i>`, `font-size:${Math.max(8, D.bodySize - 2)}pt`);
      if (block.sectionIntroText) for (const par of fill(block.sectionIntroText).split(/\n\s*\n/)) p(rich(par), body(D)), blank();
    }
    const photos = attached ? [] : (block.sectionPhotos || []).filter((x) => x.imageUrl);
    const before = D.photoLayout === 'stacked' ? photos.slice(0, D.photosBeforeTable) : photos;
    for (const ph of before) await photo(ph, photoWidthPct(ph));

    const active = (block.rows || []).filter((r) => r.included !== false);
    const rate = Number(quote.eurHufRate || config.defaultEurHufRate || 400);
    if (active.length) {
      const totals = computeBlockTotals(block, rate);
      const discountLabel = (block.tableHeaders?.[3] || '').match(/\(([^)]*%[^)]*)\)/)?.[1] || config.defaultDiscountLabel || '';
      const td = (h: string, extra = '') => `<td style="border:0.5pt solid ${D.tableBorder};padding:1pt 3.5pt;vertical-align:bottom;${extra}">${h || '&nbsp;'}</td>`;
      const rowsHtml: string[] = [];
      rowsHtml.push(
        `<tr style="background-color:${D.tableHead}">${['Megnevezés', 'Listaár (EUR)', discountLabel ? `Kedvezményes ár: ${esc(discountLabel)} (EUR)` : 'Ár (EUR)', '']
          .map((h, i) => td(`<b>${h}</b>`, `background-color:${D.tableHead};${i === 0 ? 'text-align:center' : ''}`))
          .join('')}</tr>`
      );
      const base = active.filter((r) => r.itemRole === 'base' || r.itemRole === 'gift');
      const opt = active.filter((r) => r.itemRole === 'optional');
      const hiddenTarget = base.find((r) => r.itemRole === 'base' && r.discountPriceEur > 0)?.id;
      for (const r of base) {
        const price = (Number(r.discountPriceEur) || 0) + (r.id === hiddenTarget ? totals.hiddenAdjustmentsEur : 0);
        const list = r.listPriceEur > 0 && r.discountPriceEur > 0 ? Math.round((r.listPriceEur / r.discountPriceEur) * price) : Number(r.listPriceEur) || 0;
        const gift = r.itemRole === 'gift' || price === 0;
        const note = (r.note || '').trim();
        rowsHtml.push(
          `<tr>${td(esc(stripRich(fill(r.name))))}${td(list > price || (gift && list > 0) ? String(Math.round(list)) : '', 'text-align:right')}${td(`<b>${Math.round(gift ? 0 : price)}</b>`, 'text-align:right')}${td(
            `<b>${gift ? 'Ajándék' : note && note !== discountLabel && !/aj[aá]nd[eé]k/i.test(note) ? esc(note) : attached && !block.sizeOverride && list > price ? 'Opció' : ''}</b>`
          )}</tr>`
        );
      }
      const strong = `background-color:${D.tableHead};border-top:1.5pt solid ${D.tableBorder};border-bottom:1.5pt solid ${D.tableBorder};font-size:${D.tableSize + 1}pt`;
      rowsHtml.push(`<tr>${td('', strong)}${td(`<b>${esc(block.sumLabel || 'Összesen:')}</b>`, strong)}${td(`<b>${Math.round(totals.totalEur)}</b>`, `${strong};text-align:right`)}${td('', strong)}</tr>`);
      for (const r of opt)
        rowsHtml.push(
          `<tr>${td(esc(stripRich(fill(r.name))))}${td(r.listPriceEur > r.discountPriceEur ? String(Math.round(r.listPriceEur)) : '', 'text-align:right')}${td(`<b>${Math.round(r.discountPriceEur)}</b>`, 'text-align:right')}${td(`<b>${esc((r.note || '').trim() || (r.listPriceEur > r.discountPriceEur ? 'Opció-kedvezmény-' : 'Opció'))}</b>`)}</tr>`
        );
      blank();
      out.push(
        `<table style="border-collapse:collapse;width:100%;font-family:${font};font-size:${D.tableSize}pt"><colgroup><col width="39%"><col width="17%"><col width="28%"><col width="16%"></colgroup>${rowsHtml.join('')}</table>`
      );
      const dot = (n: number) => formatDotNumber(Math.round(n));
      const label = (block.totalLabel || config.docTotalLabel || 'Az alapszerkezet szereléssel Összesen:').trim();
      const hufLine = replaceTemplateVariables(config.docHufLine || 'Az ajánlat írásának napján, {{arfolyam}} Ft/EUR árfolyamon az összeg:', { ...varCtx, eurHufRate: rate });
      blank();
      if (/^opci/i.test(label)) {
        p(`-&nbsp;&nbsp; ${esc(label)} <b>+ ${dot(totals.totalEur)} EUR (+Áfa)</b>`, `${body(D)};margin-left:18pt`);
        p(`${esc(hufLine)} <b>${dot(totals.totalHuf)} Ft (+Áfa)</b>`, `font-size:${D.bodySize - 2}pt;margin-left:36pt`);
      } else {
        p(`${esc(label)} <b>${dot(totals.totalEur)} EUR (+ Áfa)</b>`, `${body(D)};text-align:right`);
        p(`${esc(hufLine)} <b>${dot(totals.totalHuf)} Ft (+Áfa)</b>`, `font-size:${D.bodySize - 2}pt;text-align:right`);
      }
      for (const r of opt) {
        const huf = Math.round(((Number(r.discountPriceEur) || 0) * rate) / 1000) * 1000;
        p(`-&nbsp;&nbsp; ${esc(config.docOptionLabel || 'Opció:')} ${esc(stripRich(fill(r.name)))}: <b>+ ${dot(r.discountPriceEur)} EUR (+Áfa)</b>`, `${body(D)};margin-left:18pt`);
        p(`${esc(hufLine)} <b>${dot(huf)} Ft (+Áfa)</b>`, `font-size:${D.bodySize - 2}pt;margin-left:36pt`);
      }
      blank();
    }
    if (attached) return;
    const closing = fill(block.sectionClosingText).split(/\n\s*\n/).map((t) => t.trim()).filter(Boolean);
    const isPromo = (t: string) => /^ha\s/i.test(stripRich(t));
    const colorPara = active.some((r) => (r.algorithm?.colorOptions || []).length) ? closing.find((t) => /alapsz[ií]n/i.test(stripRich(t)) && stripRich(t).length < 90) : undefined;
    const colorHeading = colorPara ? stripRich(colorPara).replace(/:\s*\d+\s*(db\s*)?alapsz[ií]n\.?\s*$/i, '').replace(/[:.\s]+$/, '') : '';
    for (const v of blocks.filter((b) => b.attachedTo === block.id && b.type === 'template_section' && b.sizeOverride)) await section(v, true);
    for (const t of closing.filter(isPromo)) p(`<b>${rich(t)}</b>`, `${body(D)};margin-left:30pt`), blank();
    for (const att of blocks.filter((b) => b.attachedTo === block.id && b.type === 'template_section' && !b.sizeOverride)) await section(att, true);
    if (D.photoLayout === 'stacked') for (const ph of photos.slice(D.photosBeforeTable)) await photo(ph, photoWidthPct(ph));
    for (const r of active) {
      const colors = r.algorithm?.colorOptions || [];
      if (!colors.length) continue;
      const t2 = (colorHeading || stripRich(r.algorithm?.colorTitle || r.name)).replace(/[:\s]+$/, '');
      p(esc(colors.length > 4 ? `${t2}: ${colors.length} db alapszín` : `${t2}:`), body(D));
      const cells = colors.map(
        (c) =>
          `<td style="background-color:${c.hex || '#ccc'};height:30pt;width:20%;text-align:center;vertical-align:middle;font-size:6.5pt;font-weight:bold;color:${isDark(c.hex) ? '#fff' : '#111'}">${esc(c.code || '')}</td>`
      );
      const trs: string[] = [];
      for (let i = 0; i < cells.length; i += 5) trs.push(`<tr>${cells.slice(i, i + 5).join('')}</tr>`);
      out.push(`<table style="border-collapse:collapse;width:100%">${trs.join('')}</table>`);
      blank();
    }
    for (const t of closing.filter((x) => !isPromo(x) && x !== colorPara)) {
      if (/^\+\s*opcion/i.test(stripRich(t))) {
        const [first, ...rest] = t.split('\n');
        p(`<b>${hl(D, rich(first))}</b>`, body(D));
        rest.forEach((l) => p(rich(l.replace(/^\s*•\s*/, '- ')), body(D)));
      } else p(rich(t), body(D));
      blank();
    }
  };

  for (const block of blocks) {
    const D = designOf(block);
    if (block.type === 'page_break') {
      out.push('<br style="page-break-before:always">');
      continue;
    }
    if (block.type === 'text_box') {
      const st = block.textStyle || 'normal';
      const title = fill(block.title).trim();
      const content = fill(block.content);
      if (st === 'category_heading') p(`<b><u>${rich(title || content)}</u></b>`, body(D));
      else if (st === 'promo') p(`<b>${rich(content)}</b>`, body(D));
      else if (st === 'options') content.split('\n').forEach((l, i) => p(i === 0 ? `<b>${hl(D, rich(l))}</b>` : rich(l.replace(/^\s*•\s*/, '- ')), body(D)));
      else if (st === 'footer_info') {
        if (title) p(`<b>${hl(D, rich(title))}</b>`, body(D));
        for (const par of content.split(/\n\s*\n/)) {
          const t = par.trim();
          if (!t) continue;
          if (/^megjegyz/i.test(stripRich(t))) p(`<i>${rich(t)}</i>`, 'font-size:8pt');
          else if (/^ha\s/i.test(stripRich(t))) p(`<b>${rich(t)}</b>`, body(D));
          else p(rich(t.replace(/^\s*•\s*/gm, '- ')), body(D));
          blank();
        }
        continue;
      } else {
        if (title) p(st === 'greeting' && !D.greetingBold ? rich(title) : `<b>${rich(title)}</b>`, body(D)), blank();
        for (const par of content.split(/\n\s*\n/)) if (par.trim()) p(rich(par), `${body(D)};text-align:${block.align || 'left'}`), blank();
        continue;
      }
      blank();
      continue;
    }
    if (block.type === 'photo_box' && block.photo) {
      await photo(block.photo, Number(block.photo.sizePct || block.photo.widthPct) || 75);
      continue;
    }
    if (block.type !== 'template_section') continue;
    if (block.attachedTo && blocks.some((b) => b.id === block.attachedTo)) continue;
    await section(block);
  }
  const sig = await dataUrl(config.pdfSignatureCardUrl);
  if (sig) p(`<img src="${sig}" width="400" style="width:400px">`);

  return `<html><head><meta charset="utf-8"></head><body style="font-family:${font},sans-serif;font-size:${pageD.bodySize}pt;color:${pageD.text}">${out.join('\n')}</body></html>`;
}

function isDark(h?: string) {
  const m = (h || '').match(/^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i);
  if (!m) return false;
  const [r, g, b] = [m[1], m[2], m[3]].map((x) => parseInt(x, 16));
  return r * 0.299 + g * 0.587 + b * 0.114 < 140;
}
