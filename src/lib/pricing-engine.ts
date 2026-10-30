import {
  DEFAULT_PRICING_FORMULA,
  replaceTemplateVariables,
  VariableReplacementContext,
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
} from './types';

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
        (x) => x.itemRole === 'base' && x.pricingMode === 'percentage' && /szerel/i.test(x.name)
      );
      const pct = install ? Number(install.percentageTiers?.[0]?.percent ?? install.percentageRate) || 0 : 0;
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
  const modules = getModuleCounts(template, widthCm, projectionCm);
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
    const ed = effectiveDims(item, modules, widthCm, projectionCm, heightCm);
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

    switch (item.pricingMode) {
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

    const modifiedPrice = applyModifiers(rawPrice, item);
    const costInEur =
      item.currency === 'HUF'
        ? Math.max(1, Math.round(modifiedPrice / rate))
        : Math.max(1, modifiedPrice);
    const priceInEur = applyPercentProfit(costInEur, formula);

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
}): {
  blocks: QuoteDocumentBlock[];
  primaryTotalEur: number;
  primaryTotalHuf: number;
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
  const introBody = replaceTemplateVariables(
    config.defaultIntroTemplate ||
      'Örömmel fogadtuk megkeresését! Kérésének megfelelően küldjük személyre szabott árajánlatunkat ({{meret_m}} / {{meret}}, {{beepites}}).',
    varCtx
  );

  blocks.push({
    id: `blk_intro_${Date.now()}`,
    type: 'text_box',
    title: greetingLine,
    content: introBody,
    textStyle: 'greeting',
    bold: false,
    align: 'left',
  });

  // 2. Kiválasztott Sablonok és Termékek blokkjai
  let primaryTotalEur = 0;
  let primaryTotalHuf = 0;

  selectedTemplates.forEach((tpl, idx) => {
    const selectedMatIds = selectedMaterialsByTemplate?.[tpl.id];
    const tplBlock = buildEditableBlockFromTemplate(
      tpl,
      idx + 1,
      {
        widthCm,
        projectionCm,
        heightCm,
        mountType,
        eurHufRate,
        customerName,
        greetingName,
        city,
        deliveryFeeHuf,
      },
      config,
      selectedMatIds,
      adjustmentsByTemplate?.[tpl.id]
    );
    blocks.push(tplBlock);

    if (idx === 0) {
      primaryTotalEur = tplBlock.customTotalBaseEur || 0;
      primaryTotalHuf = tplBlock.customTotalBaseHuf || 0;
    }
  });

  (manualSections || []).forEach((ms, idx) => {
    blocks.push(
      buildManualSectionBlock(
        ms.title,
        selectedTemplates.length + idx + 1,
        { widthCm, projectionCm, heightCm },
        ms.categoryId
      )
    );
  });

  // 3. Záró Információs Szövegdoboz Blokk
  const closingText = replaceTemplateVariables(
    config.defaultClosingInfoTemplate ||
      'Információk és feltételek:\n• Az árajánlat érvényessége: 30 nap\n• Szállítás ({{telepules}}): {{szallitas}} (+Áfa)',
    varCtx
  );

  blocks.push({
    id: `blk_closing_${Date.now()}`,
    type: 'text_box',
    title: 'Fontos információk és vállalási feltételek',
    content: closingText,
    textStyle: 'footer_info',
    bold: false,
    align: 'left',
  });

  return {
    blocks,
    primaryTotalEur,
    primaryTotalHuf,
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
