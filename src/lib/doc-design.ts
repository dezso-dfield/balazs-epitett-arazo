import type { ProductCategory, QuoteDocumentBlock, SystemConfig } from './types';

/**
 * Az ajánlatok egyetlen, általános dizájn sablonja (színek, betűméretek, logó, lábléc).
 * Minden ajánlatra és kategóriára ugyanez érvényes; a PDF és a Word-szerű szerkesztő is ebből dolgozik.
 * Alapértékek: az OpenSky saját Word ajánlatai (sötétkék láblécsáv, szürke táblázatfejléc, Arial).
 */
export interface DocDesign {
  accent: string; // lábléc sáv
  accentText: string; // lábléc szöveg
  heading: string; // címek, kiemelt szöveg
  text: string; // bekezdések
  muted: string; // alcímek, képaláírások
  tableHead: string; // táblázat fejléc háttér
  tableBorder: string; // táblázat rácsvonal
  bodySize: number; // pt
  headingSize: number; // termék cím, pt
  greetingSize: number; // megszólítás, pt
  logoHeight: number; // pt az első oldalon
  lineHeight: number; // sorköz szorzó
  footerText: string; // üresen: weboldal
  showPageNumbers: boolean;
  font: 'calibri' | 'arial'; // a Word ajánlatok betűje Calibri (a PDF-ben a vele azonos méretű Carlito)
  letterhead: boolean; // a saját fejléces papír (logó fent, sötétkék sáv a weboldallal lent) a lapok hátterén
  marginPt: number; // bal/jobb margó (Word: 2,5 cm = 70,85 pt)
  highlight: string; // termék cím, „+Opcionálisan…”, „Információ:” kiemelő háttere (üresen nincs)
  greetingBold: boolean;
  tableSize: number; // táblázat betűmérete (Word: 11 pt)
  tableWide: boolean; // a táblázat szélesebb a szövegnél (Word: 18,7 cm, középre)
  photoLayout: 'stacked' | 'grid'; // fotók egymás alatt teljes szélességben (Word) vagy kettesével
}

/** A saját fejléces papír (a Word ajánlatok fejlécéből) */
export const LETTERHEAD_URL = '/uploads/legacy/opensky-letterhead.jpg';

/** Alapértékek: pontosan a saját Word ajánlatok (pl. Vadnai, Scholtz, Hild) beállításai */
export const DEFAULT_DOC_DESIGN: DocDesign = {
  accent: '#1d2c4f',
  accentText: '#dbe0f0',
  heading: '#000000',
  text: '#000000',
  muted: '#000000',
  tableHead: '#bfbfbf',
  tableBorder: '#000000',
  bodySize: 12,
  headingSize: 12,
  greetingSize: 12,
  logoHeight: 34,
  lineHeight: 1.22,
  footerText: '',
  showPageNumbers: false,
  font: 'calibri',
  letterhead: true,
  marginPt: 70.85,
  highlight: '#bfbfbf',
  greetingBold: false,
  tableSize: 11,
  tableWide: true,
  photoLayout: 'stacked',
};

/** Csak a ténylegesen kitöltött mezők (üres szöveg / NaN nem írja felül az örökölt értéket) */
const filled = (o?: Partial<DocDesign> | null): Partial<DocDesign> =>
  Object.fromEntries(Object.entries(o || {}).filter(([, v]) => v !== '' && v !== null && v !== undefined && !(typeof v === 'number' && Number.isNaN(v))));

/**
 * Az érvényes dizájn: alapértékek → általános dizájn sablon (Beállítások) → a kategória saját eltérései.
 */
export function getDocDesign(config?: Partial<SystemConfig> | null, category?: Partial<ProductCategory> | null): DocDesign {
  const d = { ...DEFAULT_DOC_DESIGN, ...filled(config?.docDesign), ...filled(category?.docDesign) } as DocDesign;
  const hex = (v: string, f: string) => (/^#[0-9a-f]{6}$/i.test(v || '') ? v : f);
  for (const k of ['accent', 'accentText', 'heading', 'text', 'muted', 'tableHead', 'tableBorder'] as const) d[k] = hex(d[k], DEFAULT_DOC_DESIGN[k]);
  d.highlight = d.highlight === 'none' ? '' : hex(d.highlight, '');
  if (d.font !== 'arial') d.font = 'calibri';
  if (d.photoLayout !== 'grid') d.photoLayout = 'stacked';
  const num = (v: unknown, f: number, lo: number, hi: number) => (Number.isFinite(Number(v)) && Number(v) >= lo && Number(v) <= hi ? Number(v) : f);
  d.bodySize = num(d.bodySize, 10, 7, 16);
  d.headingSize = num(d.headingSize, 13, 9, 24);
  d.greetingSize = num(d.greetingSize, 13, 9, 24);
  d.logoHeight = num(d.logoHeight, 34, 16, 90);
  d.lineHeight = num(d.lineHeight, 1.22, 1, 2.2);
  d.marginPt = num(d.marginPt, 70.85, 30, 100);
  d.tableSize = num(d.tableSize, 11, 7, 14);
  return d;
}

/** A blokk kategóriája (termék szakasz vagy kategória szövegdoboz) */
export const blockCategoryId = (b: QuoteDocumentBlock) => b.categoryId || b.docCategoryId || '';

/**
 * Az ajánlat „fő” kategóriája: az első fő szerkezet termék szakasza (ha nincs, az első termék).
 * Ennek a dizájnja adja az oldal keretét (logó, lábléc) és a kategória nélküli szövegeket (megszólítás, Információ).
 */
export function primaryCategory(blocks: QuoteDocumentBlock[], categories: ProductCategory[] = []): ProductCategory | undefined {
  const cats = blocks.filter((b) => b.type === 'template_section').map((b) => categories.find((c) => c.id === blockCategoryId(b))).filter(Boolean) as ProductCategory[];
  return cats.find((c) => c.categoryType !== 'accessory') || cats[0];
}

/** Szerkesztő: PDF pont → képernyő pixel (13px ≈ 10pt) */
export const ptPx = (pt: number) => `${+(pt * 1.3).toFixed(1)}px`;
