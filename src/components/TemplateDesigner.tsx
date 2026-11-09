'use client';

import React from 'react';
import { Palette, RotateCcw } from 'lucide-react';
import { DEFAULT_DOC_DESIGN, getDocDesign, type DocDesign } from '@/lib/doc-design';
import { SAMPLE_VARIABLE_CONTEXT, TEMPLATE_VARIABLES_HELP, toTemplateText } from '@/lib/constants';
import { buildFullQuoteDocumentBlocks } from '@/lib/pricing-engine';
import type { ProductCategory, QuoteDocumentBlock, QuoteTemplate, SystemConfig } from '@/lib/types';
import { DocumentEditor } from '@/components/DocumentEditor';
import { insertAtCursor } from '@/components/RichEdit';

const COLOR_FIELDS: [keyof DocDesign, string][] = [
  ['accent', 'Lábléc sáv'],
  ['accentText', 'Lábléc szöveg'],
  ['heading', 'Címek'],
  ['text', 'Szöveg'],
  ['muted', 'Alcím, képaláírás'],
  ['tableHead', 'Táblázat fejléc'],
  ['tableBorder', 'Táblázat vonal'],
];
const NUM_FIELDS: [keyof DocDesign, string, number, number, number][] = [
  ['bodySize', 'Szöveg mérete (pt)', 7, 16, 0.5],
  ['headingSize', 'Termék cím (pt)', 9, 24, 0.5],
  ['greetingSize', 'Megszólítás (pt)', 9, 24, 0.5],
  ['lineHeight', 'Sorköz', 1.1, 2.2, 0.05],
  ['logoHeight', 'Logó magassága (pt)', 16, 90, 1],
  ['photosBeforeTable', 'Fotók a táblázat előtt (db)', 0, 50, 1],
  ['tableSize', 'Táblázat betű (pt)', 7, 14, 0.5],
];

/**
 * Dizájn mezők. Általános sablonnál minden mező kitöltött; kategóriánál (inherit) csak az eltérések,
 * az üres mező az általános dizájnt örökli (halványan látszik).
 */
export function DesignFields({
  value,
  onChange,
  base,
  inherit,
}: {
  value: Partial<DocDesign> | undefined;
  onChange: (v: Partial<DocDesign>) => void;
  base: DocDesign;
  inherit?: boolean;
}) {
  const v = value || {};
  const eff = { ...base, ...Object.fromEntries(Object.entries(v).filter(([, x]) => x !== '' && x !== undefined && x !== null)) } as DocDesign;
  const set = (k: keyof DocDesign, x: unknown) => {
    const next: Record<string, unknown> = { ...v, [k]: x };
    if (x === undefined) delete next[k];
    onChange(next as Partial<DocDesign>);
  };
  const isSet = (k: keyof DocDesign) => v[k] !== undefined && v[k] !== '';
  const reset = (k: keyof DocDesign) =>
    isSet(k) && (
      <button type="button" title={inherit ? 'Vissza az általánosra' : 'Alapérték'} onClick={() => set(k, undefined)} className="text-slate-400 hover:text-slate-800">
        <RotateCcw className="w-3.5 h-3.5" />
      </button>
    );
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3">
        {COLOR_FIELDS.map(([k, l]) => (
          <label key={k} className={`block text-[12px] ${inherit && !isSet(k) ? 'opacity-60' : ''}`}>
            <span className="flex items-center gap-1 text-slate-600 mb-1">
              {l} {reset(k)}
            </span>
            <span className="flex items-center gap-2 rounded-lg border border-slate-300 px-2 py-1.5">
              <input type="color" value={String(eff[k])} onChange={(e) => set(k, e.target.value)} className="w-7 h-7 rounded border-0 bg-transparent p-0 cursor-pointer" />
              <span className="font-mono text-[11px] text-slate-500">{String(eff[k])}</span>
            </span>
          </label>
        ))}
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {NUM_FIELDS.map(([k, l, min, max, step]) => (
          <label key={k} className={`block text-[12px] ${inherit && !isSet(k) ? 'opacity-60' : ''}`}>
            <span className="flex items-center gap-1 text-slate-600 mb-1">
              {l} {reset(k)}
            </span>
            <input
              type="number"
              min={min}
              max={max}
              step={step}
              value={Number(eff[k])}
              onChange={(e) => set(k, e.target.value === '' ? undefined : Number(e.target.value))}
              className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 text-sm tabular-nums"
            />
          </label>
        ))}
        {(
          [
            ['productNewPage', 'Termék új oldalon'],
            ['infoNewPage', 'Információ új oldalon'],
          ] as const
        ).map(([k, l]) => (
          <label key={k} className={`block text-[12px] ${inherit && !isSet(k) ? 'opacity-60' : ''}`}>
            <span className="flex items-center gap-1 text-slate-600 mb-1">
              {l} {reset(k)}
            </span>
            <select value={eff[k] ? '1' : '0'} onChange={(e) => set(k, e.target.value === '1')} className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 text-sm">
              <option value="1">Igen</option>
              <option value="0">Nem</option>
            </select>
          </label>
        ))}
        <label className={`block text-[12px] ${inherit && !isSet('showPageNumbers') ? 'opacity-60' : ''}`}>
          <span className="flex items-center gap-1 text-slate-600 mb-1">Oldalszám {reset('showPageNumbers')}</span>
          <select
            value={eff.showPageNumbers ? '1' : '0'}
            onChange={(e) => set('showPageNumbers', e.target.value === '1')}
            className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 text-sm"
          >
            <option value="1">Látszik</option>
            <option value="0">Nem látszik</option>
          </select>
        </label>
      </div>
      <label className={`block text-[12px] ${inherit && !isSet('footerText') ? 'opacity-60' : ''}`}>
        <span className="flex items-center gap-1 text-slate-600 mb-1">Lábléc szöveg (üresen a weboldal) {reset('footerText')}</span>
        <input
          value={String(v.footerText ?? '')}
          placeholder={inherit ? base.footerText || 'weboldal' : 'www.openskypergola.hu'}
          onChange={(e) => set('footerText', e.target.value || undefined)}
          className="w-full px-3 py-1.5 rounded-lg border border-slate-300 text-sm"
        />
      </label>
    </div>
  );
}

/**
 * A mintában üres változók ({{opciok}}, ha a minta terméknek nincs opciója) nem látszanak a szövegben, így a
 * visszacserélés elveszítené őket: a régi sablon szerinti helyükre (a következő megmaradt változó elé) visszakerülnek.
 */
function keepEmptyTokens(oldTpl: string, next: string, ctx: { optionsSentence?: string; giftsSentence?: string; products?: string }) {
  const empty = [
    ['{{opciok}}', ctx.optionsSentence],
    ['{{ajandekok}}', ctx.giftsSentence],
  ].filter(([, v]) => !v).map(([t]) => t as string);
  let out = next;
  for (const tok of empty) {
    if (!oldTpl.includes(tok) || out.includes(tok)) continue;
    const after = oldTpl.slice(oldTpl.indexOf(tok) + tok.length).match(/\{\{\s*\w+\s*\}\}/)?.[0];
    out = after && out.includes(after) ? out.replace(after, `${tok} ${after}`) : `${out.trimEnd()} ${tok}`;
  }
  return out;
}

/**
 * Sablon tervező: egy minta ajánlat A4-es lapon, a Word-szerű szerkesztőben. Amit itt átírsz (megszólítás,
 * bevezető, Információ), az az általános sablonba kerül, {{változókkal}} (a minta ügyfél adatai visszacserélődnek).
 * A kategória szövegek és a termékek a Termékek oldalon szerkeszthetők, itt csak látszanak.
 */
export function TemplateDesigner({
  form,
  setForm,
  categories,
  templates,
}: {
  form: SystemConfig;
  setForm: React.Dispatch<React.SetStateAction<SystemConfig>>;
  categories: ProductCategory[];
  templates: QuoteTemplate[];
}) {
  const live = templates.filter((t) => t.enabled !== false && t.status !== 'inactive');
  // minden kategória választható, az új (még termék nélküli) is: ott egy minta termékkel látszik a kategória sablonja
  const usedCats = [...categories].sort((a, b) => Number(live.some((t) => t.categoryId === b.id)) - Number(live.some((t) => t.categoryId === a.id)));
  const [catId, setCatId] = React.useState(usedCats.find((c) => c.categoryType !== 'accessory')?.id || usedCats[0]?.id || '');
  const sampleCtx = { ...SAMPLE_VARIABLE_CONTEXT, greetingName: 'János' };

  const build = React.useCallback(() => {
    const own = live.filter((t) => t.categoryId === catId);
    const cat = categories.find((c) => c.id === catId);
    const fallback = live.find((t) => categories.find((c) => c.id === t.categoryId)?.categoryType === cat?.categoryType) || live[0];
    const tpls = (own.length ? own.slice(0, 1) : fallback ? [{ ...fallback, id: `sample_${catId}`, categoryId: catId, name: `${cat?.name || 'Minta'} (minta termék)` }] : []).map((t) => ({ ...t, infoText: '' }));
    const res = buildFullQuoteDocumentBlocks({
      ...sampleCtx,
      eurHufRate: Number(form.defaultEurHufRate) || 400,
      deliveryFeeHuf: Number(form.defaultDeliveryFeeHuf) || 40000,
      mountType: 'Épülethez rögzített',
      selectedTemplates: tpls,
      config: form,
      categories,
    });
    return res;
    // a minta csak kategória váltáskor épül újra (különben írás közben elveszne a kurzor)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [catId, templates, categories]);
  const [sample, setSample] = React.useState(build);
  React.useEffect(() => setSample(build()), [build]);
  const blocks = sample.blocks;
  const ctx = { ...sampleCtx, ...sample.introVars };

  const updateBlock = (id: string, fn: (b: QuoteDocumentBlock) => QuoteDocumentBlock) => {
    const old = blocks.find((b) => b.id === id);
    if (!old) return;
    const nb = fn(old);
    setSample((s) => ({ ...s, blocks: s.blocks.map((b) => (b.id === id ? nb : b)) }));
    if (nb.textStyle === 'greeting')
      setForm((f) => ({
        ...f,
        defaultGreetingTemplate: toTemplateText(nb.title || '', ctx),
        defaultIntroTemplate: keepEmptyTokens(f.defaultIntroTemplate || '', toTemplateText(nb.content || '', ctx), ctx),
      }));
    else if (nb.textStyle === 'footer_info')
      setForm((f) => ({ ...f, docInfoTitle: nb.title || '', defaultClosingInfoTemplate: toTemplateText(nb.content || '', ctx) }));
  };
  const lockedReason = (b: QuoteDocumentBlock) =>
    b.type === 'template_section' ? 'Termék sablon: Termékek oldalon' : b.docCategoryId ? 'Kategória szöveg: Termékek oldalon' : null;

  const designConfig = form; // élő előnézet: a dizájn mezők azonnal látszanak

  return (
    <div className="space-y-5">
      <div className="bg-white rounded-2xl border border-slate-200 p-6 space-y-4">
        <div className="flex items-start gap-3">
          <Palette className="w-5 h-5 mt-0.5 text-indigo-600" />
          <div className="flex-1">
            <h2 className="text-base font-semibold text-slate-950">Általános dizájn sablon</h2>
            <p className="text-[13px] text-slate-600 mt-0.5">
              Minden ajánlatra érvényes: színek, betűméretek, logó, lábléc. A kategóriák ettől eltérhetnek (Termékek oldal, kategória →
              „Dizájn”), ott csak az eltérést kell beállítani.
            </p>
          </div>
          <button type="button" className="text-[12px] text-slate-500 hover:text-slate-900 inline-flex items-center gap-1" onClick={() => setForm((f) => ({ ...f, docDesign: {} }))}>
            <RotateCcw className="w-3.5 h-3.5" /> Alapértékek
          </button>
        </div>
        <DesignFields value={form.docDesign} base={DEFAULT_DOC_DESIGN} onChange={(d) => setForm((f) => ({ ...f, docDesign: d }))} />
      </div>

      <div className="space-y-3">
        <div className="flex flex-wrap items-center gap-3">
          <h2 className="text-base font-semibold text-slate-950">Sablon tervező (mint a Word)</h2>
          <label className="text-[13px] text-slate-600 flex items-center gap-2">
            Minta kategória:
            <select value={catId} onChange={(e) => setCatId(e.target.value)} className="px-2.5 py-1.5 rounded-lg border border-slate-300 text-sm">
              {usedCats.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                  {c.docDesign && Object.keys(c.docDesign).length ? ' (saját dizájn)' : ''}
                  {live.some((t) => t.categoryId === c.id) ? '' : ' (még nincs terméke)'}
                </option>
              ))}
            </select>
          </label>
          <span className="text-[12px] text-slate-500">
            A megszólítás, a bevezető és az Információ itt írható át (formázással is). A minta ügyfél adatai mentéskor {'{{változóra}}'} cserélődnek. Ne
            felejtsd el a Mentést.
          </span>
        </div>
        <DocumentEditor
          blocks={blocks}
          config={designConfig}
          categories={categories}
          eurHufRate={Number(form.defaultEurHufRate) || 400}
          quoteNumber="OSP-MINTA"
          updateBlock={updateBlock}
          moveBlock={() => {}}
          removeBlock={() => {}}
          onAddText={() => {}}
          onAddPhoto={() => {}}
          onAddPageBreak={() => {}}
          hideStructureControls
          lockedReason={lockedReason}
          toolbarExtra={
            <select
              defaultValue=""
              title="Változó beszúrása a kurzor helyére"
              onChange={(e) => {
                const tok = e.target.value;
                e.target.value = '';
                if (tok) insertAtCursor(tok);
              }}
              className="h-8 rounded-md border border-slate-200 bg-white px-1.5 text-[13px]"
            >
              <option value="">{'{{ }}'} Változó…</option>
              {TEMPLATE_VARIABLES_HELP.map((v) => (
                <option key={v.token} value={v.token}>
                  {v.name} {v.token}
                </option>
              ))}
            </select>
          }
        />
      </div>
    </div>
  );
}

/** A kategória dizájnja (eltérés az általánostól) a Termékek oldalon */
export function CategoryDesignEditor({ category, config, onChange }: { category: ProductCategory; config?: SystemConfig; onChange: (d: Partial<DocDesign>) => void }) {
  const base = getDocDesign(config);
  const n = Object.keys(category.docDesign || {}).length;
  return (
    <div className="space-y-2">
      <div className="text-[12px] text-slate-600">
        {n ? `${n} eltérés az általános dizájntól.` : 'Az általános dizájnt használja.'} Csak azt állítsd át, ami ennél a kategóriánál más legyen (pl. másik
        táblázat fejléc szín). A kategória termékeinél érvényes; ha ez az ajánlat fő kategóriája, a lábléc és a logó is.
      </div>
      <DesignFields inherit value={category.docDesign} base={base} onChange={onChange} />
      {n > 0 && (
        <button type="button" onClick={() => onChange({})} className="text-[12px] text-slate-500 hover:text-slate-900 inline-flex items-center gap-1">
          <RotateCcw className="w-3.5 h-3.5" /> Minden eltérés törlése
        </button>
      )}
    </div>
  );
}
