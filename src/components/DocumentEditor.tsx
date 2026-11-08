'use client';

import React from 'react';
import { ArrowDown, ArrowUp, ImagePlus, Plus, Scissors, Trash2, Type, X } from 'lucide-react';
import { formatDotNumber } from '@/lib/constants';
import { computeBlockTotals, recalculateBlockTotals } from '@/lib/pricing-engine';
import type { PhotoCaptionBlock, QuoteDocumentBlock, SystemConfig } from '@/lib/types';

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
}: {
  value: string;
  onChange: (v: string) => void;
  className?: string;
  placeholder?: string;
  single?: boolean;
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
}) {
  const rate = Number(eurHufRate) || Number(config.defaultEurHufRate) || 400;
  const hufLine = (config.docHufLine || 'Az ajánlat írásának napján, {{arfolyam}} Ft/EUR árfolyamon az összeg:').replace(/\{\{\s*arfolyam\s*\}\}/g, String(rate));
  let productNo = 0;

  const insertBar = (afterIndex: number) => (
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
    const st = blk.textStyle || 'normal';
    const set = (patch: Partial<QuoteDocumentBlock>) => updateBlock(blk.id, (b) => ({ ...b, ...patch }));
    if (st === 'category_heading')
      return <Inline value={blk.title || blk.content || ''} single onChange={(v) => set({ title: v })} className="text-[15px] font-bold underline underline-offset-2" />;
    if (st === 'promo') return <Inline value={blk.content || ''} onChange={(v) => set({ content: v })} className="text-[14px] font-bold leading-relaxed" />;
    if (st === 'footer_info')
      return (
        <div className="space-y-1">
          <Inline value={blk.title || ''} single onChange={(v) => set({ title: v })} className="text-[14.5px] font-bold underline underline-offset-2" />
          <Inline value={blk.content || ''} onChange={(v) => set({ content: v })} className="text-[12.5px] leading-[1.6] text-slate-700" />
        </div>
      );
    if (st === 'options')
      return <Inline value={blk.content || ''} onChange={(v) => set({ content: v })} className="text-[13px] leading-[1.55] first-line:font-bold" />;
    return (
      <div className="space-y-1">
        {(blk.title || st === 'greeting') && (
          <Inline value={blk.title || ''} single onChange={(v) => set({ title: v })} className={st === 'greeting' ? 'text-[17px] font-bold' : 'text-[14.5px] font-bold'} placeholder="Cím" />
        )}
        <Inline value={blk.content || ''} onChange={(v) => set({ content: v })} className={`text-[13px] leading-[1.6] text-slate-800 ${st === 'highlight' ? 'font-bold' : ''}`} />
      </div>
    );
  };

  const renderSection = (blk: QuoteDocumentBlock) => {
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
          <td className="border border-slate-600 px-1.5 py-0.5 align-bottom">
            <div className="flex items-end gap-1">
              <Inline value={r.name || ''} onChange={(v) => setRow(i, { name: v })} className="text-[12px]" />
              <button type="button" title="Tétel elrejtése az ajánlatból" onClick={() => setRow(i, { included: false })} className="opacity-0 group-hover/row:opacity-100 text-slate-400 hover:text-rose-600 print:hidden">
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          </td>
          <td className="border border-slate-600 px-1.5 py-0.5 align-bottom text-[12px]">
            <NumCell value={r.listPriceEur} blank={!gift && !(Number(r.listPriceEur) > Number(r.discountPriceEur))} onChange={(n) => setRow(i, { listPriceEur: n }, true)} />
          </td>
          <td className="border border-slate-600 px-1.5 py-0.5 align-bottom text-[12px]">
            <NumCell bold value={r.discountPriceEur} onChange={(n) => setRow(i, { discountPriceEur: n }, true)} />
          </td>
          <td className="border border-slate-600 px-1.5 py-0.5 align-bottom text-[12px] font-bold">
            <Inline value={r.note || (gift ? 'Ajándék' : r.itemRole === 'optional' ? 'Opció' : '')} single onChange={(v) => setRow(i, { note: v })} className="text-[12px] font-bold" />
          </td>
        </tr>
      );
    };
    const hidden = rows.filter((r) => r.included === false && !r.systemRole);
    return (
      <div className="space-y-2">
        <div className="flex items-baseline gap-1">
          <span className="text-[17px] font-bold">{productNo}.</span>
          <Inline
            value={(blk.sectionTitle || '').replace(/^\d+\.\s*/, '').replace(/\s*\(\d+\s*[×x]\s*\d+[^)]*\)\s*$/, '').replace(/:\s*$/, '') + ':'}
            single
            onChange={(v) =>
              updateBlock(blk.id, (b) => {
                const suffix = (b.sectionTitle || '').match(/\s*\(\d+\s*[×x]\s*\d+[^)]*\)\s*$/)?.[0] || '';
                return { ...b, sectionTitle: `${productNo}. ${v.replace(/:\s*$/, '')}${suffix}` };
              })
            }
            className="text-[17px] font-bold"
          />
        </div>
        {sizeLine && <div className="text-[13px] font-bold italic underline underline-offset-2">{sizeLine}</div>}
        <Inline value={blk.sectionSubtitle || ''} single onChange={(v) => updateBlock(blk.id, (b) => ({ ...b, sectionSubtitle: v }))} className="text-[12.5px] italic text-slate-500" placeholder="Alcím" />
        <Inline value={blk.sectionIntroText || ''} onChange={(v) => updateBlock(blk.id, (b) => ({ ...b, sectionIntroText: v }))} className="text-[13px] leading-[1.6] text-slate-800" placeholder="Termék leírása" />

        {photos.length > 0 && (
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
          <table className="w-full border-collapse text-slate-900 table-fixed">
            <colgroup>
              <col style={{ width: '42%' }} />
              <col style={{ width: '16%' }} />
              <col style={{ width: '24%' }} />
              <col style={{ width: '18%' }} />
            </colgroup>
            <thead>
              <tr className="bg-[#d9d9d9] text-[12px] font-bold text-left">
                <th className="border border-slate-600 px-1.5 py-1">Megnevezés</th>
                <th className="border border-slate-600 px-1.5 py-1">Listaár (EUR)</th>
                <th className="border border-slate-600 px-1.5 py-1">{discountLabel ? `Kedvezményes ár: ${discountLabel} (EUR)` : 'Ár (EUR)'}</th>
                <th className="border border-slate-600 px-1.5 py-1" />
              </tr>
            </thead>
            <tbody>
              {base.map(rowEl)}
              <tr className="text-[12px]">
                <td className="border border-slate-600" />
                <td className="border border-slate-600 px-1.5 py-0.5">Összesen:</td>
                <td className="border border-slate-600 px-1.5 py-0.5 text-right font-bold tabular-nums">{Math.round(totals.totalEur)}</td>
                <td className="border border-slate-600" />
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
            <div className="text-[14.5px]">
              {label} <b>{plus}{formatDotNumber(Math.round(totals.totalEur))} EUR (+ Áfa)</b>
            </div>
            <div className="text-[11.5px]">
              {hufLine} <b className="text-[13.5px]">{plus}{formatDotNumber(Math.round(totals.totalHuf))} Ft (+Áfa)</b>
            </div>
          </div>
        )}
        {opt.map(({ r }) => (
          <div key={`o-${r.id}`} className="pl-2">
            <div className="text-[13.5px]">
              -&nbsp;&nbsp; {config.docOptionLabel || 'Opció:'} {r.name}: <b>+ {formatDotNumber(Math.round(r.discountPriceEur))} EUR (+Áfa)</b>
            </div>
            <div className="pl-6 text-[11.5px]">
              {hufLine} <b className="text-[13.5px]">{formatDotNumber(Math.round((r.discountPriceEur * rate) / 1000) * 1000)} Ft (+Áfa)</b>
            </div>
          </div>
        ))}
        <Inline value={blk.sectionClosingText || ''} onChange={(v) => updateBlock(blk.id, (b) => ({ ...b, sectionClosingText: v }))} className="text-[12px] leading-[1.6] text-slate-600" placeholder="Záró szöveg (opcionálisan rendelhető, színek…)" />
      </div>
    );
  };

  return (
    <div className="bg-slate-200/70 rounded-2xl p-3 sm:p-6 overflow-x-auto">
      <div className="mx-auto bg-white shadow-xl w-full max-w-[820px] min-w-[620px]" style={{ fontFamily: 'Arial, Helvetica, sans-serif' }}>
        {/* fejléc: középre igazított logó, mint a PDF-ben */}
        <div className="pt-7 pb-3 text-center relative">
          {config.pdfLogoUrl ? <img src={config.pdfLogoUrl} alt="" className="h-11 mx-auto object-contain" /> : <div className="text-xl font-bold">{config.companyName}</div>}
          {config.companySubtitle && <div className="text-[10px] text-slate-500 mt-1">{config.companySubtitle}</div>}
          {quoteNumber && <div className="absolute right-6 top-4 text-[10px] text-slate-400">Árajánlat {quoteNumber}</div>}
        </div>
        <div className="px-[70px] pb-10 space-y-1">
          {insertBar(-1)}
          {blocks.map((blk, idx) => (
            <React.Fragment key={blk.id}>
              <div className="group relative py-1.5">
                {/* blokk műveletek a lap szélén */}
                <div className="absolute -left-[58px] top-1 flex flex-col gap-0.5 opacity-0 group-hover:opacity-100 transition print:hidden">
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
        {/* lábléc: sötétkék sáv, mint a PDF-ben */}
        <div className="bg-[#343a55] text-white text-center py-3">
          <div className="text-[12px]">{(config.companyWebsite || 'www.openskypergola.hu').replace(/^https?:\/\//, '')}</div>
          <div className="text-[9px] text-indigo-100/80">{[config.companyPhone, config.companyEmail].filter(Boolean).join('  ·  ')}</div>
        </div>
      </div>
    </div>
  );
}
