'use client';

import React, { useRef, useState } from 'react';
import { ArrowDown, ArrowUp, Copy, ImagePlus, Plus, Save, Trash2, Upload } from 'lucide-react';
import { TemplateDesigner } from '@/components/TemplateDesigner';
import { btn, insertAtCursor, labelCls, PageHeader, TemplatePreview, VariableChips } from '@/components/ui';
import {
  DEFAULT_EMAIL_TEMPLATES,
  EMAIL_VARIABLES_HELP,
  formatQuoteNumber,
  STATUS_CONFIG,
  PROFIT_MODE_OPTIONS,
  QUOTE_NUMBER_FORMAT_OPTIONS,
  replaceTemplateVariables,
  SAMPLE_VARIABLE_CONTEXT,
  TEMPLATE_VARIABLES_HELP,
} from '@/lib/constants';
import {
  EmailSettings,
  EmailTemplate,
  ExtraPreset,
  PricingFormulaConfig,
  ProfitMode,
  QuoteNumberFormat,
  QuoteStatus,
  SystemConfig,
  ExtraGroupConfig,
} from '@/lib/types';



interface BrandingSettingsViewProps {
  config: SystemConfig;
  onSaveConfig: (nextConfig: SystemConfig) => Promise<void>;
  onUploadImage: (file: File) => Promise<string | null>;
  categories?: import('@/lib/types').ProductCategory[];
  templates?: import('@/lib/types').QuoteTemplate[];
}

type SettingsTab = 'pricing' | 'extras' | 'offer' | 'design' | 'email' | 'company';
const SETTINGS_TABS: [SettingsTab, string, string][] = [
  ['pricing', 'Árképzés', 'Haszon és szerelés képlete'],
  ['extras', 'Extrák', 'Gyűjtemények, gyors extrák'],
  ['offer', 'Ajánlat', 'Sorszám, PDF szövegek'],
  ['design', 'Dizájn és sablon', 'Színek, Word-szerű sablon'],
  ['email', 'E-mail', 'Küldés, sablonok, követés'],
  ['company', 'Cég és arculat', 'Cégadatok, logó, háttér'],
];

export function BrandingSettingsView({
  config,
  onSaveConfig,
  onUploadImage,
  categories = [],
  templates = [],
}: BrandingSettingsViewProps) {
  const [form, setForm] = useState<SystemConfig>({ ...config });
  const [tab, setTab] = useState<SettingsTab>('pricing');
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);

  const updatePreset = (idx: number, patch: Partial<ExtraPreset>) =>
    setForm((prev) => ({
      ...prev,
      extraPresets: prev.extraPresets.map((p, i) => (i === idx ? { ...p, ...patch } : p)),
    }));

  // Változó beszúrása a legutóbb kijelölt szövegmezőbe, a kurzor helyére
  type FieldKey = 'greeting' | 'intro' | 'closing' | 'subject' | 'body';
  const focusRef = useRef<{ key: FieldKey; el: HTMLInputElement | HTMLTextAreaElement } | null>(null);
  const track = (key: FieldKey) => ({
    onFocus: (e: React.FocusEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      focusRef.current = { key, el: e.currentTarget };
    },
  });
  const fieldValue = (key: FieldKey): string =>
    key === 'greeting'
      ? form.defaultGreetingTemplate
      : key === 'intro'
      ? form.defaultIntroTemplate
      : key === 'closing'
      ? form.defaultClosingInfoTemplate
      : key === 'subject'
      ? activeTemplate?.subject || ''
      : activeTemplate?.body || '';
  const setFieldValue = (key: FieldKey, value: string) => {
    if (key === 'greeting') setForm((f) => ({ ...f, defaultGreetingTemplate: value }));
    else if (key === 'intro') setForm((f) => ({ ...f, defaultIntroTemplate: value }));
    else if (key === 'closing') setForm((f) => ({ ...f, defaultClosingInfoTemplate: value }));
    else if (key === 'subject') updateTemplate({ subject: value });
    else updateTemplate({ body: value });
  };
  const insertVar = (token: string, allowed: FieldKey[], fallback: FieldKey) => {
    const target = focusRef.current && allowed.includes(focusRef.current.key) ? focusRef.current : null;
    const key = target?.key || fallback;
    const el = target?.el || null;
    const { value, caret } = insertAtCursor(el, fieldValue(key), token);
    setFieldValue(key, value);
    if (el) {
      requestAnimationFrame(() => {
        el.focus();
        el.setSelectionRange(caret, caret);
      });
    }
  };

  // E-mail sablonok szerkesztése
  const [activeTemplateId, setActiveTemplateId] = useState<string>(
    config.emailSettings.defaultTemplateId
  );
  const activeTemplate =
    form.emailSettings.templates.find((t) => t.id === activeTemplateId) ||
    form.emailSettings.templates[0];
  const setTemplates = (templates: EmailTemplate[]) => setEmail({ templates });
  const updateTemplate = (patch: Partial<EmailTemplate>) =>
    activeTemplate &&
    setTemplates(
      form.emailSettings.templates.map((t) =>
        t.id === activeTemplate.id ? { ...t, ...patch } : t
      )
    );
  const addTemplate = () => {
    const id = `tpl_${Date.now()}`;
    setTemplates([
      ...form.emailSettings.templates,
      {
        id,
        name: 'Új sablon',
        subject: 'Árajánlat - {{sorszam}}',
        body: 'Kedves {{megszolitas}}!\n\n\n\nÜdvözlettel:\n{{ceg}}',
        suggestFor: [],
      },
    ]);
    setActiveTemplateId(id);
  };
  const duplicateTemplate = () => {
    if (!activeTemplate) return;
    const id = `tpl_${Date.now()}`;
    setTemplates([
      ...form.emailSettings.templates,
      { ...activeTemplate, id, name: `${activeTemplate.name} (másolat)`, suggestFor: [] },
    ]);
    setActiveTemplateId(id);
  };
  const deleteTemplate = () => {
    if (!activeTemplate || form.emailSettings.templates.length <= 1) return;
    if (!window.confirm(`Törlöd a(z) „${activeTemplate.name}” sablont?`)) return;
    const rest = form.emailSettings.templates.filter((t) => t.id !== activeTemplate.id);
    setEmail({
      templates: rest,
      defaultTemplateId:
        form.emailSettings.defaultTemplateId === activeTemplate.id
          ? rest[0].id
          : form.emailSettings.defaultTemplateId,
    });
    setActiveTemplateId(rest[0].id);
  };
  const restoreSampleTemplates = () => {
    // A minta sablonok visszakerülnek, a saját sablonok megmaradnak
    const own = form.emailSettings.templates.filter(
      (t) => !DEFAULT_EMAIL_TEMPLATES.some((d) => d.id === t.id)
    );
    setTemplates([...DEFAULT_EMAIL_TEMPLATES.map((t) => ({ ...t })), ...own]);
  };

  const setEmail = (patch: Partial<EmailSettings>) =>
    setForm((prev) => ({
      ...prev,
      emailSettings: { ...prev.emailSettings, ...patch },
    }));

  const setFormula = (patch: Partial<PricingFormulaConfig>) =>
    setForm((prev) => ({
      ...prev,
      pricingFormula: { ...prev.pricingFormula, ...patch },
    }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await onSaveConfig(form);
    } finally {
      setSaving(false);
    }
  };

  // PDF alapszövegek (az Ajánlat fülön, a sorszám alatt)
  // PDF alapszövegek (az Ajánlat fülön, a sorszám alatt)
  const fillSample = (token: string) => replaceTemplateVariables(token, SAMPLE_VARIABLE_CONTEXT);
  // E-mailben ezek is kitöltődnek (mintaértékkel)
  const fillEmailSample = (token: string) => {
    const key = token.replace(/[{}\s]/g, '').toLowerCase();
    const extra: Record<string, string> = {
      sorszam: formatQuoteNumber(form, 1),
      osszeg_eur: '12.400',
      osszeg_huf: '4.960.000',
      ceg: form.companyName,
      telefon: form.companyPhone,
      weboldal: form.companyWebsite,
      email: form.companyEmail,
    };
    return extra[key] ?? fillSample(token);
  };
  const offerTextsCard = (
    <div className="bg-white rounded-2xl border border-slate-200 p-6 space-y-5">
      <div>
        <div className="text-base font-semibold text-slate-950">PDF szövegek</div>
        <p className="text-[13px] text-slate-600 mt-0.5">
          Ezek az alapszövegek kerülnek minden új ajánlatba; ajánlatonként a szerkesztőben még átírhatók.
        </p>
      </div>

      <div className="rounded-xl bg-slate-50 border border-slate-200 p-4 space-y-2">
        <div className="text-sm font-semibold text-slate-950">Hogyan készül a szöveg?</div>
        <ol className="space-y-1.5 text-[13px] text-slate-700">
          <li className="flex gap-2">
            <span className="w-5 h-5 rounded-full bg-slate-900 text-white grid place-items-center text-xs shrink-0">1</span>
            Írd meg a szöveget úgy, ahogy egy ügyfélnek írnád.
          </li>
          <li className="flex gap-2">
            <span className="w-5 h-5 rounded-full bg-slate-900 text-white grid place-items-center text-xs shrink-0">2</span>
            Ahol ügyfelenként más adat kell (név, méret, település), kattints oda, és válaszd ki az adatot a
            listából. Egy jelölő kerül be, pl. <code className="px-1 rounded bg-white border border-slate-200">{'{{megszolitas}}'}</code>.
          </li>
          <li className="flex gap-2">
            <span className="w-5 h-5 rounded-full bg-slate-900 text-white grid place-items-center text-xs shrink-0">3</span>
            Az ajánlatban a jelölő helyére a valódi adat kerül. A mezők alatt látod, hogyan fog kinézni.
          </li>
        </ol>
        <div className="text-[13px] text-slate-600">
          Példa: <code className="px-1 rounded bg-white border border-slate-200">{'Kedves {{megszolitas}}!'}</code>
          {' '}→ <span className="font-medium text-slate-950">Kedves {fillSample('{{megszolitas}}')}!</span>
        </div>
      </div>

      <div className="sticky top-0 z-10 -mx-6 px-6 py-2 bg-white/95 backdrop-blur border-b border-slate-100">
        <VariableChips
          variables={TEMPLATE_VARIABLES_HELP}
          sample={fillSample}
          onInsert={(t) => insertVar(t, ['greeting', 'intro', 'closing'], 'intro')}
        />
      </div>

      <div className="space-y-2">
        <label className={labelCls}>Megszólítás</label>
        <p className="text-xs text-slate-500 -mt-1">Az ajánlat első sora, félkövérrel.</p>
        <input
          type="text"
          {...track('greeting')}
          value={form.defaultGreetingTemplate}
          onChange={(e) => setForm({ ...form, defaultGreetingTemplate: e.target.value })}
          className="w-full px-3.5 py-2 rounded-xl border border-slate-300 text-sm font-semibold"
        />
        <TemplatePreview text={form.defaultGreetingTemplate} fill={fillSample} className="font-semibold" />
      </div>

      <div className="space-y-2">
        <label className={labelCls}>Bevezető szöveg</label>
        <p className="text-xs text-slate-500 -mt-1">A megszólítás alatt, a termékek előtt.</p>
        <textarea
          rows={3}
          {...track('intro')}
          value={form.defaultIntroTemplate}
          onChange={(e) => setForm({ ...form, defaultIntroTemplate: e.target.value })}
          className="w-full px-3.5 py-2 rounded-xl border border-slate-300 text-sm"
        />
        <TemplatePreview text={form.defaultIntroTemplate} fill={fillSample} />
      </div>

      <div className="space-y-2">
        <label className={labelCls}>Záró szöveg és feltételek</label>
        <p className="text-xs text-slate-500 -mt-1">
          A PDF végén, a termékek és az összesítő után. Új sor: Enter; felsorolás: kezdd a sort „• ” jellel.
        </p>
        <textarea
          rows={12}
          {...track('closing')}
          value={form.defaultClosingInfoTemplate}
          onChange={(e) => setForm({ ...form, defaultClosingInfoTemplate: e.target.value })}
          className="w-full px-3.5 py-2 rounded-xl border border-slate-300 text-sm"
        />
        <TemplatePreview text={form.defaultClosingInfoTemplate} fill={fillSample} />
      </div>
    </div>
  );

  return (
    <form onSubmit={handleSubmit} className="space-y-5 max-w-5xl">
      <PageHeader
        title="Beállítások"
        subtitle="Válassz egy témát; a módosítások a Mentés gombbal kerülnek érvénybe."
        actions={
          <button type="submit" disabled={saving} className={btn.primary}>
            <Save className="w-4 h-4" />
            {saving ? 'Mentés…' : 'Mentés'}
          </button>
        }
      />

      <div className="grid grid-cols-1 lg:grid-cols-[13rem_minmax(0,1fr)] gap-5 items-start">
        {/* Témák: telefonon egy görgethető sor, nagy kijelzőn bal oldali menü */}
        <nav
          aria-label="Beállítások témái"
          className="flex lg:flex-col gap-1 overflow-x-auto whitespace-nowrap p-1 rounded-xl bg-slate-100 border border-slate-200 lg:bg-white lg:p-2 lg:rounded-2xl lg:sticky lg:top-4"
        >
          {SETTINGS_TABS.map(([id, label, hint]) => (
            <button
              key={id}
              type="button"
              onClick={() => setTab(id)}
              aria-current={tab === id ? 'page' : undefined}
              className={`shrink-0 text-left px-3 py-2 rounded-lg transition ${
                tab === id
                  ? 'bg-white lg:bg-slate-900 lg:text-white text-slate-950 font-semibold shadow-sm lg:shadow-none'
                  : 'text-slate-600 hover:text-slate-950 lg:hover:bg-slate-100'
              }`}
            >
              <span className="block text-sm">{label}</span>
              <span className={`hidden lg:block text-xs font-normal ${tab === id ? 'text-white/70' : 'text-slate-500'}`}>
                {hint}
              </span>
            </button>
          ))}
        </nav>

        <div className="min-w-0 space-y-5">

      {tab === 'pricing' && (<>
      {/* Pricing formula: profit (X) + assembly (X, Y) */}
      <div className="bg-white rounded-2xl border border-slate-200 p-6 space-y-4">
        <div className="">
          <h2 className="text-base font-semibold text-slate-950">Árképlet</h2>
          <p className="text-[13px] text-slate-600 mt-0.5">
            Eladási ár = katalógusár + haszon (X) + szerelés (X + Y × m²).
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
          {PROFIT_MODE_OPTIONS.map((opt) => (
            <button
              key={opt.id}
              type="button"
              onClick={() => setFormula({ profitMode: opt.id as ProfitMode })}
              className={`p-3 rounded-xl border text-left transition ${
                form.pricingFormula.profitMode === opt.id
                  ? 'border-emerald-600 bg-emerald-50 ring-2 ring-emerald-500/20'
                  : 'border-slate-200 hover:bg-slate-50'
              }`}
            >
              <div className="text-xs font-bold text-slate-900">{opt.label}</div>
              <div className="text-xs text-slate-500 mt-0.5">
                {opt.description}
              </div>
            </button>
          ))}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
          <div>
            <label className={labelCls}>
              Haszon X (
              {form.pricingFormula.profitMode === 'fixed' ? 'EUR' : '%'})
            </label>
            <input
              type="number"
              min={0}
              value={form.pricingFormula.profitValue}
              onChange={(e) =>
                setFormula({ profitValue: Math.max(0, Number(e.target.value) || 0) })
              }
              className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-sm font-bold"
            />
          </div>
          <div>
            <label className={labelCls}>
              Szerelés X (EUR, fix)
            </label>
            <input
              type="number"
              min={0}
              value={form.pricingFormula.assemblyFixedEur}
              onChange={(e) =>
                setFormula({
                  assemblyFixedEur: Math.max(0, Number(e.target.value) || 0),
                })
              }
              className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-sm font-bold"
            />
          </div>
          <div>
            <label className={labelCls}>
              Szerelés Y (EUR / m²)
            </label>
            <input
              type="number"
              min={0}
              value={form.pricingFormula.assemblyPerM2Eur}
              onChange={(e) =>
                setFormula({
                  assemblyPerM2Eur: Math.max(0, Number(e.target.value) || 0),
                })
              }
              className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-sm font-bold"
            />
          </div>
          <div>
            <label className={labelCls}>
              Szerelés sor neve a PDF-ben
            </label>
            <input
              type="text"
              value={form.pricingFormula.assemblyLabel}
              onChange={(e) => setFormula({ assemblyLabel: e.target.value })}
              className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-sm"
            />
          </div>
        </div>

        <label className="inline-flex items-center gap-2 text-xs font-semibold text-slate-700 cursor-pointer">
          <input
            type="checkbox"
            checked={form.pricingFormula.confirmedByOwner}
            onChange={(e) => setFormula({ confirmedByOwner: e.target.checked })}
            className="rounded text-emerald-600"
          />
          A képlet végleges
        </label>
      </div>
      </>)}
      {tab === 'extras' && (<>
      {/* Extrák gyűjteményei az árazóban: név, leírás, kép, sorrend */}
      <div className="bg-white rounded-2xl border border-slate-200 p-6 space-y-4">
        <div>
          <h2 className="text-base font-semibold text-slate-950">Extrák gyűjteményei</h2>
          <p className="text-[13px] text-slate-600 mt-0.5">
            Az árazóban az extrák ezekbe a csoportokba rendezve, ebben a sorrendben jelennek meg. A
            tételeknél a sablonszerkesztőben választható gyűjtemény; ha nincs megadva, a név alapján
            kerül a megfelelő csoportba (átnevezés után is).
          </p>
        </div>
        <div className="space-y-2">
          {(form.extraGroups || []).map((g, idx, all) => {
            const update = (patch: Partial<ExtraGroupConfig>) =>
              setForm((prev) => ({
                ...prev,
                extraGroups: (prev.extraGroups || []).map((x, i) => (i === idx ? { ...x, ...patch } : x)),
              }));
            const move = (dir: -1 | 1) =>
              setForm((prev) => {
                const list = [...(prev.extraGroups || [])];
                const to = idx + dir;
                if (to < 0 || to >= list.length) return prev;
                [list[idx], list[to]] = [list[to], list[idx]];
                return { ...prev, extraGroups: list };
              });
            return (
              <div key={g.id} className="flex flex-wrap sm:flex-nowrap items-center gap-2 rounded-xl border border-slate-200 p-2">
                <label
                  className="relative w-14 h-14 rounded-lg border border-dashed border-slate-300 bg-slate-50 grid place-items-center overflow-hidden cursor-pointer shrink-0"
                  title="Kép feltöltése"
                >
                  {g.imageUrl ? (
                    <img src={g.imageUrl} alt="" className="w-full h-full object-cover" />
                  ) : (
                    <ImagePlus className="w-5 h-5 text-slate-400" />
                  )}
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={async (e) => {
                      const f = e.target.files?.[0];
                      e.target.value = '';
                      if (!f) return;
                      const url = await onUploadImage(f);
                      if (url) update({ imageUrl: url });
                    }}
                  />
                </label>
                <div className="min-w-0 flex-1 basis-56 space-y-1">
                  <input
                    value={g.name}
                    onChange={(e) => update({ name: e.target.value })}
                    placeholder="Gyűjtemény neve (pl. Világítás)"
                    className="w-full px-3 py-1.5 rounded-lg border border-slate-300 text-sm font-medium"
                  />
                  <input
                    value={g.description || ''}
                    onChange={(e) => update({ description: e.target.value })}
                    placeholder="Rövid leírás (opcionális)"
                    className="w-full px-3 py-1.5 rounded-lg border border-slate-200 text-[13px] text-slate-600"
                  />
                </div>
                <div className="flex items-center gap-0.5 ml-auto">
                  {g.imageUrl && (
                    <button type="button" onClick={() => update({ imageUrl: undefined })} className="px-2 py-1 text-xs text-slate-500 hover:text-slate-950">
                      Kép törlése
                    </button>
                  )}
                  <button type="button" disabled={idx === 0} onClick={() => move(-1)} className="p-1.5 rounded-lg text-slate-400 hover:text-slate-900 hover:bg-slate-100 disabled:opacity-30" title="Fel">
                    <ArrowUp className="w-4 h-4" />
                  </button>
                  <button type="button" disabled={idx === all.length - 1} onClick={() => move(1)} className="p-1.5 rounded-lg text-slate-400 hover:text-slate-900 hover:bg-slate-100 disabled:opacity-30" title="Le">
                    <ArrowDown className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      setForm((prev) => ({ ...prev, extraGroups: (prev.extraGroups || []).filter((_, i) => i !== idx) }))
                    }
                    className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50"
                    title="Gyűjtemény törlése"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
        <button
          type="button"
          onClick={() =>
            setForm((prev) => ({
              ...prev,
              extraGroups: [
                ...(prev.extraGroups || []),
                { id: `grp_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`, name: 'Új gyűjtemény' },
              ],
            }))
          }
          className={btn.secondary}
        >
          <Plus className="w-4 h-4" />
          Új gyűjtemény
        </button>
      </div>

      {/* Gyors extrák: a sablonépítőben egy kattintással felvehető tételek */}
      <div className="bg-white rounded-2xl border border-slate-200 p-6 space-y-4">
        <div>
          <h2 className="text-base font-semibold text-slate-950">Gyors extrák</h2>
          <p className="text-[13px] text-slate-600 mt-0.5">
            A sablonépítőben egy kattintással felvehető opcionális tételek. A sablonba
            felvett tétel ára utána ott külön is átírható.
          </p>
        </div>
        <div className="space-y-2">
          {form.extraPresets.map((p, idx) => (
            <div key={p.id} className="flex flex-wrap items-center gap-2">
              <input
                value={p.name}
                onChange={(e) => updatePreset(idx, { name: e.target.value })}
                placeholder="Megnevezés"
                className="flex-1 min-w-[180px] px-3 py-1.5 rounded-lg border border-slate-300 text-sm"
              />
              <select
                value={p.pricingMode}
                onChange={(e) =>
                  updatePreset(idx, {
                    pricingMode: e.target.value as ExtraPreset['pricingMode'],
                    unitLabel:
                      e.target.value === 'per_m2'
                        ? 'm²'
                        : e.target.value === 'per_lm'
                        ? 'fm'
                        : e.target.value === 'percentage'
                        ? '%'
                        : p.unitLabel === '%'
                        ? 'db'
                        : p.unitLabel,
                    ...(e.target.value === 'percentage' ? { perSide: false } : {}),
                  })
                }
                className="px-2.5 py-1.5 rounded-lg border border-slate-300 text-sm"
              >
                <option value="fixed">Fix ár</option>
                <option value="per_m2">EUR / m²</option>
                <option value="per_lm">EUR / fm</option>
                <option value="percentage">% a szerkezet árából</option>
              </select>
              <div className="flex items-center gap-1">
                <input
                  type="number"
                  min={0}
                  step={p.pricingMode === 'percentage' ? 0.5 : 1}
                  value={p.pricingMode === 'percentage' ? (p.price > 0 ? p.price : '') : p.price > 1 ? p.price : ''}
                  onChange={(e) =>
                    updatePreset(idx, {
                      price:
                        p.pricingMode === 'percentage'
                          ? Math.max(0, Number(e.target.value) || 0)
                          : Math.max(1, Number(e.target.value) || 1),
                    })
                  }
                  placeholder={p.pricingMode === 'percentage' ? '%' : 'ár'}
                  className="w-24 px-2.5 py-1.5 rounded-lg border border-slate-300 text-sm text-right tabular-nums"
                />
                <span className="text-xs text-slate-500 w-7">{p.pricingMode === 'percentage' ? '%' : 'EUR'}</span>
              </div>
              <label
                className={`inline-flex items-center gap-1.5 text-[13px] cursor-pointer ${
                  p.pricingMode === 'percentage' ? 'text-slate-300 pointer-events-none' : 'text-slate-600'
                }`}
              >
                <input
                  type="checkbox"
                  disabled={p.pricingMode === 'percentage'}
                  checked={Boolean(p.perSide) && p.pricingMode !== 'percentage'}
                  onChange={(e) => updatePreset(idx, { perSide: e.target.checked })}
                />
                oldalanként
              </label>
              <button
                type="button"
                onClick={() =>
                  setForm({ ...form, extraPresets: form.extraPresets.filter((_, i) => i !== idx) })
                }
                className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50"
                title="Törlés"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          ))}
          <button
            type="button"
            onClick={() =>
              setForm({
                ...form,
                extraPresets: [
                  ...form.extraPresets,
                  { id: `ex_${Date.now()}`, name: '', pricingMode: 'fixed', unitLabel: 'db', price: 1 },
                ],
              })
            }
            className={btn.ghost}
          >
            <Plus className="w-4 h-4" />
            Új extra
          </button>
        </div>
      </div>

      </>)}
      {tab === 'offer' && (<>
      {/* Ajánlat sorszám: előtag, formátum, számjegyek */}
      <div className="bg-white rounded-2xl border border-slate-200 p-6 space-y-4">
        <div>
          <h2 className="text-base font-semibold text-slate-950">Ajánlat sorszám</h2>
          <p className="text-[13px] text-slate-600 mt-0.5">
            Az új ajánlatok sorszáma. A már kiállított ajánlatok megtartják a sajátjukat.
          </p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-4 items-start">
          <div>
            <label className={labelCls}>Előtag</label>
            <input
              value={form.quoteNumberPrefix}
              onChange={(e) =>
                setForm({ ...form, quoteNumberPrefix: e.target.value.replace(/\s+/g, '') })
              }
              placeholder="OSP"
              maxLength={12}
              className="w-full px-3.5 py-2 rounded-xl border border-slate-300 text-sm font-semibold"
            />
          </div>
          <div className="sm:col-span-2">
            <label className={labelCls}>Formátum</label>
            <select
              value={form.quoteNumberFormat}
              onChange={(e) =>
                setForm({ ...form, quoteNumberFormat: e.target.value as QuoteNumberFormat })
              }
              className="w-full px-3.5 py-2 rounded-xl border border-slate-300 text-sm"
            >
              {QUOTE_NUMBER_FORMAT_OPTIONS.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className={labelCls}>Számjegyek</label>
            <select
              value={form.quoteNumberDigits}
              onChange={(e) => setForm({ ...form, quoteNumberDigits: Number(e.target.value) })}
              className="w-full px-3.5 py-2 rounded-xl border border-slate-300 text-sm"
            >
              {[2, 3, 4, 5].map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div className="text-[13px] text-slate-600">
          Minta:{' '}
          <span className="font-semibold text-slate-950 tabular-nums">
            {formatQuoteNumber(form, 1)}
          </span>
          , {formatQuoteNumber(form, 2)}, …
        </div>
      </div>

      {offerTextsCard}

      {/* Általános ajánlat sablon: a saját Word ajánlatok szerkezete és visszatérő megfogalmazásai */}
      <div className="bg-white rounded-2xl border border-slate-200 p-6 space-y-4">
        <div>
          <h2 className="text-base font-semibold text-slate-950">Ajánlat felépítése (általános sablon)</h2>
          <p className="text-[13px] text-slate-600 mt-0.5">
            Minden ajánlat ebben a sorrendben készül, a saját Word ajánlataid mintájára. A kategóriák saját szövegeit (leírás, cím,
            opciók, akció) a Termékek oldalon, a kategóriánál állíthatod be.
          </p>
        </div>
        <ol className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-1.5 text-[13px] text-slate-700">
          {[
            ['Megszólítás és bevezető', 'fent, a Szövegek kártyán'],
            ['Kategória leírás (fő szerkezetek)', 'kategóriánként'],
            ['Kategória cím (félkövér, aláhúzott)', 'kategóriánként'],
            ['Termék: „1. NÉV:” + Méretek sor', 'termékenként'],
            ['Leírás, fotók, ártáblázat', 'termékenként'],
            ['Összesen + forint sor', 'lent / kategóriánként'],
            ['Opció sorok', 'a választható tételekből'],
            ['Színek, opcionálisan rendelhető, akció', 'kategóriánként'],
            ['Kiegészítők leírása (üvegfal, árnyékoló)', 'kategóriánként'],
            ['Információ, zárás, Megjegyzés, aláírás', 'fent, a Szövegek kártyán'],
          ].map(([t, d], i) => (
            <li key={t} className="flex gap-2">
              <span className="w-5 h-5 shrink-0 rounded-md bg-slate-900 text-white text-[11px] font-bold grid place-items-center">{i + 1}</span>
              <span>
                <b className="font-semibold text-slate-900">{t}</b> <span className="text-slate-500">· {d}</span>
              </span>
            </li>
          ))}
        </ol>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 pt-2 border-t border-slate-100">
          {(
            [
              ['docSizeLine', 'Méretek sor a termék neve alatt', 'Méretek: {{szelesseg}} cm hosszú x {{kinyulas}} cm széles (kinyúlás) x {{magassag}} cm magas (belső) – {{beepites}}'],
              ['docTotalLabel', 'Összesítő sor (ha a kategória nem ad sajátot)', 'Az alapszerkezet szereléssel Összesen:'],
              ['docHufLine', 'Forint sor', 'Az ajánlat írásának napján, {{arfolyam}} Ft/EUR árfolyamon az összeg:'],
              ['docOptionLabel', 'Opció sor kezdete', 'Opció:'],
              ['docInfoTitle', 'Információ blokk címe', 'Információ:'],
            ] as const
          ).map(([key, label, ph]) => (
            <div key={key} className={key === 'docSizeLine' ? 'lg:col-span-2' : ''}>
              <label className={labelCls}>{label}</label>
              <input
                value={(form as any)[key] || ''}
                placeholder={ph}
                onChange={(e) => setForm({ ...form, [key]: e.target.value })}
                className="w-full px-3.5 py-2 rounded-xl border border-slate-300 text-sm"
              />
            </div>
          ))}
        </div>
        <label className="flex items-center gap-2 text-sm text-slate-800">
          <input type="checkbox" checked={Boolean(form.docShowTitleBlock)} onChange={(e) => setForm({ ...form, docShowTitleBlock: e.target.checked })} />
          „Árajánlat” cím és alapadatok (ügyfél, méret, beépítés) az első oldal tetején
          <span className="text-xs text-slate-500">(a Word ajánlatokban nincs)</span>
        </label>
        <p className="text-[11px] text-slate-500">
          Üres mezőnél a szürke minta érvényes. Változók: {'{{megszolitas}} {{ugyfel_nev}} {{telepules}} {{meret}} {{szelesseg}} {{kinyulas}} {{magassag}} {{beepites}} {{arfolyam}} {{hatarido}}'}
        </p>
      </div>
      </>)}
      {tab === 'email' && (<>
      {/* E-mail küldés: SMTP + sablonok + megnyitás-követés */}
      <div className="bg-white rounded-2xl border border-slate-200 p-6 space-y-4">
        <div>
          <h2 className="text-base font-semibold text-slate-950">E-mail küldés</h2>
          <p className="text-[13px] text-slate-600 mt-0.5">
            Az ajánlat PDF mellékletként megy ki. Gmail esetén alkalmazásjelszó kell
            (smtp.gmail.com, 465).
          </p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {(
            [
              ['senderName', 'Feladó neve', 'text'],
              ['senderEmail', 'Feladó e-mail', 'email'],
              ['smtpHost', 'SMTP szerver', 'text'],
              ['smtpPort', 'SMTP port', 'number'],
              ['smtpUser', 'SMTP felhasználó', 'text'],
              ['smtpPass', 'SMTP jelszó', 'password'],
            ] as [keyof EmailSettings, string, string][]
          ).map(([key, label, type]) => (
            <div key={key}>
              <label className={labelCls}>{label}</label>
              <input
                type={type}
                value={String(form.emailSettings[key] ?? '')}
                onChange={(e) =>
                  setEmail({
                    [key]: type === 'number' ? Number(e.target.value) || 0 : e.target.value,
                  } as Partial<EmailSettings>)
                }
                autoComplete={type === 'password' ? 'new-password' : 'off'}
                className="w-full px-3.5 py-2 rounded-xl border border-slate-300 text-sm"
              />
            </div>
          ))}
        </div>
        {/* Sablonok: választható lista + szerkesztő */}
        <div className="pt-2 space-y-3">
          <div className="flex flex-wrap items-end gap-2">
            <label className="block min-w-0 flex-1 basis-56">
              <span className={labelCls}>E-mail sablon</span>
              <select
                value={activeTemplate?.id || ''}
                onChange={(e) => setActiveTemplateId(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 bg-white text-sm"
              >
                {form.emailSettings.templates.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name || 'Névtelen'}
                    {t.id === form.emailSettings.defaultTemplateId ? ' (alapértelmezett)' : ''}
                  </option>
                ))}
              </select>
            </label>
            <button type="button" onClick={addTemplate} className={btn.secondary}>
              <Plus className="w-4 h-4" />
              Új sablon
            </button>
          </div>

          {activeTemplate && (
            <div className="rounded-xl border border-slate-200 p-4 space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className={labelCls}>Sablon neve</label>
                  <input
                    value={activeTemplate.name}
                    onChange={(e) => updateTemplate({ name: e.target.value })}
                    className="w-full px-3.5 py-2 rounded-xl border border-slate-300 text-sm"
                  />
                </div>
                <div>
                  <label className={labelCls}>Ennél a státusznál ajánlja fel</label>
                  <div className="flex flex-wrap gap-1.5">
                    {(Object.keys(STATUS_CONFIG) as QuoteStatus[]).map((st) => {
                      const on = activeTemplate.suggestFor?.includes(st);
                      return (
                        <button
                          key={st}
                          type="button"
                          onClick={() =>
                            updateTemplate({
                              suggestFor: on
                                ? (activeTemplate.suggestFor || []).filter((x) => x !== st)
                                : [...(activeTemplate.suggestFor || []), st],
                            })
                          }
                          className={`px-2 py-0.5 rounded-full border text-xs ${
                            on
                              ? 'bg-slate-900 border-slate-900 text-white'
                              : 'border-slate-300 text-slate-600 hover:bg-slate-50'
                          }`}
                        >
                          {STATUS_CONFIG[st].label}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
              <div>
                <label className={labelCls}>Tárgy</label>
                <input
                  {...track('subject')}
                  value={activeTemplate.subject}
                  onChange={(e) => updateTemplate({ subject: e.target.value })}
                  className="w-full px-3.5 py-2 rounded-xl border border-slate-300 text-sm"
                />
              </div>
              <div>
                <label className={labelCls}>Üzenet</label>
                <textarea
                  rows={10}
                  {...track('body')}
                  value={activeTemplate.body}
                  onChange={(e) => updateTemplate({ body: e.target.value })}
                  className="w-full px-3.5 py-2 rounded-xl border border-slate-300 text-sm"
                />
                <div className="mt-2">
                  <VariableChips
                    variables={EMAIL_VARIABLES_HELP}
                    sample={fillEmailSample}
                    onInsert={(t) => insertVar(t, ['subject', 'body'], 'body')}
                    hint="Kattints a tárgyba vagy az üzenetbe oda, ahová az adat kell, majd válaszd ki a listából."
                  />
                </div>
                <TemplatePreview
                  className="mt-2"
                  text={`Tárgy: ${activeTemplate.subject}\n\n${activeTemplate.body}`}
                  fill={fillEmailSample}
                />
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  disabled={activeTemplate.id === form.emailSettings.defaultTemplateId}
                  onClick={() => setEmail({ defaultTemplateId: activeTemplate.id })}
                  className={btn.ghost}
                >
                  ★ Alapértelmezett
                </button>
                <button type="button" onClick={duplicateTemplate} className={btn.ghost}>
                  <Copy className="w-4 h-4" />
                  Másolat
                </button>
                <button
                  type="button"
                  disabled={form.emailSettings.templates.length <= 1}
                  onClick={deleteTemplate}
                  className={`${btn.ghost} hover:text-rose-600`}
                >
                  <Trash2 className="w-4 h-4" />
                  Törlés
                </button>
                <button type="button" onClick={restoreSampleTemplates} className={`${btn.ghost} ml-auto`}>
                  Minta sablonok visszaállítása
                </button>
              </div>
            </div>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 items-end">
          <label className="inline-flex items-center gap-2 text-sm text-slate-700 cursor-pointer">
            <input
              type="checkbox"
              checked={form.emailSettings.enableTrackingPixel}
              onChange={(e) => setEmail({ enableTrackingPixel: e.target.checked })}
            />
            Megnyitás követése (láthatatlan képpont a levélben)
          </label>
          <div>
            <label className={labelCls}>Az alkalmazás nyilvános címe (a követéshez)</label>
            <input
              value={form.emailSettings.publicBaseUrl}
              onChange={(e) => setEmail({ publicBaseUrl: e.target.value })}
              placeholder="https://arazo.openskypergola.hu"
              className="w-full px-3.5 py-2 rounded-xl border border-slate-300 text-sm"
            />
          </div>
        </div>
      </div>

      </>)}
      {tab === 'design' && <TemplateDesigner form={form} setForm={setForm} categories={categories} templates={templates} />}
      {tab === 'company' && (
      <div className="bg-white rounded-2xl border border-slate-200 p-6 space-y-5">
        <h2 className="text-base font-semibold text-slate-950">Cég és arculat</h2>

        {/* Company Details */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className={labelCls}>
              Cégnév / Fejléc cím a PDF-ben
            </label>
            <input
              type="text"
              value={form.companyName}
              onChange={(e) =>
                setForm({ ...form, companyName: e.target.value })
              }
              className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-sm font-semibold"
            />
          </div>
          <div>
            <label className={labelCls}>
              Fejléc Alcím / Tevékenységek
            </label>
            <input
              type="text"
              value={form.companySubtitle}
              onChange={(e) =>
                setForm({ ...form, companySubtitle: e.target.value })
              }
              className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-sm"
            />
          </div>
          <div>
            <label className={labelCls}>
              E-mail cím (láblécben)
            </label>
            <input
              type="text"
              value={form.companyEmail}
              onChange={(e) =>
                setForm({ ...form, companyEmail: e.target.value })
              }
              className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-sm"
            />
          </div>
          <div>
            <label className={labelCls}>
              Telefonszám (láblécben)
            </label>
            <input
              type="text"
              value={form.companyPhone}
              onChange={(e) =>
                setForm({ ...form, companyPhone: e.target.value })
              }
              className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-sm"
            />
          </div>
        </div>

        {/* Default Rates */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-2">
          <div>
            <label className={labelCls}>
              Alapértelmezett EUR/HUF árfolyam
            </label>
            <input
              type="number"
              value={form.defaultEurHufRate}
              onChange={(e) =>
                setForm({
                  ...form,
                  defaultEurHufRate: Number(e.target.value),
                })
              }
              className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-sm font-bold"
            />
          </div>
          <div>
            <label className={labelCls}>
              Alapértelmezett Szállítási díj (Ft)
            </label>
            <input
              type="number"
              value={form.defaultDeliveryFeeHuf}
              onChange={(e) =>
                setForm({
                  ...form,
                  defaultDeliveryFeeHuf: Number(e.target.value),
                })
              }
              className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-sm font-bold"
            />
          </div>
          <div>
            <label className={labelCls}>
              Kedvezmény címke a táblázatban
            </label>
            <input
              type="text"
              value={form.defaultDiscountLabel}
              onChange={(e) =>
                setForm({ ...form, defaultDiscountLabel: e.target.value })
              }
              placeholder="-20%"
              className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-sm"
            />
          </div>
        </div>

        {/* Custom PDF Background / Logo / Signature Card Uploads */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-2">
          <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-2">
            <div className="text-xs font-bold text-slate-900">
              Saját A4 Fejléc/Lábléc Háttérkép
            </div>
            <p className="text-xs text-slate-500">
              Ha feltöltesz egy egész oldalas A4-es háttérképet, minden PDF oldalra
              az kerül. Ha üres, modern fejlécet rajzol a rendszer.
            </p>
            {form.pdfPageBackgroundUrl && (
              <div className="flex items-center gap-2">
                <img
                  src={form.pdfPageBackgroundUrl}
                  alt=""
                  className="w-16 h-20 object-cover rounded border border-slate-300"
                />
                <button
                  type="button"
                  onClick={() =>
                    setForm({ ...form, pdfPageBackgroundUrl: '' })
                  }
                  className="text-xs text-rose-600 font-semibold inline-flex items-center gap-1"
                >
                  <Trash2 className="w-3.5 h-3.5" /> Törlés
                </button>
              </div>
            )}
            <label className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-900 text-white text-xs font-semibold cursor-pointer">
              <Upload className="w-3.5 h-3.5" />
              {uploading ? 'Feltöltés...' : 'Háttérkép feltöltése'}
              <input
                type="file"
                accept="image/*"
                className="hidden"
                onChange={async (e) => {
                  const f = e.target.files?.[0];
                  if (!f) return;
                  setUploading(true);
                  try {
                    const url = await onUploadImage(f);
                    if (url) setForm({ ...form, pdfPageBackgroundUrl: url });
                  } finally {
                    setUploading(false);
                  }
                }}
              />
            </label>
          </div>

          <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-2">
            <div className="text-xs font-bold text-slate-900">
              Céges Logó a Fejlécbe
            </div>
            <p className="text-xs text-slate-500">
              Megjelenik a PDF felső fejlécében a cégnév mellett.
            </p>
            {form.pdfLogoUrl && (
              <div className="flex items-center gap-2">
                <img
                  src={form.pdfLogoUrl}
                  alt=""
                  className="w-20 h-12 object-contain rounded border border-slate-300 bg-white p-1"
                />
                <button
                  type="button"
                  onClick={() => setForm({ ...form, pdfLogoUrl: '' })}
                  className="text-xs text-rose-600 font-semibold inline-flex items-center gap-1"
                >
                  <Trash2 className="w-3.5 h-3.5" /> Törlés
                </button>
              </div>
            )}
            <label className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-900 text-white text-xs font-semibold cursor-pointer">
              <Upload className="w-3.5 h-3.5" />
              Logó feltöltése
              <input
                type="file"
                accept="image/*"
                className="hidden"
                onChange={async (e) => {
                  const f = e.target.files?.[0];
                  if (!f) return;
                  setUploading(true);
                  try {
                    const url = await onUploadImage(f);
                    if (url) setForm({ ...form, pdfLogoUrl: url });
                  } finally {
                    setUploading(false);
                  }
                }}
              />
            </label>
          </div>

          <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-2">
            <div className="text-xs font-bold text-slate-900">
              Névjegykártya / Aláírás kép a PDF végére
            </div>
            <p className="text-xs text-slate-500">
              Az árajánlat utolsó oldalának alján jelenik meg.
            </p>
            {form.pdfSignatureCardUrl && (
              <div className="flex items-center gap-2">
                <img
                  src={form.pdfSignatureCardUrl}
                  alt=""
                  className="w-24 h-14 object-cover rounded border border-slate-300"
                />
                <button
                  type="button"
                  onClick={() => setForm({ ...form, pdfSignatureCardUrl: '' })}
                  className="text-xs text-rose-600 font-semibold inline-flex items-center gap-1"
                >
                  <Trash2 className="w-3.5 h-3.5" /> Törlés
                </button>
              </div>
            )}
            <label className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-900 text-white text-xs font-semibold cursor-pointer">
              <Upload className="w-3.5 h-3.5" />
              Névjegy feltöltése
              <input
                type="file"
                accept="image/*"
                className="hidden"
                onChange={async (e) => {
                  const f = e.target.files?.[0];
                  if (!f) return;
                  setUploading(true);
                  try {
                    const url = await onUploadImage(f);
                    if (url) setForm({ ...form, pdfSignatureCardUrl: url });
                  } finally {
                    setUploading(false);
                  }
                }}
              />
            </label>
          </div>
        </div>

      </div>
      )}
        </div>
      </div>
    </form>
  );
}
