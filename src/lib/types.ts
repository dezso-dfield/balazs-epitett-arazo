export type CurrencyCode = 'EUR' | 'HUF';

export type QuoteStatus =
  | 'piszkozat'
  | 'kikuldve'
  | 'megnyitva'
  | 'elfogadva'
  | 'elutasitva';

export type MountType =
  | 'Épülethez rögzített'
  | 'Szabadon álló'
  | 'Lábak nélkül'
  | 'Meglévő szerkezetre'
  | 'Egyedi';

/**
 * Milyen árazási módszerrel számoljon egy adott terméket vagy anyagot a rendszer:
 * - fixed: Fix darabár / csomagár (pl. 700 EUR × mennyiség)
 * - per_m2: Egyszerű m² ár (pl. 350 EUR / m²)
 * - tiered_m2: Sávos m² ár (pl. 15 m²-ig 400 EUR/m², 25 m²-ig 360 EUR/m²)
 * - base_plus_m2: Fix alapár + m² ár (pl. 1000 EUR alap + 250 EUR/m²)
 * - per_lm: Folyóméter (fm) ár (pl. Szélesség vagy Kinyúlás fm × egységár)
 * - base_plus_lm: Fix alapár + folyóméter (fm) ár
 * - matrix_cm: Szélesség (cm) × Kinyúlás/Magasság (cm) alapú mérettábla (mátrix)
 * - percentage: Százalékos díj (pl. Szerelési munkadíj az alaptételek X%-a)
 */
export type ProductPricingMode =
  | 'fixed'
  | 'per_m2'
  | 'tiered_m2'
  | 'base_plus_m2'
  | 'per_lm'
  | 'base_plus_lm'
  | 'matrix_cm'
  | 'percentage';

/**
 * Melyik méretből számolja a felületet (m²) vagy folyómétert (fm):
 */
export type DimensionSource =
  | 'roof'        // Szélesség × Kinyúlás (m²)
  | 'front_wall'  // Szélesség × Magasság (m²)
  | 'side_wall'   // Kinyúlás × Magasság (m²)
  | 'both_walls'  // (Szélesség + Kinyúlás) × Magasság (m²)
  | 'all_walls'   // (2 × Szélesség + 2 × Kinyúlás) × Magasság (m²)
  | 'width_lm'    // Szélesség (fm)
  | 'proj_lm'     // Kinyúlás (fm)
  | 'height_lm'   // Magasság (fm)
  | 'front_side_lm' // Szélesség + Kinyúlás (fm)
  | 'perimeter_lm'; // 2 × (Szélesség + Kinyúlás) (fm)

export interface M2PriceTier {
  maxM2: number;
  pricePerM2: number;
}

export interface PercentageTier {
  maxAmount: number;
  percent: number;
}

export interface CustomMatrixTable {
  rowLabel: string; // pl. "Kinyúlás (cm)" vagy "Magasság (cm)"
  colLabel: string; // pl. "Szélesség (cm)"
  rows: number[];   // pl. [200, 250, 300, 350, 400]
  cols: number[];   // pl. [300, 400, 500, 600]
  values: Record<string, Record<string, number>>; // values[row][col] = ár
}

/**
 * Fotó és a hozzá tartozó szövegdobozok (fotó feletti cím és fotó alatti leírás)
 */
export interface PhotoCaptionBlock {
  id: string;
  imageUrl: string;
  titleAbove?: string;
  captionBelow: string;
  widthPct?: number; // 30..100, alapértelmezett ~75%
  align?: 'left' | 'center' | 'right';
  // Részletképek a nagy kép alatt (pl. motor, LED, profil közelről)
  subPhotos?: PhotoCaptionBlock[];
}

/**
 * Különálló szövegdoboz (ahová csak szöveget ír a felhasználó)
 */
export interface CustomTextBlock {
  id: string;
  title?: string;
  content: string;
  position: 'before_photos' | 'before_table' | 'after_table';
  bold?: boolean;
}

/**
 * Egy sablonhoz tartozó termék, anyag vagy munkadíj tétel
 */
export interface TemplateMaterialItem {
  id: string;
  name: string;               // pl. "Alapszerkezet", "Somfy IO Motor", "Serge 600 ponyva", "Helyszíni szerelés"
  description: string;        // Műszaki tartalom / rövid leírás
  itemRole: 'base' | 'optional' | 'gift'; // Alaptétel, Opcionális tétel, vagy Ajándék
  defaultSelected: boolean;   // Alapértelmezetten be legyen-e pipálva az árazóban
  pricingMode: ProductPricingMode;
  currency: CurrencyCode;
  dimensionSource: DimensionSource;
  // Árazási paraméterek
  basePrice: number;          // Fix ár vagy alapár
  unitPrice: number;          // m² ár vagy fm ár
  defaultQuantity: number;    // Alapértelmezett darabszám (pl. 1)
  unitLabel: string;          // pl. "db", "m²", "fm", "szett"
  m2Tiers: M2PriceTier[];     // Sávos m² árazásnál
  matrixTable?: CustomMatrixTable; // Mérettábla (cm × cm) árazásnál
  percentageRate: number;     // Százalékos díjnál (pl. 10%)
  percentageTiers?: PercentageTier[];
  minPrice: number;           // Minimum ár (pl. minimum szerelési díj)
  // Szorzók és kedvezmények
  multiplier: number;         // Beszerzési / árképzési szorzó (alapértelmezetten 1.0)
  extraDiscountPct: number;   // Extra kedvezmény % (alapértelmezetten 0)
  fixedSurcharge: number;     // Fix felár (alapértelmezetten 0)
  // Fix EUR felár darabonként / oldalanként, forintos tételnél is EUR-ban (pl. THERMO GLASS:
  // 90.000 Ft/m² + 950 EUR rendszerfelár + 400 EUR szerelés oldalanként)
  surchargeEur?: number;
  listPriceMultiplier: number; // Listaár szorzó a PDF táblázathoz (pl. 1.25 = +25% listaár)
  defaultNote: string;        // Megjegyzés oszlop a PDF táblázatban (pl. "-20%", "Ajándék", "Opció")
  // Termékhez közvetlenül felcsatolt fotók + fotó alatti szövegdobozok
  photos: PhotoCaptionBlock[];
  // Oldalanként árazott extra (pl. üveg, árnyékoló): az árazóban 1-4 oldal választható,
  // a darabszám = oldalak száma
  perSide?: boolean;
  // Csak ezeknél a beépítési módoknál szerepel (pl. falra szerelt / szabadon álló mérettábla)
  mountTypes?: MountType[];
  // --- A korábbi (Python) árazó szabályai ---
  // Mérettábla tengelyei (alap: sor = kinyúlás, oszlop = szélesség; ZIP-nél pl. magasság)
  matrixRowAxis?: SizeAxis;
  matrixColAxis?: SizeAxis;
  // Kerekítés a táblázat méreteihez: 'up' = következő nagyobb (alap), 'nearest' = legközelebbi
  matrixRowSnap?: 'up' | 'nearest';
  matrixColSnap?: 'up' | 'nearest';
  // Nettó méret: a bruttó méretből levonandó profilok stb. (cm, általában negatív)
  dimOffsets?: { widthCm?: number; projectionCm?: number; heightCm?: number };
  // Modulos szerkezet (a sablon moduleSplit beállítása szerint):
  splitByModule?: boolean; // modulonként árazva, az ár × modulszám
  perModule?: boolean; // darabszám × modulszám (pl. motor modulonként)
  minModules?: number; // csak legalább ennyi modulnál (pl. 2 modulos felár)
  maxModules?: number; // csak legfeljebb ennyi modulnál
  // Megjelenítés az árazóban: gyűjtemény (pl. „Világítás”), azon belül opciócsoport (pl. „LED a
  // keresztgerendákban”), amelynek tagjai rövid címkével választhatók (pl. „3 db”). Ha nincs megadva,
  // a név alapján automatikusan csoportosít.
  group?: string;
  choiceGroup?: string;
  choiceLabel?: string;
  choiceMulti?: boolean; // true: több is választható (pl. oldalak), false: legfeljebb egy
  // Csak pontosan ennyi modulnál a szélesség / kinyúlás mentén (pl. a gyártó 2 L táblázata)
  modulesWidth?: number;
  modulesProjection?: number;
  // Nem számít bele a százalékos tételek (pl. szerelés %) alapjába (pl. motor, távirányító)
  excludeFromPercentBase?: boolean;
  // Az ár egy másik (önálló) termék tételéből jön, pl. a pergolához kért oldalsó ZIP a Refleksol
  // 120 ZIP termékből: ugyanaz a tábla, ugyanaz a szerelési %, így mindenhol ugyanazt az árat adja.
  // Betöltéskor a resolvePriceSources tölti ki az árazási mezőket a forrásból.
  priceSource?: { templateId: string; materialId: string };
  // Saját modulokra bontás (a forrástermék szabálya szerint), pl. 700 cm fölött 2 árnyékoló
  ownSplit?: { axis: SizeAxis; maxCm: number };
  // Legfeljebb ennyi oldal választható (pl. kinyúlás oldal: 2 = mindkét oldal)
  maxSides?: number;
  // Az árazóban kiválasztott extra (alaptételként számol, de a PDF-ben külön csoportban)
  chosenExtra?: boolean;
  // Színválaszték (pl. alapszínek vagy választható RAL színek), a PDF-ben színmintaként
  colorOptions?: ColorOption[];
  colorTitle?: string;
}

/** Egy szín: kód (pl. RAL 7016), opcionális név / felület, mintaszín */
export interface ColorOption {
  id: string;
  code: string;
  name?: string;
  hex: string;
}

export type SizeAxis = 'width' | 'projection' | 'height';

/**
 * Automatikus modulokra bontás: modulszám = felfelé kerekítve (méret ÷ egy modul max. mérete)
 */
/** Extrák gyűjteménye az árazóban (pl. Világítás), saját képpel és leírással */
export interface ExtraGroupConfig {
  id: string;
  name: string;
  description?: string;
  imageUrl?: string;
}

/** Feltételes méretkorlát: ha a feltételek teljesülnek, ezek a maximumok érvényesek */
export interface ConditionalSizeRule {
  id: string;
  label?: string; // magyarázat az árazóban, pl. „2 modulnál max. 550 cm kinyúlás”
  mountType?: MountType; // csak ennél a beépítésnél
  ifWidthOverCm?: number; // csak ha a szélesség ennél nagyobb
  ifProjectionOverCm?: number; // csak ha a kinyúlás ennél nagyobb
  maxWidthCm?: number;
  maxProjectionCm?: number;
  maxHeightCm?: number;
}

export interface ModuleSplitRule {
  axis: 'width' | 'projection';
  maxCm: number;
  maxModules?: number;
  // Egyedi modulhatárok növekvő sorrendben (pl. [500, 900, 1300]: 1 modul 500-ig, 2 modul 900-ig,
  // 3 modul 1300-ig). Ha meg van adva, ez dönt a maxCm / maxModules helyett.
  breakpointsCm?: number[];
}

/**
 * Menürendszer - a legfelső szint (pl. Pergola, Karos napellenző, Utólagos ledezés,
 * Fényárnyékoló, Kocsibeálló). A sorrend és a tartalom bármikor átírható.
 */
export interface ProductMenu {
  id: string;
  name: string;
  description: string;
  enabled: boolean;
  order: number;
}

/**
 * Sablon állapota a sablonkezelőben:
 * - active: normál, mindig látszik az árazóban
 * - inactive: nem jelenik meg az árazóban
 * - seasonal: időszakos termék (látszik, jelölve)
 * - test: tesztsablon (csak külön bekapcsolva látszik)
 */
export type TemplateStatus = 'active' | 'inactive' | 'seasonal' | 'test';

/**
 * Egy modul gyártható méretkorlátai (cm). 0 vagy üres = nincs korlát.
 * Ebből dolgozik az okos szűrő.
 */
export interface TemplateSizeLimits {
  minWidthCm?: number;
  maxWidthCm?: number;
  minProjectionCm?: number;
  maxProjectionCm?: number;
  minHeightCm?: number;
  maxHeightCm?: number;
}

/**
 * Hivatkozás a gyártói katalógusra / ár PDF-re (a ~200 oldalas katalógusból hol van a termék).
 */
export interface CatalogReference {
  pdfFile?: string;       // pl. "Bioklimatikus_arlista_2026.pdf"
  pages?: string;         // pl. "47-49"
  productAlias?: string;  // gyártói / fantázianév, ha eltér a mi elnevezésünktől
  note?: string;
}

/**
 * Haszon (X) és szerelés (X, Y) képlet:
 * - markup_percent: katalógusár × (1 + X%)
 * - margin_percent: a végösszeg X%-a a haszon → katalógusár / (1 − X%)
 * - fixed: fix X EUR haszon sablononként (az alaptételekre arányosan elosztva)
 * Szerelés: assemblyFixedEur (X) + assemblyPerM2Eur (Y) × tetőfelület m²
 */
export type ProfitMode = 'markup_percent' | 'margin_percent' | 'fixed';

export interface PricingFormulaConfig {
  profitMode: ProfitMode;
  profitValue: number;
  assemblyFixedEur: number;
  assemblyPerM2Eur: number;
  assemblyLabel: string;
  confirmedByOwner: boolean; // Balázs írásban megadta-e a végleges képletet
}

/**
 * Árkorrekció indoklással (pl. "+300 EUR szükséges átalakítás miatt").
 * Ha nem látható a vevő számára, a PDF-ben az első alaptétel árába olvad bele.
 */
export interface PriceAdjustment {
  id: string;
  label: string;
  amountEur: number;
  reason: string;
  visibleToCustomer: boolean;
}

/**
 * Fő kategória / Termékcsoport (pl. Pergola, Előtető, Napellenző, Üvegtető, Üvegfal, LED világítás)
 */
export interface ProductCategory {
  id: string;
  name: string;               // pl. "Napellenző", "Pergola", "Üvegfal", "LED világítás"
  shortName: string;
  description: string;
  questionPrompt: string;     // pl. "Kér az ügyfél napellenzőt?"
  categoryType: 'main_structure' | 'accessory'; // Fő szerkezet vagy kiegészítő
  allowMultipleTemplates: boolean; // Több sablon is kiválasztható-e egyszerre
  order: number;
  menuId?: string;            // Melyik menüponthoz tartozik
  imageUrl?: string;          // Kép a végigvezetett árazó termékválasztójában
}

/**
 * Sablon (pl. Napellenzőn belül 1. sablon, 2. sablon, 3. sablon...)
 * Tartalmazza a sablon szövegdobozait, képeit+képaláírásait, valamint a termékeket/anyagokat.
 */
export interface QuoteTemplate {
  id: string;
  categoryId: string;
  name: string;               // pl. "Prémium Kazettás Napellenző", "Bioklimatikus Pergola Sablon A"
  subtitle: string;           // Rövid alcím / műszaki kiemelés
  enabled: boolean;
  status?: TemplateStatus;
  order?: number;
  sizeLimits?: TemplateSizeLimits;
  catalogRef?: CatalogReference;
  moduleSplit?: ModuleSplitRule; // régi, egytengelyes szabály (moduleSplits váltja)
  // Modulokra bontás tengelyenként (szélesség és/vagy kinyúlás), modulszám = szorzatuk
  moduleSplits?: ModuleSplitRule[];
  // Elforgatva is építhető (pl. SOLARE lamellái mindkét irányban állhatnak): ha így kevesebb modul kell,
  // a szerkezet ára felcserélt szélességgel és kinyúlással számol (az oldalsó extrák maradnak)
  allowRotate?: boolean;
  // További kategóriák, ahol ez a sablon is megjelenik (pl. Hydra a tetőre építhetők között is)
  alsoInCategoryIds?: string[];
  // Milyen beépítéssel kérhető (üres = bármelyikkel)
  mountTypes?: MountType[];
  // Feltételes méretkorlátok (pl. szabadon állóként max. 450 × 500, 800 cm felett max. 400 kinyúlás)
  sizeRules?: ConditionalSizeRule[];
  // Ha meg van adva, felülírja a globális haszon / szerelés képletet ennél a sablonnál
  pricingOverride?: Partial<PricingFormulaConfig>;
  // Sablon szövegdobozok (automatikus {{ugyfel_nev}}, {{meret}} stb. helyettesítéssel)
  introText: string;          // Sablon bevezető szövegdoboz
  closingText: string;        // Sablon záró / összegzés alatti szövegdoboz
  textBlocks: CustomTextBlock[]; // További külön szövegdobozok
  // Saját "Információ" blokk (pl. más garancia, átfutási idő); üres = a Beállításokban megadott általános szöveg
  infoText?: string;
  // Sablonhoz tartozó fotók + alájuk írható szövegdobozok
  photos: PhotoCaptionBlock[];
  // Sablonhoz tartozó termékek, anyagok, opciók és munkadíjak
  materials: TemplateMaterialItem[];
  createdAt: string;
  updatedAt: string;
}

/**
 * Feltöltött képek médiatára (hogy a feltöltött fotókat újra fel lehessen használni)
 */
export interface UploadedMediaItem {
  id: string;
  filename: string;
  originalName: string;
  url: string;
  category?: string;
  uploadedAt: string;
}

/**
 * A generálandó és utólag is szerkeszthető PDF árajánlat táblázatának egy sora
 */
export interface QuoteTableRow {
  id: string;
  materialId?: string;
  name: string;               // Szerkeszthető szövegdoboz: Tétel / Termék / Anyag megnevezése
  description?: string;       // Opcionális kiegészítő sorleírás
  quantityLabel: string;      // Algoritmus által számolt mennyiség/méret (pl. "24.0 m²", "1 db")
  listPriceEur: number;       // Algoritmus által számolt listaár (EUR)
  discountPriceEur: number;   // Algoritmus által számolt kedvezményes ár (EUR)
  formulaSummary?: string;    // Rövid leírás az algoritmus számításáról (pl. "24.0 m² × 350 EUR/m²")
  currency: CurrencyCode;
  itemRole: 'base' | 'optional' | 'gift';
  included: boolean;          // Benne van-e a PDF-ben
  note: string;               // Szerkeszthető megjegyzés (pl. "-20%", "Ajándék", "Opció")
  photos: PhotoCaptionBlock[]; // Termékhez csatolt fotók + fotó alatti szövegdobozok
  algorithm?: TemplateMaterialItem; // A tétel mögötti árazási algoritmus
  costEur?: number;           // Katalógus (beszerzési) ár haszon nélkül - belső adat, nem kerül a PDF-be
  priceOverridden?: boolean;  // Kézzel átírt ár - újraszámoláskor megmarad
  quantityOverridden?: boolean;
  systemRole?: 'assembly';    // Képletből generált sor (szerelés)
  chosenExtra?: boolean;      // Az árazóban kiválasztott extra: a PDF-ben a szerkezet összesítője után, külön
  outOfRange?: boolean;       // A méret kívül esik a mérettáblán
}

/**
 * Blokkos, utólag is szabadon szerkeszthető PDF Dokumentum Elemek (QuoteDocumentBlock)
 */
export type QuoteBlockType =
  | 'text_box'         // Különálló szövegrész / szövegdoboz (megszólítás, bevezető, műszaki szöveg, záradék)
  | 'photo_box'        // Önálló fotó + fotó feletti/alatti szövegdoboz
  | 'template_section' // Felrakott sablon blokk (cím, szövegdobozok, fotók+leírások, termékek és ártáblázat)
  | 'page_break';      // Explicit oldaltörés a PDF-ben

export interface QuoteDocumentBlock {
  id: string;
  type: QuoteBlockType;
  // 1) 'text_box' mezők
  title?: string;
  content?: string;
  textStyle?: 'greeting' | 'normal' | 'highlight' | 'footer_info';
  bold?: boolean;
  align?: 'left' | 'center' | 'right';
  // 2) 'photo_box' mezők
  photo?: PhotoCaptionBlock;
  // 3) 'template_section' mezők
  templateId?: string;
  categoryId?: string;
  sectionTitle?: string;
  sectionSubtitle?: string;
  sectionIntroText?: string;
  sectionPhotos?: PhotoCaptionBlock[];
  tableTitle?: string;
  tableHeaders?: [string, string, string, string];
  rows?: QuoteTableRow[];
  autoCalculateTotals?: boolean;
  customTotalBaseEur?: number;
  customTotalBaseHuf?: number;
  sectionClosingText?: string;
  adjustments?: PriceAdjustment[];
  manualTotalEur?: number | null; // Végösszeg kézi felülírása (EUR)
  manualTotalHuf?: number | null; // …vagy forintban (ekkor az EUR ebből számolódik)
  manualTotalCurrency?: 'EUR' | 'HUF';
  isManualSection?: boolean;      // Egyedi / több modulos, kézzel árazott szekció
}

/**
 * Egy elmentett, bármikor újraszerkeszthető és újragenerálható Árajánlat (QuoteRecord)
 */
export interface QuoteRecord {
  id: string;
  quoteNumber: string;
  filename?: string;
  createdAt: string;
  updatedAt: string;
  status: QuoteStatus;
  // Ügyfél & Név-automatizáció adatok
  customerName: string;       // Ügyfél teljes neve (pl. "Kovács János")
  greetingName: string;       // Megszólítás (pl. "Kovács János" vagy "János")
  email: string;
  phone: string;
  city: string;
  inquiryNotes: string;       // Weboldalról bejött nyers megkeresés / ügyféligény szövege
  // Méretek (cm) és alapbeállítások
  widthCm: number;            // Szélesség / Hosszúság (cm), pl. 600 cm (6 m)
  projectionCm: number;       // Kinyúlás / Mélység (cm), pl. 400 cm (4 m)
  heightCm: number;           // Magasság (cm), pl. 250 cm
  mountType: MountType;       // Beépítés módja
  eurHufRate: number;         // EUR/HUF árfolyam
  deliveryFeeHuf: number;     // Szállítási díj (HUF)
  // Végigvezetett árazóban kiválasztott kategóriák és sablonok
  selectedCategoryIds: string[];
  selectedTemplateIds: string[];
  // A teljes, blokkosan szerkeszthető PDF dokumentum felépítése
  blocks: QuoteDocumentBlock[];
  // Összesített fő árak a listázáshoz
  primaryTotalEur: number;
  primaryTotalHuf: number;
  isEditedAfterGeneration: boolean;
  // Kiküldés és megnyitás-követés
  trackingId?: string;
  sentToEmail?: string;
  sentAt?: string;
  sentCount?: number;
  openCount?: number;
  firstOpenedAt?: string;
  lastOpenedAt?: string;
  acceptedAt?: string;
}

/**
 * Korábbi ajánlatokból ismert ügyfél (a névmezőben választható)
 */
export interface KnownCustomer {
  name: string;
  greetingName: string;
  city: string;
  email: string;
  phone: string;
}

/**
 * Egy e-mailben kiküldött ajánlat megnyitása (követő pixel)
 */
export interface TrackingEvent {
  id: string;
  quoteId: string;
  customerName: string;
  email: string;
  openedAt: string;
  ipAddress: string;
  userAgent: string;
}

/**
 * Egy e-mail sablon (tárgy + szöveg). suggestFor: mely ajánlat-státusznál ajánlja fel elsőként.
 */
export interface EmailTemplate {
  id: string;
  name: string;
  subject: string;
  body: string;
  suggestFor?: QuoteStatus[];
}

export interface EmailSettings {
  senderName: string;
  senderEmail: string;
  smtpHost: string;
  smtpPort: number;
  smtpUser: string;
  smtpPass: string;
  templates: EmailTemplate[];
  defaultTemplateId: string;
  enableTrackingPixel: boolean;
  publicBaseUrl: string; // a pixel csak nyilvánosan elérhető címről működik
}

/**
 * Rendszer és PDF megjelenési beállítások
 */
/**
 * Ajánlat sorszám formátuma:
 * - year_seq: OSP-2026-001 (évente újrainduló)
 * - yearmonth_seq: OSP-202610-001 (havonta újrainduló)
 * - seq: OSP-0001 (folyamatos)
 */
export type QuoteNumberFormat = 'year_seq' | 'yearmonth_seq' | 'seq';

/**
 * Gyors extra a sablonépítőben (LED, fűtőszál, motor…). Bővíthető a Beállításokban.
 * price: alapár (fix ár, vagy EUR/m², EUR/fm); 1 = még nincs megadva.
 */
export interface ExtraPreset {
  id: string;
  name: string;
  /** percentage: a szerkezet (alaptételek) árának X%-a; ilyenkor a price a százalék */
  pricingMode: 'fixed' | 'per_m2' | 'per_lm' | 'percentage';
  dimensionSource?: DimensionSource;
  unitLabel: string;
  price: number;
  perSide?: boolean;
}

export interface SystemConfig {
  companyName: string;
  companySubtitle: string;
  companyEmail: string;
  companyPhone: string;
  companyWebsite: string;
  defaultEurHufRate: number;
  defaultDeliveryFeeHuf: number;
  defaultListPriceMultiplier: number; // pl. 1.25 (+25% listaár)
  defaultDiscountLabel: string;       // pl. "-20%"
  // Alapértelmezett globális szövegsablonok (automatikus helyettesítőkkel)
  defaultGreetingTemplate: string;
  defaultIntroTemplate: string;
  defaultClosingInfoTemplate: string;
  // Opcionális saját feltöltött PDF dizájn elemek (ha üres, tiszta modern fejlécet rajzol)
  pdfPageBackgroundUrl?: string;      // Saját A4-es fejléc/lábléc háttérkép URL
  pdfLogoUrl?: string;                // Saját logó URL
  pdfSignatureCardUrl?: string;       // Saját névjegy / aláírás kép URL a PDF végére
  pricingFormula: PricingFormulaConfig;
  emailSettings: EmailSettings;
  quoteNumberPrefix: string;
  quoteNumberFormat: QuoteNumberFormat;
  quoteNumberDigits: number;
  extraPresets: ExtraPreset[];
  // Az árazóban az extrák gyűjteményei (sorrend, név, kép) - teljesen szerkeszthető
  extraGroups?: ExtraGroupConfig[];
}

export interface DatabaseSchema {
  config: SystemConfig;
  menus: ProductMenu[];
  categories: ProductCategory[];
  templates: QuoteTemplate[];
  quotes: QuoteRecord[];
  mediaLibrary: UploadedMediaItem[];
  trackingEvents: TrackingEvent[];
  // A katalógus (menük, kategóriák, termékek) változata: ha egy telepítés nagyobbat hoz, a
  // tartós tárolóban lévő katalógus frissül belőle (az ajánlatok és beállítások maradnak)
  dataRevision?: number;
}
