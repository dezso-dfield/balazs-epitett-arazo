'use client';

import React from 'react';
import { AlignCenter, AlignLeft, AlignRight, ArrowDown, ArrowUp, BookmarkPlus, ImagePlus, Minus, Plus, Scissors, Trash2, Type, X } from 'lucide-react';
import { formatDotNumber } from '@/lib/constants';
import { computeBlockTotals, recalculateBlockTotals } from '@/lib/pricing-engine';
import type { PhotoCaptionBlock, ProductCategory, QuoteDocumentBlock, SystemConfig } from '@/lib/types';
import { blockCategoryId, getDocDesign, LETTERHEAD_URL, photoWidthPct, primaryCategory, ptPx } from '@/lib/doc-design';
import { FormatToolbar, RichInline } from '@/components/RichEdit';
import { stripRich } from '@/lib/richtext';

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

/**
 * Fotó a lapon, mint a Wordben: rámutatva méret (−/+, 25-50-75-100%), igazítás, sorrend és törlés;
 * a jobb alsó sarok fogantyújával húzva is átméretezhető. A PDF és a Word export ugyanígy rajzolja.
 */
function PhotoFrame({
  photo,
  defaultPct,
  onPatch,
  onMove,
  onRemove,
  above,
  below,
}: {
  photo: PhotoCaptionBlock;
  defaultPct: number;
  onPatch: (patch: Partial<PhotoCaptionBlock>) => void;
  onMove?: (dir: -1 | 1) => void;
  onRemove?: () => void;
  above?: React.ReactNode;
  below?: React.ReactNode;
}) {
  const pct = Math.round(Number(photo.sizePct) || defaultPct);
  const ref = React.useRef<HTMLElement>(null);
  const [drag, setDrag] = React.useState<number | null>(null);
  const shown = drag ?? pct;
  const setPct = (n: number) => onPatch({ sizePct: Math.max(20, Math.min(100, Math.round(n))) });
  const align = photo.align || 'center';
  const btnCls = 'h-6 min-w-6 px-1 inline-flex items-center justify-center rounded text-[11px] text-slate-700 hover:bg-slate-100';
  return (
    <figure
      ref={ref}
      className="group/ph relative"
      style={{ width: `${shown}%`, marginLeft: align === 'left' ? 0 : 'auto', marginRight: align === 'right' ? 0 : 'auto' }}
    >
      {above}
      <img src={photo.imageUrl} alt="" className="w-full object-contain select-none" draggable={false} style={{ maxHeight: ptPx(photo.sizePct ? 640 : 330) }} />
      {below}
      <div className="absolute right-1 top-1 z-10 flex flex-wrap items-center gap-0.5 rounded-lg border border-slate-200 bg-white/95 px-1 py-0.5 shadow-sm opacity-0 group-hover/ph:opacity-100 transition print:hidden font-sans">
        <button type="button" title="Kisebb" className={btnCls} onClick={() => setPct(pct - 10)}>
          <Minus className="w-3 h-3" />
        </button>
        {[25, 50, 75, 100].map((n) => (
          <button key={n} type="button" title={`${n}% szélesség`} className={`${btnCls} ${pct === n ? 'bg-indigo-100 text-indigo-800' : ''}`} onClick={() => setPct(n)}>
            {n}%
          </button>
        ))}
        <button type="button" title="Nagyobb" className={btnCls} onClick={() => setPct(pct + 10)}>
          <Plus className="w-3 h-3" />
        </button>
        <span className="w-px h-4 bg-slate-200 mx-0.5" />
        {(
          [
            ['left', AlignLeft],
            ['center', AlignCenter],
            ['right', AlignRight],
          ] as const
        ).map(([a, Icon]) => (
          <button key={a} type="button" title={a === 'left' ? 'Balra' : a === 'right' ? 'Jobbra' : 'Középre'} className={`${btnCls} ${align === a ? 'bg-indigo-100 text-indigo-800' : ''}`} onClick={() => onPatch({ align: a })}>
            <Icon className="w-3 h-3" />
          </button>
        ))}
        {onMove && (
          <>
            <span className="w-px h-4 bg-slate-200 mx-0.5" />
            <button type="button" title="Feljebb" className={btnCls} onClick={() => onMove(-1)}>
              <ArrowUp className="w-3 h-3" />
            </button>
            <button type="button" title="Lejjebb" className={btnCls} onClick={() => onMove(1)}>
              <ArrowDown className="w-3 h-3" />
            </button>
          </>
        )}
        {photo.sizePct ? (
          <button type="button" title="Vissza az alapméretre" className={`${btnCls} text-slate-500`} onClick={() => onPatch({ sizePct: undefined })}>
            alap
          </button>
        ) : null}
        {onRemove && (
          <button type="button" title="Fotó törlése az ajánlatból" className={`${btnCls} hover:text-rose-600`} onClick={() => window.confirm('Törlöd ezt a fotót az ajánlatból?') && onRemove()}>
            <Trash2 className="w-3 h-3" />
          </button>
        )}
      </div>
      {/* húzással átméretezés (a lap tartalomszélességéhez képest, 5%-os lépésekben) */}
      <span
        title="Húzd az átméretezéshez"
        className="absolute -right-1.5 -bottom-1.5 w-3.5 h-3.5 rounded-sm border-2 border-indigo-500 bg-white cursor-nwse-resize opacity-0 group-hover/ph:opacity-100 print:hidden"
        onPointerDown={(e) => {
          e.preventDefault();
          const fig = ref.current;
          const host = fig?.parentElement;
          if (!fig || !host) return;
          const startX = e.clientX;
          const startW = fig.getBoundingClientRect().width;
          const full = host.getBoundingClientRect().width || 1;
          let last = pct;
          const move = (ev: PointerEvent) => {
            const dx = (ev.clientX - startX) * (align === 'center' ? 2 : align === 'right' ? -1 : 1);
            last = Math.max(20, Math.min(100, Math.round((((startW + dx) / full) * 100) / 5) * 5));
            setDrag(last);
          };
          const up = () => {
            window.removeEventListener('pointermove', move);
            window.removeEventListener('pointerup', up);
            setDrag(null);
            setPct(last);
          };
          window.addEventListener('pointermove', move);
          window.addEventListener('pointerup', up);
        }}
      />
      {drag !== null && <span className="absolute left-1 top-1 rounded bg-indigo-600 px-1.5 py-0.5 text-[10px] font-semibold text-white">{drag}%</span>}
    </figure>
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
  onAddSizeVariant,
  lockedReason,
  toolbarExtra,
  hideStructureControls,
  categories = [],
  templateTargetOf,
  onSaveToTemplate,
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
  /** méret változat a termék alá (pl. 800x400 a 700x400 mellett) */
  onAddSizeVariant?: (blk: QuoteDocumentBlock) => void;
  /** sablon tervezőben: ha szöveget ad vissza, a blokk csak megjelenik (pl. „Termékek oldalon szerkeszthető”) */
  lockedReason?: (blk: QuoteDocumentBlock) => string | null;
  toolbarExtra?: React.ReactNode;
  hideStructureControls?: boolean;
  categories?: ProductCategory[];
  /** hová menthető vissza a blokk (pl. „Termék sablonba”); null: nem menthető */
  templateTargetOf?: (blk: QuoteDocumentBlock) => string | null;
  onSaveToTemplate?: (blk: QuoteDocumentBlock) => Promise<boolean>;
}) {
  // módosítás figyelése: a blokk első állapota az ajánlat megnyitásakor (vagy az utolsó sablonba mentéskor)
  const snap = React.useRef(new Map<string, string>());
  const [, bump] = React.useState(0);
  for (const b of blocks) if (!snap.current.has(b.id)) snap.current.set(b.id, JSON.stringify(b));
  const changed = (b: QuoteDocumentBlock) => snap.current.get(b.id) !== JSON.stringify(b);
  const [savingId, setSavingId] = React.useState<string | null>(null);
  const saveBtn = (b: QuoteDocumentBlock) => {
    const target = templateTargetOf?.(b);
    if (!target || !onSaveToTemplate || !changed(b)) return null;
    return (
      <button
        type="button"
        disabled={savingId === b.id}
        title="A módosítás mentése a sablonba: a következő ajánlatokban már így szerepel"
        onClick={async () => {
          setSavingId(b.id);
          try {
            if (await onSaveToTemplate(b)) {
              snap.current.set(b.id, JSON.stringify(b));
              bump((n) => n + 1);
            }
          } finally {
            setSavingId(null);
          }
        }}
        className="absolute -right-2 -top-2 z-20 inline-flex items-center gap-1 rounded-full border border-amber-300 bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-900 shadow-sm hover:bg-amber-100 print:hidden font-sans"
      >
        <BookmarkPlus className="w-3.5 h-3.5" /> {savingId === b.id ? 'Mentés…' : `Mentés: ${target}`}
      </button>
    );
  };
  const [zoom, setZoom] = React.useState(1);
  // tartalomjegyzék a lap mellett: kattintásra odaugrik
  const outline = blocks
    .filter((b) => !(b.attachedTo && blocks.some((x) => x.id === b.attachedTo)) && b.type !== 'page_break')
    .map((b) => {
      const plain = (t?: string) => stripRich(t || '').replace(/\s+/g, ' ').trim();
      const label =
        b.type === 'template_section'
          ? plain(b.sectionTitle).replace(/\s*\(\d+\s*[×x]\s*\d+[^)]*\)\s*$/, '')
          : b.textStyle === 'greeting'
            ? 'Megszólítás és bevezető'
            : b.textStyle === 'footer_info'
              ? plain(b.title) || 'Információ'
              : b.textStyle === 'category_intro'
                ? `Leírás: ${plain(b.content).slice(0, 28)}…`
                : b.textStyle === 'options'
                  ? 'Opcionálisan rendelhető'
                  : b.textStyle === 'promo'
                    ? 'Akció'
                    : b.type === 'photo_box'
                      ? 'Fotó'
                      : plain(b.title || b.content).slice(0, 32) || 'Szöveg';
      return { id: b.id, label, product: b.type === 'template_section' };
    });
  const changedCount = templateTargetOf ? blocks.filter((b) => templateTargetOf(b) && changed(b)).length : 0;
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

  const renderSection = (blk: QuoteDocumentBlock, attached = false): React.ReactNode => {
    const { D, body, headC } = styles(blk);
    if (!attached) productNo++;
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
    const stacked = (list: PhotoCaptionBlock[]) => (
          <div className="space-y-3 py-2">
            {list.map((p) => {
              const all = blk.sectionPhotos || [];
              const i = all.indexOf(p);
              const patch = (pt: Partial<PhotoCaptionBlock>) =>
                updateBlock(blk.id, (b) => {
                  const arr = [...(b.sectionPhotos || [])];
                  arr[i] = { ...arr[i], ...pt };
                  return { ...b, sectionPhotos: arr };
                });
              return (
                <PhotoFrame
                  key={p.id || i}
                  photo={p}
                  defaultPct={photoWidthPct({ widthPct: p.widthPct })}
                  onPatch={patch}
                  onMove={(dir) =>
                    updateBlock(blk.id, (b) => {
                      const arr = [...(b.sectionPhotos || [])];
                      const j = i + dir;
                      if (j < 0 || j >= arr.length) return b;
                      [arr[i], arr[j]] = [arr[j], arr[i]];
                      return { ...b, sectionPhotos: arr };
                    })
                  }
                  onRemove={() => updateBlock(blk.id, (b) => ({ ...b, sectionPhotos: (b.sectionPhotos || []).filter((_, k2) => k2 !== i) }))}
                  above={p.titleAbove ? photoCaption(blk, i, p, 'titleAbove') : undefined}
                  below={photoCaption(blk, i, p, 'captionBelow')}
                />
              );
            })}
          </div>
        
    );
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
            <Inline value={r.note || (gift ? 'Ajándék' : r.itemRole === 'optional' ? (Number(r.listPriceEur) > Number(r.discountPriceEur) ? 'Opció-kedvezmény-' : 'Opció') : attached && !blk.sizeOverride && Number(r.listPriceEur) > Number(r.discountPriceEur) ? 'Opció' : '')} single onChange={(v) => setRow(i, { note: v })} className="font-bold" />
          </td>
        </tr>
      );
    };
    const hidden = rows.filter((r) => r.included === false && !r.systemRole);
    return (
      <div className="space-y-1">
        {attached && (
          <div style={{ paddingLeft: ptPx(30) }}>
            <Inline
              value={blk.attachTitle || ''}
              single
              placeholder="Cím (pl. Opció üvegfal rendszerek:)"
              onChange={(v) => updateBlock(blk.id, (b) => ({ ...b, attachTitle: v }))}
              className="font-bold"
              style={{ ...headC, fontSize: ptPx(D.bodySize) }}
            />
          </div>
        )}
        {!attached && (<>
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

        </>)}
        {!attached && photos.length > 0 && D.photoLayout === 'stacked' && stacked(photos.slice(0, D.photosBeforeTable))}
        {!attached && photos.length > 0 && D.photoLayout !== 'stacked' && (
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
              {/* Összesen sor: kiemelve; a felirat és az összeg is átírható (az összeg kézi felülírása visszaállítható) */}
              <tr className="font-bold" style={{ background: D.tableHead, fontSize: ptPx(D.tableSize + 1), borderTop: `2px solid ${D.tableBorder}`, borderBottom: `2px solid ${D.tableBorder}` }}>
                <td className="border border-[var(--tb)]" style={{ borderTopWidth: 2, borderBottomWidth: 2 }} />
                <td className="border border-[var(--tb)] px-1 py-0" style={{ borderTopWidth: 2, borderBottomWidth: 2 }}>
                  <Inline value={blk.sumLabel ?? 'Összesen:'} single onChange={(v) => updateBlock(blk.id, (b) => ({ ...b, sumLabel: v }))} className="font-bold" />
                </td>
                <td className="border border-[var(--tb)] px-1 py-0 text-right tabular-nums" style={{ borderTopWidth: 2, borderBottomWidth: 2 }}>
                  <NumCell
                    bold
                    value={totals.totalEur}
                    onChange={(n) =>
                      updateBlock(blk.id, (b) => {
                        const auto = Math.round(computeBlockTotals({ ...b, manualTotalEur: null, manualTotalHuf: null }, rate).totalEur);
                        return recalculateBlockTotals({ ...b, manualTotalEur: n === auto ? null : n, manualTotalHuf: null }, rate);
                      })
                    }
                  />
                </td>
                <td className="border border-[var(--tb)] px-1 py-0 text-[10px] font-normal text-slate-500 print:hidden" style={{ borderTopWidth: 2, borderBottomWidth: 2 }}>
                  {blk.manualTotalEur !== null && blk.manualTotalEur !== undefined && (
                    <button
                      type="button"
                      title={`Számolt összeg: ${Math.round(computeBlockTotals({ ...blk, manualTotalEur: null, manualTotalHuf: null }, rate).totalEur)} EUR`}
                      onClick={() => updateBlock(blk.id, (b) => recalculateBlockTotals({ ...b, manualTotalEur: null, manualTotalHuf: null }, rate))}
                      className="underline hover:text-indigo-700"
                    >
                      kézi összeg · vissza
                    </button>
                  )}
                </td>
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

        {visible.length > 0 && plus && (
          <div style={{ paddingLeft: ptPx(18) }} className="pt-1">
            <div style={{ fontSize: ptPx(D.bodySize) }}>
              -&nbsp;&nbsp; {label} <b>+ {formatDotNumber(Math.round(totals.totalEur))} EUR (+Áfa)</b>
            </div>
            <div style={{ fontSize: ptPx(D.bodySize - 2), paddingLeft: ptPx(18) }}>
              {hufLine} <b>{formatDotNumber(Math.round(totals.totalHuf))} Ft (+Áfa)</b>
            </div>
          </div>
        )}
        {visible.length > 0 && !plus && (
          <div className="text-right space-y-0.5 pt-1">
            <div style={{ fontSize: ptPx(D.bodySize) }}>
              {label} <b>{formatDotNumber(Math.round(totals.totalEur))} EUR (+ Áfa)</b>
            </div>
            <div style={{ fontSize: ptPx(D.bodySize - 2) }}>
              {hufLine} <b>{formatDotNumber(Math.round(totals.totalHuf))} Ft (+Áfa)</b>
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
        {!attached &&
          (() => {
            const paras = (blk.sectionClosingText || '').split(/\n\s*\n/).filter((x) => x.trim());
            const isPromo = (t: string) => /^ha\s/i.test(stripRich(t).trim());
            const promo = paras.filter(isPromo).join('\n\n');
            const rest = paras.filter((t) => !isPromo(t)).join('\n\n');
            const save = (p: string, r: string) => updateBlock(blk.id, (b) => ({ ...b, sectionClosingText: [p, r].filter((x) => x.trim()).join('\n\n') }));
            const ro = !!lockedReason?.(blk);
            const atts = blocks.filter((b) => b.attachedTo === blk.id && b.type === 'template_section' && !b.sizeOverride);
            const variants = blocks.filter((b) => b.attachedTo === blk.id && b.type === 'template_section' && b.sizeOverride);
            const attEl = (a: QuoteDocumentBlock) => (
              <div key={a.id} className={`group/att relative pt-3 ${templateTargetOf?.(a) && changed(a) ? 'outline outline-1 outline-amber-300 outline-offset-4 rounded-sm' : ''}`}>
                {saveBtn(a)}
                <button
                  type="button"
                  title={a.sizeOverride ? 'Méret változat törlése' : 'Kiegészítő táblázat törlése ennél a terméknél'}
                  onClick={() => window.confirm(a.sizeOverride ? 'Törlöd ezt a méret változatot?' : 'Törlöd ezt a kiegészítő táblázatot ennél a terméknél?') && removeBlock(a.id)}
                  className="absolute -left-[30px] top-3 p-1 rounded-md bg-white border border-slate-200 text-slate-400 hover:text-rose-600 opacity-0 group-hover/att:opacity-100 print:hidden"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
                {renderSection(a, true)}
              </div>
            );
            return (
              <>
                {variants.map(attEl)}
                <RichInline readOnly={ro} value={promo} onChange={(v) => save(v, rest)} className="font-bold" style={{ ...body, ...headC, marginTop: ptPx(D.bodySize), paddingLeft: ptPx(30) }} placeholder="Akció (pl. Ha …-ig megrendeli…)" />
                {atts.map(attEl)}
                {D.photoLayout === 'stacked' && photos.length > D.photosBeforeTable && (
                  <>
                    {stacked(photos.slice(D.photosBeforeTable).filter((x) => x.sizePct))}
                    {/* a többi fotó rácsban, egyforma magassággal (mint a PDF-ben) */}
                    <div className="grid grid-cols-2 gap-3 items-end">
                      {photos
                        .slice(D.photosBeforeTable)
                        .filter((x) => !x.sizePct)
                        .map((x) => (
                          <div key={x.id || x.imageUrl}>{stacked([x])}</div>
                        ))}
                    </div>
                  </>
                )}
                <RichInline readOnly={ro} value={rest} onChange={(v) => save(promo, v)} style={{ ...body, marginTop: ptPx(D.bodySize) }} placeholder="Záró szöveg (színek, opcionálisan rendelhető…)" />
              </>
            );
          })()}
      </div>
    );
  };

  return (
    <div className="bg-slate-200/70 rounded-2xl p-3 sm:p-6 overflow-x-auto space-y-3 relative">
      {/* tartalomjegyzék: széles képernyőn a lap bal oldalán */}
      <nav className="hidden 2xl:block absolute left-4 top-24 w-48 space-y-0.5 print:hidden" style={{ position: 'absolute' }}>
        <div className="sticky top-4 rounded-xl bg-white/90 border border-slate-200 p-2 shadow-sm">
          <div className="px-2 pb-1 text-[10px] font-semibold uppercase tracking-wide text-slate-400">Tartalom</div>
          {outline.map((o) => (
            <button
              key={o.id}
              type="button"
              onClick={() => document.getElementById(`doc-blk-${o.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
              className={`block w-full truncate rounded-md px-2 py-1 text-left text-[12px] hover:bg-slate-100 ${o.product ? 'font-semibold text-slate-900' : 'text-slate-600'}`}
              title={o.label}
            >
              {o.label}
              {templateTargetOf && changed(blocks.find((b) => b.id === o.id)!) && templateTargetOf(blocks.find((b) => b.id === o.id)!) ? <span className="ml-1 text-amber-600">●</span> : null}
            </button>
          ))}
        </div>
      </nav>
      <div className="mx-auto" style={{ width: ptPx(595.28) }}>
        <FormatToolbar
          accent={D.accent}
          align={focused?.type === 'text_box' ? focused.align || 'left' : null}
          onAlign={
            focused?.type === 'text_box' && !lockedReason?.(focused)
              ? (a) => updateBlock(focused.id, (b) => ({ ...b, align: a }))
              : undefined
          }
          extra={
            <>
              {toolbarExtra}
              <select
                value={String(zoom)}
                onChange={(e) => setZoom(Number(e.target.value))}
                title="Nagyítás"
                className="h-8 rounded-md border border-slate-200 bg-white px-1.5 text-[13px]"
              >
                {[0.75, 0.9, 1, 1.1, 1.25].map((z) => (
                  <option key={z} value={z}>
                    {Math.round(z * 100)}%
                  </option>
                ))}
              </select>
              {changedCount > 0 && (
                <span className="ml-1 inline-flex items-center gap-1 rounded-full bg-amber-50 border border-amber-200 px-2 py-0.5 text-[11px] font-semibold text-amber-900" title="A sárga keretes részeknél a „Mentés: … sablonba” gombbal a módosítás a sablonba menthető">
                  <BookmarkPlus className="w-3.5 h-3.5" /> {changedCount} módosított rész menthető a sablonba
                </span>
              )}
            </>
          }
        />
      </div>
      <div className="mx-auto bg-white shadow-xl shrink-0" style={{ width: ptPx(595.28), fontFamily: pageFont, color: D.text, zoom }}>
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
          {blocks.map((blk, idx) => blk.attachedTo && blocks.some((b) => b.id === blk.attachedTo) ? null : (
            <React.Fragment key={blk.id}>
              <div id={`doc-blk-${blk.id}`} className={`group relative py-1.5 scroll-mt-24 ${lockedReason?.(blk) ? 'opacity-90' : ''} ${templateTargetOf?.(blk) && changed(blk) ? 'outline outline-1 outline-amber-300 outline-offset-4 rounded-sm' : ''}`} onFocus={() => setFocusId(blk.id)}>
                {saveBtn(blk)}
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
                  {onAddSizeVariant && blk.type === 'template_section' && !blk.attachedTo && (
                    <button type="button" title="Méret változat (pl. 800x400 a 700x400 mellett, saját táblázattal)" onClick={() => onAddSizeVariant(blk)} className="p-1 rounded-md bg-white border border-slate-200 text-slate-500 hover:text-indigo-700 text-[10px] font-bold leading-none">
                      +M
                    </button>
                  )}
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
                {blk.type === 'photo_box' && blk.photo && blk.photo.imageUrl && (
                  <PhotoFrame
                    photo={blk.photo}
                    defaultPct={Number(blk.photo.widthPct) || 75}
                    onPatch={(pt) => updateBlock(blk.id, (b) => ({ ...b, photo: { ...b.photo!, ...pt } }))}
                    below={
                      <Inline
                        value={blk.photo.captionBelow || ''}
                        single
                        placeholder="Képaláírás"
                        onChange={(v) => updateBlock(blk.id, (b) => ({ ...b, photo: { ...b.photo!, captionBelow: v } }))}
                        className="text-[11px] text-slate-500 text-center"
                      />
                    }
                  />
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
