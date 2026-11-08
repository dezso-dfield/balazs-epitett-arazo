'use client';

import React, { useState } from 'react';
import { ChevronDown, ChevronRight, FileText, Wand2 } from 'lucide-react';
import type { ProductCategory } from '@/lib/types';
import { btn } from '@/components/ui';

/**
 * Kategória sablon: az ajánlatban a kategória termékei köré kerülő szövegek, a saját Word ajánlatok szerkezetében.
 * Fő szerkezetnél a leírás a megszólítás után, kiegészítőnél (üvegfal, árnyékoló) az Információ előtt jelenik meg.
 */
type DocFields = Pick<ProductCategory, 'categoryType' | 'docHeading' | 'docIntro' | 'docOptions' | 'docPromo' | 'docTotalLabel'>;

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
    categoryType: 'main_structure',
    docHeading: '',
    docIntro: `Tetején a keresztléc profilok és a vezető sínek rögzítve vannak, így teszik lehetővé a rendszer vízszintes csúszását.

Szélterhelése az EN 13561 szabvány szerinti legmagasabb, 6. osztályba sorolt, azaz orkán erejű szélnek is ellenáll (119 km/h). Hóesésben a termék használata nem ajánlott.`,
    docTotalLabel: 'A szerkezet szereléssel Összesen:',
    docOptions: PONYVA_OPTS,
    docPromo: PROMO,
  }],
  [/üveg|guillotine|glass/, {
    categoryType: 'accessory',
    docHeading: 'Opció üvegfal rendszerek:',
    docIntro: `Keret nélküli, elcsúsztatható üvegfalrendszerünk:
Üvegfal rendszereinkkel garantáljuk a természetes fény adta pozitívumokat, amik az emberek hangulatát és jó érzését nagymértékben befolyásolják.
LINE GLASS rendszerünk, amely síneken csúszó üvegtáblákból áll, könnyen telepíthető és keret nélküli üvegfalakkal biztosítja a zavartalan kilátást, exkluzív kinézetet.
Ideális megoldás a pergola oldalainak vagy meglévő teraszának beépítésére, ezzel védve a belső terünket a széltől, esőtől és zajtól. Illetve kitűnő választás belső térelválasztó rendszerként.
Az üvegek 10 mm vastag biztonsági, edzett üvegek.

Az üvegfalak szélterhelése az EN 13561 szabvány szerinti legmagasabb, 6. osztályba sorolt, azaz orkán erejű szélnek is ellenáll (119 km/h).`,
    docTotalLabel: 'Opció, üvegfalrendszer szereléssel:',
    docOptions: '',
    docPromo: '',
  }],
  [/zip|vertik|oldalsó árnyékol/, {
    categoryType: 'accessory',
    docHeading: 'ZIP-es rendszerű, motoros oldalsó árnyékoló:',
    docIntro: `Oldalsó árnyékolónk:
${SCREENY}
Ez a termékcsalád csak motoros vezérléssel szerelhető. A motorok vezérlése a távirányítón kívül, okos otthon vezérlővel (applikáción keresztül) is lehetséges.

A motoros-vertikális árnyékolók szélterhelése az EN 13561 szabvány szerinti 5. osztályba sorolt, azaz viharos erejű szélnek is ellenáll (80-100 km/h). A termékhez javasoljuk a szél-érzékelő használatát, ezzel védve az esetleges árnyékoló vászon károsodást.`,
    docTotalLabel: 'Opció, árnyékolók szereléssel Összesen:',
    docOptions: `+Opcionálisan rendelhető a termékhez:
- okosotthon vezérlő
- Automatizálási funkciók: - eső, -fény, -szél érzékelők`,
    docPromo: '',
  }],
  [/meglévő|tetőárnyék|tetejére/, {
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
    categoryType: 'main_structure',
    docHeading: 'Karos napellenzők, kézi működtetésű szerkezetek:',
    docIntro: 'Prémium minőségű, lengyel, jó ár-érték arányú termékek, manuálisan vezérelhetők, motoros ponyvamozgatással is kérhetők. A termékek több szerkezet/karok színben választhatóak (lásd lejjebb) és rengeteg szövet szín variációval.',
    docTotalLabel: 'Az alapszerkezetek manuális vezérléssel, szereléssel Összesen:',
    docOptions: KAROS_OPTS,
    docPromo: '',
  }],
  [/kazett.*nélk|nélküli/, {
    categoryType: 'main_structure',
    docHeading: 'Karos napellenzők, Kazetta nélküli szerkezetek:',
    docIntro: 'Prémium minőségű, lengyel, jó ár-érték arányú termékek. Kazetta nélküli kivitelben, manuálisan vezérelhetők, motoros ponyvamozgatással is kérhetők. A termékek hét féle szerkezet/karok színben választhatóak (lásd lejjebb) és rengeteg szövet szín variációval.',
    docTotalLabel: 'Az alapszerkezetek motoros vezérléssel, szereléssel Összesen:',
    docOptions: KAROS_OPTS,
    docPromo: '',
  }],
  [/kazett|napellenz|karos/, {
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

export function CategoryDocEditor({ category, onChange }: { category: ProductCategory; onChange: (patch: Partial<ProductCategory>) => void }) {
  const [open, setOpen] = useState(false);
  const filled = [category.docHeading, category.docIntro, category.docOptions, category.docPromo, category.docTotalLabel].filter((x) => (x || '').trim()).length;
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
                  ['main_structure', 'Fő szerkezet', 'leírás a megszólítás után'],
                  ['accessory', 'Kiegészítő', 'leírás az Információ előtt'],
                ] as const
              ).map(([v, l, d]) => (
                <button
                  key={v}
                  type="button"
                  title={d}
                  onClick={() => onChange({ categoryType: v })}
                  className={`px-3 py-1.5 rounded-lg text-[12px] font-medium ${category.categoryType === v ? 'bg-slate-900 text-white' : 'text-slate-600'}`}
                >
                  {l}
                </button>
              ))}
            </div>
            <button
              type="button"
              className={btn.ghost}
              onClick={() => {
                const s = suggestCategoryDoc(category.name, category.description);
                if (filled && !window.confirm('A meglévő kategória szövegek helyére a saját ajánlataidból vett minta kerül. Folytatod?')) return;
                onChange(s);
                setOpen(true);
              }}
            >
              <Wand2 className="w-4 h-4" /> Minta a saját ajánlatokból
            </button>
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
            <div>
              <label className={lbl}>Cím a termékek előtt (félkövér, aláhúzott)</label>
              <input className={field} value={category.docHeading || ''} placeholder="pl. Karos napellenzők, Kazetta nélküli szerkezetek:" onChange={(e) => onChange({ docHeading: e.target.value })} />
            </div>
            <div>
              <label className={lbl}>Összesítő sor felirata</label>
              <input className={field} value={category.docTotalLabel || ''} placeholder="pl. Az alapszerkezet szereléssel Összesen:" onChange={(e) => onChange({ docTotalLabel: e.target.value })} />
            </div>
          </div>
          <div>
            <label className={lbl}>
              Kategória leírás {category.categoryType === 'accessory' ? '(az ajánlat végén, az Információ előtt)' : '(a megszólítás és bevezető után)'}
            </label>
            <textarea className={field} rows={6} value={category.docIntro || ''} placeholder="Miért ez a termékcsalád, minőség, hó- és szélterhelés…" onChange={(e) => onChange({ docIntro: e.target.value })} />
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
            <div>
              <label className={lbl}>Opcionálisan rendelhető (a kategória termékei után; első sor félkövér)</label>
              <textarea className={field} rows={5} value={category.docOptions || ''} placeholder={'+Opcionálisan rendelhető a termékhez:\n- egyedi RAL színek…'} onChange={(e) => onChange({ docOptions: e.target.value })} />
            </div>
            <div>
              <label className={lbl}>Akció (félkövér)</label>
              <textarea className={field} rows={5} value={category.docPromo || ''} placeholder="Ha {{hatarido}}-ig megrendeli az alapszerkezetet kedvezményt tudok biztosítani!" onChange={(e) => onChange({ docPromo: e.target.value })} />
            </div>
          </div>
          <p className="text-[11px] text-slate-500">
            Változók: {'{{megszolitas}} {{ugyfel_nev}} {{telepules}} {{meret}} {{szelesseg}} {{kinyulas}} {{magassag}} {{beepites}} {{hatarido}} {{arfolyam}}'} · A módosítás a jobb felső „Mentés” gombbal mentődik, és az új ajánlatokban érvényes.
          </p>
        </div>
      )}
    </div>
  );
}
