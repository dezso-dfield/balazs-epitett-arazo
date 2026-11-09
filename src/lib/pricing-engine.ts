import {
  DEFAULT_PRICING_FORMULA,
  replaceTemplateVariables,
  VariableReplacementContext,
  huList,
  huWith,
  LEGACY_INTRO_TEMPLATES,
  LONG_INTRO_TEMPLATE,
} from './constants';
import {
  CustomMatrixTable,
  DimensionSource,
  M2PriceTier,
  ModuleSplitRule,
  MountType,
  PriceAdjustment,
  PricingFormulaConfig,
  QuoteDocumentBlock,
  SizeAxis,
  QuoteTableRow,
  QuoteTemplate,
  SystemConfig,
  TemplateMaterialItem,
  ProductCategory,
} from './types';
import { stripRich as stripRichText } from './richtext';
import { getDocDesign } from './doc-design';

export function roundHuf(eur: number, rate: number): number {
  return Math.round((eur * rate) / 1000) * 1000;
}

export function computeDimensionValue(
  source: DimensionSource,
  widthCm: number,
  projectionCm: number,
  heightCm: number
): { value: number; unit: string; formatted: string } {
  const wM = Math.max(0.1, (Number(widthCm) || 0) / 100);
  const pM = Math.max(0.1, (Number(projectionCm) || 0) / 100);
  const hM = Math.max(0.1, (Number(heightCm) || 0) / 100);

  switch (source) {
    case 'roof': {
      const m2 = wM * pM;
      return { value: m2, unit: 'm²', formatted: `${m2.toFixed(1)} m²` };
    }
    case 'front_wall': {
      const m2 = wM * hM;
      return { value: m2, unit: 'm²', formatted: `${m2.toFixed(1)} m²` };
    }
    case 'side_wall': {
      const m2 = pM * hM;
      return { value: m2, unit: 'm²', formatted: `${m2.toFixed(1)} m²` };
    }
    case 'both_walls': {
      const m2 = (wM + pM) * hM;
      return { value: m2, unit: 'm²', formatted: `${m2.toFixed(1)} m²` };
    }
    case 'all_walls': {
      const m2 = 2 * (wM + pM) * hM;
      return { value: m2, unit: 'm²', formatted: `${m2.toFixed(1)} m²` };
    }
    case 'width_lm': {
      return { value: wM, unit: 'fm', formatted: `${wM.toFixed(2)} fm` };
    }
    case 'proj_lm': {
      return { value: pM, unit: 'fm', formatted: `${pM.toFixed(2)} fm` };
    }
    case 'height_lm': {
      return { value: hM, unit: 'fm', formatted: `${hM.toFixed(2)} fm` };
    }
    case 'front_side_lm': {
      const fm = wM + pM;
      return { value: fm, unit: 'fm', formatted: `${fm.toFixed(2)} fm` };
    }
    case 'perimeter_lm': {
      const fm = 2 * (wM + pM);
      return { value: fm, unit: 'fm', formatted: `${fm.toFixed(2)} fm` };
    }
    default: {
      const m2 = wM * pM;
      return { value: m2, unit: 'm²', formatted: `${m2.toFixed(1)} m²` };
    }
  }
}

export function createDefaultMaterialAlgorithm(
  overrides?: Partial<TemplateMaterialItem>
): TemplateMaterialItem {
  return {
    id: `mat_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    name: '',
    description: '',
    itemRole: 'base',
    defaultSelected: true,
    pricingMode: 'per_m2',
    currency: 'EUR',
    dimensionSource: 'roof',
    basePrice: 1500,
    unitPrice: 350,
    defaultQuantity: 1,
    unitLabel: 'db',
    m2Tiers: [
      { maxM2: 15, pricePerM2: 400 },
      { maxM2: 25, pricePerM2: 360 },
      { maxM2: 999, pricePerM2: 320 },
    ],
    matrixTable: {
      rowLabel: 'Kinyúlás (cm)',
      colLabel: 'Szélesség (cm)',
      rows: [250, 300, 350, 400],
      cols: [300, 400, 500, 600],
      values: {
        '250': { '300': 2200, '400': 2600, '500': 3100, '600': 3600 },
        '300': { '300': 2500, '400': 2950, '500': 3500, '600': 4100 },
        '350': { '300': 2800, '400': 3300, '500': 3900, '600': 4600 },
        '400': { '300': 3100, '400': 3700, '500': 4350, '600': 5100 },
      },
    },
    percentageRate: 10,
    minPrice: 300,
    multiplier: 1,
    extraDiscountPct: 0,
    fixedSurcharge: 0,
    listPriceMultiplier: 1.25,
    defaultNote: '',
    photos: [],
    ...overrides,
  };
}

// Még ár nélküli tétel (új termék, amíg nincs mérettábla): 0-val számol, az ajánlatban kézzel kell megadni
function hasNoPrice(m: TemplateMaterialItem): boolean {
  if (m.pricingMode === 'fixed') return !Number(m.basePrice) && !Number(m.unitPrice);
  if (m.pricingMode === 'tiered_m2') return !(m.m2Tiers || []).length;
  return false;
}

function lookupTieredM2Price(
  m2: number,
  tiers: M2PriceTier[]
): { total: number; rateUsed: number } {
  if (!tiers || tiers.length === 0) {
    return { total: m2 * 350, rateUsed: 350 };
  }
  const sorted = [...tiers].sort((a, b) => a.maxM2 - b.maxM2);
  for (const tier of sorted) {
    if (m2 <= tier.maxM2) {
      const rate = Math.max(1, Number(tier.pricePerM2) || 350);
      return { total: m2 * rate, rateUsed: rate };
    }
  }
  const last = sorted[sorted.length - 1];
  const fallbackRate = Math.max(1, Number(last?.pricePerM2) || 350);
  return { total: m2 * fallbackRate, rateUsed: fallbackRate };
}

// A táblázat méreteihez illesztés: 'up' = a következő nagyobb méret, 'nearest' = a legközelebbi
function snapToList(value: number, sorted: number[], mode: 'up' | 'nearest'): number {
  if (mode === 'nearest') {
    return sorted.reduce((best, v) =>
      Math.abs(v - value) < Math.abs(best - value) ||
      (Math.abs(v - value) === Math.abs(best - value) && v > best)
        ? v
        : best
    );
  }
  return sorted.find((v) => value <= v) ?? sorted[sorted.length - 1];
}

function lookupCustomMatrixPrice(
  table: CustomMatrixTable | undefined,
  rowCm: number,
  colCm: number,
  rowSnap: 'up' | 'nearest' = 'up',
  colSnap: 'up' | 'nearest' = 'up'
): {
  price: number;
  matchedRow: number;
  matchedCol: number;
  outOfRange: boolean;
} {
  if (!table || !table.rows?.length || !table.cols?.length) {
    return { price: 0, matchedRow: rowCm, matchedCol: colCm, outOfRange: false };
  }
  const sortedRows = [...table.rows].sort((a, b) => a - b);
  const sortedCols = [...table.cols].sort((a, b) => a - b);
  const matchedRow = snapToList(rowCm, sortedRows, rowSnap);
  const matchedCol = snapToList(colCm, sortedCols, colSnap);
  const val = table.values?.[String(matchedRow)]?.[String(matchedCol)];
  return {
    price: Math.max(0, Number(val) || 0),
    matchedRow,
    matchedCol,
    // A táblázat legnagyobb méreténél nagyobb kérés, vagy a gyártónál üresen hagyott
    // (nem gyártható) cella nem árazható a táblából
    outOfRange:
      rowCm > sortedRows[sortedRows.length - 1] ||
      colCm > sortedCols[sortedCols.length - 1] ||
      !(Number(val) > 0),
  };
}

/** A sablon ebben a kategóriában szerepel-e (saját vagy további kategóriaként) */
export function isTemplateInCategory(template: QuoteTemplate, categoryId: string): boolean {
  return template.categoryId === categoryId || Boolean(template.alsoInCategoryIds?.includes(categoryId));
}

/** A sablon modulszabályai tengelyenként (a régi egytengelyes moduleSplit is) */
export function getModuleRules(template: QuoteTemplate): ModuleSplitRule[] {
  const rules = template.moduleSplits?.length
    ? template.moduleSplits
    : template.moduleSplit
    ? [template.moduleSplit]
    : [];
  return rules.filter((r) => r && r.maxCm > 0);
}

function moduleBreakpoints(rule: ModuleSplitRule): number[] {
  return (rule.breakpointsCm || [])
    .map((v) => Number(v))
    .filter((v) => v > 0)
    .sort((a, b) => a - b);
}

/** A modulszabály szerinti legnagyobb méret (pl. 2 modul × 700 cm = 1400 cm), ha van felső határ */
export function moduleRuleMaxCm(rule: ModuleSplitRule): number | undefined {
  const bps = moduleBreakpoints(rule);
  if (bps.length) return bps[bps.length - 1];
  return rule.maxModules ? rule.maxCm * rule.maxModules : undefined;
}

export interface ModuleCounts {
  width: number;
  projection: number;
  total: number;
}

/** Modulszám tengelyenként (pl. ceil(szélesség ÷ 700)), az összes modul a kettő szorzata */
/** Elforgatható szerkezetnél: felcserélt szélesség/kinyúlással kevesebb modul kell-e */
export function shouldRotate(template: QuoteTemplate, widthCm: number, projectionCm: number): boolean {
  if (!template.allowRotate || widthCm === projectionCm) return false;
  // elforgatva is bele kell férnie a méretkorlátba (különben a forgatás „nem gyártható” méretet adna)
  const lim = template.sizeLimits || {};
  if (lim.maxWidthCm && projectionCm > lim.maxWidthCm) return false;
  if (lim.maxProjectionCm && widthCm > lim.maxProjectionCm) return false;
  if (lim.minWidthCm && projectionCm < lim.minWidthCm) return false;
  if (lim.minProjectionCm && widthCm < lim.minProjectionCm) return false;
  return (
    getModuleCounts(template, projectionCm, widthCm).total <
    getModuleCounts(template, widthCm, projectionCm).total
  );
}

export function getModuleCounts(
  template: QuoteTemplate,
  widthCm: number,
  projectionCm: number
): ModuleCounts {
  let width = 1;
  let projection = 1;
  for (const rule of getModuleRules(template)) {
    const dim = Number(rule.axis === 'width' ? widthCm : projectionCm) || 0;
    const bps = moduleBreakpoints(rule);
    let n: number;
    if (bps.length) {
      const idx = bps.findIndex((bp) => dim <= bp);
      n = idx === -1 ? bps.length : idx + 1;
    } else {
      n = Math.max(1, Math.ceil(dim / rule.maxCm));
      if (rule.maxModules) n = Math.min(n, rule.maxModules);
    }
    if (rule.axis === 'width') width = n;
    else projection = n;
  }
  return { width, projection, total: width * projection };
}

export function getModuleCount(template: QuoteTemplate, widthCm: number, projectionCm: number): number {
  return getModuleCounts(template, widthCm, projectionCm).total;
}

/**
 * Egy tétel saját (nettó, modulonkénti) méretei: profillevonások és modulokra bontás után
 */
function effectiveDims(
  item: TemplateMaterialItem,
  modules: ModuleCounts,
  widthCm: number,
  projectionCm: number,
  heightCm: number
): { widthCm: number; projectionCm: number; heightCm: number } {
  const off = item.dimOffsets || {};
  const dims = {
    widthCm: Math.max(1, widthCm + (Number(off.widthCm) || 0)),
    projectionCm: Math.max(1, projectionCm + (Number(off.projectionCm) || 0)),
    heightCm: Math.max(1, heightCm + (Number(off.heightCm) || 0)),
  };
  if (item.splitByModule) {
    dims.widthCm = Math.ceil(dims.widthCm / modules.width);
    dims.projectionCm = Math.ceil(dims.projectionCm / modules.projection);
  }
  const n = ownSplitCount(item, widthCm, projectionCm, heightCm);
  if (n > 1 && item.ownSplit) {
    const key = `${item.ownSplit.axis}Cm` as 'widthCm' | 'projectionCm' | 'heightCm';
    dims[key] = Math.ceil(dims[key] / n);
  }
  return dims;
}

/** Hány darabra bomlik a tétel a saját (forrástermék szerinti) modulszabálya alapján */
function ownSplitCount(item: TemplateMaterialItem, widthCm: number, projectionCm: number, heightCm: number): number {
  if (!item.ownSplit || !(item.ownSplit.maxCm > 0)) return 1;
  const off = item.dimOffsets || {};
  const v =
    item.ownSplit.axis === 'width'
      ? widthCm + (Number(off.widthCm) || 0)
      : item.ownSplit.axis === 'projection'
      ? projectionCm + (Number(off.projectionCm) || 0)
      : heightCm + (Number(off.heightCm) || 0);
  return Math.max(1, Math.ceil(v / item.ownSplit.maxCm));
}

/**
 * Árforrás feloldása: a priceSource-szal hivatkozott tétel árazási mezőit átveszi a forrásból,
 * és hozzáadja a forrástermék szerelési százalékát (a pergolába kért extra sorában benne van a
 * szerelés, az önálló terméknél külön sor). Így ugyanaz a méret mindenhol ugyanazt az árat adja.
 */
export function resolvePriceSources<T extends QuoteTemplate>(templates: T[]): T[] {
  const byId = new Map(templates.map((t) => [t.id, t]));
  for (const t of templates) {
    for (const m of t.materials || []) {
      if (!m.priceSource) continue;
      const srcTpl = byId.get(m.priceSource.templateId);
      const src = srcTpl?.materials?.find((x) => x.id === m.priceSource!.materialId);
      if (!srcTpl || !src || src.priceSource) continue;
      const install = (srcTpl.materials || []).find(
        (x) => x.itemRole === 'base' && /szerel/i.test(x.name) && (x.pricingMode === 'percentage' || x.pricingMode === 'fixed')
      );
      const pct = install?.pricingMode === 'percentage'
        ? Number(install.percentageTiers?.[0]?.percent ?? install.percentageRate) || 0
        : 0;
      // fix összegű szerelés (pl. 300 EUR/db): darabonként hozzáadjuk az átvett árhoz
      const installEach = install?.pricingMode === 'fixed' ? Number(install.basePrice) || 0 : 0;
      const k = 1 + pct / 100;
      const widthSplit = src.splitByModule
        ? (srcTpl.moduleSplits || []).find((s) => s.axis === 'width')
        : undefined;
      Object.assign(m, {
        pricingMode: src.pricingMode,
        currency: src.currency,
        dimensionSource: src.dimensionSource,
        matrixTable: src.matrixTable,
        matrixRowAxis: src.matrixRowAxis,
        matrixColAxis: src.matrixColAxis,
        matrixRowSnap: src.matrixRowSnap,
        matrixColSnap: src.matrixColSnap,
        m2Tiers: src.m2Tiers,
        unitPrice: src.unitPrice,
        basePrice: src.basePrice,
        minPrice: src.minPrice,
        listPriceMultiplier: src.listPriceMultiplier,
        multiplier: Math.round((Number(src.multiplier) || 1) * k * 10000) / 10000,
        fixedSurcharge: Math.round((Number(src.fixedSurcharge) || 0) * k * 100) / 100,
        surchargeEur: (Number(src.surchargeEur) || 0) * k + installEach,
        extraDiscountPct: src.extraDiscountPct || 0,
        dimOffsets: src.dimOffsets,
        // ha a forrásnak van saját modulszabálya, az érvényes; különben marad a pergola modulja
        splitByModule: widthSplit?.maxCm ? false : m.splitByModule,
        ownSplit: widthSplit?.maxCm ? { axis: 'width' as SizeAxis, maxCm: widthSplit.maxCm } : m.ownSplit,
      });
    }
  }
  return templates;
}

const axisValue = (
  axis: SizeAxis | undefined,
  fallback: SizeAxis,
  dims: { widthCm: number; projectionCm: number; heightCm: number }
) => {
  const a = axis || fallback;
  return a === 'width' ? dims.widthCm : a === 'projection' ? dims.projectionCm : dims.heightCm;
};

/** Ez a tétel szerepel-e az adott modulszámnál */
const fitsModules = (m: TemplateMaterialItem, modules: ModuleCounts) =>
  (!m.minModules || modules.total >= m.minModules) &&
  (!m.maxModules || modules.total <= m.maxModules) &&
  (!m.modulesWidth || modules.width === m.modulesWidth) &&
  (!m.modulesProjection || modules.projection === m.modulesProjection);

function applyModifiers(rawAmount: number, item: TemplateMaterialItem): number {
  const mult =
    item.multiplier !== undefined && item.multiplier > 0 ? item.multiplier : 1;
  const discPct = Math.min(95, Math.max(0, Number(item.extraDiscountPct) || 0));
  const surcharge = Number(item.fixedSurcharge) || 0;
  const afterMult = rawAmount * mult;
  const afterDisc = afterMult * (1 - discPct / 100);
  const total = afterDisc + surcharge;
  const minP = Math.max(0, Number(item.minPrice) || 0);
  return Math.max(1, minP, Math.round(total));
}

export interface CalculationContext {
  widthCm: number;
  projectionCm: number;
  heightCm: number;
  mountType: MountType;
  eurHufRate: number;
  formula?: PricingFormulaConfig;
}

export function resolvePricingFormula(
  global: PricingFormulaConfig | undefined,
  override?: Partial<PricingFormulaConfig>
): PricingFormulaConfig {
  return {
    ...DEFAULT_PRICING_FORMULA,
    ...(global || {}),
    ...(override || {}),
  };
}

/**
 * Haszon ráépítése egy katalógusárra (százalékos módoknál). Fix módban 0-t ad vissza,
 * azt a sablon szintjén osztjuk el.
 */
function applyPercentProfit(costEur: number, formula: PricingFormulaConfig): number {
  const x = Math.max(0, Number(formula.profitValue) || 0);
  if (formula.profitMode === 'markup_percent') {
    return Math.round(costEur * (1 + x / 100));
  }
  if (formula.profitMode === 'margin_percent') {
    const pct = Math.min(90, x);
    return Math.round(costEur / (1 - pct / 100));
  }
  return costEur;
}

export function computeAssemblyEur(
  formula: PricingFormulaConfig,
  widthCm: number,
  projectionCm: number
): { amount: number; formulaSummary: string } {
  const x = Math.max(0, Number(formula.assemblyFixedEur) || 0);
  const y = Math.max(0, Number(formula.assemblyPerM2Eur) || 0);
  const m2 = ((Number(widthCm) || 0) / 100) * ((Number(projectionCm) || 0) / 100);
  return {
    amount: Math.round(x + y * m2),
    formulaSummary: `Szerelés képlet: ${x} EUR + ${y} EUR/m² × ${m2.toFixed(1)} m²`,
  };
}

/**
 * Okos szűrő: belefér-e a kért méret a sablon (egy modul) méretkorlátaiba és mérettábláiba.
 * status: 'ok' | 'no_limits' (nincs megadva korlát) | 'out_of_range'
 */
export function checkTemplateFit(
  template: QuoteTemplate,
  widthCm: number,
  projectionCm: number,
  heightCm: number,
  mountType?: MountType
): { status: 'ok' | 'no_limits' | 'out_of_range'; reasons: string[] } {
  if (shouldRotate(template, widthCm, projectionCm)) {
    return checkTemplateFit({ ...template, allowRotate: false }, projectionCm, widthCm, heightCm, mountType);
  }
  const lim = template.sizeLimits || {};
  const reasons: string[] = [];
  const check = (
    value: number,
    min: number | undefined,
    max: number | undefined,
    label: string
  ) => {
    if (min && value < min) reasons.push(`${label} min. ${min} cm (kért: ${value} cm)`);
    if (max && value > max) reasons.push(`${label} max. ${max} cm (kért: ${value} cm)`);
  };
  if (mountType && template.mountTypes?.length && !template.mountTypes.includes(mountType)) {
    reasons.push(`„${mountType}” beépítéssel nem kérhető (csak: ${template.mountTypes.join(', ')})`);
  }
  check(widthCm, lim.minWidthCm, lim.maxWidthCm, 'Szélesség');
  check(projectionCm, lim.minProjectionCm, lim.maxProjectionCm, 'Kinyúlás');
  check(heightCm, lim.minHeightCm, lim.maxHeightCm, 'Magasság');

  // Modulszabályok: legfeljebb N modul × egy modul max. mérete
  for (const rule of getModuleRules(template)) {
    const max = moduleRuleMaxCm(rule);
    if (!max) continue;
    const dim = rule.axis === 'width' ? widthCm : projectionCm;
    if (dim > max) {
      const bps = moduleBreakpoints(rule);
      const how = bps.length
        ? `${bps.length} modulig`
        : `${rule.maxModules} modul × ${rule.maxCm} cm`;
      reasons.push(
        `${rule.axis === 'width' ? 'Szélesség' : 'Kinyúlás'} max. ${max} cm (${how}, kért: ${dim} cm)`
      );
    }
  }

  // Feltételes korlátok (beépítéstől / mérettől függő maximumok)
  for (const rule of template.sizeRules || []) {
    if (rule.mountType && rule.mountType !== mountType) continue;
    if (rule.ifWidthOverCm && !(widthCm > rule.ifWidthOverCm)) continue;
    if (rule.ifProjectionOverCm && !(projectionCm > rule.ifProjectionOverCm)) continue;
    const why = rule.label ? ` - ${rule.label}` : '';
    if (rule.maxWidthCm && widthCm > rule.maxWidthCm)
      reasons.push(`Szélesség max. ${rule.maxWidthCm} cm (kért: ${widthCm} cm)${why}`);
    if (rule.maxProjectionCm && projectionCm > rule.maxProjectionCm)
      reasons.push(`Kinyúlás max. ${rule.maxProjectionCm} cm (kért: ${projectionCm} cm)${why}`);
    if (rule.maxHeightCm && heightCm > rule.maxHeightCm)
      reasons.push(`Magasság max. ${rule.maxHeightCm} cm (kért: ${heightCm} cm)${why}`);
  }

  const modules = getModuleCounts(template, widthCm, projectionCm);
  // Van ártábla ehhez a beépítéshez, de egyik sem ehhez a modulkiosztáshoz
  const mountTables = (template.materials || []).filter(
    (m) =>
      m.itemRole === 'base' &&
      m.pricingMode === 'matrix_cm' &&
      (!mountType || !m.mountTypes?.length || m.mountTypes.includes(mountType))
  );
  if (mountTables.length && !mountTables.some((m) => fitsModules(m, modules))) {
    reasons.push(
      `Nincs ártábla ${modules.width} × ${modules.projection} modulos kiosztásra${
        mountType ? ` „${mountType}” beépítésnél` : ''
      }`
    );
  }
  for (const m of template.materials || []) {
    if (m.itemRole !== 'base' || m.pricingMode !== 'matrix_cm') continue;
    // A másik beépítési mód / modulszám mérettáblája nem számít
    if (mountType && m.mountTypes?.length && !m.mountTypes.includes(mountType)) continue;
    if (!fitsModules(m, modules)) continue;
    const d = effectiveDims(m, modules, widthCm, projectionCm, heightCm);
    const lookup = lookupCustomMatrixPrice(
      m.matrixTable,
      axisValue(m.matrixRowAxis, 'projection', d),
      axisValue(m.matrixColAxis, 'width', d),
      m.matrixRowSnap,
      m.matrixColSnap
    );
    if (lookup.outOfRange) {
      reasons.push(`„${m.name}” mérettáblája nem fedi le ezt a méretet`);
    }
  }
  for (const m of template.materials || []) {
    if (m.itemRole !== 'base' || !hasNoPrice(m)) continue;
    if (mountType && m.mountTypes?.length && !m.mountTypes.includes(mountType)) continue;
    reasons.push(`„${m.name}” ára még nincs megadva (az ajánlatban kézzel add meg)`);
  }

  if (reasons.length > 0) return { status: 'out_of_range', reasons };
  const hasAnyLimit =
    Object.values(lim).some((v) => Number(v) > 0) ||
    Boolean(template.sizeRules?.length) ||
    getModuleRules(template).some((r) => moduleRuleMaxCm(r));
  return { status: hasAnyLimit ? 'ok' : 'no_limits', reasons: [] };
}

/**
 * Egy szekció végösszege: bekapcsolt alaptételek + árkorrekciók, vagy a kézi végösszeg.
 */
export function computeBlockTotals(
  block: Pick<QuoteDocumentBlock, 'rows' | 'adjustments' | 'manualTotalEur' | 'manualTotalHuf'>,
  eurHufRate: number
): {
  rowsTotalEur: number;
  adjustmentsEur: number;
  hiddenAdjustmentsEur: number;
  totalEur: number;
  totalHuf: number;
} {
  const rate = Math.max(1, Number(eurHufRate) || 400);
  const rowsTotalEur = (block.rows || [])
    .filter((r) => r.included && r.itemRole === 'base')
    .reduce((sum, r) => sum + (Number(r.discountPriceEur) || 0), 0);
  const adjustments = block.adjustments || [];
  const adjustmentsEur = adjustments.reduce(
    (sum, a) => sum + (Number(a.amountEur) || 0),
    0
  );
  const hiddenAdjustmentsEur = adjustments
    .filter((a) => !a.visibleToCustomer)
    .reduce((sum, a) => sum + (Number(a.amountEur) || 0), 0);
  const isSet = (v: number | null | undefined) =>
    v !== null && v !== undefined && !Number.isNaN(Number(v));
  // Forintban megadott kézi végösszeg: a Ft pontosan ennyi, az EUR ebből számolódik
  if (isSet(block.manualTotalHuf)) {
    const totalHuf = Math.round(Number(block.manualTotalHuf));
    return {
      rowsTotalEur,
      adjustmentsEur,
      hiddenAdjustmentsEur,
      totalEur: Math.round(totalHuf / rate),
      totalHuf,
    };
  }
  const totalEur = isSet(block.manualTotalEur)
    ? Math.round(Number(block.manualTotalEur))
    : rowsTotalEur + adjustmentsEur;
  return {
    rowsTotalEur,
    adjustmentsEur,
    hiddenAdjustmentsEur,
    totalEur,
    totalHuf: roundHuf(totalEur, rate),
  };
}

/**
 * Belső (csak nekünk látható) bontás: katalógusár, haszon, szerelés, korrekciók.
 */
export function computeBlockBreakdown(
  block: QuoteDocumentBlock,
  eurHufRate: number
): {
  catalogEur: number;
  profitEur: number;
  assemblyEur: number;
  manualRowsEur: number;
  adjustmentsEur: number;
  totalEur: number;
  totalHuf: number;
} {
  let catalogEur = 0;
  let profitEur = 0;
  let assemblyEur = 0;
  let manualRowsEur = 0;
  for (const r of block.rows || []) {
    if (!r.included || r.itemRole !== 'base') continue;
    const price = Number(r.discountPriceEur) || 0;
    if (r.systemRole === 'assembly') {
      assemblyEur += price;
    } else if (r.costEur === undefined) {
      manualRowsEur += price;
    } else {
      catalogEur += r.costEur;
      profitEur += price - r.costEur;
    }
  }
  const totals = computeBlockTotals(block, eurHufRate);
  return {
    catalogEur,
    profitEur,
    assemblyEur,
    manualRowsEur,
    adjustmentsEur: totals.adjustmentsEur,
    totalEur: totals.totalEur,
    totalHuf: totals.totalHuf,
  };
}

export function createPriceAdjustment(
  overrides?: Partial<PriceAdjustment>
): PriceAdjustment {
  return {
    id: `adj_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    label: 'Egyedi árkorrekció',
    amountEur: 0,
    reason: '',
    visibleToCustomer: false,
    ...overrides,
  };
}

/**
 * Kiszámolja egy sablon összes termékét/anyagát kizárólag a beállított algoritmusok alapján,
 * és visszaadja a táblázatsorokat + összesítéseket. Soha nem enged 0 EUR árat (kivéve Ajándék kedvezményes ár).
 */
export function calculateTemplateRows(
  template: QuoteTemplate,
  ctx: CalculationContext,
  selectedMaterialIds?: string[]
): {
  rows: QuoteTableRow[];
  totalBaseEur: number;
  totalBaseHuf: number;
} {
  const { widthCm, projectionCm, heightCm, eurHufRate } = ctx;
  const rate = Math.max(1, Number(eurHufRate) || 400);
  const formula = resolvePricingFormula(ctx.formula, template.pricingOverride);

  // Ha egy sablonban véletlenül csak 'percentage' tétel lenne alaptétel nélkül,
  // az első tételt automatikusan m² alapú algoritmusként kezeljük, hogy mindig legyen valódi alapár!
  const hasNonPercentageBase = template.materials.some(
    (m) => m.pricingMode !== 'percentage' && m.itemRole === 'base'
  );

  // A más beépítési módhoz / modulszámhoz tartozó tételek (pl. szabadon álló mérettábla,
  // 2 modulos felár) kimaradnak
  // Elforgatott szerkezet: a szerkezet saját tételei felcserélt méretekkel, az oldalsó extrák a valódi oldalakkal
  const rotated = shouldRotate(template, widthCm, projectionCm);
  const structW = rotated ? projectionCm : widthCm;
  const structP = rotated ? widthCm : projectionCm;
  const modules = getModuleCounts(template, structW, structP);
  const mountMaterials = template.materials.filter(
    (m) =>
      (!m.mountTypes?.length || m.mountTypes.includes(ctx.mountType)) &&
      fitsModules(m, modules)
  );

  const normalizedMaterials: TemplateMaterialItem[] = mountMaterials.map(
    (m, idx) => {
      if (!hasNonPercentageBase && idx === 0 && m.pricingMode === 'percentage') {
        return {
          ...m,
          pricingMode: 'per_m2',
          unitPrice: Math.max(1, Number(m.unitPrice) || 350),
        };
      }
      return m;
    }
  );

  const nonPercentageItems = normalizedMaterials.filter(
    (m) => m.pricingMode !== 'percentage'
  );
  const percentageItems = normalizedMaterials.filter(
    (m) => m.pricingMode === 'percentage'
  );

  const rowsById: Record<string, QuoteTableRow> = {};
  let runningBaseSubtotalEur = 0;

  // 1. Először a nem-százalékos tételeket számoljuk ki az algoritmusuk alapján
  for (const item of nonPercentageItems) {
    const isIncluded = selectedMaterialIds
      ? selectedMaterialIds.includes(item.id)
      : item.defaultSelected !== false;

    const moduleMult =
      (item.splitByModule ? modules.total : 1) * (item.perModule ? modules.total : 1);
    const qty =
      Math.max(1, Number(item.defaultQuantity) || 1) *
      moduleMult *
      ownSplitCount(item, widthCm, projectionCm, heightCm);
    const ownStructure = rotated && item.itemRole === 'base' && !item.chosenExtra && !item.priceSource;
    const ed = ownStructure
      ? effectiveDims(item, modules, structW, structP, heightCm)
      : effectiveDims(item, modules, widthCm, projectionCm, heightCm);
    const dim = computeDimensionValue(
      item.dimensionSource || 'roof',
      ed.widthCm,
      ed.projectionCm,
      ed.heightCm
    );
    const curr = item.currency || 'EUR';

    let rawPrice = 0;
    let quantityLabel = `${qty} ${item.unitLabel || 'db'}`;
    let formulaSummary = '';
    let outOfRange = false;

    if (hasNoPrice(item)) {
      quantityLabel =
        item.pricingMode === 'tiered_m2' ? dim.formatted : `${qty} ${item.unitLabel || 'db'}`;
      formulaSummary = 'Nincs ár megadva - add meg kézzel';
    } else switch (item.pricingMode) {
      case 'fixed': {
        const unitBase = Math.max(
          1,
          Number(item.basePrice) || Number(item.unitPrice) || 1500
        );
        rawPrice = unitBase * qty;
        quantityLabel = `${qty} ${item.unitLabel || 'db'}`;
        formulaSummary = `Fix darabár: ${qty} ${item.unitLabel || 'db'} × ${unitBase} ${curr}`;
        break;
      }
      case 'per_m2': {
        const uPrice = Math.max(1, Number(item.unitPrice) || 350);
        rawPrice = dim.value * uPrice * qty;
        quantityLabel =
          qty > 1 ? `${qty} × ${dim.formatted}` : dim.formatted;
        formulaSummary = `m² algoritmus: ${dim.formatted} × ${uPrice} ${curr}/m²${
          qty > 1 ? ` × ${qty} db` : ''
        }`;
        break;
      }
      case 'tiered_m2': {
        const tiered = lookupTieredM2Price(dim.value, item.m2Tiers || []);
        rawPrice = tiered.total * qty;
        quantityLabel =
          qty > 1 ? `${qty} × ${dim.formatted}` : dim.formatted;
        formulaSummary = `Sávos m² algoritmus: ${dim.formatted} × ${tiered.rateUsed} ${curr}/m²`;
        break;
      }
      case 'base_plus_m2': {
        const bPrice = Math.max(0, Number(item.basePrice) || 1000);
        const uPrice = Math.max(1, Number(item.unitPrice) || 220);
        rawPrice = (bPrice + dim.value * uPrice) * qty;
        quantityLabel = `${dim.formatted}`;
        formulaSummary = `Alap + m² algoritmus: ${bPrice} ${curr} + (${dim.formatted} × ${uPrice} ${curr}/m²)`;
        break;
      }
      case 'per_lm': {
        const uPrice = Math.max(1, Number(item.unitPrice) || 180);
        rawPrice = dim.value * uPrice * qty;
        quantityLabel =
          qty > 1 ? `${qty} × ${dim.formatted}` : dim.formatted;
        formulaSummary = `Folyóméter algoritmus: ${dim.formatted} × ${uPrice} ${curr}/fm${
          qty > 1 ? ` × ${qty} db` : ''
        }`;
        break;
      }
      case 'base_plus_lm': {
        const bPrice = Math.max(0, Number(item.basePrice) || 600);
        const uPrice = Math.max(1, Number(item.unitPrice) || 150);
        rawPrice = (bPrice + dim.value * uPrice) * qty;
        quantityLabel = `${dim.formatted}`;
        formulaSummary = `Alap + fm algoritmus: ${bPrice} ${curr} + (${dim.formatted} × ${uPrice} ${curr}/fm)`;
        break;
      }
      case 'matrix_cm': {
        const matrixLookup = lookupCustomMatrixPrice(
          item.matrixTable,
          axisValue(item.matrixRowAxis, 'projection', ed),
          axisValue(item.matrixColAxis, 'width', ed),
          item.matrixRowSnap,
          item.matrixColSnap
        );
        const fallbackM2Price = Math.round(
          dim.value * Math.max(1, Number(item.unitPrice) || 350)
        );
        const effectiveMatrixPrice =
          matrixLookup.price > 0 ? matrixLookup.price : fallbackM2Price;
        rawPrice = effectiveMatrixPrice * qty;
        {
          // A Méret oszlopban azok a méretek, amelyekkel a táblázatból az ár jön (pl. ZIP: szélesség × magasság)
          const used = (['width', 'projection', 'height'] as SizeAxis[]).filter(
            (a) => a === (item.matrixRowAxis || 'projection') || a === (item.matrixColAxis || 'width')
          );
          const size = used.map((a) => axisValue(a, a, ed)).join('×') + ' cm';
          const sides = Math.max(1, Number(item.defaultQuantity) || 1);
          const parts = qty / sides;
          quantityLabel =
            (parts > 1 ? `${parts} × ${size}` : size) +
            (item.perSide && sides > 1 ? ` (${sides} oldal)` : qty > 1 && parts === 1 ? ` (${qty} db)` : '');
        }
        formulaSummary = `Mérettábla algoritmus (${matrixLookup.matchedCol}×${matrixLookup.matchedRow} cm): ${effectiveMatrixPrice} ${curr} × ${qty} db${
          matrixLookup.outOfRange
            ? ' ⚠ A kért méret nagyobb, mint a táblázat - kézi ellenőrzés szükséges!'
            : ''
        }`;
        outOfRange = matrixLookup.outOfRange;
        break;
      }
      default: {
        const uPrice = Math.max(1, Number(item.unitPrice) || 350);
        rawPrice = dim.value * uPrice * qty;
        quantityLabel = dim.formatted;
        formulaSummary = `m² algoritmus: ${dim.formatted} × ${uPrice} ${curr}/m²`;
      }
    }

    const noPrice = hasNoPrice(item);
    const modifiedPrice = noPrice ? 0 : applyModifiers(rawPrice, item);
    const surchargeEur = Math.round((Number(item.surchargeEur) || 0) * qty);
    const costInEur = noPrice
      ? 0
      : (item.currency === 'HUF'
          ? Math.max(1, Math.round(modifiedPrice / rate))
          : Math.max(1, modifiedPrice)) + surchargeEur;
    if (surchargeEur) formulaSummary += ` + ${surchargeEur} EUR felár`;
    const priceInEur = noPrice ? 0 : applyPercentProfit(costInEur, formula);

    const listMult =
      item.listPriceMultiplier && item.listPriceMultiplier > 0
        ? item.listPriceMultiplier
        : 1.25;
    const listPriceEur = Math.max(
      priceInEur,
      Math.round(priceInEur * listMult)
    );

    const discountPriceEur = item.itemRole === 'gift' ? 0 : priceInEur;

    if (isIncluded && item.itemRole === 'base' && !item.excludeFromPercentBase) {
      // A százalékos tételek (pl. szerelési %) a katalógusárakból számolnak
      runningBaseSubtotalEur += costInEur;
    }

    rowsById[item.id] = {
      id: `row_${item.id}_${Math.random().toString(36).slice(2, 6)}`,
      materialId: item.id,
      chosenExtra: item.chosenExtra || undefined,
      name: item.name,
      description: item.description || '',
      quantityLabel,
      listPriceEur,
      discountPriceEur,
      formulaSummary,
      currency: item.currency || 'EUR',
      itemRole: item.itemRole || 'base',
      included: isIncluded,
      note:
        item.defaultNote !== undefined
          ? item.defaultNote
          : item.itemRole === 'gift'
          ? 'Ajándék'
          : item.itemRole === 'optional'
          ? 'Opció'
          : '',
      photos: (item.photos || []).map((p) => ({ ...p })),
      algorithm: JSON.parse(JSON.stringify(item)),
      costEur: item.itemRole === 'gift' ? 0 : costInEur,
      outOfRange,
    };
  }

  // 2. Most a százalékos tételeket (pl. Szerelési munkadíj) számoljuk ki az alaptételek összegéből
  for (const item of percentageItems) {
    const isIncluded = selectedMaterialIds
      ? selectedMaterialIds.includes(item.id)
      : item.defaultSelected !== false;

    let pct = Math.max(1, Number(item.percentageRate) || 10);
    if (item.percentageTiers && item.percentageTiers.length > 0) {
      const sorted = [...item.percentageTiers].sort(
        (a, b) => a.maxAmount - b.maxAmount
      );
      let matched = sorted[sorted.length - 1].percent;
      for (const t of sorted) {
        if (runningBaseSubtotalEur <= t.maxAmount) {
          matched = t.percent;
          break;
        }
      }
      pct = Math.max(1, matched);
    }

    const baseForPct =
      runningBaseSubtotalEur > 0
        ? runningBaseSubtotalEur
        : Math.round(
            computeDimensionValue('roof', widthCm, projectionCm, heightCm)
              .value * 350
          );
    const rawEur = Math.round(baseForPct * (pct / 100));
    const minEur =
      item.currency === 'HUF'
        ? Math.round(Math.max(1, Number(item.minPrice) || 80000) / rate)
        : Math.max(1, Number(item.minPrice) || 250);
    const finalEur = Math.max(
      1,
      minEur,
      rawEur + (Number(item.fixedSurcharge) || 0)
    );
    const pricedEur = applyPercentProfit(finalEur, formula);
    const discountPriceEur = item.itemRole === 'gift' ? 0 : pricedEur;

    if (isIncluded && item.itemRole === 'base' && !item.excludeFromPercentBase) {
      runningBaseSubtotalEur += finalEur;
    }

    const listMult =
      item.listPriceMultiplier && item.listPriceMultiplier > 0
        ? item.listPriceMultiplier
        : 1.25;

    rowsById[item.id] = {
      id: `row_${item.id}_${Math.random().toString(36).slice(2, 6)}`,
      materialId: item.id,
      chosenExtra: item.chosenExtra || undefined,
      name: item.name,
      description: item.description || '',
      quantityLabel: `${pct}%`,
      listPriceEur: Math.max(pricedEur, Math.round(pricedEur * listMult)),
      discountPriceEur,
      costEur: item.itemRole === 'gift' ? 0 : finalEur,
      formulaSummary: `Százalékos algoritmus: alaptételek ${pct}%-a (min. ${minEur} EUR)`,
      currency: 'EUR',
      itemRole: item.itemRole || 'base',
      included: isIncluded,
      note: item.defaultNote || '',
      photos: (item.photos || []).map((p) => ({ ...p })),
      algorithm: JSON.parse(JSON.stringify(item)),
    };
  }

  // Tartjuk az eredeti sorrendet
  const orderedRows: QuoteTableRow[] = normalizedMaterials
    .map((m) => rowsById[m.id])
    .filter(Boolean);

  // 3. Fix összegű haszon: arányosan elosztva a bekapcsolt alaptételeken
  if (formula.profitMode === 'fixed' && Number(formula.profitValue) > 0) {
    const targets = orderedRows.filter(
      (r) => r.included && r.itemRole === 'base' && (r.costEur || 0) > 0
    );
    const costSum = targets.reduce((sum, r) => sum + (r.costEur || 0), 0);
    let remaining = Math.round(Number(formula.profitValue));
    targets.forEach((r, idx) => {
      const share =
        idx === targets.length - 1
          ? remaining
          : Math.round((Number(formula.profitValue) * (r.costEur || 0)) / costSum);
      remaining -= share;
      const listRatio = r.discountPriceEur > 0 ? r.listPriceEur / r.discountPriceEur : 1.25;
      r.discountPriceEur += share;
      r.listPriceEur = Math.round(r.discountPriceEur * listRatio);
    });
  }

  // 4. Szerelés a képletből (X + Y × m²) külön sorként
  const assembly = computeAssemblyEur(formula, widthCm, projectionCm);
  if (assembly.amount > 0) {
    orderedRows.push({
      id: `row_assembly_${template.id}_${Math.random().toString(36).slice(2, 6)}`,
      name: formula.assemblyLabel || 'Helyszíni összeszerelés',
      description: '',
      quantityLabel: computeDimensionValue('roof', widthCm, projectionCm, heightCm)
        .formatted,
      listPriceEur: assembly.amount,
      discountPriceEur: assembly.amount,
      formulaSummary: assembly.formulaSummary,
      currency: 'EUR',
      itemRole: 'base',
      included: true,
      note: '',
      photos: [],
      systemRole: 'assembly',
    });
  }

  const totalBaseEur = orderedRows
    .filter((r) => r.included && r.itemRole === 'base')
    .reduce((sum, r) => sum + (Number(r.discountPriceEur) || 0), 0);

  const totalBaseHuf = roundHuf(totalBaseEur, rate);

  return {
    rows: orderedRows,
    totalBaseEur,
    totalBaseHuf,
  };
}

/**
 * Egyetlen sablonból elkészít egy teljes, szerkeszthető QuoteDocumentBlock szekciót
 */
export function buildEditableBlockFromTemplate(
  template: QuoteTemplate,
  indexNumber: number,
  ctx: CalculationContext & VariableReplacementContext,
  config: SystemConfig,
  selectedMaterialIds?: string[],
  adjustments?: PriceAdjustment[]
): QuoteDocumentBlock {
  const calc = calculateTemplateRows(
    template,
    { ...ctx, formula: ctx.formula || config.pricingFormula },
    selectedMaterialIds
  );
  const blockAdjustments = (adjustments || []).map((a) => ({ ...a }));
  const totals = computeBlockTotals(
    { rows: calc.rows, adjustments: blockAdjustments },
    ctx.eurHufRate
  );

  const varCtx: VariableReplacementContext = {
    customerName: ctx.customerName,
    greetingName: ctx.greetingName,
    city: ctx.city,
    widthCm: ctx.widthCm,
    projectionCm: ctx.projectionCm,
    heightCm: ctx.heightCm,
    mountType: ctx.mountType,
    eurHufRate: ctx.eurHufRate,
    deliveryFeeHuf: ctx.deliveryFeeHuf,
  };

  // Sablon fotók szövegdobozainak behelyettesítése
  const resolvedPhotos = (template.photos || []).map((p) => ({
    ...p,
    id: p.id || `photo_${Math.random().toString(36).slice(2, 8)}`,
    titleAbove: replaceTemplateVariables(p.titleAbove || '', varCtx),
    captionBelow: replaceTemplateVariables(p.captionBelow || '', varCtx),
  }));

  // Ha a sablonban külön szövegdobozok (textBlocks) is vannak, hozzáfűzzük a bevezető/záró szövegekhez
  const beforeTexts = (template.textBlocks || [])
    .filter((tb) => tb.position === 'before_photos' || tb.position === 'before_table')
    .map((tb) =>
      replaceTemplateVariables(
        tb.title ? `${tb.title}\n${tb.content}` : tb.content,
        varCtx
      )
    )
    .filter(Boolean);

  const afterTexts = (template.textBlocks || [])
    .filter((tb) => tb.position === 'after_table')
    .map((tb) =>
      replaceTemplateVariables(
        tb.title ? `${tb.title}\n${tb.content}` : tb.content,
        varCtx
      )
    )
    .filter(Boolean);

  const introCombined = [
    replaceTemplateVariables(template.introText, varCtx),
    ...beforeTexts,
  ]
    .filter(Boolean)
    .join('\n\n');

  const closingCombined = [
    replaceTemplateVariables(template.closingText, varCtx),
    ...afterTexts,
  ]
    .filter(Boolean)
    .join('\n\n');

  return {
    id: `blk_tpl_${template.id}_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    type: 'template_section',
    templateId: template.id,
    categoryId: template.categoryId,
    sectionTitle: `${indexNumber}. ${template.name} (${ctx.widthCm}×${ctx.projectionCm}×${ctx.heightCm} cm - ${ctx.mountType})`,
    sectionSubtitle: replaceTemplateVariables(template.subtitle || '', varCtx),
    sectionIntroText: introCombined,
    sectionPhotos: resolvedPhotos,
    tableTitle: `${template.name} - Részletes árkalkuláció (${ctx.widthCm}×${ctx.projectionCm} cm)`,
    tableHeaders: [
      'Megnevezés / Anyag / Műszaki tartalom',
      'Mennyiség / Méret',
      'Listaár (EUR)',
      `Kedvezményes ár (${config.defaultDiscountLabel || '-20%'})`,
    ],
    rows: calc.rows.map((r) => ({
      ...r,
      name: replaceTemplateVariables(r.name, varCtx),
      description: replaceTemplateVariables(r.description || '', varCtx),
      photos: (r.photos || []).map((rp) => ({
        ...rp,
        captionBelow: replaceTemplateVariables(rp.captionBelow || '', varCtx),
      })),
    })),
    autoCalculateTotals: true,
    customTotalBaseEur: totals.totalEur,
    customTotalBaseHuf: totals.totalHuf,
    sectionClosingText: closingCombined,
    adjustments: blockAdjustments,
    manualTotalEur: null,
  };
}

/**
 * Egyedi (pl. több modulos, nagyon széles) ajánlat: üres, kézzel árazható szekció.
 * Az ajánlatok ~97%-a egy modulra szól, ezért ezt nem automatizáljuk.
 */
export function buildManualSectionBlock(
  title: string,
  indexNumber: number,
  ctx: { widthCm: number; projectionCm: number; heightCm: number },
  categoryId?: string
): QuoteDocumentBlock {
  const now = Date.now();
  const manualRow = (name: string, i: number): QuoteTableRow => ({
    id: `row_manual_${now}_${i}`,
    name,
    description: '',
    quantityLabel: i === 0 ? `${ctx.widthCm}×${ctx.projectionCm} cm` : '1 db',
    listPriceEur: 0,
    discountPriceEur: 0,
    formulaSummary: 'Kézi ár (egyedi kalkuláció)',
    currency: 'EUR',
    itemRole: 'base',
    included: true,
    note: '',
    photos: [],
    priceOverridden: true,
    quantityOverridden: true,
  });
  return {
    id: `blk_manual_${now}_${Math.random().toString(36).slice(2, 6)}`,
    type: 'template_section',
    categoryId,
    isManualSection: true,
    sectionTitle: `${indexNumber}. ${title} (${ctx.widthCm}×${ctx.projectionCm}×${ctx.heightCm} cm)`,
    sectionSubtitle: 'Egyedi, több modulos kialakítás',
    sectionIntroText: '',
    sectionPhotos: [],
    tableTitle: `${title} - Egyedi árkalkuláció`,
    tableHeaders: [
      'Megnevezés / Anyag / Műszaki tartalom',
      'Mennyiség / Méret',
      'Listaár (EUR)',
      'Kedvezményes ár (EUR)',
    ],
    rows: [manualRow('1. modul', 0), manualRow('2. modul', 1)],
    autoCalculateTotals: true,
    customTotalBaseEur: 0,
    customTotalBaseHuf: 0,
    sectionClosingText: '',
    adjustments: [],
    manualTotalEur: null,
  };
}

/**
 * Felépíti a teljes, blokkosan szerkeszthető PDF dokumentumot a végigvezetett árazó (Wizard)
 * adatai alapján.
 */
export function buildFullQuoteDocumentBlocks(params: {
  customerName: string;
  greetingName: string;
  city: string;
  inquiryNotes?: string;
  widthCm: number;
  projectionCm: number;
  heightCm: number;
  mountType: MountType;
  eurHufRate: number;
  deliveryFeeHuf: number;
  selectedTemplates: QuoteTemplate[];
  selectedMaterialsByTemplate?: Record<string, string[]>;
  adjustmentsByTemplate?: Record<string, PriceAdjustment[]>;
  manualSections?: { title: string; categoryId?: string }[];
  config: SystemConfig;
  categories?: ProductCategory[];
}): {
  blocks: QuoteDocumentBlock[];
  primaryTotalEur: number;
  primaryTotalHuf: number;
  /** a bevezető változói ebben az ajánlatban (a sablon tervező ezekkel cseréli vissza a szöveget {{…}}-re) */
  introVars: Pick<VariableReplacementContext, 'products' | 'optionsSentence' | 'giftsSentence'>;
} {
  const {
    customerName,
    greetingName,
    city,
    widthCm,
    projectionCm,
    heightCm,
    mountType,
    eurHufRate,
    deliveryFeeHuf,
    selectedTemplates,
    selectedMaterialsByTemplate,
    adjustmentsByTemplate,
    manualSections,
    config,
    categories = [],
  } = params;

  const varCtx: VariableReplacementContext = {
    customerName,
    greetingName: greetingName || customerName,
    city,
    widthCm,
    projectionCm,
    heightCm,
    mountType,
    eurHufRate,
    deliveryFeeHuf,
  };

  const blocks: QuoteDocumentBlock[] = [];

  // 1. Megszólítás és Bevezető Szövegdoboz Blokk (automatikus név- és méret-behelyettesítéssel)
  const greetingLine = replaceTemplateVariables(
    config.defaultGreetingTemplate || 'Kedves {{megszolitas}}!',
    varCtx
  );
  // a bevezető a termékek felépítése után töltődik ki ({{termekek}}, {{opciok}}, {{ajandekok}})
  const introTemplate =
    !config.defaultIntroTemplate?.trim() || LEGACY_INTRO_TEMPLATES.includes(config.defaultIntroTemplate.trim())
      ? LONG_INTRO_TEMPLATE
      : config.defaultIntroTemplate;
  const introBlock: QuoteDocumentBlock = {
    id: `blk_intro_${Date.now()}`,
    type: 'text_box',
    title: greetingLine,
    content: '',
    textStyle: 'greeting',
    bold: false,
    align: 'left',
  };
  blocks.push(introBlock);

  // 1/b. A Word ajánlatok szerkezete: fő szerkezetek (pergolák) kategóriánként, mindegyik alatt a hozzá
  // ajánlott kiegészítők (oldalsó árnyékoló, üvegfal) táblázata; a kiegészítők leírása a végén, az Információ előtt
  const catOf = (id: string) => categories.find((c) => c.id === id);
  const catOrder0 = [...new Set(selectedTemplates.map((t) => t.categoryId))];
  const hasMain = catOrder0.some((cid) => catOf(cid)?.categoryType !== 'accessory');
  // kiegészítő csak akkor kerül a pergolák alá, ha van mellette fő szerkezet (önálló ZIP / üvegfal ajánlatnál önálló termék)
  const isAccessory = (cid: string) => hasMain && catOf(cid)?.categoryType === 'accessory';
  const catOrder = [...catOrder0.filter((c) => !isAccessory(c)), ...catOrder0.filter(isAccessory)];
  const orderedTemplates = [...selectedTemplates].sort((a, b) => catOrder.indexOf(a.categoryId) - catOrder.indexOf(b.categoryId));
  const mainTemplates = orderedTemplates.filter((t) => !isAccessory(t.categoryId));
  const accessoryTemplates = orderedTemplates.filter((t) => isAccessory(t.categoryId));
  const tb = (key: string, style: QuoteDocumentBlock['textStyle'], content: string, title = ''): QuoteDocumentBlock => ({
    id: `blk_${key}_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    type: 'text_box',
    title,
    content,
    textStyle: style,
    bold: false,
    align: 'left',
  });
  // fő kategóriák bevezetője (tartalmát a termékek után töltjük ki: termékenkénti ajánló bekezdés, hó- és szélterhelés)
  const catIntroBlocks = new Map<string, QuoteDocumentBlock>();
  for (const cid of catOrder.filter((c) => !isAccessory(c))) {
    const blk = { ...tb('catintro', 'category_intro', ''), docCategoryId: cid };
    catIntroBlocks.set(cid, blk);
    blocks.push(blk);
  }

  // 2. Kiválasztott Sablonok és Termékek blokkjai
  let primaryTotalEur = 0;
  let primaryTotalHuf = 0;
  const calc = { widthCm, projectionCm, heightCm, mountType, eurHufRate, customerName, greetingName, city, deliveryFeeHuf };
  const buildBlock = (tpl: QuoteTemplate, no: number) => {
    const blk = buildEditableBlockFromTemplate(tpl, no, calc, config, selectedMaterialsByTemplate?.[tpl.id], adjustmentsByTemplate?.[tpl.id]);
    const cat = catOf(tpl.categoryId);
    if (cat?.docTotalLabel?.trim()) {
      let label = replaceTemplateVariables(cat.docTotalLabel, varCtx).trim();
      // önálló kiegészítő ajánlatnál (pl. csak üvegfal) nem opció: „Opció, üvegfalrendszer szereléssel:” → „Üvegfalrendszer szereléssel Összesen:”
      if (!isAccessory(tpl.categoryId) && cat.categoryType === 'accessory' && /^opci/i.test(label)) {
        label = label.replace(/^opció[,:]?\s*/i, '').replace(/:\s*$/, '');
        label = `${label.charAt(0).toUpperCase()}${label.slice(1)}${/összesen/i.test(label) ? '' : ' Összesen'}:`;
      }
      blk.totalLabel = label;
    }
    return blk;
  };
  // a kiegészítők táblázatai egyszer kiszámolva, minden pergola alá másolva
  const accessoryBlocks = accessoryTemplates.map((tpl) => {
    const blk = buildBlock(tpl, 0);
    blk.sectionTitle = (blk.sectionTitle || '').replace(/^0\.\s*/, '');
    const cat = catOf(tpl.categoryId);
    blk.attachTitle = replaceTemplateVariables(cat?.docHeading || '', varCtx).trim();
    return blk;
  });

  let promoShown = false;
  const mainSections: { tpl: QuoteTemplate; block: QuoteDocumentBlock }[] = [];
  // a Word ajánlatokban minden termék új oldalon kezdődik (az oldaltörés a szerkesztőben törölhető)
  const design = getDocDesign(config);
  const pageBreak = (): QuoteDocumentBlock => ({ id: `blk_brk_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`, type: 'page_break' });
  mainTemplates.forEach((tpl, idx) => {
    const cat = catOf(tpl.categoryId);
    if (design.productNewPage) blocks.push(pageBreak());
    if (idx === 0 || mainTemplates[idx - 1].categoryId !== tpl.categoryId) {
      // kiegészítő kategória címe („Opció üvegfal rendszerek:”) önálló ajánlatnál nem kell
      const heading = cat?.categoryType === 'accessory' ? '' : replaceTemplateVariables(cat?.docHeading || '', varCtx).trim();
      if (heading) blocks.push({ ...tb('cathead', 'category_heading', '', heading), docCategoryId: tpl.categoryId });
    }
    const tplBlock = buildBlock(tpl, idx + 1);
    blocks.push(tplBlock);
    mainSections.push({ tpl, block: tplBlock });
    for (const acc of accessoryBlocks) {
      blocks.push({
        ...JSON.parse(JSON.stringify(acc)),
        id: `blk_att_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        attachedTo: tplBlock.id,
      });
    }
    // a kategória utolsó terméke után: opcionálisan rendelhető tételek és akció
    if (idx === mainTemplates.length - 1 || mainTemplates[idx + 1].categoryId !== tpl.categoryId) {
      // ha a kategória valamelyik terméke már saját listát / akciót ad (záró szövegében), nem ismételjük
      const group = mainTemplates.filter((t) => t.categoryId === tpl.categoryId);
      const own = (re: RegExp) => group.some((t) => re.test(`${t.closingText || ''}\n${(t.textBlocks || []).map((x) => x.content).join('\n')}`));
      const opts = replaceTemplateVariables(cat?.docOptions || '', varCtx).trim();
      if (opts && !own(/opcion[aá]lisan rendelhet/i)) blocks.push({ ...tb('catopts', 'options', opts), docCategoryId: tpl.categoryId });
      const promo = replaceTemplateVariables(cat?.docPromo || '', varCtx).trim();
      if (promo && !own(/megrendeli/i)) {
        blocks.push({ ...tb('catpromo', 'promo', promo), docCategoryId: tpl.categoryId });
        promoShown = true;
      }
    }
    if (idx === 0) {
      primaryTotalEur = tplBlock.customTotalBaseEur || 0;
      primaryTotalHuf = tplBlock.customTotalBaseHuf || 0;
    }
  });
  // csak kiegészítők (pl. önálló ZIP ajánlat): ha nincs fő szerkezet, a fenti ág nem fut, mert isAccessory hamis

  (manualSections || []).forEach((ms, idx) => {
    blocks.push(
      buildManualSectionBlock(
        ms.title,
        mainTemplates.length + idx + 1,
        { widthCm, projectionCm, heightCm },
        ms.categoryId
      )
    );
  });

  // 2/b. Fő kategóriák bevezetője, mint a Word ajánlatokban: „Azért ajánljuk…” → termékenként egy ajánló bekezdés
  // (a termék leírásának első bekezdése, a termék neve félkövér) → többi leírás → hóterhelés modellenként → szélterhelés
  const modelName = (tpl: QuoteTemplate) => {
    const catWords = new Set((catOf(tpl.categoryId)?.name || '').toLowerCase().split(/\s+/));
    const words = (tpl.name || '').split(/\s+/);
    while (words.length > 1 && catWords.has(words[words.length - 1].toLowerCase())) words.pop();
    return words.join(' ').replace(/\s*\(.*\)\s*$/, '').trim();
  };
  const titleCase = (t: string) => t.replace(/\p{L}+/gu, (w) => (/\d/.test(w) ? w : w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()));
  const snowOf = (tpl: QuoteTemplate) =>
    `${tpl.introText || ''}\n${(tpl.textBlocks || []).map((x) => x.content).join('\n')}\n${tpl.closingText || ''}`.match(
      /h[óo]terhel[ée]s(?:e)?[^:\n]{0,30}:\s*((?:[^.\n]|\.(?=\s*\d))*?\d[\d.,]*\s*kg\/m[²2](?:[^.\n]*?kg\/m[²2])?)/i
    )?.[1]?.trim();
  for (const [cid, introBlk] of catIntroBlocks) {
    const inCat = mainSections.filter((m) => m.tpl.categoryId === cid);
    const pitches: string[] = [];
    for (const { tpl, block } of inCat) {
      const paras = (block.sectionIntroText || '').split(/\n\s*\n/).filter((x) => x.trim());
      if (paras.length < 2) continue;
      // az első bekezdés az ajánló a bevezetőben (mint a Word ajánlatokban), a többi a termék szakaszában marad
      const name = modelName(tpl);
      let pitch = paras[0].replace(/\s*\(\d+\s*[x×]\s*\d+[^)]*\)/g, '').replace(/\s+([,.;:])/g, '$1');
      const at = name ? pitch.toLowerCase().indexOf(name.toLowerCase()) : -1;
      if (at >= 0) pitch = `${pitch.slice(0, at)}[b]${pitch.slice(at, at + name.length)}[/b]${pitch.slice(at + name.length)}`;
      pitches.push(pitch);
      block.sectionIntroText = paras.slice(1).join('\n\n');
      if (at >= 0) block.pitchName = name;
    }
    const catParas = replaceTemplateVariables(catOf(cid)?.docIntro || '', varCtx)
      .split(/\n\s*\n/)
      .map((x) => x.trim())
      .filter(Boolean);
    const loads = inCat.map((m) => [titleCase(modelName(m.tpl)), snowOf(m.tpl)] as const);
    const dynamicSnow = loads.length > 0 && loads.every(([, l]) => l);
    if (dynamicSnow) {
      // a hóterhelés a bevezetőbe került (modellenként), a termék szövegében nem ismétlődik
      const dropSnow = (t?: string) =>
        (t || '')
          .replace(/(^|\n)\s*-\s*h[óo]terhel[ée]s[^\n]*(?=\n|$)/gi, '$1')
          .replace(/h[óo]terhel[ée]s(?:e)?[^:\n]{0,30}:\s*(?:[^.\n]|\.(?=\s*\d))*?kg\/m[²2](?:[^.\n]*?kg\/m[²2])?\.?\s*/gi, '')
          .replace(/\n{3,}/g, '\n\n')
          .trim();
      for (const m of inCat) {
        m.block.sectionIntroText = dropSnow(m.block.sectionIntroText);
        m.block.sectionClosingText = dropSnow(m.block.sectionClosingText);
      }
    }
    const isSnow = (t: string) => /^h[óo]terhel/i.test(t);
    const isWind = (t: string) => /^sz[ée]lterhel/i.test(t);
    const [first, ...rest] = catParas;
    let wind = rest.find(isWind) || '';
    if (wind && inCat.length > 1) wind = wind.replace(/^(sz[ée]lterhel[ée]se)\s*/i, `$1 (mind a ${inCat.length} szerkezetnek) `);
    const out = [
      ...(first && !isSnow(first) && !isWind(first) ? [first] : []),
      ...pitches,
      ...rest.filter((t) => !isWind(t) && !(dynamicSnow && isSnow(t))),
      ...(dynamicSnow ? [`Hóterhelése a szerkezeteknek:\n${loads.map(([n, l]) => `- ${n} modellnél: ${String(l).replace('²', '2')}`).join('\n')}`] : []),
      ...(wind ? [wind] : []),
    ];
    if (first && (isSnow(first) || isWind(first))) out.splice(out.length - (wind ? 1 : 0), 0, ...(isWind(first) ? [] : [first]));
    introBlk.content = out.join('\n\n');
  }
  // üres bevezető blokk (nincs kategória szöveg és ajánló sem) nem marad az ajánlatban
  for (const [, introBlk] of catIntroBlocks) {
    if (!introBlk.content?.trim()) blocks.splice(blocks.indexOf(introBlk), 1);
  }

  // a Word ajánlatok nyitó bekezdése: mit ajánlunk, mi opcionális, mi ajándék, mely kiegészítők szerepelnek
  const dims = `[b]1db ${widthCm}x${projectionCm}x${heightCm} cm-es[/b]`;
  const lcFirst = (t: string) => t.replace(/^(\p{Lu})(\p{Ll})/u, (_m, a, b) => a.toLowerCase() + b);
  const mainCats = [...new Set(mainTemplates.map((t) => t.categoryId))];
  // a Word ajánlatokban a termékcsalád leírása áll itt (nem a modell): „1db 600x300x250 cm-es, bioklimatikus pergola,
  // forgatható lamellás tetővel”; több terméknél „…, termékeinkre”
  const phrase = (c: string) => replaceTemplateVariables(catOf(c)?.docProductPhrase || '', varCtx).trim() || lcFirst(catOf(c)?.name || '');
  const products =
    mainTemplates.length === 1
      ? `${dims.replace('[/b]', ',[/b]')} ${phrase(mainTemplates[0].categoryId)}`
      : mainTemplates.length > 1
        ? `${dims} ${huList(mainCats.map(phrase))}, termékeinkre`
        : huList(orderedTemplates.map((t) => t.name));
  const rowsOf = (secs: QuoteDocumentBlock[], pred: (r: NonNullable<QuoteDocumentBlock['rows']>[number]) => boolean) => {
    const seen = new Set<string>();
    const out: string[] = [];
    for (const r of secs.flatMap((b) => b.rows || [])) {
      if (r.included === false || r.systemRole || !pred(r)) continue;
      const w = huWith(stripRichText(r.name || ''));
      const key = w.split(/\s+a\s|\s+az\s/)[0].toLowerCase();
      if (!w || seen.has(key)) continue;
      seen.add(key);
      out.push(w);
    }
    return out;
  };
  const mainBlocks = mainSections.length ? mainSections.map((m) => m.block) : blocks.filter((b) => b.type === 'template_section');
  const optNames = rowsOf(mainBlocks, (r) => r.itemRole === 'optional').slice(0, 3);
  const giftNames0 = rowsOf(mainBlocks, (r) => r.itemRole === 'gift' || (Number(r.discountPriceEur) === 0 && Number(r.listPriceEur) > 0));
  // a Word ajánlatokban: „Ajándék eső érzékelővel és ajándék infrafűtéssel.” (az érzékelő elöl)
  const giftNames = [...giftNames0].sort((x, y) => Number(/érzékel/i.test(y)) - Number(/érzékel/i.test(x)));
  const accCats = [...new Set(accessoryTemplates.map((t) => t.categoryId))];
  const introVars = {
    products: products || undefined,
    optionsSentence: optNames.length ? `Opcionálisan ${huList(optNames)}.` : '',
    giftsSentence: giftNames.length ? `Ajándék ${giftNames.join(' és ajándék ')}.` : '',
    accessoriesSentence: accCats
      .map((c) => replaceTemplateVariables(catOf(c)?.docIntroMention || '', varCtx).trim() || `Opcionálisan feltüntetjük a pergola oldalainak beépítését ${huWith(catOf(c)?.name || '')} is.`)
      .join(' '),
  };
  introBlock.templateVars = introVars;
  introBlock.content = replaceTemplateVariables(introTemplate, { ...varCtx, ...introVars })
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/\.\s*\./g, '.')
    .trim();

  // kiegészítő kategóriák leírása (Guillotine, Thermo Glass, oldalsó árnyékoló…) az Információ előtt; a fő kategóriánál
  // beállított kiegészítők leírása akkor is, ha nincsenek az ajánlatban (a Word ajánlatokban a pergolák után mindig ott van)
  const describe = [...new Set([...catOrder.filter(isAccessory), ...mainCats.flatMap((c) => catOf(c)?.docAlsoDescribe || [])])].filter((c) => catOf(c));
  for (const cid of describe) {
    const intro = replaceTemplateVariables(catOf(cid)?.docIntro || '', varCtx).trim();
    if (intro) blocks.push({ ...tb('catintro', 'category_intro', intro), docCategoryId: cid });
  }

  // 3. Záró Információs Szövegdoboz Blokk (az első termék saját feltételei, ha vannak)
  const closingText = replaceTemplateVariables(
    selectedTemplates[0]?.infoText?.trim() ||
      config.defaultClosingInfoTemplate ||
      'Információk és feltételek:\n• Az árajánlat érvényessége: 30 nap\n• Szállítás ({{telepules}}): {{szallitas}} (+Áfa)',
    varCtx
  );

  // a termékek saját záró szövegében álló akció („Ha …-ig megrendeli…”) is számít: az Információban nem ismétlődik
  if (mainSections.some((m) => /^\s*ha\s.{0,60}megrendeli/im.test(m.block.sectionClosingText || ''))) promoShown = true;
  // ha a kategóriáknál már volt akció, az Információ elején álló akció-bekezdés nem ismétlődik
  if (!promoShown && mainSections.length) {
    const promoPar = closingText.split(/\n\s*\n/).find((par) => /^\s*ha\s.{0,60}megrendeli/i.test(par));
    if (promoPar) {
      const first = mainSections[0].block;
      first.sectionClosingText = [promoPar.trim(), first.sectionClosingText || ''].filter((x) => x.trim()).join('\n\n');
      promoShown = true;
    }
  }
  const closingContent = promoShown
    ? closingText
        .split(/\n\s*\n/)
        .filter((par) => !/^\s*ha\s.{0,60}megrendeli/i.test(par))
        .join('\n\n')
    : closingText;
  if (design.infoNewPage && blocks.length > 1) blocks.push(pageBreak());
  blocks.push({
    id: `blk_closing_${Date.now()}`,
    type: 'text_box',
    title: config.docInfoTitle || 'Információ:',
    content: closingContent,
    textStyle: 'footer_info',
    bold: false,
    align: 'left',
  });

  return {
    blocks,
    primaryTotalEur,
    primaryTotalHuf,
    introVars,
  };
}

/**
 * Újraszámolja egy template_section blokk sorait a mögöttük lévő árazási algoritmusokból
 * (és az aktuális méretekből/árfolyamból). A kézzel átírt árak megmaradnak.
 */
export function recalculateBlockWithAlgorithms(
  block: QuoteDocumentBlock,
  ctx: CalculationContext,
  templates?: QuoteTemplate[]
): QuoteDocumentBlock {
  if (block.type !== 'template_section' || !block.rows) return block;

  const sourceTpl = templates?.find((t) => t.id === block.templateId);

  // A kézzel árazott (egyedi) szekció sorai nem mennek át az algoritmuson
  if (block.isManualSection) {
    return recalculateBlockTotals(block, ctx.eurHufRate);
  }

  const materialRows = block.rows.filter((r) => !r.systemRole);
  const origAssemblyRow = block.rows.find((r) => r.systemRole === 'assembly');

  const materialsFromRows: TemplateMaterialItem[] = materialRows.map((r, idx) => {
    const tplMat = sourceTpl?.materials?.find((m) => m.id === r.materialId);
    const baseAlg =
      r.algorithm ||
      tplMat ||
      createDefaultMaterialAlgorithm({
        id: r.materialId || `mat_row_${idx}_${Date.now()}`,
        pricingMode: 'per_m2',
        unitPrice: 350,
      });

    return {
      ...baseAlg,
      // A sor már a választott beépítési módhoz / modulszámhoz készült, újraszámoláskor nem szűrünk újra
      mountTypes: undefined,
      minModules: undefined,
      maxModules: undefined,
      modulesWidth: undefined,
      modulesProjection: undefined,
      id: r.materialId || baseAlg.id || `mat_row_${idx}`,
      name: r.name,
      description: r.description || '',
      itemRole: r.itemRole || 'base',
      defaultSelected: r.included !== false,
      defaultNote: r.note ?? baseAlg.defaultNote ?? '',
      photos: r.photos || baseAlg.photos || [],
    };
  });

  const includedIds = materialsFromRows
    .filter((_, idx) => materialRows[idx].included !== false)
    .map((m) => m.id);

  const virtualTemplate: QuoteTemplate = {
    id: block.templateId || 'virtual_tpl',
    categoryId: block.categoryId || '',
    name: block.sectionTitle || '',
    subtitle: block.sectionSubtitle || '',
    enabled: true,
    introText: block.sectionIntroText || '',
    closingText: block.sectionClosingText || '',
    textBlocks: [],
    photos: block.sectionPhotos || [],
    materials: materialsFromRows,
    pricingOverride: sourceTpl?.pricingOverride,
    moduleSplit: sourceTpl?.moduleSplit,
    moduleSplits: sourceTpl?.moduleSplits,
    createdAt: '',
    updatedAt: '',
  };

  const calc = calculateTemplateRows(virtualTemplate, ctx, includedIds);

  // Kézzel átírt ár / mennyiség megmarad, csak a többi számolódik újra
  const keepManual = (calcRow: QuoteTableRow, origRow?: QuoteTableRow) => ({
    ...calcRow,
    id: origRow?.id || calcRow.id,
    name: origRow?.name ?? calcRow.name,
    description: origRow?.description ?? calcRow.description,
    note: origRow?.note !== undefined ? origRow.note : calcRow.note,
    photos: origRow?.photos || calcRow.photos,
    included: origRow ? origRow.included : calcRow.included,
    ...(origRow?.priceOverridden
      ? {
          priceOverridden: true,
          listPriceEur: origRow.listPriceEur,
          discountPriceEur: origRow.discountPriceEur,
        }
      : {}),
    ...(origRow?.quantityOverridden
      ? { quantityOverridden: true, quantityLabel: origRow.quantityLabel }
      : {}),
  });

  const updatedRows: QuoteTableRow[] = calc.rows.map((calcRow, idx) =>
    calcRow.systemRole === 'assembly'
      ? keepManual(calcRow, origAssemblyRow)
      : keepManual(calcRow, materialRows[idx])
  );
  // Ha a képlet szerint már nincs szerelés, de kézzel be volt árazva, megtartjuk
  if (
    origAssemblyRow?.priceOverridden &&
    !updatedRows.some((r) => r.systemRole === 'assembly')
  ) {
    updatedRows.push(origAssemblyRow);
  }

  return recalculateBlockTotals({ ...block, rows: updatedRows }, ctx.eurHufRate);
}

/**
 * Újraszámolja egy template_section blokk összesített EUR és HUF árát a sorai
 * (algoritmus vagy kézi ár), az árkorrekciók és az esetleges kézi végösszeg alapján.
 */
export function recalculateBlockTotals(
  block: QuoteDocumentBlock,
  eurHufRate: number
): QuoteDocumentBlock {
  if (block.type !== 'template_section' || !block.rows) return block;

  const totals = computeBlockTotals(block, eurHufRate);

  return {
    ...block,
    autoCalculateTotals: true,
    customTotalBaseEur: totals.totalEur,
    customTotalBaseHuf: totals.totalHuf,
  };
}

/**
 * Szám beolvasása árlistából: "2.200", "2 200", "2,200.00", "2200 €" → 2200
 */
function parsePriceNumber(raw: string): number | null {
  let t = raw.replace(/[^0-9.,-]/g, '');
  if (!t || !/[0-9]/.test(t)) return null;
  const lastDot = t.lastIndexOf('.');
  const lastComma = t.lastIndexOf(',');
  if (lastDot >= 0 && lastComma >= 0) {
    // A később álló jel a tizedesjel
    const dec = lastDot > lastComma ? '.' : ',';
    const thou = dec === '.' ? ',' : '.';
    t = t.split(thou).join('').replace(dec, '.');
  } else if (lastDot >= 0 || lastComma >= 0) {
    const sep = lastDot >= 0 ? '.' : ',';
    const after = t.length - t.lastIndexOf(sep) - 1;
    // Pontosan 3 számjegy utána → ezres tagolás, különben tizedes
    t = after === 3 ? t.split(sep).join('') : t.replace(sep, '.');
  }
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

/**
 * Ár PDF-ből / Excelből kimásolt mérettábla beolvasása.
 * Első sor: szélességek (cm), a többi sor: kinyúlás (cm), majd az árak.
 * Elválasztó: tabulátor, pontosvessző vagy több szóköz.
 */
export function parseMatrixPaste(
  text: string,
  labels?: { rowLabel?: string; colLabel?: string }
): CustomMatrixTable | null {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  if (lines.length < 2) return null;
  const splitLine = (line: string) =>
    line
      .split(/[\t;]|\s+/)
      .map((c) => c.trim())
      .filter(Boolean);

  let header = splitLine(lines[0])
    .map(parsePriceNumber)
    .filter((n): n is number => n !== null);
  // "2 200" szóközös ezres tagolás: a sor addig vonódik össze, amíg a cellák száma
  // meg nem egyezik a fejléccel (+1 a sor címkéjének)
  const expected = header.length + 1;
  const dataRows = lines.slice(1).map((line) => {
    // A pénznem / mértékegység cellák (€, EUR, cm) nem számítanak oszlopnak
    const cells = splitLine(line).filter((c) => /\d/.test(c));
    while (cells.length > expected) {
      let i = cells.findIndex(
        (c, idx) =>
          idx >= 1 &&
          /^\d{1,2}$/.test(c) &&
          /^\d{3}([.,]\d+)?$/.test(cells[idx + 1] || '')
      );
      if (i < 0) {
        i = cells.findIndex(
          (c, idx) =>
            idx >= 1 && /^\d{1,3}$/.test(c) && /^\d{3}([.,]\d+)?$/.test(cells[idx + 1] || '')
        );
      }
      if (i < 0) break;
      cells.splice(i, 2, cells[i] + cells[i + 1]);
    }
    return cells;
  });
  const dataWidth = Math.max(...dataRows.map((r) => r.length));
  // Ha a fejlécben is van "sarok" szám (pl. 0), azt eldobjuk
  if (header.length === dataWidth) header = header.slice(1);
  const cols = header.filter((c): c is number => c !== null && c > 0);
  if (cols.length === 0) return null;

  const rows: number[] = [];
  const values: Record<string, Record<string, number>> = {};
  for (const cells of dataRows) {
    const rowCm = parsePriceNumber(cells[0]);
    if (!rowCm || rowCm <= 0) continue;
    rows.push(rowCm);
    values[String(rowCm)] = {};
    cols.forEach((colCm, idx) => {
      const price = parsePriceNumber(cells[idx + 1] || '');
      if (price !== null) values[String(rowCm)][String(colCm)] = price;
    });
  }
  if (rows.length === 0) return null;
  return {
    rowLabel: labels?.rowLabel || 'Kinyúlás (cm)',
    colLabel: labels?.colLabel || 'Szélesség (cm)',
    rows,
    cols,
    values,
  };
}
