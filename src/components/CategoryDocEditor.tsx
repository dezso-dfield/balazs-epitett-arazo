'use client';

import React, { useState } from 'react';
import { ChevronDown, ChevronRight, FileText, LayoutList, Type, Wand2 } from 'lucide-react';
import type { ProductCategory, SystemConfig } from '@/lib/types';
import { btn } from '@/components/ui';
import { FormatToolbar, insertAtCursor, RichInline } from '@/components/RichEdit';
import { getDocDesign, LETTERHEAD_URL, ptPx } from '@/lib/doc-design';
import { TEMPLATE_VARIABLES_HELP } from '@/lib/constants';

/**
 * Kategória sablon: az ajánlatban a kategória termékei köré kerülő szövegek, a saját Word ajánlatok szerkezetében.
 * Fő szerkezetnél a leírás a megszólítás után, kiegészítőnél (üvegfal, árnyékoló) az Információ előtt jelenik meg.
 */
type DocFields = Pick<ProductCategory, 'categoryType' | 'docHeading' | 'docIntro' | 'docOptions' | 'docPromo' | 'docTotalLabel' | 'docProductPhrase' | 'docIntroMention'>;

const TELIKERT = `Illetve ezeket a termékeket lehet körbe szerelni elcsúsztatható üvegfalrendszerrel és oldalsó árnyékolókkal, így megnövelve nem csak a terasz, de akár a nappali méretét és kihasználhatóságát. Ezekkel az opciókkal igazából egy télikertet kialakítva, amit tényleg télen-nyáron lehet használni.`;
const WIND6 = 'Szélterhelése az EN 13561 szabvány szerinti legmagasabb, 6. osztályba sorolt, azaz orkán erejű szélnek is ellenáll (119 km/h).';
const PROMO = 'Ha {{hatarido}}-ig megrendeli az alapszerkezetet kedvezményt tudok biztosítani! Az eső szenzort ajándékba tudom adni!';
const SCREENY = `SCREENY GPZ család oldalsó árnyékolóinál a napháló megvezetése egy speciális oldalsó megvezetésben rejlik. A ponyva mindkét oldalára egy zipzár van felhegesztve, ami így lehetővé teszi, hogy a ponyva mindig feszes (ráncoktól mentes) maradjon és mindvégig az oldalsó megvezető profilokban mozogjon. Mivel a ponyva nem tud kijutni az oldalsó megvezető profilokból, így a szúnyogháló feladatát is teljes mértékben ellátja. Kapható egymodulos és többmodulos változatban is.`;
const POLI_OPTS = `+Opcionálisan rendelhető a termékhez:
- Oldalsó árnyékoló
- okosotthon vezérlő
- Automatizálási funkciók: - eső, -fény, -szél érzékelők
- Tetőárnyékolók (a tető alá vagy fölé)
- Dekor lamellák`;
const PONYVA_OPTS = `+Opcionálisan rendelhető a termékekhez:
- oldalsó árnyékolók
- üvegfalrendszer
- LED világítás a vásznat tartó és mozgató keresztprofilokban
- okos otthon vezérlők`;
const KAROS_OPTS = `+Opcionálisan rendelhető a termékhez:
- katalógusból választható egyedi színek és szövetek (+ felár ellenében)
- Motoros működés távirányítóval – Automata működéssel: Nap szenzor, szél szenzor, eső szenzor
- okos otthon vezérlő`;

/**
 * Kategória sablon minták a saját ajánlatokból (árajánlatok mappa, ~47 ajánlat, kategóriánként a visszatérő szövegek).
 * Csak általános szövegek: ügyfélnév, cím, egyedi ár nincs benne.
 */
const LIBRARY: [RegExp, Partial<DocFields>][] = [
  [/üvegtet|glassfix/, {
    docProductPhrase: 'üvegtetős pergola',
    categoryType: 'main_structure',
    docHeading: '',
    docIntro: `Azért ajánljuk ezeket a szerkezeteket, mert télen-nyáron használhatóak, az üvegtetővel elegendő fény mennyiség tud jutni a tető alá.
${TELIKERT}

Fix és mozgatható üvegfalakat vagy polikarbonát oldalakat, oldalsó árnyékolókat később is tudjuk építeni a szerkezethez.

${WIND6}`,
    docTotalLabel: 'Az alapszerkezet szereléssel Összesen:',
    docOptions: POLI_OPTS.replace('Tetőárnyékolók (a tető alá vagy fölé)', 'Tetőárnyékolók (üvegtető alá vagy fölé)').replace('\n- Dekor lamellák', ''),
    docPromo: '',
  }],
  [/polikarbon|szendvics/, {
    docProductPhrase: 'polikarbonát tetejű pergola',
    categoryType: 'main_structure',
    docHeading: '',
    docIntro: `Azért ajánljuk ezeket a szerkezeteket, mert télen-nyáron használhatóak, opálszínű polikarbonát tetővel elegendő fény mennyiség tud jutni a tető alá, de a napsugarakat megszűrve a meleget nem engedi át.
${TELIKERT}

A pergola teljes vázszerkezete szinterezett alumíniumból készül. A talpkonzolok rozsdamentes acélból készülnek. Választható polikarbonát színek: opál, víztiszta, bronz, antracit.
A szerkezet alapszíne az antracit (RAL7016 Matt). Egyéb RAL színek is választhatóak (a szerkezet árának a 10%-os felára ellenében). A szerkezet általános falvastagsága 3-4 mm.
A lábak és üvegfalrendszer alsó sínjeinek biztonságos rögzítéséhez beton alapra van szükség.
Fix és mozgatható üvegfalakat vagy polikarbonát oldalakat, dekor-árnyékoló lamellákat, oldalsó árnyékolókat később is tudjuk építeni a szerkezethez.

${WIND6}`,
    docTotalLabel: 'Az alapszerkezet szereléssel, RAL 7016 Matt színben Összesen:',
    docOptions: POLI_OPTS,
    docPromo: '',
  }],
  [/kocsibe/, {
    docProductPhrase: 'polikarbonát tetejű kocsibeálló',
    categoryType: 'main_structure',
    docHeading: '',
    docIntro: `A szerkezet teljes vázszerkezete szinterezett alumíniumból készül. A talpkonzolok rozsdamentes acélból készülnek. Választható polikarbonát színek: opál, víztiszta, bronz, antracit.
A szerkezet alapszíne az antracit (RAL7016 Matt). Egyéb RAL színek is választhatóak (a szerkezet árának a 10%-os felára ellenében). A szerkezet általános falvastagsága 3-4 mm.
A lábak biztonságos rögzítéséhez beton alapra van szükség.
Fix polikarbonát oldalakat, dekor-árnyékoló lamellákat később is tudjuk építeni a szerkezethez.

${WIND6}`,
    docTotalLabel: 'Az alapszerkezet szereléssel, RAL 7016 Matt színben Összesen:',
    docOptions: POLI_OPTS,
    docPromo: '',
  }],
  [/feszített/, {
    docProductPhrase: 'elhúzható, feszített vásznas pergola',
    categoryType: 'main_structure',
    docHeading: '',
    docIntro: `A napellenző ponyva teljesen be van zárva egy kazettás koncepcióba, a napháló megvezetése egy speciális oldalsó megvezetésben rejlik. A ponyva mindkét oldalára egy zipzár van felhegesztve, ami így lehetővé teszi, hogy a ponyva mindig feszes (ráncoktól mentes) maradjon és mindvégig az oldalsó megvezető profilokban mozogjon.
Egyéb színek és szövet választék katalógusból, plusz felár ellenében.

Szélterhelése az EN 13561 szabvány szerinti 3. osztályba sorolt, azaz erős erejű szélnek ellenáll (50-70 km/h).`,
    docTotalLabel: 'Az alapszerkezet szereléssel Összesen:',
    docOptions: PONYVA_OPTS,
    docPromo: '',
  }],
  [/ponyv|pvc|elhúzható/, {
    docProductPhrase: 'elhúzható PVC ponyvás pergola',
    categoryType: 'main_structure',
    docHeading: '',
    docIntro: `Tetején a keresztléc profilok és a vezető sínek rögzítve vannak, így teszik lehetővé a rendszer vízszintes csúszását.

Szélterhelése az EN 13561 szabvány szerinti legmagasabb, 6. osztályba sorolt, azaz orkán erejű szélnek is ellenáll (119 km/h). Hóesésben a termék használata nem ajánlott.`,
    docTotalLabel: 'A szerkezet szereléssel Összesen:',
    docOptions: PONYVA_OPTS,
    docPromo: PROMO,
  }],
  [/üveg|guillotine|glass/, {
    docIntroMention: 'Opcionálisan feltüntetjük a pergola oldalainak beépítését üvegfal rendszerrel is.',
    categoryType: 'accessory',
    docHeading: 'Opció üvegfal rendszerek:',
    docIntro: `[b][u]Keret nélküli, elcsúsztatható üvegfalrendszereink:[/u][/b]

1., Üvegfal rendszereinkkel is garantáljuk a természetes fény adta pozitívumokat, amik az emberek hangulatát és jó érzését nagymértékben befolyásolják.
LINE GLASS rendszerünk, amely síneken csúszó üvegtáblákból áll, könnyen telepíthető és keret nélküli üvegfalakkal biztosítja a zavartalan kilátást, exkluzív kinézetet.
Ideális megoldás a pergola oldalainak vagy meglévő teraszának beépítésére, ezzel védve a belső terünket a széltől, esőtől és zajtól. Illetve kitűnő választás belső térelválasztó rendszerként.
Az üvegek 10 mm vastag biztonsági, edzett üvegek.

Az üvegfalak szélterhelése az EN 13561 szabvány szerinti legmagasabb, 6. osztályba sorolt, azaz orkán erejű szélnek is ellenáll (119 km/h).`,
    // a Word ajánlatokban: „- Opció: A két 340- és 600 cm-es oldal beépítése elcsúsztatható üvegfalrendszer szereléssel: + 7.252 EUR”
    docTotalLabel: 'Opció: A pergola oldalainak beépítése elcsúsztatható üvegfalrendszer szereléssel:',
    docOptions: '',
    docPromo: '',
  }],
  [/zip|vertik|oldalsó árnyékol/, {
    docIntroMention: 'Opcionálisan feltüntetjük a pergola front- ({{szelesseg}} cm) és oldalának ({{kinyulas}} cm) beépítését, motoros-vertikális árnyékolóval.',
    categoryType: 'accessory',
    // a Word ajánlatokban a ZIP táblázat felett nincs cím, az összesítő: „Az árnyékolók szereléssel Összesen: 2.565 EUR (+ Áfa)”
    docHeading: '',
    docIntro: `[b][u]Oldalsó árnyékolónk:[/u][/b]

${SCREENY}
Ez a termékcsalád csak motoros vezérléssel szerelhető. A motorok vezérlése a távirányítón kívül, okos otthon vezérlővel (applikáción keresztül) is lehetséges.

A motoros-vertikális árnyékolók szélterhelése az EN 13561 szabvány szerinti 5. osztályba sorolt, azaz viharos erejű szélnek is ellenáll (80-100 km/h). A termékhez javasoljuk a szél-érzékelő használatát, ezzel védve az esetleges árnyékoló vászon károsodást.`,
    docTotalLabel: 'Az árnyékolók szereléssel Összesen:',
    docOptions: `+Opcionálisan rendelhető a termékhez:
- okosotthon vezérlő
- Automatizálási funkciók: - eső, -fény, -szél érzékelők`,
    docPromo: '',
  }],
  [/meglévő|tetőárnyék|tetejére/, {
    docProductPhrase: 'meglévő szerkezetre építhető, elhúzható vásznas tetőárnyékoló',
    categoryType: 'main_structure',
    docHeading: '',
    docIntro: `Elhúzható, feszített vásznas tetőárnyékolóink, amiket tudunk építeni már meglévő szerkezet tetejére vagy a tartó gerendák alá. Csak árnyékolásra ajánljuk.
Mindegyik termékhez jár ajándékba a szélérzékelő.

Szélterhelése az EN 13561 szabvány szerinti 5. osztályba sorolt, azaz viharos erejű szélnek ellenáll (50-80 km/h).`,
    docTotalLabel: 'A tetőárnyékoló szereléssel Összesen:',
    docOptions: '',
    docPromo: '',
  }],
  [/vitorl|kolibri/, {
    docProductPhrase: 'napvitorla',
    categoryType: 'main_structure',
    docHeading: '',
    docIntro: `Manuális vezérlésű vagy automatizált motoros árnyékoló vitorla. Manuális és motoros vezérléssel is lehet választani. Motoros vezérlésű termékhez jár ajándékba a szélérzékelő (automatikusan betekeri a vásznat, ha nagy szélsebességet érzékel).
Rögzíthető falhoz, a talpkonzollal a földhöz, vagy mobil, 123x123 cm-es rozsdamentes acélból készült, elektropolírozott bázisalaphoz (a bázisalap súlyként szolgál, nincs rögzítés a talajhoz).
Amennyiben motoros vezérléssel kéri, 3 x 1,5-es 230V-os kábel kell majd a motornak.

Árnyékoló vitorlák szélterhelése az EN 13561 szabvány szerinti 1. osztályba sorolt, azaz mérsékelt/élénk erejű szélnek ellenáll (15-30 km/h).`,
    docTotalLabel: 'A szerkezet szereléssel Összesen:',
    docOptions: '',
    docPromo: '',
  }],
  [/kézi|tekerős/, {
    docProductPhrase: 'kézi tekerős napellenző',
    categoryType: 'main_structure',
    docHeading: 'Karos napellenzők, kézi működtetésű szerkezetek:',
    docIntro: 'Prémium minőségű, lengyel, jó ár-érték arányú termékek, manuálisan vezérelhetők, motoros ponyvamozgatással is kérhetők. A termékek több szerkezet/karok színben választhatóak (lásd lejjebb) és rengeteg szövet szín variációval.',
    docTotalLabel: 'Az alapszerkezetek manuális vezérléssel, szereléssel Összesen:',
    docOptions: KAROS_OPTS,
    docPromo: '',
  }],
  [/kazett.*nélk|nélküli/, {
    docProductPhrase: 'kazetta nélküli karos napellenző',
    categoryType: 'main_structure',
    docHeading: 'Karos napellenzők, Kazetta nélküli szerkezetek:',
    docIntro: 'Prémium minőségű, lengyel, jó ár-érték arányú termékek. Kazetta nélküli kivitelben, manuálisan vezérelhetők, motoros ponyvamozgatással is kérhetők. A termékek hét féle szerkezet/karok színben választhatóak (lásd lejjebb) és rengeteg szövet szín variációval.',
    docTotalLabel: 'Az alapszerkezetek motoros vezérléssel, szereléssel Összesen:',
    docOptions: KAROS_OPTS,
    docPromo: '',
  }],
  [/kazett|napellenz|karos/, {
    docProductPhrase: 'kazettás karos napellenző',
    categoryType: 'main_structure',
    docHeading: 'Kazettás szerkezetek:',
    docIntro: `Motorosan mozgatható karos napellenzőink kazettás kivitelben (Zárt szerkezet, becsukott állapotban a szövetet nem éri az időjárás okozta károsító hatások: -napfény, -fagy, -eső).
Mindegyik termékhez ajándék a 3D- és szélérzékelő.
A termékek több szerkezet színben választhatóak (lásd lejjebb) és rengeteg szövet és szín variációval.`,
    docTotalLabel: 'A szerkezet szereléssel Összesen:',
    docOptions: `+Opcionálisan rendelhető mindegyik termékhez:
- katalógusból választható egyedi szövetek (+ felár ellenében)
- szél-, nap érzékelők, okosotthon vezérlők`,
    docPromo: '',
  }],
  [/led|világít/, {
    categoryType: 'accessory',
    docHeading: 'LED világítás:',
    docIntro: '',
    docTotalLabel: 'Opció, LED világítás szereléssel:',
    docOptions: '',
    docPromo: '',
  }],
  [/bioklim|lamell|pergol/, {
    docProductPhrase: 'bioklimatikus pergola, forgatható lamellás tetővel',
    categoryType: 'main_structure',
    docHeading: '',
    docIntro: `Azért ajánljuk ezeket a lamellás szerkezeteket, mert télen-nyáron használhatóak, és lamellák dőlésszögének állításával nem csak a bejutó fény mennyiségét tudjuk szabályozni, hanem a szellőzést is, így megvalósul a bioklimatikus hatás.
${TELIKERT}

A motoros oldalsó árnyékolókat illetve üvegfal rendszereket, később is tudjuk szerelni a pergolákhoz.

Hóterhelése a szerkezeteknek:
SOLARE modelleknél: 200 kg/m2
KEDRY modelleknél: 250 kg/m2

${WIND6}`,
    docTotalLabel: 'Az alapszerkezet szereléssel Összesen:',
    docOptions: `+Opcionálisan rendelhető a termékhez:
- egyedi RAL színek (+20% felár ellenében)
- LED spot világítás a lamellákban (szabályozható fényerejű)
- Üvegfalrendszer
- Oldalsó árnyékoló
- Okosotthon vezérlő (Conexxon, Tahoma – Somfy vagy BLEBOX Applikációval): + 250 EUR`,
    docPromo: 'Ha {{hatarido}}-ig megrendeli az alapszerkezetet kedvezményt tudok biztosítani! Az infrafűtést és az eső szenzort ajándékba tudom adni!',
  }],
];

/** Minta a saját ajánlatokból a kategória neve (és leírása) alapján */
export function suggestCategoryDoc(name: string, description = ''): Partial<DocFields> {
  const n = `${name} ${description}`.toLowerCase();
  const hit = LIBRARY.find(([re]) => re.test(n));
  return hit ? { ...hit[1] } : { categoryType: 'main_structure', docHeading: `${name}:`, docTotalLabel: 'A szerkezet szereléssel Összesen:' };
}

const field = 'w-full px-3 py-2 rounded-xl border border-slate-300 text-[13px] leading-relaxed';
const lbl = 'block text-[12px] font-semibold text-slate-700 mb-1';

/** Szürke helyőrző a lapon: ide kerül az ajánlatban automatikusan (termék, táblázat…) */
function Slot({ children, h = 'auto' }: { children: React.ReactNode; h?: number | 'auto' }) {
  return (
    <div className="rounded-md border border-dashed border-slate-300 bg-slate-50 text-slate-400 text-[11px] px-3 py-2 font-sans select-none" style={{ height: h }}>
      {children}
    </div>
  );
}

/** Kis jelölés a lap szélén: mit szerkesztesz épp */
function Tag({ children }: { children: React.ReactNode }) {
  return <div className="text-[10px] uppercase tracking-wide text-indigo-500 font-sans font-semibold mb-0.5 select-none">{children}</div>;
}

export function CategoryDocEditor({
  category,
  onChange,
  config,
  allCategories = [],
}: {
  category: ProductCategory;
  onChange: (patch: Partial<ProductCategory>) => void;
  config?: SystemConfig;
  allCategories?: ProductCategory[];
}) {
  const accessoryCats = allCategories.filter((c) => c.id !== category.id && c.categoryType === 'accessory');
  const also = category.docAlsoDescribe || [];
  const filled = [category.docHeading, category.docIntro, category.docOptions, category.docPromo, category.docTotalLabel].filter((x) => (x || '').trim()).length;
  const [open, setOpen] = useState(true);
  const [view, setView] = useState<'page' | 'fields'>('page');
  const D = getDocDesign(config, category);
  const accessory = category.categoryType === 'accessory';
  const body: React.CSSProperties = { fontSize: ptPx(D.bodySize), lineHeight: D.lineHeight, color: D.text };
  const letterhead = config?.pdfPageBackgroundUrl || (D.letterhead ? LETTERHEAD_URL : '');
  const font = D.font === 'arial' ? 'Arial, Helvetica, sans-serif' : 'Calibri, Carlito, sans-serif';
  const label = category.docTotalLabel || (accessory ? 'Opció, árnyékolók szereléssel Összesen:' : 'Az alapszerkezet szereléssel Összesen:');
  const optLabel = /^opci/i.test(label);

  const table = (
    <Slot>
      <div className="font-semibold text-slate-500 mb-1">Ártáblázat (a termék tételeiből, automatikusan)</div>
      <div className="grid grid-cols-[2fr_1fr_1.4fr_1fr] gap-px bg-slate-300 text-[10px]">
        {['Megnevezés', 'Listaár (EUR)', 'Kedvezményes ár (EUR)', ''].map((h, i) => (
          <div key={i} className="px-1 py-0.5" style={{ background: D.tableHead, color: '#000' }}>
            {h}
          </div>
        ))}
        {['…', '…', '…', accessory ? 'Opció' : ''].map((h, i) => (
          <div key={`r${i}`} className="px-1 py-0.5 bg-white">
            {h}
          </div>
        ))}
        {['', 'Összesen:', '…', ''].map((h, i) => (
          <div key={`s${i}`} className="px-1 py-0.5 font-bold" style={{ background: `color-mix(in srgb, ${D.tableHead} 55%, white)`, color: '#000' }}>
            {h}
          </div>
        ))}
      </div>
    </Slot>
  );
  const totalLine = (
    <div style={{ ...body, textAlign: optLabel ? 'left' : 'right', paddingLeft: optLabel ? ptPx(18) : undefined }} className="flex items-baseline gap-1 justify-end">
      {optLabel && <span>-&nbsp;&nbsp;</span>}
      <RichInline single value={category.docTotalLabel || ''} placeholder={label} onChange={(v) => onChange({ docTotalLabel: v })} style={{ display: 'inline-block', width: 'auto', minWidth: '12ch' }} />
      <b className="whitespace-nowrap">{optLabel ? '+ ' : ''}12.345 EUR (+ Áfa)</b>
    </div>
  );

  const page = (
    <div className="bg-slate-200/70 rounded-2xl p-3 sm:p-5 overflow-x-auto space-y-3">
      <div className="mx-auto" style={{ width: ptPx(595.28) }}>
        <FormatToolbar
          accent={D.accent}
          extra={
            <select
              defaultValue=""
              title="Változó beszúrása a kurzor helyére"
              onChange={(e) => {
                const v = e.target.value;
                e.target.value = '';
                if (v) insertAtCursor(v);
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
      <div className="mx-auto bg-white shadow-xl" style={{ width: ptPx(595.28), fontFamily: font, color: D.text }}>
        {letterhead ? (
          <div style={{ height: ptPx(93), backgroundImage: `url(${letterhead})`, backgroundSize: '100% auto', backgroundRepeat: 'no-repeat', backgroundPosition: `0 ${ptPx(7)}` }} />
        ) : (
          <div className="h-12" />
        )}
        <div className="space-y-3 pb-8" style={{ paddingLeft: ptPx(D.marginPt), paddingRight: ptPx(D.marginPt) }}>
          {!accessory ? (
            <>
              <Slot>Kedves …! · Örömmel fogadtuk megkeresését! … paraméterek alapján:</Slot>
              <div>
                <Tag>A termék megnevezése a bevezetőben („1db 600x300x250 cm-es, …”)</Tag>
                <div style={body} className="flex items-baseline gap-1 flex-wrap">
                  <b className="font-sans text-slate-400 text-[12px]">1db 600x300x250 cm-es,</b>
                  <RichInline single value={category.docProductPhrase || ''} placeholder={(category.name || '').toLowerCase()} onChange={(v) => onChange({ docProductPhrase: v })} style={{ display: 'inline-block', width: 'auto', minWidth: '20ch' }} />
                  <span className="font-sans text-slate-400 text-[12px]">… Opcionálisan … Ajándék …</span>
                </div>
              </div>
              <div>
                <Tag>Kategória leírás · a bevezető után</Tag>
                <RichInline value={category.docIntro || ''} onChange={(v) => onChange({ docIntro: v })} style={body} placeholder="Azért ajánljuk ezeket a szerkezeteket, mert…" />
              </div>
              <Slot>
                Automatikusan, a fenti leírás első bekezdése után: a kiválasztott termékek ajánló bekezdése (a termék leírásának első bekezdése,
                a név félkövér). A „Hóterhelése…” bekezdés helyére modellenkénti lista kerül, ha a termékeknél meg van adva; a szélterhelésnél
                több termék esetén „(mind a N szerkezetnek)”.
              </Slot>
              <div>
                <Tag>Cím a termékek előtt (ha kell)</Tag>
                <RichInline single value={category.docHeading || ''} onChange={(v) => onChange({ docHeading: v })} className="font-bold underline underline-offset-2" style={{ ...body, color: D.heading }} placeholder="pl. Karos napellenzők:" />
              </div>
              <Slot>
                <span style={{ background: D.highlight || undefined }} className="font-bold text-slate-600">
                  1. TERMÉK NEVE:
                </span>{' '}
                Méretek… · leírás · fotók (a termék sablonjából)
              </Slot>
              {table}
              <div>
                <Tag>Összesítő sor felirata</Tag>
                {totalLine}
              </div>
              <div>
                <Tag>Akció (félkövér, a táblázat után)</Tag>
                <RichInline value={category.docPromo || ''} onChange={(v) => onChange({ docPromo: v })} className="font-bold" style={{ ...body, color: D.heading, paddingLeft: ptPx(30) }} placeholder="Ha {{hatarido}}-ig megrendeli az alapszerkezetet kedvezményt tudok biztosítani!" />
              </div>
              <Slot>Ha a vevő kiegészítőt is kér (oldalsó árnyékoló, üvegfal): azok táblázata ide kerül, minden termék alá.</Slot>
              <div>
                <Tag>Opcionálisan rendelhető (első sor félkövér, szürke kiemeléssel)</Tag>
                <RichInline
                  value={category.docOptions || ''}
                  onChange={(v) => onChange({ docOptions: v })}
                  className="first-line:font-bold first-line:bg-[var(--hl)]"
                  style={{ ...body, ['--hl' as string]: D.highlight || 'transparent' }}
                  placeholder={'+Opcionálisan rendelhető a termékhez:\n- egyedi RAL színek…'}
                />
              </div>
              <Slot>Információ · aláírás</Slot>
            </>
          ) : (
            <>
              <div>
                <Tag>Mondat a bevezetőben, ha a vevő ezt is kéri (változókkal: {'{{szelesseg}}, {{kinyulas}}'})</Tag>
                <RichInline value={category.docIntroMention || ''} onChange={(v) => onChange({ docIntroMention: v })} style={body} placeholder="Opcionálisan feltüntetjük a pergola oldalainak beépítését … is." />
              </div>
              <Slot>Kedves …! · bevezető · a pergola leírása, táblázata, összesítője és akciója</Slot>
              <div>
                <Tag>Táblázat címe a pergola alatt</Tag>
                <RichInline single value={category.docHeading || ''} onChange={(v) => onChange({ docHeading: v })} className="font-bold" style={{ ...body, color: D.heading, paddingLeft: ptPx(30) }} placeholder="pl. Opció üvegfal rendszerek:" />
              </div>
              {table}
              <div>
                <Tag>Összesítő sor felirata („Opció…” kezdetű: kötőjeles opció sor, + előjellel)</Tag>
                {totalLine}
              </div>
              <Slot>… a többi termék, mindegyik alatt ugyanez a táblázat …</Slot>
              <div>
                <Tag>Kiegészítő leírása · az ajánlat végén, az Információ előtt</Tag>
                <RichInline value={category.docIntro || ''} onChange={(v) => onChange({ docIntro: v })} style={body} placeholder="Keret nélküli, elcsúsztatható üvegfalrendszereink: …" />
              </div>
              <Slot>Információ · aláírás</Slot>
            </>
          )}
        </div>
        {letterhead ? (
          <div style={{ height: ptPx(57), backgroundImage: `url(${letterhead})`, backgroundSize: '100% auto', backgroundRepeat: 'no-repeat', backgroundPosition: `left 0 bottom ${ptPx(-15.5)}` }} />
        ) : (
          <div className="h-10" style={{ background: D.accent }} />
        )}
      </div>
    </div>
  );

  const fields = (
    <div className="space-y-3">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        <div>
          <label className={lbl}>{accessory ? 'Táblázat címe a pergola alatt' : 'Cím a termékek előtt (félkövér, aláhúzott)'}</label>
          <input className={field} value={category.docHeading || ''} placeholder={accessory ? 'pl. Opció üvegfal rendszerek:' : 'pl. Karos napellenzők:'} onChange={(e) => onChange({ docHeading: e.target.value })} />
        </div>
        <div>
          <label className={lbl}>Összesítő sor felirata</label>
          <input className={field} value={category.docTotalLabel || ''} placeholder={label} onChange={(e) => onChange({ docTotalLabel: e.target.value })} />
        </div>
      </div>
      <div>
        <label className={lbl}>{accessory ? 'Mondat a bevezetőben, ha a vevő ezt is kéri' : 'A termék megnevezése a bevezetőben („1db 600x300x250 cm-es, …”)'}</label>
        {accessory ? (
          <input className={field} value={category.docIntroMention || ''} onChange={(e) => onChange({ docIntroMention: e.target.value })} />
        ) : (
          <input className={field} value={category.docProductPhrase || ''} placeholder={(category.name || '').toLowerCase()} onChange={(e) => onChange({ docProductPhrase: e.target.value })} />
        )}
      </div>
      <div>
        <label className={lbl}>Kategória leírás {accessory ? '(az ajánlat végén, az Információ előtt)' : '(a megszólítás és bevezető után)'}</label>
        <textarea className={field} rows={6} value={category.docIntro || ''} onChange={(e) => onChange({ docIntro: e.target.value })} />
      </div>
      {!accessory && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          <div>
            <label className={lbl}>Opcionálisan rendelhető (első sor félkövér)</label>
            <textarea className={field} rows={5} value={category.docOptions || ''} onChange={(e) => onChange({ docOptions: e.target.value })} />
          </div>
          <div>
            <label className={lbl}>Akció (félkövér)</label>
            <textarea className={field} rows={5} value={category.docPromo || ''} onChange={(e) => onChange({ docPromo: e.target.value })} />
          </div>
        </div>
      )}
    </div>
  );

  return (
    <div className="border-b border-slate-200 bg-slate-50/60">
      <button type="button" onClick={() => setOpen((o) => !o)} className="w-full flex items-center gap-2 px-4 py-2.5 text-left">
        {open ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
        <FileText className="w-4 h-4 text-slate-500" />
        <span className="text-[13px] font-semibold text-slate-900">Kategória ajánlat sablon</span>
        <span className="text-xs text-slate-500">
          {filled ? `${filled}/5 szöveg kitöltve` : 'nincs kitöltve'} · a kategória minden termékénél így jelenik meg az ajánlatban
        </span>
      </button>
      {open && (
        <div className="px-4 pb-4 space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex gap-1 p-1 rounded-xl bg-white border border-slate-200">
              {(
                [
                  ['main_structure', 'Fő szerkezet', 'pl. pergola, napellenző: saját szakasz, leírás a bevezető után'],
                  ['accessory', 'Kiegészítő', 'pl. oldalsó árnyékoló, üvegfal: táblázat a pergolák alatt, leírás a végén'],
                ] as const
              ).map(([v, l, d]) => (
                <button
                  key={v}
                  type="button"
                  title={d}
                  onClick={() => onChange({ categoryType: v })}
                  className={`px-3 py-1.5 rounded-lg text-[12px] font-medium ${(category.categoryType || 'main_structure') === v ? 'bg-slate-900 text-white' : 'text-slate-600'}`}
                >
                  {l}
                </button>
              ))}
            </div>
            <div className="flex gap-1 p-1 rounded-xl bg-white border border-slate-200">
              {(
                [
                  ['page', Type, 'Lapon (mint a Word)'],
                  ['fields', LayoutList, 'Mezők'],
                ] as const
              ).map(([v, Icon, l]) => (
                <button key={v} type="button" onClick={() => setView(v)} className={`px-3 py-1.5 rounded-lg text-[12px] font-medium inline-flex items-center gap-1 ${view === v ? 'bg-slate-900 text-white' : 'text-slate-600'}`}>
                  <Icon className="w-3.5 h-3.5" /> {l}
                </button>
              ))}
            </div>
            <button
              type="button"
              className={btn.ghost}
              onClick={() => {
                const s = suggestCategoryDoc(category.name, category.description);
                if (filled && !window.confirm('A meglévő kategória szövegek helyére a saját ajánlataidból vett minta kerül. Folytatod?')) return;
                // pergoláknál a Word ajánlatok végén mindig ott van az üvegfal és az oldalsó árnyékoló leírása
                const wantsAcc = s.categoryType !== 'accessory' && /üvegfalrendszerrel és oldalsó árnyékolókkal/i.test(s.docIntro || '');
                const accIds = wantsAcc ? accessoryCats.filter((c) => /üvegfal|zip|oldalsó|vertikális/i.test(c.name)).map((c) => c.id) : [];
                onChange({ ...s, ...(accIds.length ? { docAlsoDescribe: accIds } : {}) });
              }}
            >
              <Wand2 className="w-4 h-4" /> Minta a saját ajánlatokból
            </button>
          </div>
          {view === 'page' ? page : fields}
          {category.categoryType !== 'accessory' && accessoryCats.length > 0 && (
            <div className="rounded-xl border border-slate-200 bg-white px-3 py-2">
              <div className="text-[12px] font-semibold text-slate-700">Ajánlott kiegészítők leírása az ajánlat végén (akkor is, ha nincsenek az ajánlatban)</div>
              <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1">
                {accessoryCats.map((c) => (
                  <label key={c.id} className="inline-flex items-center gap-1.5 text-[12px] text-slate-700">
                    <input
                      type="checkbox"
                      checked={also.includes(c.id)}
                      onChange={(e) => onChange({ docAlsoDescribe: e.target.checked ? [...also, c.id] : also.filter((x) => x !== c.id) })}
                    />
                    {c.name}
                  </label>
                ))}
              </div>
            </div>
          )}
          <p className="text-[11px] text-slate-500">
            A szürke dobozok helyére az ajánlatban automatikusan kerül a tartalom. A módosítás a jobb felső „Mentés” gombbal mentődik, és az új ajánlatokban érvényes.
          </p>
        </div>
      )}
    </div>
  );
}
