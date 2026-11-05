import fs from 'fs';
import os from 'os';
import path from 'path';
import {
  DEFAULT_EMAIL_SETTINGS,
  DEFAULT_MENUS,
  DEFAULT_PRICING_FORMULA,
  DEFAULT_SYSTEM_CONFIG,
} from './constants';
import { resolvePriceSources } from './pricing-engine';
import { blobEnabled, readDbFromBlob, writeDbToBlob } from './blob-store';
import {
  DatabaseSchema,
  EmailSettings,
  EmailTemplate,
  ProductCategory,
  ProductMenu,
  QuoteTemplate,
} from './types';

const BUNDLED_DATA_DIR = path.join(process.cwd(), 'data');
const BUNDLED_DB_PATH = path.join(BUNDLED_DATA_DIR, 'db.json');

const TMP_DATA_DIR = path.join(os.tmpdir(), 'custom-pricer-data');
const TMP_DB_PATH = path.join(TMP_DATA_DIR, 'db.json');

export const SAVED_PDFS_DIR = path.join(process.cwd(), 'data', 'pdfs');

declare global {
  // eslint-disable-next-line no-var
  var __customPricerDbCache: DatabaseSchema | undefined;
  // eslint-disable-next-line no-var
  var __customPricerDbLoadedAt: number | undefined;
  // eslint-disable-next-line no-var
  var __customPricerBundledDb: DatabaseSchema | null | undefined;
}

export function createEmptyDatabase(): DatabaseSchema {
  return {
    config: { ...DEFAULT_SYSTEM_CONFIG },
    menus: DEFAULT_MENUS.map((m) => ({ ...m })),
    categories: [],
    templates: [],
    quotes: [],
    mediaLibrary: [],
    trackingEvents: [],
  };
}

// Régi (menü nélküli) kategóriák besorolása név alapján, különben az első menübe
function guessMenuIdForCategory(cat: ProductCategory, menus: ProductMenu[]): string {
  const name = (cat.name || '').toLowerCase();
  const rules: [string, string[]][] = [
    ['menu_ledezes', ['led']],
    ['menu_napellenzo', ['napellenz']],
    ['menu_arnyekolo', ['árnyékol', 'arnyekol', 'zip', 'redőny']],
    ['menu_kocsibeallo', ['kocsibeáll', 'kocsibeall', 'carport']],
    ['menu_pergola', ['pergola', 'előtető', 'üvegtető', 'üvegfal']],
  ];
  for (const [menuId, keys] of rules) {
    if (keys.some((k) => name.includes(k)) && menus.some((m) => m.id === menuId)) {
      return menuId;
    }
  }
  return menus[0]?.id || '';
}

function normalizeTemplate(tpl: QuoteTemplate, idx: number): QuoteTemplate {
  const status = tpl.status || (tpl.enabled === false ? 'inactive' : 'active');
  return {
    ...tpl,
    status,
    enabled: status !== 'inactive',
    order: typeof tpl.order === 'number' ? tpl.order : idx + 1,
    sizeLimits: tpl.sizeLimits || {},
    catalogRef: tpl.catalogRef || {},
    // A régi egytengelyes modulszabály a tengelyenkénti listába kerül
    moduleSplits: tpl.moduleSplits?.length ? tpl.moduleSplits : tpl.moduleSplit ? [tpl.moduleSplit] : [],
    moduleSplit: undefined,
    mountTypes: tpl.mountTypes || [],
    alsoInCategoryIds: tpl.alsoInCategoryIds || [],
    sizeRules: tpl.sizeRules || [],
  };
}

// Régi (egy tárgy + egy szöveg) beállításból sablonlista; üres listánál a minta sablonok
function normalizeEmailSettings(raw: any): EmailSettings {
  const merged = { ...DEFAULT_EMAIL_SETTINGS, ...(raw || {}) };
  let templates: EmailTemplate[] =
    Array.isArray(raw?.templates) && raw.templates.length > 0
      ? raw.templates
      : DEFAULT_EMAIL_SETTINGS.templates.map((t) => ({ ...t }));
  if (raw?.subjectTemplate && raw?.bodyTemplate && !Array.isArray(raw?.templates)) {
    templates = [
      { id: 'tpl_sajat', name: 'Saját sablon', subject: raw.subjectTemplate, body: raw.bodyTemplate },
      ...templates,
    ];
  }
  const { subjectTemplate, bodyTemplate, ...rest } = merged;
  void subjectTemplate;
  void bodyTemplate;
  return {
    ...rest,
    templates,
    defaultTemplateId: templates.some((t) => t.id === merged.defaultTemplateId)
      ? merged.defaultTemplateId
      : templates[0].id,
  };
}

function normalizeDatabase(raw: any): DatabaseSchema {
  const empty = createEmptyDatabase();
  if (!raw || typeof raw !== 'object') return empty;
  const rawConfig =
    raw.config && typeof raw.config === 'object' ? raw.config : {};
  const menus: ProductMenu[] =
    Array.isArray(raw.menus) && raw.menus.length > 0 ? raw.menus : empty.menus;
  const categories: ProductCategory[] = (
    Array.isArray(raw.categories) ? raw.categories : []
  ).map((c: ProductCategory) => ({
    ...c,
    menuId:
      c.menuId && menus.some((m) => m.id === c.menuId)
        ? c.menuId
        : guessMenuIdForCategory(c, menus),
  }));
  return {
    config: {
      ...empty.config,
      ...rawConfig,
      pricingFormula: {
        ...DEFAULT_PRICING_FORMULA,
        ...(rawConfig.pricingFormula || {}),
      },
      emailSettings: normalizeEmailSettings(rawConfig.emailSettings),
    },
    menus,
    categories,
    // Az árforrásra hivatkozó extrák (pl. pergolához kért ZIP) a forrástermék árát kapják
    templates: resolvePriceSources(
      (Array.isArray(raw.templates) ? raw.templates : []).map(normalizeTemplate)
    ),
    quotes: Array.isArray(raw.quotes) ? raw.quotes : [],
    mediaLibrary: Array.isArray(raw.mediaLibrary) ? raw.mediaLibrary : [],
    trackingEvents: Array.isArray(raw.trackingEvents) ? raw.trackingEvents : [],
    dataRevision: Number(raw.dataRevision) || 0,
  };
}

export function getDb(): DatabaseSchema {
  const isVercel = Boolean(process.env.VERCEL);

  if (isVercel) {
    if (fs.existsSync(TMP_DB_PATH)) {
      try {
        const parsed = normalizeDatabase(
          JSON.parse(fs.readFileSync(TMP_DB_PATH, 'utf-8'))
        );
        globalThis.__customPricerDbCache = parsed;
        return parsed;
      } catch {
        // ignore
      }
    }
    if (globalThis.__customPricerDbCache) {
      return globalThis.__customPricerDbCache;
    }
  }

  if (fs.existsSync(BUNDLED_DB_PATH)) {
    try {
      const parsed = normalizeDatabase(
        JSON.parse(fs.readFileSync(BUNDLED_DB_PATH, 'utf-8'))
      );
      globalThis.__customPricerDbCache = parsed;
      return parsed;
    } catch {
      // ignore
    }
  }

  const initial = createEmptyDatabase();
  saveDb(initial);
  return initial;
}

export function saveDb(data: DatabaseSchema): void {
  const normalized = normalizeDatabase(data);
  globalThis.__customPricerDbCache = normalized;
  const serialized = JSON.stringify(normalized, null, 2);

  if (!process.env.VERCEL) {
    try {
      fs.mkdirSync(BUNDLED_DATA_DIR, { recursive: true });
      fs.writeFileSync(BUNDLED_DB_PATH, serialized, 'utf-8');
      return;
    } catch {
      // fallback to tmp
    }
  }

  try {
    fs.mkdirSync(TMP_DATA_DIR, { recursive: true });
    fs.writeFileSync(TMP_DB_PATH, serialized, 'utf-8');
  } catch (e) {
    console.error('Failed to persist db.json:', e);
  }
}

// A telepítéssel érkező adatfájl példányonként változatlan: elég egyszer beolvasni (~2 MB JSON)
function readBundledDb(): DatabaseSchema | null {
  if (globalThis.__customPricerBundledDb !== undefined) return globalThis.__customPricerBundledDb;
  try {
    globalThis.__customPricerBundledDb = normalizeDatabase(JSON.parse(fs.readFileSync(BUNDLED_DB_PATH, 'utf-8')));
  } catch {
    globalThis.__customPricerBundledDb = null;
  }
  return globalThis.__customPricerBundledDb;
}

/**
 * Az API route-ok elején: Vercelen a tartós tárolóból (Blob) frissen betölti az adatokat, így
 * minden szerverpéldány ugyanazt látja. Ha a telepítés újabb katalógust hoz (dataRevision),
 * a menük, kategóriák és termékek frissülnek, az ajánlatok, képek és beállítások maradnak.
 */
export async function loadDb(opts: { maxAgeMs?: number } = {}): Promise<DatabaseSchema> {
  if (!blobEnabled()) return getDb();
  // Csak olvasó, gyakori kéréseknél (pl. PDF-előnézet) elég a nemrég betöltött példány
  if (
    opts.maxAgeMs &&
    globalThis.__customPricerDbCache &&
    globalThis.__customPricerDbLoadedAt &&
    Date.now() - globalThis.__customPricerDbLoadedAt < opts.maxAgeMs
  ) {
    return globalThis.__customPricerDbCache;
  }
  const db = await loadDbFresh();
  globalThis.__customPricerDbLoadedAt = Date.now();
  return db;
}

async function loadDbFresh(): Promise<DatabaseSchema> {
  const bundled = readBundledDb();
  let stored: DatabaseSchema | null = null;
  try {
    const raw = await readDbFromBlob();
    stored = raw ? normalizeDatabase(raw) : null;
  } catch (e) {
    console.error('Blob read failed:', e);
    if (globalThis.__customPricerDbCache) return globalThis.__customPricerDbCache;
  }
  if (!stored) {
    const seed = bundled || createEmptyDatabase();
    globalThis.__customPricerDbCache = seed;
    await persistDb(seed);
    return seed;
  }
  if (bundled && (bundled.dataRevision || 0) > (stored.dataRevision || 0)) {
    const merged = normalizeDatabase({
      ...stored,
      menus: bundled.menus,
      categories: bundled.categories,
      templates: bundled.templates,
      dataRevision: bundled.dataRevision,
    });
    globalThis.__customPricerDbCache = merged;
    await persistDb(merged);
    return merged;
  }
  globalThis.__customPricerDbCache = stored;
  return stored;
}

/** Mentés; Vercelen a tartós tárolóba is (meg kell várni, különben a függvény leállhat előtte) */
export async function persistDb(data: DatabaseSchema): Promise<void> {
  saveDb(data);
  if (blobEnabled()) {
    await writeDbToBlob(JSON.stringify(globalThis.__customPricerDbCache, null, 2));
  }
}
