import {
  DimensionSource,
  EmailSettings,
  ColorOption,
  EmailTemplate,
  ExtraGroupConfig,
  ExtraPreset,
  MountType,
  QuoteNumberFormat,
  PricingFormulaConfig,
  ProductMenu,
  ProductPricingMode,
  ProfitMode,
  QuoteStatus,
  SystemConfig,
  TemplateMaterialItem,
  TemplateStatus,
} from './types';

export const MOUNT_TYPES: {
  id: MountType;
  label: string;
  description: string;
  imageUrl?: string;
}[] = [
  {
    id: 'Épülethez rögzített',
    label: 'Épülethez rögzített',
    description: 'Homlokzathoz / falhoz csatlakozó kivitel',
    imageUrl: '/uploads/legacy/beepites/epulethez_rogzitett.png',
  },
  {
    id: 'Szabadon álló',
    label: 'Szabadon álló',
    description: 'Önálló lábakon álló szerkezet',
    imageUrl: '/uploads/legacy/beepites/szabadon_allo.png',
  },
  {
    id: 'Lábak nélkül',
    label: 'Lábak nélkül',
    description: 'Falak közé vagy meglévő szerkezetre, oszlopok nélkül',
    imageUrl: '/uploads/catalog-2026/isola-2/photo-3.jpg',
  },
  {
    id: 'Meglévő szerkezetre',
    label: 'Meglévő szerkezetre',
    description: 'Meglévő pergola, tető vagy nyílászáró fölé/alá',
  },
  {
    id: 'Egyedi',
    label: 'Egyedi beépítés',
    description: 'Speciális helyszíni kialakítás',
  },
];

export const PRICING_MODE_OPTIONS: {
  id: ProductPricingMode;
  label: string;
  shortLabel: string;
  description: string;
}[] = [
  {
    id: 'fixed',
    label: 'Fix darabár / csomagár',
    shortLabel: 'Fix ár',
    description: 'Fix összeg (pl. motor, távirányító, LED szett, szenzor, kiegészítő)',
  },
  {
    id: 'per_m2',
    label: 'Négyzetméter (m²) alapú ár',
    shortLabel: 'm² ár',
    description: 'Felület (m²) × megadott m² egységár',
  },
  {
    id: 'tiered_m2',
    label: 'Sávos négyzetméter (m²) ár',
    shortLabel: 'Sávos m² ár',
    description: 'Mérettől függő m² ár (pl. 15 m²-ig X EUR/m², 15 m² felett Y EUR/m²)',
  },
  {
    id: 'base_plus_m2',
    label: 'Fix alapár + m² ár',
    shortLabel: 'Alapár + m²',
    description: 'Fix induló alapár + minden négyzetméter után m² felár',
  },
  {
    id: 'per_lm',
    label: 'Folyóméter (fm) alapú ár',
    shortLabel: 'Folyóméter ár',
    description: 'Szélesség, kinyúlás vagy kerület (fm) × folyóméter ár',
  },
  {
    id: 'base_plus_lm',
    label: 'Fix alapár + folyóméter (fm) ár',
    shortLabel: 'Alapár + fm',
    description: 'Fix induló alapár + folyóméterenkénti díj',
  },
  {
    id: 'matrix_cm',
    label: 'Mérettábla / Mátrix árazás (cm × cm)',
    shortLabel: 'Mérettábla (Mátrix)',
    description: 'Szélesség (cm) és Kinyúlás/Magasság (cm) táblázatból kikeresett ár',
  },
  {
    id: 'percentage',
    label: 'Százalékos díj (pl. Szerelési munkadíj)',
    shortLabel: 'Százalékos (%)',
    description: 'A sablonban lévő alaptételek összegének megadott százaléka (minimum díjjal)',
  },
];

export const DIMENSION_SOURCE_OPTIONS: {
  id: DimensionSource;
  label: string;
  unit: 'm²' | 'fm';
}[] = [
  { id: 'roof', label: 'Tetőfelület: Szélesség × Kinyúlás (m²)', unit: 'm²' },
  { id: 'front_wall', label: 'Első oldal: Szélesség × Magasság (m²)', unit: 'm²' },
  { id: 'side_wall', label: 'Oldalsó fal: Kinyúlás × Magasság (m²)', unit: 'm²' },
  { id: 'both_walls', label: 'Szélesség + Kinyúlás oldalfal × Magasság (m²)', unit: 'm²' },
  { id: 'all_walls', label: 'Mind a 4 oldal kerülete × Magasság (m²)', unit: 'm²' },
  { id: 'width_lm', label: 'Szélesség / Hosszúság (folyóméter)', unit: 'fm' },
  { id: 'proj_lm', label: 'Kinyúlás / Mélység (folyóméter)', unit: 'fm' },
  { id: 'height_lm', label: 'Magasság (folyóméter)', unit: 'fm' },
  { id: 'front_side_lm', label: 'Szélesség + Kinyúlás együtt (folyóméter)', unit: 'fm' },
  { id: 'perimeter_lm', label: 'Teljes kerület: 2 × (Szélesség + Kinyúlás) (fm)', unit: 'fm' },
];

export const STATUS_CONFIG: Record<
  QuoteStatus,
  { label: string; badgeClass: string }
> = {
  piszkozat: {
    label: 'Piszkozat',
    badgeClass: 'bg-slate-100 text-slate-700 border-slate-300',
  },
  kikuldve: {
    label: 'Kiküldve',
    badgeClass: 'bg-blue-50 text-blue-700 border-blue-200',
  },
  megnyitva: {
    label: 'Megnyitva',
    badgeClass: 'bg-amber-50 text-amber-700 border-amber-200',
  },
  elfogadva: {
    label: 'Elfogadva',
    badgeClass: 'bg-green-50 text-green-700 border-green-200',
  },
  elutasitva: {
    label: 'Elutasítva',
    badgeClass: 'bg-rose-50 text-rose-700 border-rose-200',
  },
};

export const QUICK_CATEGORY_SUGGESTIONS = [
  {
    name: 'Pergola',
    questionPrompt: 'Kér az ügyfél pergolát?',
    categoryType: 'main_structure' as const,
    description: 'Bioklimatikus, ponyvás vagy fix tetős pergolák',
  },
  {
    name: 'Előtető',
    questionPrompt: 'Kér az ügyfél előtetőt?',
    categoryType: 'main_structure' as const,
    description: 'Polikarbonát, üveg vagy alumínium előtetők',
  },
  {
    name: 'Üvegtető',
    questionPrompt: 'Kér az ügyfél üvegtetőt?',
    categoryType: 'main_structure' as const,
    description: 'Edzett, laminált biztonsági üvegtetős rendszerek',
  },
  {
    name: 'Napellenző',
    questionPrompt: 'Kér az ügyfél napellenzőt?',
    categoryType: 'accessory' as const,
    description: 'Kazettás, könyökkaros és tetőre szerelhető napellenzők',
  },
  {
    name: 'Üvegfal',
    questionPrompt: 'Kér az ügyfél üvegfalat?',
    categoryType: 'accessory' as const,
    description: 'Keret nélküli eltolható vagy fix biztonsági üvegfalak',
  },
  {
    name: 'Oldalsó árnyékoló (ZIP)',
    questionPrompt: 'Kér az ügyfél oldalsó árnyékolót (ZIP)?',
    categoryType: 'accessory' as const,
    description: 'Motoros, szélálló oldalsó textilárnyékoló rendszerek',
  },
  {
    name: 'LED világítás',
    questionPrompt: 'Kér az ügyfél LED világítást?',
    categoryType: 'accessory' as const,
    description: 'Integrált LED szalag, spot világítás vagy RGBW rendszer',
  },
];

// Beszúrható változók: name = rövid név a gombon, label = magyarázat (súgó)
export const TEMPLATE_VARIABLES_HELP = [
  { token: '{{ugyfel_nev}}', name: 'Ügyfél neve', label: 'Ügyfél teljes neve (pl. Kovács János)' },
  { token: '{{megszolitas}}', name: 'Megszólítás', label: 'Megszólítás (pl. Kovács János / János)' },
  { token: '{{telepules}}', name: 'Település', label: 'Település (pl. Budapest)' },
  { token: '{{meret}}', name: 'Méret (cm)', label: 'Méret cm-ben (pl. 600x400x250 cm)' },
  { token: '{{meret_m}}', name: 'Méret (m)', label: 'Méret méterben (pl. 6 x 4 m)' },
  { token: '{{szelesseg}}', name: 'Szélesség', label: 'Szélesség cm-ben (pl. 600)' },
  { token: '{{kinyulas}}', name: 'Kinyúlás', label: 'Kinyúlás cm-ben (pl. 400)' },
  { token: '{{magassag}}', name: 'Magasság', label: 'Magasság cm-ben (pl. 250)' },
  { token: '{{m2}}', name: 'Alapterület', label: 'Alapterület m²-ben (pl. 24.0 m²)' },
  { token: '{{beepites}}', name: 'Beépítés', label: 'Beépítés módja (pl. Épülethez rögzített)' },
  { token: '{{arfolyam}}', name: 'Árfolyam', label: 'EUR/HUF árfolyam (pl. 400)' },
  { token: '{{szallitas}}', name: 'Szállítási díj', label: 'Szállítási díj Ft-ban (pl. 40.000 Ft)' },
  { token: '{{datum}}', name: 'Mai dátum', label: 'Mai dátum (pl. 2026. 10. 18.)' },
  { token: '{{hatarido}}', name: 'Határidő', label: 'Megrendelési határidő: a hónap utolsó napja, 10 napon belül a következő hónapé (pl. Október 31)' },
];

// Mintaadatok a szövegsablonok előnézetéhez (Beállítások)
export const SAMPLE_VARIABLE_CONTEXT = {
  customerName: 'Kovács János',
  greetingName: 'Kovács János',
  city: 'Szentendre',
  widthCm: 600,
  projectionCm: 400,
  heightCm: 250,
  mountType: 'Épülethez rögzített',
  eurHufRate: 400,
  deliveryFeeHuf: 40000,
};

// E-mailben ezek is használhatók
export const EMAIL_VARIABLES_HELP = [
  ...TEMPLATE_VARIABLES_HELP,
  { token: '{{sorszam}}', name: 'Sorszám', label: 'Ajánlat sorszáma (pl. OSP-2026-001)' },
  { token: '{{osszeg_eur}}', name: 'Összeg (EUR)', label: 'Ajánlat összege EUR-ban, csak a szám (utána írd: EUR)' },
  { token: '{{osszeg_huf}}', name: 'Összeg (Ft)', label: 'Ajánlat összege forintban, csak a szám (utána írd: Ft)' },
  { token: '{{ceg}}', name: 'Cégnév', label: 'Cégnév (Beállítások)' },
  { token: '{{telefon}}', name: 'Telefon', label: 'Cég telefonszáma' },
  { token: '{{weboldal}}', name: 'Weboldal', label: 'Cég weboldala' },
  { token: '{{email}}', name: 'Cég e-mail', label: 'Cég e-mail címe' },
];

// A 2026.10.18-i megbeszélésen elhangzott termékkör (a sorrend a sablonkezelőben átírható)
export const DEFAULT_MENUS: ProductMenu[] = [
  { id: 'menu_pergola', name: 'Pergola', description: 'Bioklimatikus és egyéb pergolák', enabled: true, order: 1 },
  { id: 'menu_napellenzo', name: 'Karos napellenző', description: 'Kazettás, kazetta nélküli és kézi tekerős modellek', enabled: true, order: 2 },
  { id: 'menu_ledezes', name: 'Utólagos ledezés', description: 'Sima és körbefutó LED világítás meglévő szerkezetre', enabled: true, order: 3 },
  { id: 'menu_arnyekolo', name: 'Fényárnyékoló', description: 'ZIP, oldalsó és egyéb árnyékolók', enabled: true, order: 4 },
  { id: 'menu_kocsibeallo', name: 'Kocsibeálló', description: 'Kocsibeálló szerkezetek', enabled: true, order: 5 },
];

// A megbeszélésen elhangzott extrák (a Beállításokban szerkeszthetők, bővíthetők; 1 = még nincs ár)
export const DEFAULT_EXTRA_PRESETS: ExtraPreset[] = [
  { id: 'ex_led', name: 'LED világítás (sima)', pricingMode: 'fixed', unitLabel: 'szett', price: 1 },
  { id: 'ex_led_kor', name: 'LED világítás (körbefutó)', pricingMode: 'per_lm', dimensionSource: 'perimeter_lm', unitLabel: 'fm', price: 1 },
  { id: 'ex_futes', name: 'Fűtőszál', pricingMode: 'fixed', unitLabel: 'db', price: 1 },
  { id: 'ex_vaz', name: 'Erősített váz', pricingMode: 'fixed', unitLabel: 'db', price: 1 },
  { id: 'ex_lamella', name: 'Lamellák', pricingMode: 'per_m2', dimensionSource: 'roof', unitLabel: 'm²', price: 1 },
  { id: 'ex_uveg', name: 'Üvegfal', pricingMode: 'fixed', unitLabel: 'oldal', price: 1, perSide: true },
  { id: 'ex_ip', name: 'IP védettség', pricingMode: 'fixed', unitLabel: 'db', price: 1 },
  { id: 'ex_motor', name: 'Motor', pricingMode: 'fixed', unitLabel: 'db', price: 1 },
];

/** Gyors extra → sablon tétel mezői (opcionális, alapból nincs bepipálva) */
export function extraPresetToMaterial(preset: ExtraPreset): Partial<TemplateMaterialItem> {
  const price = Math.max(1, Number(preset.price) || 1);
  return {
    name: preset.name,
    pricingMode: preset.pricingMode,
    dimensionSource: preset.dimensionSource || (preset.pricingMode === 'per_lm' ? 'width_lm' : 'roof'),
    unitLabel: preset.unitLabel,
    perSide: Boolean(preset.perSide),
    basePrice: price,
    unitPrice: price,
  };
}

// Gyártói színpaletták (a régi színkártyák alapján), a sablonépítőben egy kattintással felvehetők
export const COLOR_PALETTES: { id: string; name: string; colors: ColorOption[] }[] = [
  {
    id: 'ral25',
    name: 'RAL 25 szín (SOLARE)',
    colors: [
    { id: 'ral25_0', code: 'RAL 9016', name: 'matt', hex: '#f9f9f7' },
    { id: 'ral25_1', code: 'RAL 9010', name: 'matt', hex: '#f4f2eb' },
    { id: 'ral25_2', code: 'RAL 9001', name: 'matt', hex: '#ece7dc' },
    { id: 'ral25_3', code: 'RAL 1013', name: 'matt', hex: '#e5dfcf' },
    { id: 'ral25_4', code: 'RAL 1015', name: 'matt', hex: '#e7dac1' },
    { id: 'ral25_5', code: 'VSR 240', name: 'szatén', hex: '#d8c7ad' },
    { id: 'ral25_6', code: 'RAL 7035', name: 'matt', hex: '#cccecd' },
    { id: 'ral25_7', code: 'RAL 9006', name: 'matt', hex: '#aeafb1' },
    { id: 'ral25_8', code: 'RAL 9007', name: 'matt', hex: '#8f8f91' },
    { id: 'ral25_9', code: 'RAL 7037', name: 'matt', hex: '#8a8b8e' },
    { id: 'ral25_10', code: 'RAL 7001', name: 'matt', hex: '#98a1ac' },
    { id: 'ral25_11', code: 'RAL 7012', name: 'matt', hex: '#6e757a' },
    { id: 'ral25_12', code: 'DB 703', name: 'matt', hex: '#6c6a70' },
    { id: 'ral25_13', code: 'RAL 7015', name: 'matt', hex: '#646772' },
    { id: 'ral25_14', code: 'RAL 7024', name: 'matt', hex: '#5b5d68' },
    { id: 'ral25_15', code: 'RAL 7016', name: 'matt', hex: '#464e5a' },
    { id: 'ral25_16', code: 'RAL 7043', name: 'matt', hex: '#434e58' },
    { id: 'ral25_17', code: 'RAL 7021', name: 'matt', hex: '#444851' },
    { id: 'ral25_18', code: 'FSM 71319', name: 'matt', hex: '#404042' },
    { id: 'ral25_19', code: 'RAL 7022', name: 'matt', hex: '#323630' },
    { id: 'ral25_20', code: 'RAL 8014', name: 'matt', hex: '#643d25' },
    { id: 'ral25_21', code: 'RAL 8003', name: 'matt', hex: '#7c3f18' },
    { id: 'ral25_22', code: 'RAL 8016', name: 'matt', hex: '#672b21' },
    { id: 'ral25_23', code: 'RAL 7039', name: 'matt', hex: '#60625b' },
    { id: 'ral25_24', code: 'VSR 780', name: 'matt', hex: '#4a4538' },
    ],
  },
  {
    id: 'gibus',
    name: 'Alapszínek (Gibus / KE)',
    colors: [
    { id: 'gibus_0', code: 'Corten', name: 'rozsdabarna, durva', hex: '#713d16' },
    { id: 'gibus_1', code: 'RAL 7016 Iron', name: 'antracit, matt', hex: '#373e41' },
    { id: 'gibus_2', code: 'Carbon', name: 'fekete, durva', hex: '#0b0b0e' },
    { id: 'gibus_3', code: 'RAL 9010', name: 'fehér, matt', hex: '#f7f6f2' },
    { id: 'gibus_4', code: 'RAL 9010', name: 'fehér, fényes', hex: '#ffffff' },
    ],
  },
  {
    id: 'selt',
    name: 'Alapszínek (Selt)',
    colors: [
    { id: 'selt_0', code: 'RAL 9010', name: 'matt', hex: '#f2f0eb' },
    { id: 'selt_1', code: 'RAL 9006', name: 'matt', hex: '#a9abad' },
    { id: 'selt_2', code: 'RAL 9005', name: 'matt', hex: '#23232b' },
    { id: 'selt_3', code: 'RAL 7016', name: 'matt', hex: '#454b57' },
    { id: 'selt_4', code: 'FSM 71319', name: 'struktúrált', hex: '#454545' },
    ],
  },
  {
    id: 'glass',
    name: 'Alapszínek (Polifix / Glassfix)',
    colors: [
    { id: 'glass_0', code: 'RAL 7016', name: 'antracit', hex: '#233039' },
    { id: 'glass_1', code: 'RAL 9016', name: 'fehér', hex: '#fdfdf8' },
    ],
  },
];

export const TEMPLATE_STATUS_OPTIONS: {
  id: TemplateStatus;
  label: string;
  badgeClass: string;
}[] = [
  { id: 'active', label: 'Aktív', badgeClass: 'bg-green-50 text-green-700 border-green-200' },
  { id: 'seasonal', label: 'Időszakos', badgeClass: 'bg-amber-50 text-amber-700 border-amber-200' },
  { id: 'test', label: 'Teszt', badgeClass: 'bg-violet-50 text-violet-700 border-violet-200' },
  { id: 'inactive', label: 'Inaktív', badgeClass: 'bg-slate-100 text-slate-500 border-slate-300' },
];

export const PROFIT_MODE_OPTIONS: { id: ProfitMode; label: string; description: string }[] = [
  {
    id: 'markup_percent',
    label: 'Százalékos felár a katalógusárra',
    description: 'Eladási ár = katalógusár × (1 + X%)',
  },
  {
    id: 'margin_percent',
    label: 'A végösszeg X%-a a haszon',
    description: 'Eladási ár = katalógusár ÷ (1 − X%)',
  },
  {
    id: 'fixed',
    label: 'Fix összeg (EUR)',
    description: 'Sablononként X EUR, az alaptételekre arányosan elosztva',
  },
];

// A végleges képletet Balázs írásban adja meg - addig 0 haszonnal és 0 szereléssel számol
export const DEFAULT_PRICING_FORMULA: PricingFormulaConfig = {
  profitMode: 'markup_percent',
  profitValue: 0,
  assemblyFixedEur: 0,
  assemblyPerM2Eur: 0,
  assemblyLabel: 'Helyszíni összeszerelés',
  confirmedByOwner: false,
};

// Minta e-mail sablonok (a Beállításokban szerkeszthetők, bővíthetők)
export const DEFAULT_EMAIL_TEMPLATES: EmailTemplate[] = [
  {
    id: 'tpl_ajanlat',
    name: 'Árajánlat küldése',
    subject: 'Árajánlat - {{sorszam}} - {{ceg}}',
    body:
      'Kedves {{megszolitas}}!\n\nKöszönjük megkeresését! Mellékelten küldjük a(z) {{meret_m}} ({{meret}}) méretű szerkezetre vonatkozó, személyre szabott árajánlatunkat.\n\nAz ajánlat összege: {{osszeg_eur}} EUR + Áfa ({{osszeg_huf}} Ft + Áfa).\n\nHa {{hatarido}}-ig megrendeli az alapszerkezetet, kedvezményt tudunk biztosítani.\n\nAmennyiben ajánlatunk elnyerte tetszését, kérjük, jelezzen vissza, és egyeztetjük a helyszíni felmérés időpontját. Bármilyen kérdés esetén keressen minket bizalommal!\n\nÜdvözlettel:\n{{ceg}}\n{{telefon}} · {{weboldal}}',
    suggestFor: ['piszkozat'],
  },
  {
    id: 'tpl_emlekezteto',
    name: 'Emlékeztető',
    subject: 'Emlékeztető: árajánlatunk ({{sorszam}})',
    body:
      'Kedves {{megszolitas}}!\n\nNéhány napja elküldtük Önnek a(z) {{meret_m}} méretű szerkezetre vonatkozó árajánlatunkat ({{sorszam}}). Érdeklődnék, sikerült-e átnéznie?\n\nHa bármilyen kérdése van, vagy módosítana a méreten, kivitelen vagy az extrákon, szívesen átdolgozzuk az ajánlatot. A biztonság kedvéért újra mellékeljük a PDF-et.\n\nÜdvözlettel:\n{{ceg}}\n{{telefon}} · {{weboldal}}',
    suggestFor: ['kikuldve', 'megnyitva'],
  },
  {
    id: 'tpl_hatarido',
    name: 'Határidős kedvezmény',
    subject: 'Kedvezmény {{hatarido}}-ig - árajánlat {{sorszam}}',
    body:
      'Kedves {{megszolitas}}!\n\nSzeretnénk jelezni, hogy a mellékelt árajánlatban ({{sorszam}}) szereplő alapszerkezetre {{hatarido}}-ig leadott megrendelés esetén kedvezményt tudunk biztosítani.\n\nAz ajánlat összege: {{osszeg_eur}} EUR + Áfa ({{osszeg_huf}} Ft + Áfa). Ha szeretné, egyeztessünk egy helyszíni felmérést, ahol minden részletet pontosítunk.\n\nÜdvözlettel:\n{{ceg}}\n{{telefon}} · {{weboldal}}',
    suggestFor: [],
  },
  {
    id: 'tpl_felmeres',
    name: 'Helyszíni felmérés egyeztetése',
    subject: 'Helyszíni felmérés egyeztetése - {{sorszam}}',
    body:
      'Kedves {{megszolitas}}!\n\nKöszönjük visszajelzését! A pontos méretek és a beépítési körülmények egyeztetéséhez helyszíni felmérésre van szükség ({{telepules}}).\n\nKérjük, írjon néhány Önnek megfelelő időpontot a következő két hétből, és visszaigazoljuk. A felmérés után véglegesítjük az ajánlatot.\n\nÜdvözlettel:\n{{ceg}}\n{{telefon}} · {{weboldal}}',
    suggestFor: [],
  },
  {
    id: 'tpl_modositott',
    name: 'Módosított ajánlat',
    subject: 'Módosított árajánlat - {{sorszam}}',
    body:
      'Kedves {{megszolitas}}!\n\nAz egyeztetésünk alapján átdolgoztuk az árajánlatot, a módosított változatot mellékelten küldjük ({{meret_m}}, {{beepites}}).\n\nAz új összeg: {{osszeg_eur}} EUR + Áfa ({{osszeg_huf}} Ft + Áfa).\n\nHa minden rendben, kérjük, jelezzen vissza, és egyeztetjük a következő lépéseket.\n\nÜdvözlettel:\n{{ceg}}\n{{telefon}} · {{weboldal}}',
    suggestFor: [],
  },
  {
    id: 'tpl_koszonjuk',
    name: 'Köszönjük a megrendelést',
    subject: 'Köszönjük megrendelését! - {{sorszam}}',
    body:
      'Kedves {{megszolitas}}!\n\nKöszönjük megrendelését és bizalmát! A következő lépések:\n\n1. Elküldjük a szerződést és az előlegszámlát (a végösszeg 60%-a).\n2. Az előleg beérkezése után indul a gyártás, az átfutási idő 30-60 nap.\n3. A szerelés időpontját a gyártás végén egyeztetjük Önnel.\n\nA rendelés alapja a mellékelt ajánlat ({{sorszam}}). Kérdés esetén bármikor elérhet minket.\n\nÜdvözlettel:\n{{ceg}}\n{{telefon}} · {{weboldal}}',
    suggestFor: ['elfogadva'],
  },
];

export const DEFAULT_EMAIL_SETTINGS: EmailSettings = {
  senderName: 'OpenSky Pergola Kft.',
  senderEmail: 'info@openskypergola.hu',
  smtpHost: '',
  smtpPort: 587,
  smtpUser: '',
  smtpPass: '',
  templates: DEFAULT_EMAIL_TEMPLATES.map((t) => ({ ...t })),
  defaultTemplateId: 'tpl_ajanlat',
  enableTrackingPixel: true,
  publicBaseUrl: '',
};

/**
 * Az ajánlat státuszához illő sablon (pl. elfogadott ajánlatnál a köszönő levél), különben az alapértelmezett.
 */
export function suggestEmailTemplate(
  settings: EmailSettings,
  status: QuoteStatus | undefined
): EmailTemplate | undefined {
  const list = settings.templates || [];
  return (
    (status && list.find((t) => t.suggestFor?.includes(status))) ||
    list.find((t) => t.id === settings.defaultTemplateId) ||
    list[0]
  );
}

// Az extrák alap gyűjteményei (a Beállításokban átnevezhető, bővíthető, képpel ellátható)
export const DEFAULT_EXTRA_GROUPS: ExtraGroupConfig[] = [
  { id: 'grp_light', name: 'Világítás', description: 'LED-szalagok, spotok, RGB', imageUrl: '/uploads/catalog-2026/led/photo-2.jpg' },
  { id: 'grp_shade', name: 'Oldalzárás és árnyékolás', description: 'ZIP árnyékolók, üvegfalak, tetőárnyékolók' },
  { id: 'grp_heat', name: 'Fűtés', description: 'Infra hősugárzók', imageUrl: '/uploads/catalog-2026/heaters/photo-1.jpg' },
  { id: 'grp_control', name: 'Érzékelők és vezérlés', description: 'Eső-, szél-, napfényérzékelő, okosotthon', imageUrl: '/uploads/catalog-2026/automation/photo-5.jpg' },
  { id: 'grp_colour', name: 'Szín', description: 'Egyedi RAL és gyári színek', imageUrl: '/uploads/catalog-2026/colours-ke/colours-1.jpg' },
  { id: 'grp_other', name: 'Egyéb' },
];

export const DEFAULT_SYSTEM_CONFIG: SystemConfig = {
  companyName: 'OpenSky Pergola Kft.',
  companySubtitle: 'Pergolák • Napellenzők • Árnyékolók • LED • Kocsibeállók',
  companyEmail: 'info@openskypergola.hu',
  companyPhone: '+36 70 676 0145',
  companyWebsite: 'openskypergola.hu',
  defaultEurHufRate: 400,
  defaultDeliveryFeeHuf: 40000,
  defaultListPriceMultiplier: 1.25,
  defaultDiscountLabel: '-20%',
  defaultGreetingTemplate: 'Kedves {{megszolitas}}!',
  defaultIntroTemplate:
    'Örömmel fogadtuk megkeresését! Kérésének megfelelően küldjük személyre szabott árajánlatunkat az Ön által megadott ({{meret_m}} / {{meret}}, {{beepites}}) paraméterek alapján.',
  // A korábbi (Python) rendszer ajánlataiból átvett feltételek
  defaultClosingInfoTemplate:
    'Ha {{hatarido}}-ig megrendeli az alapszerkezetet, kedvezményt tudunk biztosítani!\n\n' +
    '• Az ajánlat érvényes 30 napig\n' +
    '• EUR áraink az aktuális nap MNB középárfolyamán számítandók (ajánlatírás napján: {{arfolyam}} Ft/EUR)\n' +
    '• Szállítási költség ide: {{telepules}}: + {{szallitas}} (+Áfa)\n' +
    '• Garancia: a szerkezetre 10 év; a vásznakra, ponyvákra 5 év; a motorokra, érzékelőkre 3 év\n' +
    '• Átfutási idő a visszaigazolástól számítva: 30-60 nap\n' +
    '• Fizetés: szerződéskötéskor 60%, átvételkor a maradék 40%\n' +
    '• Az árajánlat a későbbi műszaki tartalom változása és a helyszíni felmérés miatt módosulhat\n\n' +
    'Amennyiben ajánlatunk szimpatikus Önnek, kérjük, e-mailben jelezzen vissza, ezután helyszíni felmérésre és méretpontosításra van szükség. Bármilyen kérdés esetén keressen minket bizalommal.\n\n' +
    'Megjegyzés: az extra anyagmozgatás, villamos tervezés és elektromos kiállások, kiegészítő lakatos szerkezetek, beton alap, burkolási munkák és fogadó szerkezetek költségei a vevőt terhelik. Vállalási díjaink normál szerelési körülmények esetén, szabad és folyamatos munkaterület biztosítása mellett érvényesek.',
  pdfPageBackgroundUrl: '',
  pdfLogoUrl: '/uploads/legacy/opensky_logo.png',
  pdfSignatureCardUrl: '/uploads/legacy/_cache/_balazs_card.jpg',
  pricingFormula: { ...DEFAULT_PRICING_FORMULA },
  emailSettings: { ...DEFAULT_EMAIL_SETTINGS },
  quoteNumberPrefix: 'OSP',
  quoteNumberFormat: 'year_seq',
  quoteNumberDigits: 3,
  extraPresets: DEFAULT_EXTRA_PRESETS.map((p) => ({ ...p })),
  extraGroups: DEFAULT_EXTRA_GROUPS.map((g) => ({ ...g })),
};

export const QUOTE_NUMBER_FORMAT_OPTIONS: { id: QuoteNumberFormat; label: string }[] = [
  { id: 'year_seq', label: 'Év + sorszám (évente újraindul)' },
  { id: 'yearmonth_seq', label: 'Év-hónap + sorszám (havonta újraindul)' },
  { id: 'seq', label: 'Folyamatos sorszám' },
];

/** Az időszak része a sorszámnak (év, év+hónap vagy semmi) */
function quoteNumberPeriod(format: QuoteNumberFormat, date: Date): string {
  if (format === 'year_seq') return String(date.getFullYear());
  if (format === 'yearmonth_seq')
    return `${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, '0')}`;
  return '';
}

export function formatQuoteNumber(
  config: Pick<SystemConfig, 'quoteNumberPrefix' | 'quoteNumberFormat' | 'quoteNumberDigits'>,
  seq: number,
  date: Date = new Date()
): string {
  const prefix = (config.quoteNumberPrefix || '').trim();
  const period = quoteNumberPeriod(config.quoteNumberFormat || 'year_seq', date);
  const digits = Math.min(8, Math.max(1, Number(config.quoteNumberDigits) || 3));
  return [prefix, period, String(seq).padStart(digits, '0')].filter(Boolean).join('-');
}

/**
 * Következő szabad sorszám: az azonos előtagú és időszakú sorszámok közül a legnagyobb + 1.
 */
export function nextQuoteNumber(
  config: Pick<SystemConfig, 'quoteNumberPrefix' | 'quoteNumberFormat' | 'quoteNumberDigits'>,
  existingNumbers: string[],
  date: Date = new Date()
): string {
  const base = formatQuoteNumber(config, 0, date).replace(/-?0+$/, '');
  const escaped = base.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp(`^${escaped}${base ? '-' : ''}(\\d+)$`);
  const maxSeq = existingNumbers.reduce((max, n) => {
    const m = String(n || '').match(re);
    return m ? Math.max(max, Number(m[1])) : max;
  }, 0);
  return formatQuoteNumber(config, maxSeq + 1, date);
}

export interface VariableReplacementContext {
  customerName?: string;
  greetingName?: string;
  city?: string;
  widthCm?: number;
  projectionCm?: number;
  heightCm?: number;
  mountType?: string;
  eurHufRate?: number;
  deliveryFeeHuf?: number;
}

export function formatDotNumber(val: number | undefined | null): string {
  const n = Math.round(Number(val || 0));
  return n.toLocaleString('de-DE');
}

const HU_MONTHS = [
  'Január', 'Február', 'Március', 'Április', 'Május', 'Június',
  'Július', 'Augusztus', 'Szeptember', 'Október', 'November', 'December',
];

/**
 * Megrendelési határidő a kedvezményhez (a korábbi rendszerrel azonosan): az aktuális hónap
 * utolsó napja, de ha abból már kevesebb mint 10 nap van hátra, a következő hónap utolsó napja.
 */
export function getOrderDeadline(today: Date = new Date()): string {
  const lastOfMonth = (y: number, m: number) => new Date(y, m + 1, 0);
  const current = lastOfMonth(today.getFullYear(), today.getMonth());
  const daysLeft = Math.floor((current.getTime() - new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime()) / 86400000);
  const target = daysLeft < 10 ? lastOfMonth(today.getFullYear(), today.getMonth() + 1) : current;
  return `${HU_MONTHS[target.getMonth()]} ${target.getDate()}`;
}

/**
 * A replaceTemplateVariables fordítottja: a konkrét ügyféladatokat (név, méret, település stb.)
 * visszacseréli {{...}} jelölőkre, hogy egy ajánlatban átírt szöveg sablonként menthető legyen.
 */
export function toTemplateText(text: string, ctx: VariableReplacementContext): string {
  if (!text) return '';
  const pairs = TEMPLATE_VARIABLES_HELP.map((v) => [replaceTemplateVariables(v.token, ctx), v.token] as const)
    // csak szám (pl. árfolyam 400) nem cserélhető vissza: a „SOLARE 400” is 400-at tartalmaz
    .filter(([value, token]) => value && value !== token && value.trim().length >= 3 && !/^[\d\s.,]+$/.test(value))
    .sort((a, b) => b[0].length - a[0].length);
  let out = text;
  for (const [value, token] of pairs) out = out.split(value).join(token);
  return out;
}

export function replaceTemplateVariables(
  text: string | undefined,
  ctx: VariableReplacementContext
): string {
  if (!text) return '';
  const customerName = (ctx.customerName || 'Ügyfél').trim();
  const greetingName = (ctx.greetingName || customerName || 'Érdeklődő').trim();
  const city = (ctx.city || 'Budapest').trim();
  const w = Number(ctx.widthCm || 600);
  const p = Number(ctx.projectionCm || 400);
  const h = Number(ctx.heightCm || 250);
  const wMeter = (w / 100).toFixed(w % 100 === 0 ? 0 : 1).replace('.', ',');
  const pMeter = (p / 100).toFixed(p % 100 === 0 ? 0 : 1).replace('.', ',');
  const m2 = ((w / 100) * (p / 100)).toFixed(1).replace('.', ',');
  const mount = ctx.mountType || 'Épülethez rögzített';
  const rate = Number(ctx.eurHufRate || 400);
  const delivery = formatDotNumber(ctx.deliveryFeeHuf ?? 40000) + ' Ft';
  const today = new Date().toLocaleDateString('hu-HU');

  return text
    .replace(/\{\{\s*ugyfel_nev\s*\}\}/gi, customerName)
    .replace(/\{\{\s*nev\s*\}\}/gi, customerName)
    .replace(/\{\{\s*megszolitas\s*\}\}/gi, greetingName)
    .replace(/\{\{\s*telepules\s*\}\}/gi, city)
    .replace(/\{\{\s*szelesseg\s*\}\}/gi, String(w))
    .replace(/\{\{\s*kinyulas\s*\}\}/gi, String(p))
    .replace(/\{\{\s*magassag\s*\}\}/gi, String(h))
    .replace(/\{\{\s*meret\s*\}\}/gi, `${w}x${p}x${h} cm`)
    .replace(/\{\{\s*meret_m\s*\}\}/gi, `${wMeter} x ${pMeter} m`)
    .replace(/\{\{\s*m2\s*\}\}/gi, `${m2} m²`)
    .replace(/\{\{\s*beepites\s*\}\}/gi, mount)
    .replace(/\{\{\s*arfolyam\s*\}\}/gi, String(rate))
    .replace(/\{\{\s*szallitas\s*\}\}/gi, delivery)
    .replace(/\{\{\s*datum\s*\}\}/gi, today)
    .replace(/\{\{\s*hatarido\s*\}\}/gi, getOrderDeadline());
}
