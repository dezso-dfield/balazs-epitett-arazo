'use client';

import { templateCoverUrl, thumbUrl } from '@/lib/thumb';
import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  Check,
  ChevronRight,
  Plus,
  RefreshCw,
  Trash2,
} from 'lucide-react';
import { formatDotNumber, MOUNT_TYPES } from '@/lib/constants';
import {
  buildFullQuoteDocumentBlocks,
  calculateTemplateRows,
  checkTemplateFit,
  getModuleCounts,
  shouldRotate,
  isTemplateInCategory,
  computeBlockBreakdown,
} from '@/lib/pricing-engine';
import {
  MountType,
  PriceAdjustment,
  ProductCategory,
  ProductMenu,
  QuoteDocumentBlock,
  QuoteRecord,
  QuoteTemplate,
  QuoteTableRow,
  SystemConfig,
  KnownCustomer,
} from '@/lib/types';
import { AdjustmentsEditor, PriceSummaryLine } from '@/components/PricingWidgets';
import { ColorDots } from '@/components/ColorOptions';
import { presentExtra, sortGroupNames } from '@/lib/extra-groups';
import {
  btn,
  card,
  inputCls,
  labelCls,
  PageHeader,
  Stepper,
} from '@/components/ui';

interface GuidedQuoteWizardViewProps {
  knownCustomers: KnownCustomer[];
  config: SystemConfig;
  menus: ProductMenu[];
  categories: ProductCategory[];
  templates: QuoteTemplate[];
  onOpenTemplateBuilder: () => void;
  onFinishWizardToEditor: (draftQuote: Partial<QuoteRecord>) => void;
}

type WizardStep = 1 | 2 | 3 | 4 | 5;

interface ManualSectionDraft {
  id: string;
  title: string;
  categoryId: string;
}

const STEPS: { num: WizardStep; label: string; short: string }[] = [
  { num: 1, label: 'Ügyfél', short: 'Ügyfél' },
  { num: 2, label: 'Termék', short: 'Termék' },
  { num: 3, label: 'Sablon', short: 'Sablon' },
  { num: 4, label: 'Méret & szűrő', short: 'Méret' },
  { num: 5, label: 'Extrák & ár', short: 'Extrák' },
];

const byOrder = <T extends { order?: number }>(a: T, b: T) =>
  (a.order ?? 0) - (b.order ?? 0);

/**
 * Végigvezetett árazó a megbeszélt sorrendben:
 * Ügyfél → Menü + Kategória → Sablon → Méret (cm) + okos szűrő → Extrák + árkalkuláció
 */
export function GuidedQuoteWizardView({
  knownCustomers,
  config,
  menus,
  categories,
  templates,
  onOpenTemplateBuilder,
  onFinishWizardToEditor,
}: GuidedQuoteWizardViewProps) {
  const [step, setStep] = useState<WizardStep>(1);

  // 1. Ügyfél
  const [customerName, setCustomerName] = useState('');
  const [greetingName, setGreetingName] = useState('');
  const [greetingManuallyEdited, setGreetingManuallyEdited] = useState(false);
  const [city, setCity] = useState('Budapest');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [inquiryNotes, setInquiryNotes] = useState('');

  // 2. Termék
  // Csak az a menü jelenik meg, amelyben van árazható termék
  const sortedMenus = useMemo(
    () =>
      menus
        .filter((m) => m.enabled)
        .filter((m) =>
          categories.some(
            (c) =>
              c.menuId === m.id &&
              templates.some(
                (t) => isTemplateInCategory(t, c.id) && t.status !== 'inactive' && t.status !== 'test'
              )
          )
        )
        .sort(byOrder),
    [menus, categories, templates]
  );
  const [selectedMenuId, setSelectedMenuId] = useState<string>(
    sortedMenus[0]?.id || ''
  );
  const [selectedCategoryId, setSelectedCategoryId] = useState<string>('');

  // 3. Méret
  const [widthCm, setWidthCm] = useState<number>(600);
  const [projectionCm, setProjectionCm] = useState<number>(400);
  const [heightCm, setHeightCm] = useState<number>(250);
  const [mountType, setMountType] = useState<MountType>('Épülethez rögzített');
  const [eurHufRate, setEurHufRate] = useState<number>(
    config.defaultEurHufRate || 400
  );
  const [deliveryFeeHuf, setDeliveryFeeHuf] = useState<number>(
    config.defaultDeliveryFeeHuf ?? 40000
  );
  const [fetchingRate, setFetchingRate] = useState(false);
  // Honnan jön az árfolyam (pl. "MNB hivatalos középárfolyam · 2026-10-16"), kézi átírásnál üres
  const [rateSource, setRateSource] = useState('');

  // 4. Sablon - a kijelölés kategóriákon átível (pergola + napellenző egy ajánlatban)
  const [selectedTemplateIds, setSelectedTemplateIds] = useState<string[]>([]);
  const [forcedTemplateIds, setForcedTemplateIds] = useState<string[]>([]);
  const [showTestTemplates, setShowTestTemplates] = useState(false);
  const [manualSections, setManualSections] = useState<ManualSectionDraft[]>(
    []
  );

  // 5. Extrák & korrekciók
  const [selectedMaterialsByTemplate, setSelectedMaterialsByTemplate] =
    useState<Record<string, string[]>>({});
  const [adjustmentsByTemplate, setAdjustmentsByTemplate] = useState<
    Record<string, PriceAdjustment[]>
  >({});
  // Oldalanként árazott extrák (pl. üveg): hány oldalra kéri (1-4)
  const [sidesByTemplate, setSidesByTemplate] = useState<
    Record<string, Record<string, number>>
  >({});

  const getSides = (tplId: string, matId: string) =>
    sidesByTemplate[tplId]?.[matId] ?? 1;

  // A sablon a választott oldalszámokkal: oldalanként árazott tételnél darabszám = oldalak száma
  // A bepipált extra az ügyfél kérése: alaptételként a végösszegbe kerül (a PDF-ben is rendes sor)
  const effectiveTemplate = (tpl: QuoteTemplate): QuoteTemplate => {
    const selected = getSelectedMaterialsForTemplate(tpl);
    return {
      ...tpl,
      materials: (tpl.materials || []).map((m) => {
        let next = m.perSide ? { ...m, defaultQuantity: getSides(tpl.id, m.id) } : m;
        if (next.itemRole === 'optional' && selected.includes(next.id)) {
          next = { ...next, itemRole: 'base', defaultNote: '', chosenExtra: true };
        }
        return next;
      }),
    };
  };

  // Termék nélküli kategória nem jelenik meg (nincs mit árazni benne)
  const menuCategories = useMemo(
    () =>
      categories
        .filter((c) => c.menuId === selectedMenuId)
        .filter((c) =>
          templates.some(
            (t) => isTemplateInCategory(t, c.id) && t.status !== 'inactive' && t.status !== 'test'
          )
        )
        .sort(byOrder),
    [categories, templates, selectedMenuId]
  );
  const selectedCategory = categories.find((c) => c.id === selectedCategoryId);

  const isTemplateVisible = (t: QuoteTemplate) => {
    const status = t.status || (t.enabled === false ? 'inactive' : 'active');
    if (status === 'inactive') return false;
    if (status === 'test') return showTestTemplates;
    return true;
  };

  const categoryTemplates = templates
    .filter((t) => isTemplateInCategory(t, selectedCategoryId))
    .filter(isTemplateVisible)
    .sort(byOrder);

  // Rövid terméknév a nagybetűs részből (pl. „KEDRY NEOS bioklimatikus pergola” → „KEDRY NEOS”)
  const shortProductName = (name: string) => {
    const words = name.split(' ');
    const idx = words.findIndex((w, i) => i > 0 && /^[a-záéíóöőúüű]/.test(w));
    return (idx > 0 ? words.slice(0, idx) : words).join(' ');
  };

  // Választható beépítések: a kiválasztott termékek alapján (ha még nincs, a kategóriáé),
  // annyi termékkel, ahányan az adott beépítéssel kérhetők (a legjobb elöl)
  const mountBase = (() => {
    const picked = selectedTemplateIds
      .map((id) => templates.find((t) => t.id === id))
      .filter((t): t is QuoteTemplate => Boolean(t));
    return picked.length ? picked : categoryTemplates;
  })();
  const supports = (t: QuoteTemplate, m: MountType) => !t.mountTypes?.length || t.mountTypes.includes(m);
  const mountOptions = (() => {
    const unrestricted = mountBase.length === 0 || mountBase.some((t) => !t.mountTypes?.length);
    const used = new Set(mountBase.flatMap((t) => t.mountTypes || []));
    return MOUNT_TYPES.filter((mt) => unrestricted || used.has(mt.id))
      .map((mt) => ({
        ...mt,
        support: mountBase.filter((t) => supports(t, mt.id)).length,
        products: mountBase
          .filter((t) => t.mountTypes?.length && t.mountTypes.includes(mt.id))
          .map((t) => shortProductName(t.name)),
      }))
      .filter((mt) => unrestricted || mt.support > 0);
  })();

  // Ha a kiválasztás változik, arra a beépítésre vált, amellyel a legtöbb termék kérhető
  useEffect(() => {
    if (!mountOptions.length) return;
    const best = [...mountOptions].sort((a, b) => b.support - a.support)[0];
    const current = mountOptions.find((mt) => mt.id === mountType);
    if (!current || current.support < best.support) setMountType(best.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedCategoryId, selectedTemplateIds.join('|')]);

  const calcCtx = {
    widthCm,
    projectionCm,
    heightCm,
    mountType,
    eurHufRate,
    formula: config.pricingFormula,
  };

  const getSelectedMaterialsForTemplate = (tpl: QuoteTemplate): string[] =>
    selectedMaterialsByTemplate[tpl.id] ||
    (tpl.materials || [])
      .filter((m) => m.defaultSelected !== false)
      .map((m) => m.id);

  // Extrák gyűjteményei: melyik van kinyitva (sablon|gyűjtemény)
  const [openExtraGroups, setOpenExtraGroups] = useState<Record<string, boolean>>({});

  // Opciócsoport: egyet választós (rádió) vagy többet (pl. oldalak)
  const pickChoice = (tpl: QuoteTemplate, memberIds: string[], id: string | null, multi: boolean) => {
    const current = getSelectedMaterialsForTemplate(tpl);
    let next: string[];
    if (multi && id) {
      next = current.includes(id) ? current.filter((x) => x !== id) : [...current, id];
    } else {
      const wasOn = id ? current.includes(id) : false;
      next = current.filter((x) => !memberIds.includes(x));
      if (id && !wasOn) next.push(id);
    }
    setSelectedMaterialsByTemplate((prev) => ({ ...prev, [tpl.id]: next }));
  };

  const toggleMaterialForTemplate = (tpl: QuoteTemplate, matId: string) => {
    const current = getSelectedMaterialsForTemplate(tpl);
    setSelectedMaterialsByTemplate((prev) => ({
      ...prev,
      [tpl.id]: current.includes(matId)
        ? current.filter((id) => id !== matId)
        : [...current, matId],
    }));
  };

  const handleCustomerNameChange = (val: string) => {
    setCustomerName(val);
    // Korábbi ügyfél kiválasztásakor az elérhetőségei is kitöltődnek
    const known = knownCustomers.find((c) => c.name.toLowerCase() === val.trim().toLowerCase());
    if (known) {
      setGreetingName(known.greetingName);
      setGreetingManuallyEdited(false);
      if (known.city) setCity(known.city);
      if (known.email) setEmail(known.email);
      if (known.phone) setPhone(known.phone);
      return;
    }
    if (!greetingManuallyEdited) setGreetingName(val);
  };

  const handleFetchLiveRate = async () => {
    setFetchingRate(true);
    try {
      const res = await fetch('/api/exchange-rate');
      const data = await res.json();
      if (data?.rate) {
        setEurHufRate(Math.round(Number(data.rate)));
        setRateSource(
          [data.source, data.rateDate].filter(Boolean).join(' · ')
        );
      }
    } catch {
      // marad a Beállításokban megadott alapértelmezett
    } finally {
      setFetchingRate(false);
    }
  };

  // Új ajánlatnál mindig az aktuális MNB árfolyammal indulunk
  useEffect(() => {
    handleFetchLiveRate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleToggleTemplate = (tpl: QuoteTemplate) => {
    const cat = categories.find((c) => c.id === tpl.categoryId);
    setSelectedTemplateIds((prev) => {
      if (prev.includes(tpl.id)) return prev.filter((id) => id !== tpl.id);
      // Ha a kategóriában csak egy sablon választható, a többit kivesszük
      if (cat && cat.allowMultipleTemplates === false) {
        const sameCat = templates
          .filter((t) => isTemplateInCategory(t, cat.id))
          .map((t) => t.id);
        return [...prev.filter((id) => !sameCat.includes(id)), tpl.id];
      }
      return [...prev, tpl.id];
    });
  };

  const handleAddManualSection = () => {
    if (!selectedCategory) return;
    setManualSections((prev) => [
      ...prev,
      {
        id: `ms_${Date.now()}`,
        title: `${selectedCategory.name} - egyedi, több modulos`,
        categoryId: selectedCategory.id,
      },
    ]);
  };

  const activeTemplatesToInclude = useMemo(
    () =>
      selectedTemplateIds
        .map((id) => templates.find((t) => t.id === id))
        .filter((t): t is QuoteTemplate => Boolean(t)),
    [templates, selectedTemplateIds]
  );

  const selectionCount = activeTemplatesToInclude.length + manualSections.length;

  const handleProceedToPdfEditor = () => {
    const resolvedCustomer = customerName.trim() || 'Minta Ügyfél';
    const resolvedGreeting =
      (greetingName || customerName).trim() || resolvedCustomer;

    const { blocks, primaryTotalEur, primaryTotalHuf } =
      buildFullQuoteDocumentBlocks({
        customerName: resolvedCustomer,
        greetingName: resolvedGreeting,
        city: city.trim() || 'Budapest',
        inquiryNotes,
        widthCm,
        projectionCm,
        heightCm,
        mountType,
        eurHufRate,
        deliveryFeeHuf,
        selectedTemplates: activeTemplatesToInclude.map(effectiveTemplate),
        selectedMaterialsByTemplate,
        adjustmentsByTemplate,
        manualSections,
        config,
        categories,
      });

    onFinishWizardToEditor({
      customerName: resolvedCustomer,
      greetingName: resolvedGreeting,
      email: email.trim(),
      phone: phone.trim(),
      city: city.trim() || 'Budapest',
      inquiryNotes,
      widthCm,
      projectionCm,
      heightCm,
      mountType,
      eurHufRate,
      deliveryFeeHuf,
      selectedCategoryIds: Array.from(
        new Set([
          ...activeTemplatesToInclude.map((t) => t.categoryId),
          ...manualSections.map((m) => m.categoryId),
        ])
      ),
      selectedTemplateIds: activeTemplatesToInclude.map((t) => t.id),
      blocks: blocks as QuoteDocumentBlock[],
      primaryTotalEur,
      primaryTotalHuf,
    });
  };

  if (categories.length === 0 || templates.length === 0) {
    return (
      <div className={`${card} p-10 text-center space-y-3`}>
        <h2 className="text-base font-semibold text-slate-900">
          Még nincs termék felvéve
        </h2>
        <p className="text-sm text-slate-600">
          Az árazáshoz legalább egy kategória és egy sablon kell.
        </p>
        <button type="button" onClick={onOpenTemplateBuilder} className={btn.primary}>
          <Plus className="w-4 h-4" />
          Termék felvétele
        </button>
      </div>
    );
  }

  const fitOf = (tpl: QuoteTemplate) =>
    checkTemplateFit(tpl, widthCm, projectionCm, heightCm, mountType);

  // Kiválasztott, de a megadott méretben nem gyártható (és nem kézzel jóváhagyott) sablonok
  const blockedSelections = activeTemplatesToInclude.filter(
    (t) => fitOf(t).status === 'out_of_range' && !forcedTemplateIds.includes(t.id)
  );

  // withFit = false: sablonválasztás (3. lépés), true: okos szűrő a méret után (4. lépés)
  const renderTemplateCards = () => (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
      {categoryTemplates.length === 0 && (
        <div className="col-span-full px-4 py-6 text-sm text-slate-500 text-center border border-dashed border-slate-300 rounded-xl">
          Nincs aktív termék ebben a kategóriában.
        </div>
      )}
      {categoryTemplates.map((tpl) => {
        const isSelected = selectedTemplateIds.includes(tpl.id);
        const l = tpl.sizeLimits || {};
        const short = shortProductName(tpl.name);
        const rest = tpl.name.slice(short.length).trim();
        const photo = templateCoverUrl(tpl);
        return (
          <button
            key={tpl.id}
            type="button"
            onClick={() => handleToggleTemplate(tpl)}
            aria-pressed={isSelected}
            className={`relative flex sm:block text-left rounded-xl border overflow-hidden bg-white transition ${
              isSelected ? 'border-slate-900 ring-2 ring-slate-900/10' : 'border-slate-200 hover:border-slate-400'
            }`}
          >
            <div className="w-24 sm:w-auto shrink-0 sm:aspect-[16/10] bg-slate-100">
              {photo && (
                <img src={thumbUrl(photo)} loading="lazy" decoding="async" alt="" className="w-full h-full object-cover" />
              )}
            </div>
            <span
              className={`absolute top-2 right-2 w-7 h-7 rounded-full grid place-items-center border-2 ${
                isSelected ? 'bg-slate-900 border-slate-900 text-white' : 'bg-white/90 border-white text-transparent'
              }`}
              aria-hidden
            >
              <Check className="w-4 h-4" />
            </span>
            <div className="min-w-0 flex-1 p-3 pr-10 sm:pr-3">
              <div className="text-sm font-semibold text-slate-950">
                {short}
                {tpl.status === 'seasonal' && <span className="ml-2 text-xs font-normal text-amber-700">időszakos</span>}
                {tpl.status === 'test' && <span className="ml-2 text-xs font-normal text-violet-700">teszt</span>}
              </div>
              {rest && <div className="text-xs text-slate-500">{rest}</div>}
              {tpl.subtitle && (
                <div className="hidden sm:block text-[13px] text-slate-600 mt-1.5 leading-snug">{tpl.subtitle}</div>
              )}
              <div className="mt-2 flex flex-wrap gap-1">
                {(l.maxWidthCm || l.maxProjectionCm) && (
                  <span className="inline-flex items-center rounded-md bg-slate-100 px-2 py-0.5 text-xs text-slate-600 whitespace-nowrap">
                    max. {l.maxWidthCm || '?'} × {l.maxProjectionCm || '?'} cm
                  </span>
                )}
                {(tpl.mountTypes || []).map((m) => (
                  <span
                    key={m}
                    className="hidden sm:inline-flex items-center rounded-md border border-slate-200 px-2 py-0.5 text-xs text-slate-500 whitespace-nowrap"
                  >
                    {MOUNT_TYPES.find((x) => x.id === m)?.label || m}
                  </span>
                ))}
              </div>
            </div>
          </button>
        );
      })}
    </div>
  );

  // 4. lépés: a kategória termékei + a máshonnan kiválasztottak, rendezve (megfelel → méret → beépítés)
  const mountLabel = (m: MountType) => MOUNT_TYPES.find((x) => x.id === m)?.label || m;
  const renderTemplateList = () => {
    const others = activeTemplatesToInclude.filter((t) => !categoryTemplates.some((c) => c.id === t.id));
    const rank = (tpl: QuoteTemplate) => {
      if (tpl.mountTypes?.length && !tpl.mountTypes.includes(mountType)) return 2;
      return fitOf(tpl).status === 'out_of_range' ? 1 : 0;
    };
    const sorted = [...categoryTemplates].sort((a, b) => rank(a) - rank(b));

    const row = (tpl: QuoteTemplate) => {
      const fit = fitOf(tpl);
      const wrongMount = Boolean(tpl.mountTypes?.length && !tpl.mountTypes.includes(mountType));
      const isOut = !wrongMount && fit.status === 'out_of_range';
      const isForced = forcedTemplateIds.includes(tpl.id);
      const isSelected = selectedTemplateIds.includes(tpl.id);
      const canToggle = isSelected || (!wrongMount && (!isOut || isForced));
      const calc = !wrongMount
        ? calculateTemplateRows(effectiveTemplate(tpl), calcCtx, getSelectedMaterialsForTemplate(tpl))
        : null;
      const rotated = shouldRotate(tpl, widthCm, projectionCm);
      const modules = rotated
        ? getModuleCounts(tpl, projectionCm, widthCm)
        : getModuleCounts(tpl, widthCm, projectionCm);
      const photo = templateCoverUrl(tpl);
      const status = wrongMount
        ? { text: `Csak ${tpl.mountTypes!.map((m) => mountLabel(m).toLowerCase()).join(' / ')} kérhető`, cls: 'text-slate-500' }
        : isOut
        ? { text: `Ebben a méretben nem gyártható: ${fit.reasons.join(' · ')}`, cls: 'text-rose-700 font-medium' }
        : fit.status === 'no_limits'
        ? { text: 'Nincs megadva méretkorlát - ellenőrizd', cls: 'text-amber-700' }
        : {
            text: `Ebben a méretben gyártható${modules.total > 1 ? ` · ${modules.total} modul` : ''}${
              rotated ? ' · elforgatott lamellákkal' : ''
            }`,
            cls: 'text-green-700',
          };
      return (
        <div key={tpl.id} className={`${isSelected ? 'bg-slate-50' : ''} ${wrongMount ? 'opacity-70' : ''}`}>
          <label className={`flex items-center gap-3 px-4 py-3 ${canToggle ? 'cursor-pointer' : 'cursor-default'}`}>
            <input
              type="checkbox"
              checked={isSelected}
              disabled={!canToggle}
              onChange={() => handleToggleTemplate(tpl)}
            />
            {photo && (
              <img
                src={thumbUrl(photo)}
                loading="lazy"
                decoding="async"
                alt=""
                className="w-16 h-12 rounded-lg object-cover border border-slate-200 shrink-0"
              />
            )}
            <div className="min-w-0 flex-1">
              <div className={`text-sm font-medium ${isOut && !isForced ? 'text-rose-800' : 'text-slate-950'}`}>
                {tpl.name}
                {tpl.status === 'seasonal' && <span className="ml-2 text-xs font-normal text-amber-700">időszakos</span>}
                {tpl.status === 'test' && <span className="ml-2 text-xs font-normal text-violet-700">teszt</span>}
              </div>
              <div className={`text-xs break-words ${status.cls}`}>{status.text}</div>
            </div>
            {calc && (
              <div className="text-right shrink-0">
                <div className={`text-sm font-semibold tabular-nums ${isOut && !isForced ? 'text-slate-400' : 'text-slate-950'}`}>
                  {formatDotNumber(calc.totalBaseEur)} EUR
                </div>
                <div className="text-xs text-slate-500 tabular-nums">{formatDotNumber(calc.totalBaseHuf)} Ft</div>
              </div>
            )}
          </label>
          {wrongMount && (
            <div className="px-4 pb-3 -mt-1 pl-11 flex flex-wrap gap-2">
              {tpl.mountTypes!.map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setMountType(m)}
                  className="px-2.5 py-1 rounded-lg border border-slate-300 bg-white text-xs text-slate-700 hover:border-slate-500"
                >
                  Váltás: {mountLabel(m)}
                </button>
              ))}
              {isSelected && (
                <button type="button" onClick={() => handleToggleTemplate(tpl)} className="text-xs text-slate-500 underline">
                  Kiveszem
                </button>
              )}
            </div>
          )}
          {isOut && !isForced && (
            <div className="px-4 pb-3 -mt-1 pl-11 flex flex-wrap gap-3 text-xs">
              <button
                type="button"
                onClick={() => setForcedTemplateIds((prev) => [...prev, tpl.id])}
                className="text-amber-800 underline"
              >
                {isSelected ? 'Mégis megtartom (kézi ellenőrzés)' : 'Mégis kiválasztom'}
              </button>
              {isSelected && (
                <button type="button" onClick={() => handleToggleTemplate(tpl)} className="text-slate-500 underline">
                  Kiveszem
                </button>
              )}
            </div>
          )}
        </div>
      );
    };

    return (
      <div className="space-y-3">
        <div className="divide-y divide-slate-200 border border-slate-200 rounded-xl overflow-hidden">
          {sorted.length === 0 && (
            <div className="px-4 py-6 text-sm text-slate-500 text-center">Nincs aktív termék ebben a kategóriában.</div>
          )}
          {sorted.map(row)}
        </div>
        {others.length > 0 && (
          <div>
            <div className="text-xs font-medium text-slate-500 mb-1.5">Más kategóriából kiválasztva</div>
            <div className="divide-y divide-slate-200 border border-slate-200 rounded-xl overflow-hidden">
              {others.map(row)}
            </div>
          </div>
        )}
      </div>
    );
  };

  const footer = (
    back: WizardStep | null,
    next: React.ReactNode,
    extra?: React.ReactNode
  ) => (
    <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 pt-5 mt-5 border-t border-slate-200">
      {back ? (
        <button type="button" onClick={() => setStep(back)} className={btn.ghost}>
          <ArrowLeft className="w-4 h-4" />
          Vissza
        </button>
      ) : (
        <span />
      )}
      <div className="flex flex-wrap items-center justify-end gap-2 ml-auto">
        {extra}
        {next}
      </div>
    </div>
  );

  const sizeLabel = `${widthCm} × ${projectionCm} × ${heightCm} cm`;

  // Enter egy mezőben = Tovább (szövegdobozban nem)
  const enterToStep = (e: React.KeyboardEvent, next: WizardStep) => {
    if (e.key === 'Enter' && (e.target as HTMLElement).tagName === 'INPUT') {
      e.preventDefault();
      setStep(next);
    }
  };

  return (
    <div className="max-w-4xl mx-auto">
      <PageHeader
        title="Új ajánlat"
        subtitle={
          step >= 4
            ? `${customerName || 'Ügyfél'} · ${sizeLabel}`
            : step > 1
            ? customerName || 'Ügyfél'
            : 'Lépésről lépésre, a végén minden ár átírható.'
        }
      >
        <Stepper steps={STEPS} current={step} onSelect={(n) => setStep(n as WizardStep)} />
      </PageHeader>

      <div className={`${card} p-4 sm:p-6`}>
        {/* 1. ÜGYFÉL */}
        {step === 1 && (
          <>
            <div
              className="grid grid-cols-1 sm:grid-cols-2 gap-4"
              onKeyDown={(e) => enterToStep(e, 2)}
            >
              <div>
                <label className={labelCls}>Ügyfél neve</label>
                <input
                  autoFocus
                  type="text"
                  value={customerName}
                  onChange={(e) => handleCustomerNameChange(e.target.value)}
                  placeholder={knownCustomers.length ? 'Név, vagy korábbi ügyfél' : 'Kovács János'}
                  list="known-customers"
                  autoComplete="off"
                  className={inputCls}
                />
                <datalist id="known-customers">
                  {knownCustomers.map((c) => (
                    <option key={c.name} value={c.name}>
                      {[c.city, c.email || c.phone].filter(Boolean).join(' · ')}
                    </option>
                  ))}
                </datalist>
              </div>
              <div>
                <label className={labelCls}>Megszólítás a PDF-ben</label>
                <input
                  type="text"
                  value={greetingName}
                  onChange={(e) => {
                    setGreetingManuallyEdited(true);
                    setGreetingName(e.target.value);
                  }}
                  placeholder="Kedves …!"
                  className={inputCls}
                />
              </div>
              <div>
                <label className={labelCls}>Település</label>
                <input
                  type="text"
                  value={city}
                  onChange={(e) => setCity(e.target.value)}
                  className={inputCls}
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={labelCls}>E-mail</label>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className={inputCls}
                  />
                </div>
                <div>
                  <label className={labelCls}>Telefon</label>
                  <input
                    type="text"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    className={inputCls}
                  />
                </div>
              </div>
              <div className="sm:col-span-2">
                <label className={labelCls}>Megkeresés szövege (opcionális)</label>
                <textarea
                  rows={2}
                  value={inquiryNotes}
                  onChange={(e) => setInquiryNotes(e.target.value)}
                  placeholder="Ide másolható, amit az ügyfél írt"
                  className={inputCls}
                />
              </div>
            </div>
            {footer(
              null,
              <button type="button" onClick={() => setStep(2)} className={btn.primary}>
                Tovább
                <ArrowRight className="w-4 h-4" />
              </button>
            )}
          </>
        )}

        {/* 2. TERMÉK: menü → kategória (a kategóriára kattintás továbblép) */}
        {step === 2 && (
          <>
            <div className="inline-flex flex-wrap gap-1 p-1 rounded-xl bg-slate-100 border border-slate-200">
              {sortedMenus.map((menu) => (
                <button
                  key={menu.id}
                  type="button"
                  onClick={() => setSelectedMenuId(menu.id)}
                  className={`px-3 py-1.5 rounded-lg text-[13px] transition ${
                    menu.id === selectedMenuId
                      ? 'bg-white text-slate-950 font-semibold shadow-sm'
                      : 'text-slate-600 hover:text-slate-950'
                  }`}
                >
                  {menu.name}
                </button>
              ))}
            </div>

            {menuCategories.length === 0 && (
              <div className="mt-4 px-4 py-6 text-sm text-slate-500 text-center border border-slate-200 rounded-xl">
                Ebben a menüben még nincs kategória.
              </div>
            )}
            <div className="mt-4 grid grid-cols-2 sm:grid-cols-3 gap-3">
              {menuCategories.map((cat) => {
                const picked = selectedTemplateIds.filter(
                  (id) => {
                    const t = templates.find((x) => x.id === id);
                    return Boolean(t && isTemplateInCategory(t, cat.id));
                  }
                ).length;
                const count = templates
                  .filter((t) => isTemplateInCategory(t, cat.id))
                  .filter(isTemplateVisible).length;
                return (
                  <button
                    key={cat.id}
                    type="button"
                    onClick={() => {
                      setSelectedCategoryId(cat.id);
                      setStep(3);
                    }}
                    className={`text-left rounded-xl border overflow-hidden transition hover:border-slate-400 ${
                      cat.id === selectedCategoryId ? 'border-slate-900' : 'border-slate-200'
                    }`}
                  >
                    <div className="aspect-[4/3] bg-slate-50 grid place-items-center overflow-hidden">
                      {cat.imageUrl ? (
                        <img src={thumbUrl(cat.imageUrl)} loading="lazy" decoding="async" alt="" className="w-full h-full object-contain" />
                      ) : (
                        <span className="text-3xl font-semibold text-slate-300">
                          {cat.name.charAt(0)}
                        </span>
                      )}
                    </div>
                    <div className="px-3 py-2.5 border-t border-slate-200">
                      <div className="text-sm font-medium text-slate-950">{cat.name}</div>
                      <div className="text-xs text-slate-500">
                        {picked > 0 ? `${picked} kiválasztva` : `${count} termék`}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
            {footer(1, null)}
          </>
        )}

        {/* 3. SABLON - a kiválasztott kategórián belül */}
        {step === 3 && (
          <>
            {!selectedCategory ? (
              <div className="text-sm text-slate-600">Előbb válassz terméket.</div>
            ) : (
              <>
                <div className="flex items-center justify-between mb-3">
                  <div className="text-sm font-semibold text-slate-950">
                    {selectedCategory.name}
                  </div>
                  <label className="inline-flex items-center gap-1.5 text-xs text-slate-500 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={showTestTemplates}
                      onChange={(e) => setShowTestTemplates(e.target.checked)}
                    />
                    Tesztsablonok
                  </label>
                </div>
                {renderTemplateCards()}
              </>
            )}
            {footer(
              2,
              <button
                type="button"
                disabled={selectionCount === 0}
                onClick={() => setStep(4)}
                className={btn.primary}
              >
                Tovább
                <ArrowRight className="w-4 h-4" />
              </button>,
              <button type="button" onClick={() => setStep(2)} className={`${btn.ghost} whitespace-nowrap`}>
                <Plus className="w-4 h-4" />
                Másik termék
              </button>
            )}
          </>
        )}

        {/* 4. MÉRET (cm) + OKOS SZŰRŐ: minden sablon látszik, ami nem lehetséges, piros */}
        {step === 4 && (
          <>
            <div
              className="grid grid-cols-1 sm:grid-cols-3 gap-4"
              onKeyDown={(e) => enterToStep(e, blockedSelections.length === 0 ? 5 : 4)}
            >
              {(
                [
                  ['Szélesség (cm)', widthCm, setWidthCm],
                  ['Kinyúlás (cm)', projectionCm, setProjectionCm],
                  ['Magasság (cm)', heightCm, setHeightCm],
                ] as [string, number, (v: number) => void][]
              ).map(([label, value, setter], idx) => (
                <div key={label}>
                  <label className={labelCls}>{label}</label>
                  <input
                    autoFocus={idx === 0}
                    type="number"
                    value={value}
                    onChange={(e) => setter(Number(e.target.value))}
                    className={`${inputCls} text-base font-semibold`}
                  />
                  <div className="text-xs text-slate-500 mt-1">
                    {(value / 100).toFixed(2)} m
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-4">
              <div className="flex items-baseline justify-between">
                <label className={labelCls}>Beépítés</label>
                <span className="text-sm text-slate-600">
                  Alapterület:{' '}
                  <span className="font-semibold text-slate-950">
                    {((widthCm / 100) * (projectionCm / 100)).toFixed(1)} m²
                  </span>
                </span>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {mountOptions.map((mt) => (
                  <button
                    key={mt.id}
                    type="button"
                    onClick={() => setMountType(mt.id)}
                    className={`rounded-xl border px-2 py-2 text-left transition ${
                      mountType === mt.id
                        ? 'border-slate-900 bg-slate-50'
                        : 'border-slate-200 hover:border-slate-400'
                    }`}
                  >
                    {mt.imageUrl && (
                      <img src={thumbUrl(mt.imageUrl)} loading="lazy" decoding="async" alt="" className="h-16 w-full object-contain mb-1" />
                    )}
                    <div className="text-[13px] font-medium text-slate-950">{mt.label}</div>
                    {mt.products.length > 0 ? (
                      <div className="text-xs text-slate-500">{mt.products.join(', ')}</div>
                    ) : (
                      !mt.imageUrl && <div className="text-xs text-slate-500">{mt.description}</div>
                    )}
                  </button>
                ))}
              </div>
            </div>

            <details className="mt-4 group">
              <summary className="cursor-pointer text-[13px] text-slate-600 hover:text-slate-950 select-none">
                Árfolyam és szállítás ({eurHufRate} Ft/EUR
                {rateSource ? ` - ${rateSource}` : fetchingRate ? ' - frissítés…' : ' - kézi'} ·{' '}
                {formatDotNumber(deliveryFeeHuf)} Ft)
              </summary>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-3">
                <div>
                  <label className={labelCls}>EUR/HUF árfolyam</label>
                  <div className="flex gap-2">
                    <input
                      type="number"
                      value={eurHufRate}
                      onChange={(e) => {
                        setEurHufRate(Number(e.target.value));
                        setRateSource('');
                      }}
                      className={inputCls}
                    />
                    <button
                      type="button"
                      onClick={handleFetchLiveRate}
                      disabled={fetchingRate}
                      className={btn.secondary}
                      title="Aktuális MNB árfolyam"
                    >
                      <RefreshCw
                        className={`w-3.5 h-3.5 ${fetchingRate ? 'animate-spin' : ''}`}
                      />
                    </button>
                  </div>
                </div>
                <div>
                  <label className={labelCls}>Szállítási díj (Ft)</label>
                  <input
                    type="number"
                    step={5000}
                    value={deliveryFeeHuf}
                    onChange={(e) => setDeliveryFeeHuf(Number(e.target.value))}
                    className={inputCls}
                  />
                </div>
              </div>
            </details>


            {selectedCategory && (
              <div className="mt-6">
                <div className="text-sm font-semibold text-slate-950 mb-1">
                  Mely sablonok jöhetnek szóba ebben a méretben?
                </div>
                <div className="text-[13px] text-slate-500 mb-3">
                  {selectedCategory.name} · ami nem fér bele a méretbe vagy a beépítésbe, a lista végén, indoklással.
                </div>
                {renderTemplateList()}
              </div>
            )}

            {manualSections.length > 0 && (
              <div className="mt-3 space-y-1.5">
                {manualSections.map((ms) => (
                  <div key={ms.id} className="flex items-center gap-2">
                    <input
                      type="text"
                      value={ms.title}
                      onChange={(e) =>
                        setManualSections((prev) =>
                          prev.map((m) =>
                            m.id === ms.id ? { ...m, title: e.target.value } : m
                          )
                        )
                      }
                      className={inputCls}
                    />
                    <button
                      type="button"
                      onClick={() =>
                        setManualSections((prev) => prev.filter((m) => m.id !== ms.id))
                      }
                      className={btn.ghost}
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
            )}

            {selectedCategory && (
              <button
                type="button"
                onClick={handleAddManualSection}
                className={`${btn.ghost} mt-3`}
                title="Nagyon széles méretnél: üres, kézzel árazható szekció"
              >
                <Plus className="w-4 h-4" />
                Egyedi, több modulos ajánlat (kézi ár)
              </button>
            )}

            {blockedSelections.length > 0 && (
              <div className="mt-4 text-[13px] text-rose-700">
                {blockedSelections.map((t) => t.name).join(', ')} ebben a méretben nem
                gyártható. Vedd ki, válassz másikat, vagy jelöld kézi ellenőrzésre.
              </div>
            )}

            {footer(
              3,
              <button
                type="button"
                disabled={selectionCount === 0 || blockedSelections.length > 0}
                onClick={() => setStep(5)}
                className={btn.primary}
              >
                Tovább
                <ArrowRight className="w-4 h-4" />
              </button>
            )}
          </>
        )}

        {/* 5. EXTRÁK & ÁR */}
        {step === 5 && (
          <>
            {selectionCount === 0 && (
              <div className="text-sm text-slate-600">Nincs kiválasztott sablon.</div>
            )}

            <div className="space-y-4">
              {activeTemplatesToInclude.map((tpl) => {
                const activeMatIds = getSelectedMaterialsForTemplate(tpl);
                const calc = calculateTemplateRows(
                  effectiveTemplate(tpl),
                  calcCtx,
                  activeMatIds
                );
                const adjustments = adjustmentsByTemplate[tpl.id] || [];
                const breakdown = computeBlockBreakdown(
                  { id: tpl.id, type: 'template_section', rows: calc.rows, adjustments },
                  eurHufRate
                );
                // A csoportosítás a sablon eredeti szerepe szerint (a bepipált extra a végösszegbe kerül)
                const isExtra = (r: QuoteTableRow) =>
                  tpl.materials.find((m) => m.id === r.materialId)?.itemRole === 'optional';
                const baseRows = calc.rows.filter((r) => !isExtra(r));
                const extraRows = calc.rows.filter(isExtra);

                const matOf = (r: QuoteTableRow) => tpl.materials.find((m) => m.id === r.materialId);
                const isOn = (r: QuoteTableRow) =>
                  Boolean(r.systemRole) || activeMatIds.includes(r.materialId || '');
                const priceText = (r: QuoteTableRow) =>
                  r.itemRole === 'gift'
                    ? 'ajándék'
                    : `${r.itemRole === 'optional' ? '+' : ''}${formatDotNumber(r.discountPriceEur)} EUR`;

                const sidesSelect = (r: QuoteTableRow) => {
                  const mat = matOf(r);
                  if (!mat?.perSide || !isOn(r)) return null;
                  return (
                    <select
                      value={getSides(tpl.id, mat.id)}
                      onChange={(e) =>
                        setSidesByTemplate((prev) => ({
                          ...prev,
                          [tpl.id]: { ...(prev[tpl.id] || {}), [mat.id]: Number(e.target.value) },
                        }))
                      }
                      className="px-2 py-1 rounded-lg border border-slate-300 bg-white text-sm"
                      title="Hány oldalra kéri"
                    >
                      {Array.from({ length: Math.max(1, mat.maxSides || 4) }, (_, i) => i + 1).map((n) => (
                        <option key={n} value={n}>
                          {mat.maxSides === 2
                            ? n === 2
                              ? 'mindkét oldal'
                              : '1 oldal'
                            : n === 4
                            ? 'mind a 4 oldal'
                            : `${n} oldal`}
                        </option>
                      ))}
                    </select>
                  );
                };

                const renderRow = (r: QuoteTableRow) => {
                  const isSystem = Boolean(r.systemRole);
                  const checked = isOn(r);
                  const pres = r.itemRole === 'optional' ? presentExtra(matOf(r) || { name: r.name }, config.extraGroups) : null;
                  return (
                    <label
                      key={r.id}
                      className={`flex flex-wrap items-center gap-x-2.5 gap-y-1 py-1.5 text-sm ${
                        isSystem ? '' : 'cursor-pointer'
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        disabled={isSystem}
                        onChange={() =>
                          r.materialId && toggleMaterialForTemplate(tpl, r.materialId)
                        }
                        className="rounded"
                      />
                      {pres && thumbOf(r) && (
                        <img
                          src={thumbUrl(thumbOf(r))}
                          alt=""
                          loading="lazy"
                          className="w-10 h-10 rounded-md object-cover border border-slate-200 shrink-0"
                        />
                      )}
                      <span
                        className={`min-w-0 flex-1 basis-40 break-words ${
                          checked ? 'text-slate-950' : 'text-slate-600'
                        }`}
                      >
                        {pres ? pres.title : r.name}
                        {pres?.detail && (
                          <span className="block text-xs text-slate-500">{pres.detail}</span>
                        )}
                      </span>
                      <ColorDots colors={r.algorithm?.colorOptions || []} />
                      {sidesSelect(r)}
                      {r.outOfRange && (
                        <AlertTriangle
                          className="w-3.5 h-3.5 text-rose-600"
                          aria-label="A méret kívül esik a táblázaton"
                        />
                      )}
                      <span className="ml-auto pl-3 tabular-nums text-slate-700 whitespace-nowrap">
                        {priceText(r)}
                      </span>
                    </label>
                  );
                };

                // Opciócsoport: cím + választható címkék (pl. „Szélesség oldala”, „3 db”)
                const renderChoice = (title: string, detail: string | undefined, rows: QuoteTableRow[], multi: boolean) => {
                  const ids = rows.map((r) => r.materialId || '');
                  const anyOn = rows.some(isOn);
                  const chip = (active: boolean) =>
                    `inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-[13px] transition ${
                      active
                        ? 'border-slate-900 bg-slate-900 text-white'
                        : 'border-slate-200 bg-white text-slate-700 hover:border-slate-400'
                    }`;
                  return (
                    <div key={`choice_${title}`} className="py-1.5">
                      <div className="text-sm text-slate-950">{title}</div>
                      {detail && <div className="text-xs text-slate-500">{detail}</div>}
                      <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
                        {!multi && (
                          <button type="button" onClick={() => pickChoice(tpl, ids, null, false)} className={chip(!anyOn)}>
                            Nincs
                          </button>
                        )}
                        {rows.map((r) => {
                          const pres = presentExtra(matOf(r) || { name: r.name }, config.extraGroups);
                          const on = isOn(r);
                          return (
                            <button
                              key={r.id}
                              type="button"
                              onClick={() => pickChoice(tpl, ids, r.materialId || null, multi)}
                              className={chip(on)}
                              aria-pressed={on}
                            >
                              {thumbOf(r) && (
                                <img src={thumbUrl(thumbOf(r))} alt="" loading="lazy" className="w-6 h-6 rounded object-cover" />
                              )}
                              {pres.choiceLabel}
                              <span className={`tabular-nums text-xs ${on ? 'text-white/80' : 'text-slate-500'}`}>
                                +{formatDotNumber(r.discountPriceEur)} EUR
                              </span>
                              {r.outOfRange && <AlertTriangle className="w-3.5 h-3.5 text-rose-500" />}
                            </button>
                          );
                        })}
                        {rows.map((r) => sidesSelect(r))}
                      </div>
                    </div>
                  );
                };

                // Extrák gyűjteményekbe rendezve (Világítás, Oldalzárás …), összecsukható szakaszokkal
                const groupNames = sortGroupNames(
                  Array.from(new Set(extraRows.map((r) => presentExtra(matOf(r) || { name: r.name }, config.extraGroups).group))),
                  config.extraGroups
                );
                const groupConfig = (g: string) => (config.extraGroups || []).find((x) => x.name === g);
                const thumbOf = (r: QuoteTableRow) => matOf(r)?.photos?.find((ph) => ph.imageUrl)?.imageUrl;
                const renderGroups = () =>
                  groupNames.map((g) => {
                    const rows = extraRows.filter((r) => presentExtra(matOf(r) || { name: r.name }, config.extraGroups).group === g);
                    const onRows = rows.filter(isOn);
                    const sum = onRows.reduce((acc, r) => acc + (r.discountPriceEur || 0), 0);
                    const key = `${tpl.id}|${g}`;
                    const open = openExtraGroups[key] ?? false;
                    // sorrend megtartásával: opciócsoportok egyszer, a többi tétel külön sorban
                    const seen = new Set<string>();
                    const parts: React.ReactNode[] = [];
                    for (const r of rows) {
                      const pres = presentExtra(matOf(r) || { name: r.name }, config.extraGroups);
                      if (pres.choiceGroup) {
                        if (seen.has(pres.choiceGroup)) continue;
                        seen.add(pres.choiceGroup);
                        const members = rows.filter(
                          (x) => presentExtra(matOf(x) || { name: x.name }, config.extraGroups).choiceGroup === pres.choiceGroup
                        );
                        parts.push(renderChoice(pres.choiceGroup, pres.detail, members, pres.choiceMulti));
                      } else {
                        parts.push(renderRow(r));
                      }
                    }
                    return (
                      <div key={key} className="border-t border-slate-100 first:border-t-0">
                        <button
                          type="button"
                          onClick={() => setOpenExtraGroups((prev) => ({ ...prev, [key]: !open }))}
                          className="w-full flex items-center gap-2 py-2.5 text-left"
                          aria-expanded={open}
                        >
                          <ChevronRight
                            className={`w-4 h-4 text-slate-400 shrink-0 transition-transform ${open ? 'rotate-90' : ''}`}
                          />
                          {groupConfig(g)?.imageUrl && (
                            <img
                              src={thumbUrl(groupConfig(g)?.imageUrl)}
                              alt=""
                              loading="lazy"
                              className="w-9 h-9 rounded-md object-cover border border-slate-200 shrink-0"
                            />
                          )}
                          <span className="min-w-0 flex-1 flex flex-wrap items-baseline gap-x-2">
                            <span className="text-sm font-medium text-slate-950">{g}</span>
                            <span className="text-xs text-slate-500 whitespace-nowrap">
                              {onRows.length > 0 ? `${onRows.length} kiválasztva` : `${rows.length} lehetőség`}
                            </span>
                          </span>
                          {sum > 0 && (
                            <span className="text-sm tabular-nums text-slate-950 whitespace-nowrap">
                              +{formatDotNumber(sum)} EUR
                            </span>
                          )}
                        </button>
                        {open && (
                          <div className="pl-1 sm:pl-6 pb-2">
                            {groupConfig(g)?.description && (
                              <div className="text-xs text-slate-500 -mt-1 mb-1">{groupConfig(g)?.description}</div>
                            )}
                            {parts}
                          </div>
                        )}
                      </div>
                    );
                  });

                return (
                  <div key={tpl.id} className="border border-slate-200 rounded-xl">
                    <div className="flex items-center gap-2 px-4 py-3 border-b border-slate-200">
                      <div className="text-sm font-semibold text-slate-950">
                        {tpl.name}
                      </div>
                      <button
                        type="button"
                        onClick={() =>
                          setSelectedTemplateIds((prev) => prev.filter((id) => id !== tpl.id))
                        }
                        className={`${btn.ghost} ml-auto`}
                        title="Eltávolítás"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                    <div className="px-4 py-2">
                      {baseRows.map(renderRow)}
                      {extraRows.length > 0 && (
                        <div className="mt-3 rounded-lg border border-slate-200 px-3">
                          {renderGroups()}
                        </div>
                      )}
                      <div className="mt-3">
                        <AdjustmentsEditor
                          adjustments={adjustments}
                          onChange={(next) =>
                            setAdjustmentsByTemplate((prev) => ({ ...prev, [tpl.id]: next }))
                          }
                        />
                      </div>
                    </div>
                    <div className="px-4 py-3 border-t border-slate-200 bg-slate-50 rounded-b-xl">
                      <PriceSummaryLine breakdown={breakdown} eurHufRate={eurHufRate} />
                    </div>
                  </div>
                );
              })}

              {manualSections.map((ms) => (
                <div
                  key={ms.id}
                  className="border border-dashed border-slate-300 rounded-xl px-4 py-3 text-sm text-slate-600"
                >
                  <span className="font-medium text-slate-950">{ms.title}</span> - az
                  árat a szerkesztőben adod meg.
                </div>
              ))}
            </div>

            {footer(
              4,
              <button
                type="button"
                disabled={selectionCount === 0}
                onClick={handleProceedToPdfEditor}
                className={btn.primary}
              >
                Ajánlat elkészítése
                <ArrowRight className="w-4 h-4" />
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
}
