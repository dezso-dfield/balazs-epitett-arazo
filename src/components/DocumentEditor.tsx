'use client';

import React from 'react';
import { ArrowDown, ArrowUp, ImagePlus, Plus, Scissors, Trash2, Type, X } from 'lucide-react';
import { formatDotNumber } from '@/lib/constants';
import { computeBlockTotals, recalculateBlockTotals } from '@/lib/pricing-engine';
import type { PhotoCaptionBlock, ProductCategory, QuoteDocumentBlock, SystemConfig } from '@/lib/types';
import { blockCategoryId, getDocDesign, LETTERHEAD_URL, primaryCategory, ptPx } from '@/lib/doc-design';
import { FormatToolbar, RichInline } from '@/components/RichEdit';

/**
 * „Word-szerű” szerkesztő: az ajánlat egy A4-es lapon, a PDF kinézetével, közvetlenül a szövegbe kattintva szerkeszthető.
 * Címek, bekezdések, képaláírások, a táblázat cellái (megnevezés, listaár, kedvezményes ár, megjegyzés);
 * az Összesen és a forint sor magától frissül. A blokk mellett: fel / le / törlés, a blokkok között: beszúrás.
 */

/** Átlátszó, magától növő szövegmező: úgy néz ki, mint a dokumentum szövege */
function Inline({
  value,
  onChange,
  className = '',
  placeholder,
  single,
  style,
}: {
  value: string;
  onChange: (v: string) => void;
  className?: string;
  placeholder?: string;
  single?: boolean;
  style?: React.CSSProperties;
}) {
  const ref = React.useRef<HTMLTextAreaElement>(null);
  React.useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = '0px';
    el.style.height = `${el.scrollHeight}px`;
  }, [value]);
  return (
    <textarea
      ref={ref}
      rows={1}
      value={value}
      placeholder={placeholder}
      spellCheck
      style={style}
      onChange={(e) => onChange(single ? e.target.value.replace(/\n/g, ' ') : e.target.value)}
      className={`block w-full resize-none overflow-hidden bg-transparent border-0 p-0 m-0 outline-none rounded-sm focus:bg-amber-50/70 hover:bg-slate-50 focus:ring-2 focus:ring-indigo-200 ${className}`}
    />
  );
}

/** Szám a táblázatban: ezres tagolás nélkül, mint a Word ajánlatokban */
function NumCell({ value, onChange, bold, blank }: { value: number; onChange: (n: number) => void; bold?: boolean; blank?: boolean }) {
  // blank: a PDF-hez hasonlóan üresen látszik (pl. listaár, ha nincs kedvezmény), de kattintva szerkeszthető
  const shown = blank ? '' : String(Math.round(value || 0));
  const [text, setText] = React.useState(shown);
  React.useEffect(() => setText(shown), [shown]);
  return (
    <input
      inputMode="numeric"
      value={text}
      onChange={(e) => setText(e.target.value.replace(/[^\d-]/g, ''))}
      onFocus={() => blank && setText(String(Math.round(value || 0)))}
      onBlur={() => {
        if (blank && text === String(Math.round(value || 0))) return setText('');
        const n = Number(text) || 0;
        if (n !== Math.round(value || 0)) onChange(n);
      }}
      onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
      className={`w-full bg-transparent text-right border-0 p-0 outline-none rounded-sm focus:bg-amber-50/70 hover:bg-slate-50 focus:ring-2 focus:ring-indigo-200 tabular-nums ${bold ? 'font-bold' : ''}`}
    />
  );
}

export function DocumentEditor({
  blocks,
  config,
  eurHufRate,
  quoteNumber,
  updateBlock,
  moveBlock,
  removeBlock,
  onAddText,
  onAddPhoto,
  onAddPageBreak,
  lockedReason,
  toolbarExtra,
  hideStructureControls,
  categories = [],
}: {
  blocks: QuoteDocumentBlock[];
  config: SystemConfig;
  eurHufRate: number;
  quoteNumber?: string;
  updateBlock: (id: string, fn: (b: QuoteDocumentBlock) => QuoteDocumentBlock) => void;
  moveBlock: (idx: number, dir: -1 | 1) => void;
  removeBlock: (id: string) => void;
  onAddText: (afterIndex: number) => void;
  onAddPhoto: (afterIndex: number) => void;
  onAddPageBreak: (at: number) => void;
  /** sablon tervezőben: ha szöveget ad vissza, a blokk csak megjelenik (pl. „Termékek oldalon szerkeszthető”) */
  lockedReason?: (blk: QuoteDocumentBlock) => string | null;
  toolbarExtra?: React.ReactNode;
  hideStructureControls?: boolean;
  categories?: ProductCategory[];
}) {
  // oldal keret: a fő kategória dizájnja; a blokkok a saját kategóriájukét kapják (ha van eltérés)
  const D = getDocDesign(config, primaryCategory(blocks, categories));
  const pageD = D;
  const letterhead = config.pdfPageBackgroundUrl || (D.letterhead ? LETTERHEAD_URL : '');
  const pageFont = D.font === 'arial' ? 'Arial, Helvetica, sans-serif' : 'Calibri, Carlito, sans-serif';
  const styles = (blk: QuoteDocumentBlock) => {
    const cat = categories.find((c) => c.id === blockCategoryId(blk));
    const d = cat ? getDocDesign(config, cat) : D;
    return {
      D: d,
      body: { fontSize: ptPx(d.bodySize), lineHeight: d.lineHeight, color: d.text } as React.CSSProperties,
      headC: { color: d.heading } as React.CSSProperties,
    };
  };
  const [focusId, setFocusId] = React.useState<string | null>(null);
  const focused = blocks.find((b) => b.id === focusId);
  const rate = Number(eurHufRate) || Number(config.defaultEurHufRate) || 400;
  const hufLine = (config.docHufLine || 'Az ajánlat írásának napján, {{arfolyam}} Ft/EUR árfolyamon az összeg:').replace(/\{\{\s*arfolyam\s*\}\}/g, String(rate));
  let productNo = 0;

  const insertBar = (afterIndex: number) => hideStructureControls ? null : (
    <div className="group/ins relative h-5 -my-1 flex items-center justify-center print:hidden">
      <div className="absolute inset-x-8 top-1/2 h-px bg-indigo-200 opacity-0 group-hover/ins:opacity-100 transition" />
      <div className="relative flex gap-1 opacity-0 group-hover/ins:opacity-100 transition">
        {(
          [
            [Type, 'Szöveg', () => onAddText(afterIndex)],
            [ImagePlus, 'Fotó', () => onAddPhoto(afterIndex)],
            [Scissors, 'Oldaltörés', () => onAddPageBreak(afterIndex + 1)],
          ] as const
        ).map(([Icon, l, fn]) => (
          <button key={l} type="button" onClick={fn} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-white border border-indigo-200 text-[11px] font-semibold text-indigo-700 shadow-sm hover:bg-indigo-50">
            <Plus className="w-3 h-3" />
            <Icon className="w-3 h-3" /> {l}
          </button>
        ))}
      </div>
    </div>
  );

  const photoCaption = (blk: QuoteDocumentBlock, idx: number, p: PhotoCaptionBlock, key: 'captionBelow' | 'titleAbove') => (
    <Inline
      value={p[key] || ''}
      single
      placeholder={key === 'titleAbove' ? 'Cím a kép fölött' : 'Képaláírás'}
      onChange={(v) =>
        updateBlock(blk.id, (b) => {
          const photos = [...(b.sectionPhotos || [])];
          photos[idx] = { ...photos[idx], [key]: v };
          return { ...b, sectionPhotos: photos };
        })
      }
      className={key === 'titleAbove' ? 'text-[11.5px] font-bold text-slate-900' : 'text-[11px] text-slate-500 text-center'}
    />
  );

  const renderTextBox = (blk: QuoteDocumentBlock) => {
    const { D, body, headC } = styles(blk);
    const st = blk.textStyle || 'normal';
    const set = (patch: Partial<QuoteDocumentBlock>) => updateBlock(blk.id, (b) => ({ ...b, ...patch }));
    const ro = !!lockedReason?.(blk);
    const alignCls = blk.align === 'center' ? 'text-center' : blk.align === 'right' ? 'text-right' : '';
    const hlStyle: React.CSSProperties = D.highlight ? { display: 'inline-block', width: 'auto', background: D.highlight } : { display: 'inline-block', width: 'auto' };
    if (st === 'category_heading')
      return <RichInline readOnly={ro} value={blk.title || blk.content || ''} single onChange={(v) => set({ title: v })} className="font-bold underline underline-offset-2" style={{ ...headC, fontSize: ptPx(D.bodySize) }} />;
    if (st === 'promo') return <RichInline readOnly={ro} value={blk.content || ''} onChange={(v) => set({ content: v })} className="font-bold" style={{ ...body, ...headC }} />;
    if (st === 'footer_info')
      return (
        <div>
          <RichInline readOnly={ro} value={blk.title || ''} single onChange={(v) => set({ title: v })} className="font-bold" style={{ ...headC, fontSize: ptPx(D.bodySize), ...hlStyle }} />
          <RichInline readOnly={ro} value={blk.content || ''} onChange={(v) => set({ content: v })} style={body} />
        </div>
      );
    if (st === 'options')
      return (
        <RichInline
          readOnly={ro}
          value={blk.content || ''}
          onChange={(v) => set({ content: v })}
          className="first-line:font-bold first-line:bg-[var(--hl)]"
          style={{ ...body, ['--hl' as string]: D.highlight || 'transparent' }}
        />
      );
    return (
      <div className="space-y-1">
        {(blk.title || st === 'greeting') && (
          <RichInline
            readOnly={ro}
            value={blk.title || ''}
            single
            onChange={(v) => set({ title: v })}
            className={st === 'greeting' && !D.greetingBold ? '' : 'font-bold'}
            style={{ ...headC, fontSize: ptPx(st === 'greeting' ? D.greetingSize : D.bodySize), lineHeight: D.lineHeight, marginBottom: ptPx(D.bodySize * D.lineHeight) }}
            placeholder="Cím"
          />
        )}
        <RichInline readOnly={ro} value={blk.content || ''} onChange={(v) => set({ content: v })} className={`${alignCls} ${st === 'highlight' ? 'font-bold' : ''}`} style={body} placeholder="Szöveg…" />
      </div>
    );
  };

  const renderSection = (blk: QuoteDocumentBlock) => {
    const { D, body, headC } = styles(blk);
    productNo++;
    const sizeM = (blk.sectionTitle || '').match(/\((\d+)\s*[×x]\s*(\d+)\s*[×x]\s*(\d+)\s*cm(?:\s*-\s*([^)]*))?\)\s*$/);
    const rows = blk.rows || [];
    const totals = computeBlockTotals(blk, rate);
    const discountLabel = (blk.tableHeaders?.[3] || '').match(/\(([^)]*%[^)]*)\)/)?.[1] || config.defaultDiscountLabel || '';
    const label = (blk.totalLabel || config.docTotalLabel || 'Az alapszerkezet szereléssel Összesen:').trim();
    const plus = /^opci/i.test(label) ? '+ ' : '';
    const setRow = (rIdx: number, patch: Record<string, unknown>, prices = false) =>
      updateBlock(blk.id, (b) => {
        const next = [...(b.rows || [])];
        next[rIdx] = { ...next[rIdx], ...patch, ...(prices ? { priceOverridden: true } : {}) };
        return recalculateBlockTotals({ ...b, rows: next }, rate);
      });
    const photos = (blk.sectionPhotos || []).filter((p) => p.imageUrl);
    const sizeLine = sizeM
      ? (config.docSizeLine || 'Méretek: {{szelesseg}} cm hosszú x {{kinyulas}} cm széles (kinyúlás) x {{magassag}} cm magas (belső) – {{beepites}}')
          .replace(/\{\{\s*szelesseg\s*\}\}/g, sizeM[1])
          .replace(/\{\{\s*kinyulas\s*\}\}/g, sizeM[2])
          .replace(/\{\{\s*magassag\s*\}\}/g, sizeM[3])
          .replace(/\{\{\s*beepites\s*\}\}/g, (sizeM[4] || '').trim())
      : '';
    const visible = rows.map((r, i) => ({ r, i })).filter(({ r }) => r.included !== false && !r.systemRole);
    const base = visible.filter(({ r }) => r.itemRole !== 'optional');
    const opt = visible.filter(({ r }) => r.itemRole === 'optional');
    const rowEl = ({ r, i }: { r: (typeof rows)[number]; i: number }) => {
      const gift = r.itemRole === 'gift' || Number(r.discountPriceEur) === 0;
      return (
        <tr key={r.id} className="group/row align-bottom">
          <td className="border border-[var(--tb)] px-1 py-0 align-bottom">
            <div className="flex items-end gap-1">
              <Inline value={r.name || ''} onChange={(v) => setRow(i, { name: v })} className="" />
              <button type="button" title="Tétel elrejtése az ajánlatból" onClick={() => setRow(i, { included: false })} className="opacity-0 group-hover/row:opacity-100 text-slate-400 hover:text-rose-600 print:hidden">
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          </td>
          <td className="border border-[var(--tb)] px-1 py-0 align-bottom">
            <NumCell value={r.listPriceEur} blank={!gift && !(Number(r.listPriceEur) > Number(r.discountPriceEur))} onChange={(n) => setRow(i, { listPriceEur: n }, true)} />
          </td>
          <td className="border border-[var(--tb)] px-1 py-0 align-bottom">
            <NumCell bold value={r.discountPriceEur} onChange={(n) => setRow(i, { discountPriceEur: n }, true)} />
          </td>
          <td className="border border-[var(--tb)] px-1 py-0 align-bottom font-bold">
            <Inline value={r.note || (gift ? 'Ajándék' : r.itemRole === 'optional' ? 'Opció' : '')} single onChange={(v) => setRow(i, { note: v })} className="font-bold" />
          </td>
        </tr>
      );
    };
    const hidden = rows.filter((r) => r.included === false && !r.systemRole);
    return (
      <div className="space-y-1">
        <div className="inline-flex items-baseline gap-1 max-w-full" style={{ background: D.highlight || undefined }}>
          <span className="font-bold" style={{ ...headC, fontSize: ptPx(D.headingSize) }}>{productNo}.</span>
          <Inline
            value={(blk.sectionTitle || '').replace(/^\d+\.\s*/, '').replace(/\s*\(\d+\s*[×x]\s*\d+[^)]*\)\s*$/, '').replace(/:\s*$/, '') + ':'}
            single
            onChange={(v) =>
              updateBlock(blk.id, (b) => {
                const suffix = (b.sectionTitle || '').match(/\s*\(\d+\s*[×x]\s*\d+[^)]*\)\s*$/)?.[0] || '';
                return { ...b, sectionTitle: `${productNo}. ${v.replace(/:\s*$/, '')}${suffix}` };
              })
            }
            className="font-bold"
            style={{
              ...headC,
              fontSize: ptPx(D.headingSize),
              // a szürke kiemelés csak a szövegig tartson (mint a Wordben): a mező a szöveg hosszáig nő
              width: `calc(${(blk.sectionTitle || '').replace(/^\d+\.\s*/, '').replace(/\s*\(\d+\s*[×x]\s*\d+[^)]*\)\s*$/, '').length + 2}ch)`,
              maxWidth: '100%',
            }}
          />
        </div>
        {sizeLine && (
          <div className="font-bold" style={{ ...headC, fontSize: ptPx(D.bodySize), lineHeight: D.lineHeight }}>
            {sizeLine.indexOf(':') > 0 && sizeLine.indexOf(':') < 20 ? (
              <>
                {sizeLine.slice(0, sizeLine.indexOf(':') + 1)} <i>{sizeLine.slice(sizeLine.indexOf(':') + 1).trim()}</i>
              </>
            ) : (
              <i>{sizeLine}</i>
            )}
          </div>
        )}
        <RichInline readOnly={!!lockedReason?.(blk)} value={blk.sectionSubtitle || ''} single onChange={(v) => updateBlock(blk.id, (b) => ({ ...b, sectionSubtitle: v }))} className="italic" style={{ fontSize: ptPx(Math.max(8, D.bodySize - 2)), color: D.muted, lineHeight: D.lineHeight }} placeholder="Alcím" />
        <RichInline readOnly={!!lockedReason?.(blk)} value={blk.sectionIntroText || ''} onChange={(v) => updateBlock(blk.id, (b) => ({ ...b, sectionIntroText: v }))} style={body} placeholder="Termék leírása" />

        {photos.length > 0 && D.photoLayout === 'stacked' && (
          <div className="space-y-3 py-2">
            {photos.map((p, k) => (
              <figure key={p.id || k} className="mx-auto w-full">
                {p.titleAbove && photoCaption(blk, k, p, 'titleAbove')}
                <img src={p.imageUrl} alt="" className="mx-auto w-full object-contain" style={{ maxHeight: ptPx(330) }} />
                {photoCaption(blk, k, p, 'captionBelow')}
              </figure>
            ))}
          </div>
        )}
        {photos.length > 0 && D.photoLayout !== 'stacked' && (
          <div className="space-y-3 py-1">
            <figure className="mx-auto w-[75%]">
              {photos[0].titleAbove && photoCaption(blk, 0, photos[0], 'titleAbove')}
              <img src={photos[0].imageUrl} alt="" className="w-full max-h-[390px] object-contain" />
              {photoCaption(blk, 0, photos[0], 'captionBelow')}
            </figure>
            {photos.length > 1 && (
              <div className="grid grid-cols-2 gap-3">
                {photos.slice(1).map((p, k) => (
                  <figure key={p.id || k} className={photos.length - 1 === k + 1 && (photos.length - 1) % 2 === 1 ? 'col-span-2 mx-auto w-[75%]' : ''}>
                    {p.titleAbove !== undefined && p.titleAbove !== '' && photoCaption(blk, k + 1, p, 'titleAbove')}
                    <img src={p.imageUrl} alt="" className="w-full max-h-[270px] object-contain" />
                    {photoCaption(blk, k + 1, p, 'captionBelow')}
                  </figure>
                ))}
              </div>
            )}
          </div>
        )}

        {visible.length > 0 && (
          <table
            className="border-collapse text-slate-900 table-fixed"
            style={{
              ['--tb' as string]: D.tableBorder,
              fontSize: ptPx(D.tableSize),
              lineHeight: 1.22,
              width: D.tableWide ? ptPx(531) : '100%',
              marginLeft: D.tableWide ? ptPx(-(531 - (595.28 - 2 * pageD.marginPt)) / 2) : undefined,
            }}
          >
            <colgroup>
              {[4160, 1780, 2960, 1720].map((tw, i) => (
                <col key={i} style={{ width: `${(tw / 10620) * 100}%` }} />
              ))}
            </colgroup>
            <thead>
              <tr className="font-bold text-left" style={{ background: D.tableHead }}>
                <th className="border border-[var(--tb)] px-1 py-0 text-center">Megnevezés</th>
                <th className="border border-[var(--tb)] px-1 py-0">Listaár (EUR)</th>
                <th className="border border-[var(--tb)] px-1 py-0">{discountLabel ? `Kedvezményes ár: ${discountLabel} (EUR)` : 'Ár (EUR)'}</th>
                <th className="border border-[var(--tb)] px-1 py-0" />
              </tr>
            </thead>
            <tbody>
              {base.map(rowEl)}
              <tr>
                <td className="border border-[var(--tb)]" />
                <td className="border border-[var(--tb)] px-1 py-0">Összesen:</td>
                <td className="border border-[var(--tb)] px-1 py-0 text-right font-bold tabular-nums">{Math.round(totals.totalEur)}</td>
                <td className="border border-[var(--tb)]" />
              </tr>
              {opt.map(rowEl)}
            </tbody>
          </table>
        )}
        {hidden.length > 0 && (
          <div className="text-[11px] text-slate-500 print:hidden">
            Rejtett tételek:{' '}
            {hidden.map((r) => (
              <button key={r.id} type="button" className="underline mr-2 hover:text-indigo-700" onClick={() => setRow(rows.indexOf(r), { included: true })}>
                + {r.name}
              </button>
            ))}
          </div>
        )}

        {visible.length > 0 && (
          <div className="text-right space-y-0.5 pt-1">
            <div style={{ fontSize: ptPx(D.bodySize) }}>
              {label} <b>{plus}{formatDotNumber(Math.round(totals.totalEur))} EUR (+ Áfa)</b>
            </div>
            <div style={{ fontSize: ptPx(D.bodySize - 2) }}>
              {hufLine} <b>{plus}{formatDotNumber(Math.round(totals.totalHuf))} Ft (+Áfa)</b>
            </div>
          </div>
        )}
        {opt.map(({ r }) => (
          <div key={`o-${r.id}`} style={{ paddingLeft: ptPx(18) }}>
            <div style={{ fontSize: ptPx(D.bodySize) }}>
              -&nbsp;&nbsp; {config.docOptionLabel || 'Opció:'} {r.name}: <b>+ {formatDotNumber(Math.round(r.discountPriceEur))} EUR (+Áfa)</b>
            </div>
            <div style={{ fontSize: ptPx(D.bodySize - 2), paddingLeft: ptPx(18) }}>
              {hufLine} <b>{formatDotNumber(Math.round((r.discountPriceEur * rate) / 1000) * 1000)} Ft (+Áfa)</b>
            </div>
          </div>
        ))}
        <RichInline readOnly={!!lockedReason?.(blk)} value={blk.sectionClosingText || ''} onChange={(v) => updateBlock(blk.id, (b) => ({ ...b, sectionClosingText: v }))} style={{ ...body, marginTop: ptPx(D.bodySize) }} placeholder="Záró szöveg (opcionálisan rendelhető, színek…)" />
      </div>
    );
  };

  return (
    <div className="bg-slate-200/70 rounded-2xl p-3 sm:p-6 overflow-x-auto space-y-3">
      <div className="mx-auto" style={{ width: ptPx(595.28) }}>
        <FormatToolbar
          accent={D.accent}
          align={focused?.type === 'text_box' ? focused.align || 'left' : null}
          onAlign={
            focused?.type === 'text_box' && !lockedReason?.(focused)
              ? (a) => updateBlock(focused.id, (b) => ({ ...b, align: a }))
              : undefined
          }
          extra={toolbarExtra}
        />
      </div>
      <div className="mx-auto bg-white shadow-xl shrink-0" style={{ width: ptPx(595.28), fontFamily: pageFont, color: D.text }}>
        {/* fejléc: a fejléces papír teteje (logó), mint a PDF-ben és a Word ajánlatokban */}
        {letterhead ? (
          <div
            style={{ height: ptPx(93), backgroundImage: `url(${letterhead})`, backgroundSize: '100% auto', backgroundRepeat: 'no-repeat', backgroundPosition: `0 ${ptPx(7)}` }}
          />
        ) : (
          <div className="pt-7 pb-3 text-center relative">
            {config.pdfLogoUrl ? <img src={config.pdfLogoUrl} alt="" className="mx-auto object-contain" style={{ height: ptPx(D.logoHeight) }} /> : <div className="text-xl font-bold">{config.companyName}</div>}
            {config.companySubtitle && <div className="text-[10px] text-slate-500 mt-1">{config.companySubtitle}</div>}
            {quoteNumber && <div className="absolute right-6 top-4 text-[10px] text-slate-400">Árajánlat {quoteNumber}</div>}
          </div>
        )}
        <div className="pb-10 space-y-1" style={{ paddingLeft: ptPx(D.marginPt), paddingRight: ptPx(D.marginPt) }}>
          {insertBar(-1)}
          {blocks.map((blk, idx) => (
            <React.Fragment key={blk.id}>
              <div className={`group relative py-1.5 ${lockedReason?.(blk) ? 'opacity-90' : ''}`} onFocus={() => setFocusId(blk.id)}>
                {lockedReason?.(blk) && (
                  <div className="absolute -right-[64px] top-1 w-[58px] text-[9px] leading-tight text-slate-400 print:hidden">{lockedReason(blk)}</div>
                )}
                {/* blokk műveletek a lap szélén */}
                <div className={`absolute -left-[58px] top-1 flex-col gap-0.5 opacity-0 group-hover:opacity-100 transition print:hidden ${hideStructureControls ? 'hidden' : 'flex'}`}>
                  <button type="button" title="Feljebb" disabled={idx === 0} onClick={() => moveBlock(idx, -1)} className="p-1 rounded-md bg-white border border-slate-200 text-slate-500 hover:text-slate-900 disabled:opacity-30">
                    <ArrowUp className="w-3.5 h-3.5" />
                  </button>
                  <button type="button" title="Lejjebb" disabled={idx === blocks.length - 1} onClick={() => moveBlock(idx, 1)} className="p-1 rounded-md bg-white border border-slate-200 text-slate-500 hover:text-slate-900 disabled:opacity-30">
                    <ArrowDown className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    title="Törlés"
                    onClick={() => window.confirm('Törlöd ezt a részt az ajánlatból?') && removeBlock(blk.id)}
                    className="p-1 rounded-md bg-white border border-slate-200 text-slate-500 hover:text-rose-600"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
                {blk.type === 'text_box' && renderTextBox(blk)}
                {blk.type === 'template_section' && renderSection(blk)}
                {blk.type === 'photo_box' && blk.photo && (
                  <figure className="mx-auto w-[75%]">
                    {blk.photo.imageUrl && <img src={blk.photo.imageUrl} alt="" className="w-full max-h-[390px] object-contain" />}
                    <Inline
                      value={blk.photo.captionBelow || ''}
                      single
                      placeholder="Képaláírás"
                      onChange={(v) => updateBlock(blk.id, (b) => ({ ...b, photo: { ...b.photo!, captionBelow: v } }))}
                      className="text-[11px] text-slate-500 text-center"
                    />
                  </figure>
                )}
                {blk.type === 'page_break' && (
                  <div className="flex items-center gap-2 text-[10px] uppercase tracking-wider text-slate-400">
                    <div className="flex-1 border-t-2 border-dashed border-slate-300" /> Oldaltörés <div className="flex-1 border-t-2 border-dashed border-slate-300" />
                  </div>
                )}
              </div>
              {insertBar(idx)}
            </React.Fragment>
          ))}
        </div>
        {/* lábléc: a fejléces papír alja (sötétkék sáv a weboldallal), vagy a dizájn szerinti sáv */}
        {letterhead ? (
          <div
            style={{ height: ptPx(57), backgroundImage: `url(${letterhead})`, backgroundSize: '100% auto', backgroundRepeat: 'no-repeat', backgroundPosition: `left 0 bottom ${ptPx(-15.5)}` }}
          />
        ) : (
          <div className="text-white text-center py-3" style={{ background: D.accent }}>
            <div className="text-[12px]">{D.footerText.trim() || (config.companyWebsite || 'www.openskypergola.hu').replace(/^https?:\/\//, '')}</div>
            <div className="text-[9px]" style={{ color: D.accentText }}>{[config.companyPhone, config.companyEmail].filter(Boolean).join('  ·  ')}</div>
          </div>
        )}
      </div>
    </div>
  );
}
