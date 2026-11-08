'use client';

import { thumbUrl } from '@/lib/thumb';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  Check,
  Download,
  Eye,
  FilePlus2,
  FileText,
  Image as ImageIcon,
  Layers,
  Maximize2,
  PackagePlus,
  ChevronRight,
  GripVertical,
  Plus,
  RefreshCw,
  RotateCcw,
  Save,
  Scissors,
  Send,
  SlidersHorizontal,
  Sparkles,
  Trash2,
  Type,
  Upload,
} from 'lucide-react';
import {
  DIMENSION_SOURCE_OPTIONS,
  formatDotNumber,
  MOUNT_TYPES,
  PRICING_MODE_OPTIONS,
  toTemplateText,
} from '@/lib/constants';
import {
  buildEditableBlockFromTemplate,
  CalculationContext,
  computeBlockBreakdown,
  createDefaultMaterialAlgorithm,
  recalculateBlockTotals,
  recalculateBlockWithAlgorithms,
  roundHuf,
} from '@/lib/pricing-engine';
import { AdjustmentsEditor, PriceSummaryLine } from '@/components/PricingWidgets';
import { AutoTextarea, btn, labelCls, PageHeader, Stepper } from '@/components/ui';
import {
  DimensionSource,
  MountType,
  PhotoCaptionBlock,
  ProductCategory,
  ProductPricingMode,
  QuoteDocumentBlock,
  QuoteRecord,
  QuoteTableRow,
  QuoteTemplate,
  SystemConfig,
  TemplateMaterialItem,
  UploadedMediaItem,
  KnownCustomer,
} from '@/lib/types';

interface PdfBlockEditorViewProps {
  knownCustomers: KnownCustomer[];
  config: SystemConfig;
  categories: ProductCategory[];
  templates: QuoteTemplate[];
  mediaLibrary: UploadedMediaItem[];
  initialQuote: Partial<QuoteRecord>;
  onUploadImage: (file: File) => Promise<string | null>;
  onSaveQuoteAndGeneratePdf: (
    quotePayload: Partial<QuoteRecord>,
    downloadAfterSave: boolean
  ) => Promise<QuoteRecord | null>;
  onBackToWizard?: () => void;
  // Mentés után a kiküldő ablak megnyitása
  onSendQuote?: (saved: QuoteRecord) => void;
  // Egy termékszakasz alcímének és bevezetőjének mentése a termék sablonjába
  onSaveTemplate?: (template: QuoteTemplate) => Promise<void>;
}

export function PdfBlockEditorView({
  knownCustomers,
  config,
  templates,
  mediaLibrary,
  initialQuote,
  onUploadImage,
  onSaveQuoteAndGeneratePdf,
  onBackToWizard,
  onSendQuote,
  onSaveTemplate,
}: PdfBlockEditorViewProps) {
  const isExistingSavedQuote = Boolean(initialQuote.id);

  const [customerName, setCustomerName] = useState(
    initialQuote.customerName || 'Minta Ügyfél'
  );
  const [greetingName, setGreetingName] = useState(
    initialQuote.greetingName || initialQuote.customerName || 'Érdeklődő'
  );
  const [city, setCity] = useState(initialQuote.city || 'Budapest');
  const [email, setEmail] = useState(initialQuote.email || '');
  const [phone, setPhone] = useState(initialQuote.phone || '');
  const [widthCm, setWidthCm] = useState<number>(
    Number(initialQuote.widthCm || 600)
  );
  const [projectionCm, setProjectionCm] = useState<number>(
    Number(initialQuote.projectionCm || 400)
  );
  const [heightCm, setHeightCm] = useState<number>(
    Number(initialQuote.heightCm || 250)
  );
  const [mountType, setMountType] = useState<MountType>(
    initialQuote.mountType || 'Épülethez rögzített'
  );
  const [eurHufRate, setEurHufRate] = useState<number>(
    Number(initialQuote.eurHufRate || config.defaultEurHufRate || 400)
  );
  const [deliveryFeeHuf, setDeliveryFeeHuf] = useState<number>(
    Number(initialQuote.deliveryFeeHuf ?? config.defaultDeliveryFeeHuf ?? 40000)
  );

  const calcCtx: CalculationContext = {
    widthCm,
    projectionCm,
    heightCm,
    mountType,
    eurHufRate,
    formula: config.pricingFormula,
  };

  const [blocks, setBlocks] = useState<QuoteDocumentBlock[]>(() => {
    const initCtx: CalculationContext = {
      widthCm: Number(initialQuote.widthCm || 600),
      projectionCm: Number(initialQuote.projectionCm || 400),
      heightCm: Number(initialQuote.heightCm || 250),
      mountType: initialQuote.mountType || 'Épülethez rögzített',
      eurHufRate: Number(
        initialQuote.eurHufRate || config.defaultEurHufRate || 400
      ),
      formula: config.pricingFormula,
    };
    if (Array.isArray(initialQuote.blocks) && initialQuote.blocks.length > 0) {
      const cloned: QuoteDocumentBlock[] = JSON.parse(
        JSON.stringify(initialQuote.blocks)
      );
      return cloned.map((b) =>
        b.type === 'template_section'
          ? recalculateBlockWithAlgorithms(b, initCtx, templates)
          : b
      );
    }
    return [
      {
        id: `blk_intro_${Date.now()}`,
        type: 'text_box',
        title: `Kedves ${
          initialQuote.greetingName ||
          initialQuote.customerName ||
          'Érdeklődő'
        }!`,
        content:
          'Örömmel fogadtuk megkeresését! Kérésének megfelelően küldjük személyre szabott árajánlatunkat.',
        textStyle: 'greeting',
      },
    ];
  });

  const [templateToInsertId, setTemplateToInsertId] = useState<string>(
    templates[0]?.id || ''
  );

  const [pdfPreviewUrl, setPdfPreviewUrl] = useState<string | null>(null);
  const previewRequestRef = useRef(0);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [needsPreviewRefresh, setNeedsPreviewRefresh] = useState(false);
  const [savingPdf, setSavingPdf] = useState(false);
  const [uploadingImg, setUploadingImg] = useState(false);
  const [fullscreenPreview, setFullscreenPreview] = useState(false);
  // Tételsoronként lenyitható részletek (képlet, leírás, szerep, fotó)
  const [expandedRowIds, setExpandedRowIds] = useState<string[]>([]);

  const updateBlock = (
    blockId: string,
    updater: (blk: QuoteDocumentBlock) => QuoteDocumentBlock
  ) => {
    setBlocks((prev) =>
      prev.map((b) => (b.id === blockId ? updater(b) : b))
    );
    setNeedsPreviewRefresh(true);
  };

  // Húzd és ejtsd: a fogantyú lenyomásakor válik húzhatóvá a blokk (a mezők így szerkeszthetők maradnak)
  const [dragFrom, setDragFrom] = useState<number | null>(null);
  const [dropAt, setDropAt] = useState<number | null>(null);
  // Alapból minden szakasz össze van csukva; a nyitottakat tartjuk számon
  const [openBlocks, setOpenBlocks] = useState<Record<string, boolean>>({});
  const [editorStep, setEditorStep] = useState<1 | 2 | 3>(2);
  const [outlineDrag, setOutlineDrag] = useState<number | null>(null);
  const [outlineDrop, setOutlineDrop] = useState<number | null>(null);
  const [outlineMenuOpen, setOutlineMenuOpen] = useState(false);
  const [insertMenuAt, setInsertMenuAt] = useState<number | null>(null);

  const blockLabel = (blk: QuoteDocumentBlock) =>
    blk.type === 'text_box'
      ? 'Szöveg'
      : blk.type === 'photo_box'
      ? 'Fotó'
      : blk.type === 'template_section'
      ? blk.isManualSection
        ? 'Termék (kézi ár)'
        : 'Termék'
      : 'Oldaltörés';
  const blockSummary = (blk: QuoteDocumentBlock) =>
    blk.type === 'text_box'
      ? blk.title || (blk.content || '').slice(0, 80)
      : blk.type === 'photo_box'
      ? blk.photo?.titleAbove || blk.photo?.captionBelow || ''
      : blk.type === 'template_section'
      ? blk.sectionTitle || ''
      : '';

  const renderInsertMenu = (at: number, close: () => void, placement = 'absolute top-full mt-1') => {
    const item = 'px-3 py-1.5 rounded-lg text-[13px] text-slate-700 hover:bg-slate-100 text-left';
    const run = (fn: () => void) => {
      fn();
      close();
    };
    return (
<div className={`${placement} z-20 w-64 max-w-[calc(100vw-2rem)] bg-white border border-slate-200 rounded-xl shadow-lg p-1.5 flex flex-col`}>
            <button type="button" className={item} onClick={() => run(() => handleAddStandaloneTextBox(at - 1))}>
              Szöveg
            </button>
            <button type="button" className={item} onClick={() => run(() => handleAddStandalonePhotoBox(at - 1))}>
              Fotó
            </button>
            <button type="button" className={item} onClick={() => run(() => handleAddCustomBlankTemplateSection(at))}>
              Üres termékszekció
            </button>
            <button type="button" className={item} onClick={() => run(() => handleAddPageBreak(at))}>
              Oldaltörés
            </button>
            {templates.length > 0 && (
              <div className="border-t border-slate-100 mt-1 pt-1">
                <div className="px-3 py-1 text-xs text-slate-500">Termék sablonból</div>
                <div className="max-h-56 overflow-y-auto flex flex-col">
                  {templates
                    .filter((t) => t.status !== 'inactive')
                    .map((t) => (
                      <button key={t.id} type="button" className={item} onClick={() => run(() => handleInsertSavedTemplateBlock(at, t.id))}>
                        {t.name}
                      </button>
                    ))}
                </div>
              </div>
            )}
          </div>
    );
  };

  // Bal oldali szerkezet: a szakaszok sorrendje, kattintásra ugrás, húzással átrendezés
  const blockIcon = (blk: QuoteDocumentBlock) =>
    blk.type === 'text_box' ? Type : blk.type === 'photo_box' ? ImageIcon : blk.type === 'template_section' ? PackagePlus : Scissors;
  const focusBlock = (id: string) => {
    setOpenBlocks({ [id]: true });
    setTimeout(() => document.getElementById(`blk-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 60);
  };
  const renderOutline = () => (
    <nav aria-label="Ajánlat szerkezete" className="bg-white rounded-2xl border border-slate-200 p-2">
      <div className="px-2 pt-1 pb-2 text-xs font-medium text-slate-500 uppercase tracking-wide">Szerkezet</div>
      <ol className="space-y-0.5">
        {blocks.map((blk, idx) => {
          const Icon = blockIcon(blk);
          const open = Boolean(openBlocks[blk.id]);
          return (
            <li
              key={blk.id}
              draggable
              onDragStart={(e) => {
                setOutlineDrag(idx);
                e.dataTransfer.effectAllowed = 'move';
                e.dataTransfer.setData('text/plain', blk.id);
              }}
              onDragOver={(e) => {
                if (outlineDrag === null) return;
                e.preventDefault();
                const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
                setOutlineDrop(e.clientY < r.top + r.height / 2 ? idx : idx + 1);
              }}
              onDrop={(e) => {
                e.preventDefault();
                if (outlineDrag !== null && outlineDrop !== null) moveBlockTo(outlineDrag, outlineDrop);
                setOutlineDrag(null);
                setOutlineDrop(null);
              }}
              onDragEnd={() => {
                setOutlineDrag(null);
                setOutlineDrop(null);
              }}
              className={`relative ${outlineDrag === idx ? 'opacity-40' : ''}`}
            >
              {outlineDrag !== null && outlineDrop === idx && <div className="absolute inset-x-1 -top-px h-0.5 bg-slate-900" />}
              {outlineDrag !== null && outlineDrop === idx + 1 && idx === blocks.length - 1 && (
                <div className="absolute inset-x-1 -bottom-px h-0.5 bg-slate-900" />
              )}
              <button
                type="button"
                onClick={() => focusBlock(blk.id)}
                className={`w-full flex items-start gap-2 px-2 py-1.5 rounded-lg text-left cursor-grab active:cursor-grabbing ${
                  open ? 'bg-slate-900 text-white' : 'hover:bg-slate-100 text-slate-700'
                }`}
                title="Kattints a megnyitáshoz, húzd az átrendezéshez"
              >
                <Icon className={`w-3.5 h-3.5 mt-0.5 shrink-0 ${open ? 'text-white/80' : 'text-slate-400'}`} />
                <span className="min-w-0 text-[13px] leading-snug break-words">
                  {blockSummary(blk) || blockLabel(blk)}
                </span>
              </button>
            </li>
          );
        })}
      </ol>
      <div className="relative mt-1 pt-1 border-t border-slate-100">
        <button
          type="button"
          onClick={() => setOutlineMenuOpen((v) => !v)}
          className="w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-[13px] text-slate-600 hover:bg-slate-100"
          aria-expanded={outlineMenuOpen}
        >
          <Plus className="w-3.5 h-3.5" />
          Új szakasz a végére
        </button>
        {outlineMenuOpen && renderInsertMenu(blocks.length, () => setOutlineMenuOpen(false), 'absolute left-0 top-full mt-1')}
      </div>
    </nav>
  );

  // „+” sáv két blokk között: ide szúrja be az új szakaszt
  const renderInsertBar = (at: number) => {
    const open = insertMenuAt === at;
    return (
      <div className="relative flex items-center justify-center h-4 group" key={`ins_${at}`}>
        <div className={`absolute inset-x-0 top-1/2 border-t ${open ? 'border-slate-400' : 'border-transparent group-hover:border-slate-200'}`} />
        <button
          type="button"
          onClick={() => setInsertMenuAt(open ? null : at)}
          className={`relative z-[1] w-6 h-6 grid place-items-center rounded-full border bg-white text-slate-500 hover:text-slate-950 hover:border-slate-400 ${
            open ? 'border-slate-400 text-slate-950' : 'border-slate-200 opacity-60 group-hover:opacity-100'
          }`}
          title="Új szakasz beszúrása ide"
          aria-label="Új szakasz beszúrása ide"
          aria-expanded={open}
        >
          <Plus className="w-3.5 h-3.5" />
        </button>
        {open && renderInsertMenu(at, () => setInsertMenuAt(null))}
      </div>
    );
  };

  // Átrendezés után a termékszakaszok címében lévő sorszám („1. KEDRY …”) a tényleges sorrendet kövesse
  const renumberSections = (list: QuoteDocumentBlock[]): QuoteDocumentBlock[] => {
    let n = 0;
    return list.map((b) => {
      if (b.type !== 'template_section') return b;
      n += 1;
      const title = b.sectionTitle || '';
      return /^\d+\.\s/.test(title) ? { ...b, sectionTitle: title.replace(/^\d+\.\s/, `${n}. `) } : b;
    });
  };

  const moveBlock = (idx: number, direction: -1 | 1) => {
    setBlocks((prev) => {
      const target = idx + direction;
      if (target < 0 || target >= prev.length) return prev;
      const copy = [...prev];
      const temp = copy[idx];
      copy[idx] = copy[target];
      copy[target] = temp;
      return renumberSections(copy);
    });
    setNeedsPreviewRefresh(true);
  };

  // Új blokk beszúrása a megadott helyre (index nélkül a végére)
  const insertBlockAt = (block: QuoteDocumentBlock, at?: number) => {
    setOpenBlocks((prev) => ({ ...prev, [block.id]: true }));
    setBlocks((prev) => {
      if (at === undefined || at >= prev.length) return [...prev, block];
      const copy = [...prev];
      copy.splice(Math.max(0, at), 0, block);
      return copy;
    });
    setNeedsPreviewRefresh(true);
  };

  // Húzással áthelyezés: a blokk a `to` pozíció elé kerül
  const moveBlockTo = (from: number, to: number) => {
    setBlocks((prev) => {
      if (from === to || from + 1 === to) return prev;
      const copy = [...prev];
      const [item] = copy.splice(from, 1);
      copy.splice(to > from ? to - 1 : to, 0, item);
      return renumberSections(copy);
    });
    setNeedsPreviewRefresh(true);
  };

  const removeBlock = (blockId: string) => {
    setBlocks((prev) => prev.filter((b) => b.id !== blockId));
    setNeedsPreviewRefresh(true);
  };

  // Update greeting name inside first greeting block automatically when user edits customer/greeting name
  const handleUpdateCustomerGreetingInBlocks = (
    newCustName: string,
    newGreetName: string
  ) => {
    setCustomerName(newCustName);
    setGreetingName(newGreetName);
    setBlocks((prev) =>
      prev.map((b, i) => {
        if (i === 0 && b.type === 'text_box' && b.textStyle === 'greeting') {
          return {
            ...b,
            title: `Kedves ${(newGreetName || newCustName || 'Érdeklődő').trim()}!`,
          };
        }
        return b;
      })
    );
    setNeedsPreviewRefresh(true);
  };

  // Add standalone text box block
  const handleAddStandaloneTextBox = (afterIndex?: number) => {
    const newBlock: QuoteDocumentBlock = {
      id: `blk_txt_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      type: 'text_box',
      title: 'Külön szövegrész / Megjegyzés',
      content: 'Írd ide a kívánt szöveget...',
      textStyle: 'normal',
      align: 'left',
    };
    insertBlockAt(newBlock, afterIndex === undefined ? undefined : afterIndex + 1);
  };

  // Add standalone photo + caption box block
  const handleAddStandalonePhotoBox = (afterIndex?: number) => {
    const newBlock: QuoteDocumentBlock = {
      id: `blk_photo_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      type: 'photo_box',
      photo: {
        id: `ph_${Date.now()}`,
        imageUrl: mediaLibrary[0]?.url || '',
        titleAbove: 'Látványterv / Műszaki fotó',
        captionBelow: 'Írd ide a fotó alatti szövegdoboz tartalmát...',
        widthPct: 75,
        align: 'center',
      },
    };
    insertBlockAt(newBlock, afterIndex === undefined ? undefined : afterIndex + 1);
  };

  // Insert existing saved template as a new block
  /**
   * Egy termékszakasz minden módosítása vissza a termék sablonjába: alcím, bevezető és záró szöveg,
   * fotók feliratokkal, tételek neve / leírása / árazása, új tételek. A konkrét ügyféladatok
   * (méret, név, település) visszaalakulnak változóvá, hogy a következő ajánlatban az új adat kerüljön a helyükre.
   */
  const [savingTplFor, setSavingTplFor] = useState<string | null>(null);
  const saveSectionToTemplate = async (blk: QuoteDocumentBlock) => {
    if (!onSaveTemplate || !blk.templateId) return;
    const tpl = templates.find((t) => t.id === blk.templateId);
    if (!tpl) return;
    const ctx = { customerName, greetingName, city, widthCm, projectionCm, heightCm, mountType, eurHufRate, deliveryFeeHuf };
    const T = (x?: string) => toTemplateText(x || '', ctx);
    const rows = (blk.rows || []).filter((r) => !r.systemRole);
    let updated = 0;
    let added = 0;
    const materials = (tpl.materials || []).map((m) => {
      const r = rows.find((x) => x.materialId === m.id);
      if (!r) return m;
      updated++;
      const alg = r.algorithm ? { ...r.algorithm } : {};
      // átvett árnál (priceSource) a forrás termék marad az ár gazdája
      const pricing = m.priceSource ? {} : alg;
      return {
        ...m,
        ...pricing,
        id: m.id,
        priceSource: m.priceSource,
        name: T(r.name) || m.name,
        description: T(r.description) || m.description || '',
        photos: (r.photos || m.photos || []).map((ph) => ({ ...ph, titleAbove: T(ph.titleAbove), captionBelow: T(ph.captionBelow) })),
      } as typeof m;
    });
    // az ajánlatban felvett új (algoritmussal rendelkező) tételek is bekerülnek
    for (const r of rows) {
      if (r.materialId && (tpl.materials || []).some((m) => m.id === r.materialId)) continue;
      if (!r.algorithm) continue;
      added++;
      materials.push({ ...r.algorithm, id: r.algorithm.id || `mat_${Date.now().toString(36)}${added}`, name: T(r.name) || r.algorithm.name, description: T(r.description) || r.algorithm.description || '' });
    }
    const skipped = rows.filter((r) => !r.algorithm && !(r.materialId && (tpl.materials || []).some((m) => m.id === r.materialId))).length;
    const msg =
      `A „${tpl.name}” sablonba mentés:\n\n` +
      `• alcím, bevezető és záró szöveg\n• ${(blk.sectionPhotos || []).length} fotó a feliratokkal\n• ${updated} tétel frissül${added ? `, ${added} új tétel` : ''}\n` +
      (skipped ? `• ${skipped} kézi tétel (árazás nélkül) kimarad\n` : '') +
      `\nA méret, név és település helyére a következő ajánlatokban automatikusan az új adat kerül. Mented?`;
    if (!window.confirm(msg)) return;
    setSavingTplFor(blk.id);
    try {
      await onSaveTemplate({
        ...tpl,
        subtitle: T(blk.sectionSubtitle),
        introText: T(blk.sectionIntroText),
        closingText: T(blk.sectionClosingText),
        // a bevezető / záró szöveg már tartalmazza a külön szövegdobozokat, ezért azok beolvadnak
        textBlocks: (tpl.textBlocks || []).filter((tb) => !['before_photos', 'before_table', 'after_table'].includes(tb.position)),
        photos: (blk.sectionPhotos || []).map((ph) => ({ ...ph, titleAbove: T(ph.titleAbove), captionBelow: T(ph.captionBelow) })),
        materials,
      });
    } finally {
      setSavingTplFor(null);
    }
  };

  const handleInsertSavedTemplateBlock = (at?: number, templateId = templateToInsertId) => {
    const tpl = templates.find((t) => t.id === templateId);
    if (!tpl) return;
    const sectionCount =
      blocks.filter((b) => b.type === 'template_section').length + 1;
    const newBlock = buildEditableBlockFromTemplate(
      tpl,
      sectionCount,
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
      config
    );
    insertBlockAt(newBlock, at);
  };

  // Insert a brand-new blank custom template/product section directly in the editor
  const handleAddCustomBlankTemplateSection = (at?: number) => {
    const sectionCount =
      blocks.filter((b) => b.type === 'template_section').length + 1;
    const defaultAlg = createDefaultMaterialAlgorithm({
      name: '1. Termék / Anyag megnevezése',
      description: 'Egyedi méretre gyártott kivitel',
      pricingMode: 'per_m2',
      unitPrice: 350,
    });
    const draftBlock: QuoteDocumentBlock = {
      id: `blk_custom_sec_${Date.now()}`,
      type: 'template_section',
      sectionTitle: `${sectionCount}. Egyedi Sablon / Termék Szekció (${widthCm}×${projectionCm} cm)`,
      sectionSubtitle: 'Egyedi műszaki tartalom és árkalkuláció',
      sectionIntroText: 'Írd ide a sablon bevezető szövegét...',
      sectionPhotos: [],
      tableTitle: 'Részletes Árkalkuláció',
      tableHeaders: [
        'Megnevezés / Anyag',
        'Mennyiség / Méret',
        'Listaár (EUR)',
        'Kedvezményes ár (EUR)',
      ],
      rows: [
        {
          id: `row_${Date.now()}`,
          materialId: defaultAlg.id,
          name: defaultAlg.name,
          description: defaultAlg.description,
          quantityLabel: '',
          listPriceEur: 0,
          discountPriceEur: 0,
          currency: 'EUR',
          itemRole: 'base',
          included: true,
          note: '',
          photos: [],
          algorithm: defaultAlg,
        },
      ],
      autoCalculateTotals: true,
      customTotalBaseEur: 0,
      customTotalBaseHuf: 0,
      sectionClosingText: '',
    };
    const calculatedBlock = recalculateBlockWithAlgorithms(
      draftBlock,
      calcCtx,
      templates
    );
    insertBlockAt(calculatedBlock, at);
  };

  // Add page break
  const handleAddPageBreak = (at?: number) => {
    insertBlockAt({ id: `blk_brk_${Date.now()}`, type: 'page_break' }, at);
  };

  const refreshLivePdfPreview = useCallback(async () => {
    setPreviewLoading(true);
    try {
      const requestId = ++previewRequestRef.current;
      const res = await fetch('/api/quotes/preview-pdf', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/pdf' },
        body: JSON.stringify({
          quoteNumber: initialQuote.quoteNumber || 'ELŐNÉZET',
          customerName,
          greetingName,
          city,
          email,
          phone,
          widthCm,
          projectionCm,
          heightCm,
          mountType,
          eurHufRate,
          deliveryFeeHuf,
          blocks,
        }),
      });
      // Csak a legutolsó kérés eredményét mutatjuk (gyors gépelésnél a régebbiek elavultak)
      if (res.ok && requestId === previewRequestRef.current) {
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        setPdfPreviewUrl((prev) => {
          if (prev) URL.revokeObjectURL(prev);
          return url;
        });
        setNeedsPreviewRefresh(false);
      }
    } catch (e) {
      console.error('Failed to generate PDF preview:', e);
    } finally {
      setPreviewLoading(false);
    }
  }, [
    initialQuote.quoteNumber,
    customerName,
    greetingName,
    city,
    email,
    phone,
    widthCm,
    projectionCm,
    heightCm,
    mountType,
    eurHufRate,
    deliveryFeeHuf,
    blocks,
  ]);

  useEffect(() => {
    refreshLivePdfPreview();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Az előnézet magától frissül, ha egy ideje nem változott semmi
  useEffect(() => {
    if (!needsPreviewRefresh) return;
    const timer = setTimeout(() => {
      refreshLivePdfPreview();
    }, 500);
    return () => clearTimeout(timer);
  }, [needsPreviewRefresh, refreshLivePdfPreview]);

  // Árfolyam váltás: minden termékszekció forintos összege újraszámolódik
  const applyRate = (newRate: number) => {
    setEurHufRate(newRate);
    const nextCtx: CalculationContext = { ...calcCtx, eurHufRate: newRate };
    setBlocks((prev) =>
      prev.map((b) =>
        b.type === 'template_section'
          ? recalculateBlockWithAlgorithms(b, nextCtx, templates)
          : b
      )
    );
    setNeedsPreviewRefresh(true);
  };

  // Aktuális MNB árfolyam: új, még alapértelmezett árfolyamú ajánlatnál automatikusan átvesszük,
  // mentett ajánlatnál csak felajánljuk (az ajánlat a kiállításkori árfolyamot őrzi)
  const [liveRate, setLiveRate] = useState<{
    rate: number;
    exact: number;
    source: string;
    rateDate: string | null;
  } | null>(null);
  useEffect(() => {
    let cancelled = false;
    fetch('/api/exchange-rate')
      .then((r) => r.json())
      .then((d) => {
        if (cancelled || !d?.rate) return;
        setLiveRate(d);
        const usingDefault =
          !initialQuote.eurHufRate ||
          Number(initialQuote.eurHufRate) === Number(config.defaultEurHufRate);
        if (!isExistingSavedQuote && usingDefault && d.rate !== eurHufRate) {
          applyRate(d.rate);
        }
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSaveAndDownload = async (mode: 'save' | 'download' | 'send') => {
    const downloadImmediately = mode !== 'save';
    setSavingPdf(true);
    try {
      const firstTpl = blocks.find((b) => b.type === 'template_section');
      const primaryTotalEur = Number(firstTpl?.customTotalBaseEur || 0);
      const primaryTotalHuf = Number(
        firstTpl?.customTotalBaseHuf || roundHuf(primaryTotalEur, eurHufRate)
      );

      const saved = await onSaveQuoteAndGeneratePdf(
        {
          ...initialQuote,
          customerName,
          greetingName,
          city,
          email,
          phone,
          widthCm,
          projectionCm,
          heightCm,
          mountType,
          eurHufRate,
          deliveryFeeHuf,
          blocks,
          primaryTotalEur,
          primaryTotalHuf,
          isEditedAfterGeneration: isExistingSavedQuote,
        },
        downloadImmediately
      );

      if (saved && mode === 'download') {
        await downloadSavedPdf(saved.id, saved.quoteNumber);
      }
      if (saved && mode === 'send') {
        onSendQuote?.(saved);
      }
    } finally {
      setSavingPdf(false);
    }
    // az előnézet frissítése ne tartsa vissza a gombokat
    void refreshLivePdfPreview();
  };

  // Letöltés fájlként (nem új lapon: a mentés utáni window.open-t a böngésző felugró ablakként blokkolhatja)
  const downloadSavedPdf = async (id: string, quoteNumber?: string) => {
    try {
      const res = await fetch(`/api/quotes/${id}/pdf?download=1`);
      if (!res.ok) throw new Error(String(res.status));
      const blob = await res.blob();
      const cd = res.headers.get('content-disposition') || '';
      const m = cd.match(/filename\*=UTF-8''([^;]+)|filename="?([^";]+)"?/i);
      const name = m ? decodeURIComponent(m[1] || m[2]) : `${quoteNumber || 'arajanlat'}.pdf`;
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = name;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
    } catch (e) {
      console.error('PDF letöltési hiba:', e);
      window.location.href = `/api/quotes/${id}/pdf?download=1`;
    }
  };

  const renderPreviewCard = (heightCls: string) => (
          <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
            <div className="px-4 py-2 border-b border-slate-200 flex items-center justify-between">
              <span className="text-[13px] font-medium text-slate-600 inline-flex items-center gap-2">
                Előnézet
                {(previewLoading || needsPreviewRefresh) && (
                  <RefreshCw className="w-3.5 h-3.5 animate-spin text-slate-400" />
                )}
              </span>
              {pdfPreviewUrl && (
                <button
                  type="button"
                  onClick={() => setFullscreenPreview(true)}
                  className="p-1.5 rounded-lg text-slate-400 hover:text-slate-900 hover:bg-slate-100"
                  title="Teljes képernyő"
                >
                  <Maximize2 className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            <div className={`${heightCls} bg-slate-100 flex items-center justify-center`}>
              {pdfPreviewUrl ? (
                <iframe
                  src={pdfPreviewUrl}
                  title="PDF Előnézet"
                  className="w-full h-full border-0"
                />
              ) : (
                <div className="text-xs text-slate-500">
                  PDF előnézet készítése...
                </div>
              )}
            </div>
          </div>
  );

  // Lépések: ügyfél és méret → tartalom → előnézet és küldés
  const EDITOR_STEPS = [
    { num: 1 as const, label: 'Ügyfél és méret', short: 'Ügyfél' },
    { num: 2 as const, label: 'Tartalom', short: 'Tartalom' },
    { num: 3 as const, label: 'Előnézet és küldés', short: 'Küldés' },
  ];
  const stepNav = (
    <div className="flex flex-wrap items-center justify-between gap-2 pt-4 border-t border-slate-200">
      {editorStep > 1 ? (
        <button type="button" onClick={() => setEditorStep((st) => (st - 1) as 1 | 2 | 3)} className={btn.ghost}>
          <ArrowLeft className="w-4 h-4" />
          Vissza
        </button>
      ) : (
        <span />
      )}
      {editorStep < 3 && (
        <button type="button" onClick={() => setEditorStep((st) => (st + 1) as 1 | 2 | 3)} className={btn.primary}>
          Tovább: {EDITOR_STEPS[editorStep].label}
          <ArrowRight className="w-4 h-4" />
        </button>
      )}
    </div>
  );

  return (
    <div className="space-y-5">
      <PageHeader
        title={
          isExistingSavedQuote
            ? `Ajánlat ${initialQuote.quoteNumber || ''}`
            : 'Ajánlat szerkesztése'
        }
        subtitle="Három lépés: ügyfél és méret, tartalom, végül előnézet és küldés. Minden szöveg és ár átírható."
        actions={
          <>
            {onBackToWizard && (
              <button type="button" onClick={onBackToWizard} className={btn.ghost}>
                <ArrowLeft className="w-4 h-4" />
                Vissza
              </button>
            )}
            <button
              type="button"
              disabled={savingPdf}
              onClick={() => handleSaveAndDownload('save')}
              className={btn.secondary}
            >
              <Save className="w-4 h-4" />
              {savingPdf ? 'Mentés…' : 'Mentés'}
            </button>
            {/* PDF letöltés bármelyik lépésből (mentés után) */}
            <button
              type="button"
              disabled={savingPdf}
              onClick={() => handleSaveAndDownload('download')}
              className={btn.secondary}
              title="Mentés, majd a PDF letöltése"
            >
              <Download className="w-4 h-4" />
              PDF
            </button>
          </>
        }
      >
        <Stepper steps={EDITOR_STEPS} current={editorStep} onSelect={(n) => setEditorStep(n)} />
      </PageHeader>

      {editorStep === 1 && (<>
      {/* Customer Name Automation & Dimensions Quick Bar */}
      <div className="bg-white rounded-2xl border border-slate-200 p-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-3 items-start">
          <div>
            <label className={labelCls}>
              Ügyfél
            </label>
            <input
              type="text"
              value={customerName}
              list="editor-known-customers"
              autoComplete="off"
              onChange={(e) => {
                const val = e.target.value;
                // Korábbi ügyfél kiválasztása: megszólítás, település, elérhetőség is átjön
                const known = knownCustomers.find(
                  (c) => c.name.toLowerCase() === val.trim().toLowerCase()
                );
                handleUpdateCustomerGreetingInBlocks(val, known ? known.greetingName : val);
                if (known) {
                  if (known.city) setCity(known.city);
                  if (known.email) setEmail(known.email);
                  if (known.phone) setPhone(known.phone);
                }
              }}
              className="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs font-bold"
            />
            <datalist id="editor-known-customers">
              {knownCustomers.map((c) => (
                <option key={c.name} value={c.name}>
                  {[c.city, c.email || c.phone].filter(Boolean).join(' · ')}
                </option>
              ))}
            </datalist>
          </div>
          <div>
            <label className={labelCls}>
              Megszólítás
            </label>
            <input
              type="text"
              value={greetingName}
              onChange={(e) =>
                handleUpdateCustomerGreetingInBlocks(
                  customerName,
                  e.target.value
                )
              }
              className="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs font-semibold"
            />
          </div>
          <div>
            <label className={labelCls}>
              Település
            </label>
            <input
              type="text"
              value={city}
              onChange={(e) => {
                setCity(e.target.value);
                setNeedsPreviewRefresh(true);
              }}
              className="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs"
            />
          </div>
          <div>
            <label className={labelCls}>
              Méret (cm)
            </label>
            <div className="flex items-center gap-1">
              <input
                type="number"
                min={50}
                value={widthCm}
                onChange={(e) => {
                  const nextW = Math.max(50, Number(e.target.value) || 100);
                  setWidthCm(nextW);
                  const nextCtx: CalculationContext = {
                    ...calcCtx,
                    widthCm: nextW,
                  };
                  setBlocks((prev) =>
                    prev.map((b) =>
                      b.type === 'template_section'
                        ? recalculateBlockWithAlgorithms(b, nextCtx, templates)
                        : b
                    )
                  );
                  setNeedsPreviewRefresh(true);
                }}
                className="w-full px-2.5 py-2 rounded-xl border border-slate-300 text-xs font-bold"
              />
              <span className="text-slate-400">×</span>
              <input
                type="number"
                min={50}
                value={projectionCm}
                onChange={(e) => {
                  const nextP = Math.max(50, Number(e.target.value) || 100);
                  setProjectionCm(nextP);
                  const nextCtx: CalculationContext = {
                    ...calcCtx,
                    projectionCm: nextP,
                  };
                  setBlocks((prev) =>
                    prev.map((b) =>
                      b.type === 'template_section'
                        ? recalculateBlockWithAlgorithms(b, nextCtx, templates)
                        : b
                    )
                  );
                  setNeedsPreviewRefresh(true);
                }}
                className="w-full px-2.5 py-2 rounded-xl border border-slate-300 text-xs font-bold"
              />
            </div>
          </div>
          <div>
            <label className={labelCls}>
              Beépítés
            </label>
            <select
              value={mountType}
              onChange={(e) => {
                const nextMount = e.target.value as MountType;
                setMountType(nextMount);
                setNeedsPreviewRefresh(true);
              }}
              className="w-full px-2.5 py-2 rounded-xl border border-slate-300 text-xs"
            >
              {MOUNT_TYPES.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className={labelCls}>
              Árfolyam (Ft/EUR)
            </label>
            <input
              type="number"
              min={1}
              value={eurHufRate}
              onChange={(e) =>
                applyRate(Math.max(1, Number(e.target.value) || 400))
              }
              className="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs font-bold tabular-nums"
            />
            {liveRate && (
              liveRate.rate === eurHufRate ? (
                <div className="text-xs text-slate-500 mt-1" title={liveRate.source}>
                  MNB {liveRate.rateDate || 'ma'} · {liveRate.exact.toFixed(2).replace('.', ',')}
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => applyRate(liveRate.rate)}
                  className="text-xs text-slate-600 hover:text-slate-950 underline mt-1"
                  title="Átállítja az ajánlatot az aktuális MNB árfolyamra és újraszámolja az árakat"
                >
                  MNB ma: {liveRate.exact.toFixed(2).replace('.', ',')} - frissítés
                </button>
              )
            )}
          </div>
        </div>
      </div>

      {stepNav}
      </>)}

      {editorStep === 2 && (<>
      {/* Add Block Toolbar */}
      <div className="flex flex-wrap items-center gap-1">
        <span className="text-[13px] text-slate-500 mr-1">Hozzáadás:</span>
        <button type="button" onClick={() => handleAddStandaloneTextBox()} className={btn.ghost}>
          <Type className="w-4 h-4" />
          Szöveg
        </button>
        <button type="button" onClick={() => handleAddStandalonePhotoBox()} className={btn.ghost}>
          <ImageIcon className="w-4 h-4" />
          Fotó
        </button>
        <button type="button" onClick={() => handleAddCustomBlankTemplateSection()} className={btn.ghost}>
          <PackagePlus className="w-4 h-4" />
          Üres termékszekció
        </button>
        <button type="button" onClick={() => handleAddPageBreak()} className={btn.ghost}>
          <Scissors className="w-4 h-4" />
          Oldaltörés
        </button>
        {templates.length > 0 && (
          <div className="flex items-center gap-1.5 w-full sm:w-auto sm:ml-auto min-w-0">
            {/* választásra azonnal bekerül a termék (nem kell külön gombot nyomni) */}
            <select
              value=""
              onChange={(e) => {
                if (!e.target.value) return;
                setTemplateToInsertId(e.target.value);
                handleInsertSavedTemplateBlock(undefined, e.target.value);
              }}
              aria-label="Termék hozzáadása az ajánlathoz"
              className="min-w-0 flex-1 sm:flex-none sm:max-w-[20rem] px-2.5 py-1.5 rounded-lg border border-slate-300 bg-white text-[13px] font-medium"
            >
              <option value="">+ Termék hozzáadása…</option>
              {templates.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      {/* Main Split Layout: Left = Editable Blocks, Right = Live PDF Viewer */}
      <div className="grid grid-cols-1 xl:grid-cols-[12rem_minmax(0,1.15fr)_minmax(0,1fr)] gap-5 items-start">
        {/* Szerkezet (csak széles képernyőn) */}
        <div className="hidden xl:block xl:sticky xl:top-4">{renderOutline()}</div>
        {/* LEFT COLUMN: Editable Document Blocks */}
        <div
          className="min-w-0 space-y-4"
          // a kártyák közötti rés is érvényes ejtési hely (különben a húzás „elveszne”)
          onDragOver={(e) => {
            if (dragFrom !== null) e.preventDefault();
          }}
          onDrop={(e) => e.preventDefault()}
        >
          {blocks.length > 1 && (
            <div className="flex justify-end gap-3 text-[13px] text-slate-500 -mb-2">
              <button
                type="button"
                className="hover:text-slate-950"
                onClick={() => setOpenBlocks({})}
              >
                Összecsuk mind
              </button>
              <button
                type="button"
                className="hover:text-slate-950"
                onClick={() => setOpenBlocks(Object.fromEntries(blocks.map((b) => [b.id, true])))}
              >
                Kinyit mind
              </button>
            </div>
          )}
          {blocks.map((blk, bIdx) => (
            <React.Fragment key={blk.id}>
            {renderInsertBar(bIdx)}
            <div
              id={`blk-${blk.id}`}
              onDragOver={(e) => {
                if (dragFrom === null) return;
                e.preventDefault();
                const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
                setDropAt(e.clientY < rect.top + rect.height / 2 ? bIdx : bIdx + 1);
              }}
              onDrop={(e) => e.preventDefault()}
              className={`relative bg-white rounded-2xl border overflow-hidden transition ${
                dragFrom === bIdx ? 'opacity-40 border-slate-300' : 'border-slate-200'
              }`}
            >
              {dragFrom !== null && dropAt === bIdx && (
                <div className="absolute inset-x-0 top-0 h-1 bg-slate-900 z-10" />
              )}
              {dragFrom !== null && dropAt === bIdx + 1 && bIdx === blocks.length - 1 && (
                <div className="absolute inset-x-0 bottom-0 h-1 bg-slate-900 z-10" />
              )}
              {/* Block Top Bar */}
              <div className="px-2 sm:px-3 py-2 border-b border-slate-200 flex items-center gap-1.5">
                <button
                  type="button"
                  // A fogantyú maga húzható (így már az első húzás működik), a húzott kép a teljes kártya
                  draggable
                  onDragStart={(e) => {
                    setDragFrom(bIdx);
                    setDropAt(null);
                    e.dataTransfer.effectAllowed = 'move';
                    e.dataTransfer.setData('text/plain', blk.id);
                    const card = document.getElementById(`blk-${blk.id}`);
                    if (card) e.dataTransfer.setDragImage(card, 24, 20);
                  }}
                  onDragEnd={(e) => {
                    // Az utolsó jelzett helyre kerül, akkor is, ha két kártya közötti résen engedted el;
                    // Esc vagy a listán kívüli elengedés (dropEffect = none) nem mozgat
                    if (dragFrom !== null && dropAt !== null && e.dataTransfer.dropEffect !== 'none') {
                      moveBlockTo(dragFrom, dropAt);
                    }
                    setDragFrom(null);
                    setDropAt(null);
                  }}
                  className="p-1.5 rounded-lg text-slate-400 hover:text-slate-900 hover:bg-slate-100 cursor-grab active:cursor-grabbing"
                  title="Húzd az áthelyezéshez"
                  aria-label="Áthelyezés húzással"
                >
                  <GripVertical className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={() => setOpenBlocks((prev) => ({ ...prev, [blk.id]: !prev[blk.id] }))}
                  className="min-w-0 flex-1 flex items-center gap-2 text-left"
                  aria-expanded={Boolean(openBlocks[blk.id])}
                >
                  <ChevronRight
                    className={`w-4 h-4 text-slate-400 shrink-0 transition-transform ${
                      openBlocks[blk.id] ? 'rotate-90' : ''
                    }`}
                  />
                  <span className="text-[13px] font-medium text-slate-600 shrink-0">{blockLabel(blk)}</span>
                  {!openBlocks[blk.id] && blockSummary(blk) && (
                    <span className="min-w-0 truncate text-[13px] text-slate-950">{blockSummary(blk)}</span>
                  )}
                </button>

                <div className="flex items-center gap-0.5 shrink-0">
                  <button
                    type="button"
                    onClick={() => moveBlock(bIdx, -1)}
                    disabled={bIdx === 0}
                    title="Mozgatás fel"
                    className="p-1.5 rounded-lg text-slate-400 hover:text-slate-900 hover:bg-slate-100 disabled:opacity-30"
                  >
                    <ArrowUp className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => moveBlock(bIdx, 1)}
                    disabled={bIdx === blocks.length - 1}
                    title="Mozgatás le"
                    className="p-1.5 rounded-lg text-slate-400 hover:text-slate-900 hover:bg-slate-100 disabled:opacity-30"
                  >
                    <ArrowDown className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => removeBlock(blk.id)}
                    title="Blokk törlése a PDF-ből"
                    className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {openBlocks[blk.id] && (<>
              {/* BLOCK TYPE 1: STANDALONE TEXT BOX */}
              {blk.type === 'text_box' && (
                <div className="p-4 space-y-3">
                  <div className="flex flex-col sm:flex-row gap-3">
                    <div className="flex-1">
                      <label className="block text-xs font-bold text-slate-600 mb-1">
                        Cím
                      </label>
                      <input
                        type="text"
                        value={blk.title || ''}
                        onChange={(e) =>
                          updateBlock(blk.id, (b) => ({
                            ...b,
                            title: e.target.value,
                          }))
                        }
                        placeholder="pl. Kedves Kovács János! vagy Fontos információk"
                        className="w-full px-3.5 py-2 rounded-xl border border-slate-300 text-sm font-bold"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-600 mb-1">
                        Stílus
                      </label>
                      <select
                        value={blk.textStyle || 'normal'}
                        onChange={(e) =>
                          updateBlock(blk.id, (b) => ({
                            ...b,
                            textStyle: e.target.value as any,
                          }))
                        }
                        className="px-3 py-2 rounded-xl border border-slate-300 text-xs font-semibold"
                      >
                        <option value="greeting">Megszólítás / Bevezető</option>
                        <option value="normal">Normál szövegrész</option>
                        <option value="highlight">Kiemelt keretes szövegdoboz</option>
                        <option value="footer_info">Záró információs doboz</option>
                      </select>
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-600 mb-1">
                      Szöveg
                    </label>
                    <textarea
                      rows={4}
                      value={blk.content || ''}
                      onChange={(e) =>
                        updateBlock(blk.id, (b) => ({
                          ...b,
                          content: e.target.value,
                        }))
                      }
                      placeholder="Írj ide bármilyen szöveget..."
                      className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-sm leading-relaxed"
                    />
                  </div>
                </div>
              )}

              {/* BLOCK TYPE 2: STANDALONE PHOTO + CAPTION BOX */}
              {blk.type === 'photo_box' && blk.photo && (
                <div className="p-4 flex flex-col md:flex-row gap-4">
                  <div className="w-full md:w-52 shrink-0 space-y-2">
                    {blk.photo.imageUrl ? (
                      <img
                        src={thumbUrl(blk.photo.imageUrl)}
                        loading="lazy"
                        decoding="async"
                        alt=""
                        className="w-full h-36 object-cover rounded-xl border border-slate-200"
                      />
                    ) : (
                      <div className="w-full h-36 rounded-xl border-2 border-dashed border-slate-300 flex items-center justify-center text-xs text-slate-400">
                        Nincs kép kiválasztva
                      </div>
                    )}
                    <label className="w-full inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold cursor-pointer">
                      <Upload className="w-3.5 h-3.5" />
                      {uploadingImg ? 'Feltöltés...' : 'Fotó feltöltése / cseréje'}
                      <input
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={async (e) => {
                          const file = e.target.files?.[0];
                          if (!file) return;
                          setUploadingImg(true);
                          try {
                            const url = await onUploadImage(file);
                            if (url) {
                              updateBlock(blk.id, (b) => ({
                                ...b,
                                photo: { ...b.photo!, imageUrl: url },
                              }));
                            }
                          } finally {
                            setUploadingImg(false);
                            e.target.value = '';
                          }
                        }}
                      />
                    </label>
                  </div>

                  <div className="flex-1 space-y-3">
                    <div>
                      <label className="block text-xs font-bold text-slate-600 mb-1">
                        Fotó feletti cím
                      </label>
                      <input
                        type="text"
                        value={blk.photo.titleAbove || ''}
                        onChange={(e) =>
                          updateBlock(blk.id, (b) => ({
                            ...b,
                            photo: { ...b.photo!, titleAbove: e.target.value },
                          }))
                        }
                        placeholder="Fotó feletti cím (opcionális)"
                        className="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs font-bold"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-600 mb-1">
                        Képaláírás
                      </label>
                      <textarea
                        rows={3}
                        value={blk.photo.captionBelow || ''}
                        onChange={(e) =>
                          updateBlock(blk.id, (b) => ({
                            ...b,
                            photo: {
                              ...b.photo!,
                              captionBelow: e.target.value,
                            },
                          }))
                        }
                        placeholder="Írd ide a fotó alatt megjelenő szöveget..."
                        className="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs"
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* BLOCK TYPE 3: TEMPLATE & PRODUCT SECTION */}
              {blk.type === 'template_section' && (
                <div className="p-4 sm:p-5 space-y-5">
                  {onSaveTemplate && blk.templateId && templates.some((t) => t.id === blk.templateId) && (
                    <div className="flex flex-wrap items-center gap-2 rounded-xl bg-indigo-50 border border-indigo-100 px-3 py-2">
                      <span className="text-xs text-indigo-950 flex-1 min-w-[12rem]">
                        Ha itt módosítasz (szöveg, fotó, tétel, ár), elmentheted a termék sablonjába is: a következő ajánlatok már így indulnak.
                      </span>
                      <button type="button" disabled={savingTplFor === blk.id} onClick={() => saveSectionToTemplate(blk)} className={btn.primary}>
                        <Save className="w-4 h-4" />
                        {savingTplFor === blk.id ? 'Mentés…' : 'Mentés a sablonba'}
                      </button>
                    </div>
                  )}
                  {/* Section Title & Subtitle text boxes */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className={labelCls}>
                        Cím
                      </label>
                      <AutoTextarea
                        value={blk.sectionTitle || ''}
                        onChange={(e) =>
                          updateBlock(blk.id, (b) => ({
                            ...b,
                            sectionTitle: e.target.value,
                          }))
                        }
                        className="w-full px-3.5 py-2 rounded-xl border border-slate-300 text-sm font-bold"
                      />
                    </div>
                    <div>
                      <label className={labelCls}>
                        Alcím
                      </label>
                      <AutoTextarea
                        value={blk.sectionSubtitle || ''}
                        onChange={(e) =>
                          updateBlock(blk.id, (b) => ({
                            ...b,
                            sectionSubtitle: e.target.value,
                          }))
                        }
                        className="w-full px-3.5 py-2 rounded-xl border border-slate-300 text-sm"
                      />
                    </div>
                  </div>

                  {/* Intro Text Box */}
                  <div>
                    <label className={labelCls}>
                      Bevezető szöveg
                    </label>
                    <textarea
                      rows={3}
                      value={blk.sectionIntroText || ''}
                      onChange={(e) =>
                        updateBlock(blk.id, (b) => ({
                          ...b,
                          sectionIntroText: e.target.value,
                        }))
                      }
                      placeholder="Írd ide a sablonhoz tartozó leíró szöveget..."
                      className="w-full px-3.5 py-2 rounded-xl border border-slate-300 text-xs leading-relaxed"
                    />

                  </div>

                  {/* Section Photos + Text Boxes under each photo */}
                  <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-3">
                    <div className="flex items-center justify-between flex-wrap gap-2">
                      <span className="text-xs font-bold text-slate-800">
                        Fotók (
                        {blk.sectionPhotos?.length || 0} db)
                      </span>
                      <label className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold cursor-pointer">
                        <Upload className="w-3.5 h-3.5" />
                        + Fotó felcsatolása a sablonhoz
                        <input
                          type="file"
                          accept="image/*"
                          className="hidden"
                          onChange={async (e) => {
                            const file = e.target.files?.[0];
                            if (!file) return;
                            setUploadingImg(true);
                            try {
                              const url = await onUploadImage(file);
                              if (url) {
                                updateBlock(blk.id, (b) => ({
                                  ...b,
                                  sectionPhotos: [
                                    ...(b.sectionPhotos || []),
                                    {
                                      id: `sp_${Date.now()}`,
                                      imageUrl: url,
                                      titleAbove: '',
                                      captionBelow: '',
                                      widthPct: 75,
                                      align: 'center',
                                    },
                                  ],
                                }));
                              }
                            } finally {
                              setUploadingImg(false);
                              e.target.value = '';
                            }
                          }}
                        />
                      </label>
                    </div>

                    {(blk.sectionPhotos || []).map((ph, pIdx) => (
                      <div
                        key={ph.id}
                        className="bg-white p-3 rounded-xl border border-slate-200 flex flex-col sm:flex-row gap-3"
                      >
                        <div className="w-full sm:w-36 shrink-0 space-y-1.5">
                          {ph.imageUrl && (
                            <img
                              src={thumbUrl(ph.imageUrl)}
                              loading="lazy"
                              decoding="async"
                              alt=""
                              className="w-full h-24 object-cover rounded-lg border border-slate-200"
                            />
                          )}
                          <label className="block text-center px-2 py-1 rounded bg-slate-100 hover:bg-slate-200 text-xs font-semibold text-slate-700 cursor-pointer">
                            Kép cseréje
                            <input
                              type="file"
                              accept="image/*"
                              className="hidden"
                              onChange={async (e) => {
                                const file = e.target.files?.[0];
                                if (!file) return;
                                const url = await onUploadImage(file);
                                if (url) {
                                  updateBlock(blk.id, (b) => {
                                    const next = [...(b.sectionPhotos || [])];
                                    next[pIdx] = {
                                      ...next[pIdx],
                                      imageUrl: url,
                                    };
                                    return { ...b, sectionPhotos: next };
                                  });
                                }
                              }}
                            />
                          </label>
                        </div>

                        <div className="flex-1 space-y-2">
                          <input
                            type="text"
                            value={ph.titleAbove || ''}
                            onChange={(e) =>
                              updateBlock(blk.id, (b) => {
                                const next = [...(b.sectionPhotos || [])];
                                next[pIdx] = {
                                  ...next[pIdx],
                                  titleAbove: e.target.value,
                                };
                                return { ...b, sectionPhotos: next };
                              })
                            }
                            placeholder="Fotó feletti cím (opcionális)"
                            className="w-full px-3 py-1.5 rounded-lg border border-slate-300 text-xs font-semibold"
                          />
                          <textarea
                            rows={2}
                            value={ph.captionBelow || ''}
                            onChange={(e) =>
                              updateBlock(blk.id, (b) => {
                                const next = [...(b.sectionPhotos || [])];
                                next[pIdx] = {
                                  ...next[pIdx],
                                  captionBelow: e.target.value,
                                };
                                return { ...b, sectionPhotos: next };
                              })
                            }
                            placeholder="Szövegdoboz a fotó alatt: írd ide a képaláírást vagy műszaki leírást..."
                            className="w-full px-3 py-1.5 rounded-lg border border-slate-300 text-xs"
                          />
                        </div>

                        <button
                          type="button"
                          onClick={() =>
                            updateBlock(blk.id, (b) => ({
                              ...b,
                              sectionPhotos: (b.sectionPhotos || []).filter(
                                (_, i) => i !== pIdx
                              ),
                            }))
                          }
                          className="p-1.5 text-rose-500 hover:bg-rose-50 rounded-lg self-start"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    ))}
                  </div>

                  {/* Products / Materials Table & Product Photo Attachments */}
                  <div className="space-y-3">
                    <div className="flex items-center justify-between flex-wrap gap-2">
                      <input
                        type="text"
                        value={blk.tableTitle || ''}
                        onChange={(e) =>
                          updateBlock(blk.id, (b) => ({
                            ...b,
                            tableTitle: e.target.value,
                          }))
                        }
                        placeholder="Táblázat címe..."
                        className="flex-1 px-3 py-1.5 rounded-lg border border-slate-300 text-xs font-bold"
                      />
                      <button
                        type="button"
                        onClick={() =>
                          updateBlock(blk.id, (b) => {
                            const newAlg = createDefaultMaterialAlgorithm({
                              name: 'Új Termék / Anyag tétel',
                              description: 'Egyedi méretre gyártott kivitel',
                              pricingMode: 'per_m2',
                              unitPrice: 350,
                            });
                            const newRow: QuoteTableRow = {
                              id: `row_${Date.now()}_${Math.random()
                                .toString(36)
                                .slice(2, 5)}`,
                              materialId: newAlg.id,
                              name: newAlg.name,
                              description: newAlg.description,
                              quantityLabel: '',
                              listPriceEur: 0,
                              discountPriceEur: 0,
                              currency: 'EUR',
                              itemRole: 'base',
                              included: true,
                              note: '',
                              photos: [],
                              ...(b.isManualSection
                                ? {
                                    priceOverridden: true,
                                    quantityOverridden: true,
                                    quantityLabel: '1 db',
                                  }
                                : { algorithm: newAlg }),
                            };
                            const updated = {
                              ...b,
                              rows: [...(b.rows || []), newRow],
                            };
                            return recalculateBlockWithAlgorithms(
                              updated,
                              calcCtx,
                              templates
                            );
                          })
                        }
                        className={btn.ghost}
                      >
                        <Plus className="w-4 h-4" />
                        Tétel
                      </button>
                    </div>

                    {/* Editable Product Rows (Strictly Algorithm-Calculated Prices) */}
                    <div className="space-y-2.5">
                      {(blk.rows || []).map((row, rIdx) => {
                        const rowAlg: TemplateMaterialItem =
                          row.algorithm ||
                          createDefaultMaterialAlgorithm({
                            id: row.materialId || row.id,
                            name: row.name,
                            description: row.description || '',
                            pricingMode: 'per_m2',
                            unitPrice: 350,
                          });
                        const hasOtherNonPctBase = (blk.rows || []).some(
                          (other, oIdx) =>
                            oIdx !== rIdx &&
                            other.included &&
                            other.itemRole === 'base' &&
                            (other.algorithm?.pricingMode || 'per_m2') !==
                              'percentage'
                        );

                        const updateRowAlgorithm = (
                          algPatch: Partial<TemplateMaterialItem>
                        ) => {
                          updateBlock(blk.id, (b) => {
                            const nextRows = [...(b.rows || [])];
                            const currentAlg =
                              nextRows[rIdx].algorithm || rowAlg;
                            nextRows[rIdx] = {
                              ...nextRows[rIdx],
                              algorithm: {
                                ...currentAlg,
                                ...algPatch,
                              },
                            };
                            return recalculateBlockWithAlgorithms(
                              { ...b, rows: nextRows },
                              calcCtx,
                              templates
                            );
                          });
                        };

                        const isRowExpanded = expandedRowIds.includes(row.id);
                        // Kézi ár: megjelöljük, hogy újraszámoláskor megmaradjon
                        const setRowPrices = (
                          patch: Partial<
                            Pick<QuoteTableRow, 'listPriceEur' | 'discountPriceEur'>
                          >
                        ) => {
                          updateBlock(blk.id, (b) => {
                            const nextRows = [...(b.rows || [])];
                            nextRows[rIdx] = {
                              ...nextRows[rIdx],
                              ...patch,
                              priceOverridden: true,
                            };
                            return recalculateBlockTotals(
                              { ...b, rows: nextRows },
                              eurHufRate
                            );
                          });
                        };

                        return (
                          <div
                            key={row.id}
                            className={`p-3.5 rounded-xl border transition space-y-2.5 ${
                              row.included
                                ? 'bg-white border-slate-200 shadow-xs'
                                : 'bg-slate-50 border-slate-200 opacity-60'
                            }`}
                          >
                            {/* Top Row: Checkbox + Name + Read-Only Algorithm Calculated Badges */}
                            <div className="flex flex-wrap items-center gap-2">
                              <div className="flex items-center gap-2 basis-full">
                                <input
                                  type="checkbox"
                                  checked={row.included}
                                  onChange={(e) =>
                                    updateBlock(blk.id, (b) => {
                                      const nextRows = [...(b.rows || [])];
                                      nextRows[rIdx] = {
                                        ...nextRows[rIdx],
                                        included: e.target.checked,
                                      };
                                      return recalculateBlockWithAlgorithms(
                                        { ...b, rows: nextRows },
                                        calcCtx,
                                        templates
                                      );
                                    })
                                  }
                                  className="rounded text-emerald-600"
                                />
                                <input
                                  type="text"
                                  value={row.name}
                                  onChange={(e) =>
                                    updateBlock(blk.id, (b) => {
                                      const nextRows = [...(b.rows || [])];
                                      nextRows[rIdx] = {
                                        ...nextRows[rIdx],
                                        name: e.target.value,
                                      };
                                      return { ...b, rows: nextRows };
                                    })
                                  }
                                  placeholder="Tétel neve"
                                  className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 font-medium"
                                />
                              </div>

                              {/* Quantity / prices: algorithm-calculated, but every value can be overridden by hand */}
                              <input
                                type="text"
                                value={row.quantityLabel}
                                onChange={(e) =>
                                  updateBlock(blk.id, (b) => {
                                    const nextRows = [...(b.rows || [])];
                                    nextRows[rIdx] = {
                                      ...nextRows[rIdx],
                                      quantityLabel: e.target.value,
                                      quantityOverridden: true,
                                    };
                                    return { ...b, rows: nextRows };
                                  })
                                }
                                title="Mennyiség / méret (kézzel átírható)"
                                className={`ml-6 w-28 px-2.5 py-1.5 rounded-lg border text-center ${
                                  row.quantityOverridden
                                    ? 'bg-amber-50 border-amber-300 text-amber-900'
                                    : 'bg-slate-50 border-slate-200 text-slate-700'
                                }`}
                              />

                              <div className="w-32 relative">
                                <input
                                  type="number"
                                  value={row.listPriceEur}
                                  onChange={(e) =>
                                    setRowPrices({
                                      listPriceEur: Math.max(
                                        0,
                                        Number(e.target.value) || 0
                                      ),
                                    })
                                  }
                                  title="Listaár (EUR) - kézzel átírható"
                                  className={`w-full pl-2.5 pr-9 py-1.5 rounded-lg border text-right line-through tabular-nums ${
                                    row.priceOverridden
                                      ? 'bg-amber-50 border-amber-300 text-amber-900'
                                      : 'bg-slate-50 border-slate-200 text-slate-500'
                                  }`}
                                />
                                <span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-400">
                                  EUR
                                </span>
                              </div>

                              <div className="w-36 relative">
                                <input
                                  type="number"
                                  value={row.itemRole === 'gift' ? 0 : row.discountPriceEur}
                                  disabled={row.itemRole === 'gift'}
                                  onChange={(e) =>
                                    setRowPrices({
                                      discountPriceEur: Math.max(
                                        0,
                                        Number(e.target.value) || 0
                                      ),
                                    })
                                  }
                                  title="Kedvezményes ár (EUR) - kézzel átírható"
                                  className={`w-full pl-2.5 pr-9 py-1.5 rounded-lg border font-semibold text-right tabular-nums ${
                                    row.priceOverridden
                                      ? 'bg-amber-100 border-amber-400 text-amber-950'
                                      : 'bg-white border-slate-300 text-slate-950'
                                  }`}
                                />
                                <span
                                  className={`absolute right-2 top-1/2 -translate-y-1/2 text-xs font-bold ${
                                    row.priceOverridden ? 'text-amber-700' : 'text-slate-400'
                                  }`}
                                >
                                  EUR
                                </span>
                              </div>

                              <div className="flex items-center ml-auto">
                                {!row.systemRole && (
                                  <button
                                    type="button"
                                    onClick={() =>
                                      setExpandedRowIds((prev) =>
                                        prev.includes(row.id)
                                          ? prev.filter((id) => id !== row.id)
                                          : [...prev, row.id]
                                      )
                                    }
                                    title="Részletek: képlet, leírás, fotó"
                                    className={`p-1.5 rounded-lg hover:bg-slate-100 ${
                                      isRowExpanded ? 'text-slate-950' : 'text-slate-400'
                                    }`}
                                  >
                                    <SlidersHorizontal className="w-3.5 h-3.5" />
                                  </button>
                                )}
                                {(row.priceOverridden || row.quantityOverridden) &&
                                  !blk.isManualSection && (
                                    <button
                                      type="button"
                                      onClick={() =>
                                        updateBlock(blk.id, (b) => {
                                          const nextRows = [...(b.rows || [])];
                                          nextRows[rIdx] = {
                                            ...nextRows[rIdx],
                                            priceOverridden: false,
                                            quantityOverridden: false,
                                          };
                                          return recalculateBlockWithAlgorithms(
                                            { ...b, rows: nextRows },
                                            calcCtx,
                                            templates
                                          );
                                        })
                                      }
                                      title="Vissza az algoritmus által számolt árra"
                                      className="p-1.5 text-amber-600 hover:bg-amber-50 rounded-lg"
                                    >
                                      <RotateCcw className="w-3.5 h-3.5" />
                                    </button>
                                  )}
                                {(blk.rows || []).length > 1 && !row.systemRole && (
                                  <button
                                    type="button"
                                    onClick={() =>
                                      updateBlock(blk.id, (b) => {
                                        const nextRows = (b.rows || []).filter(
                                          (_, i) => i !== rIdx
                                        );
                                        return recalculateBlockWithAlgorithms(
                                          { ...b, rows: nextRows },
                                          calcCtx,
                                          templates
                                        );
                                      })
                                    }
                                    className="p-1.5 text-rose-500 hover:bg-rose-50 rounded-lg"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </button>
                                )}
                              </div>
                            </div>

                            {/* Algorithm Configuration Bar for this Product Row */}
                            {isRowExpanded && !row.systemRole && !blk.isManualSection && (
                            <div className="ml-6 p-2.5 rounded-xl bg-slate-50 border border-slate-200 space-y-2">
                              <div className="text-xs text-slate-600">
                                {row.formulaSummary || 'Árképlet'}
                                {row.priceOverridden &&
                                  ' · kézi ár van beállítva, a képlet nem írja felül'}
                              </div>

                              <div className="grid grid-cols-1 sm:grid-cols-4 gap-2 items-end">
                                <div>
                                  <label className={labelCls}>
                                    Árazás módja
                                  </label>
                                  <select
                                    value={rowAlg.pricingMode}
                                    onChange={(e) => {
                                      const nextMode = e.target
                                        .value as ProductPricingMode;
                                      if (
                                        nextMode === 'percentage' &&
                                        !hasOtherNonPctBase
                                      ) {
                                        return;
                                      }
                                      updateRowAlgorithm({
                                        pricingMode: nextMode,
                                        basePrice: Math.max(
                                          1,
                                          Number(rowAlg.basePrice) || 1500
                                        ),
                                        unitPrice: Math.max(
                                          1,
                                          Number(rowAlg.unitPrice) || 350
                                        ),
                                      });
                                    }}
                                    className="w-full px-2 py-1.5 rounded-lg border border-slate-300 bg-white text-xs font-bold"
                                  >
                                    {PRICING_MODE_OPTIONS.map((pm) => {
                                      const disabled =
                                        pm.id === 'percentage' &&
                                        !hasOtherNonPctBase;
                                      return (
                                        <option
                                          key={pm.id}
                                          value={pm.id}
                                          disabled={disabled}
                                        >
                                          {pm.shortLabel}
                                          {disabled
                                            ? ' (csak 2. tételként)'
                                            : ''}
                                        </option>
                                      );
                                    })}
                                  </select>
                                </div>

                                {[
                                  'per_m2',
                                  'tiered_m2',
                                  'base_plus_m2',
                                  'per_lm',
                                  'base_plus_lm',
                                ].includes(rowAlg.pricingMode) && (
                                  <div>
                                    <label className={labelCls}>
                                      Méretforrás
                                    </label>
                                    <select
                                      value={rowAlg.dimensionSource || 'roof'}
                                      onChange={(e) =>
                                        updateRowAlgorithm({
                                          dimensionSource: e.target
                                            .value as DimensionSource,
                                        })
                                      }
                                      className="w-full px-2 py-1.5 rounded-lg border border-slate-300 bg-white text-xs"
                                    >
                                      {DIMENSION_SOURCE_OPTIONS.map((ds) => (
                                        <option key={ds.id} value={ds.id}>
                                          {ds.label}
                                        </option>
                                      ))}
                                    </select>
                                  </div>
                                )}

                                {(rowAlg.pricingMode === 'per_m2' ||
                                  rowAlg.pricingMode === 'per_lm') && (
                                  <div>
                                    <label className={labelCls}>
                                      {rowAlg.pricingMode === 'per_m2'
                                        ? 'Egységár (EUR / m²)'
                                        : 'Egységár (EUR / fm)'}
                                    </label>
                                    <input
                                      type="number"
                                      min={1}
                                      value={rowAlg.unitPrice}
                                      onChange={(e) =>
                                        updateRowAlgorithm({
                                          unitPrice: Math.max(
                                            1,
                                            Number(e.target.value) || 1
                                          ),
                                        })
                                      }
                                      className="w-full px-2 py-1.5 rounded-lg border border-slate-300 bg-white text-xs font-bold"
                                    />
                                  </div>
                                )}

                                {rowAlg.pricingMode === 'fixed' && (
                                  <div>
                                    <label className={labelCls}>
                                      Fix Egységár (EUR / db)
                                    </label>
                                    <input
                                      type="number"
                                      min={1}
                                      value={rowAlg.basePrice}
                                      onChange={(e) =>
                                        updateRowAlgorithm({
                                          basePrice: Math.max(
                                            1,
                                            Number(e.target.value) || 1
                                          ),
                                        })
                                      }
                                      className="w-full px-2 py-1.5 rounded-lg border border-slate-300 bg-white text-xs font-bold"
                                    />
                                  </div>
                                )}

                                {(rowAlg.pricingMode === 'base_plus_m2' ||
                                  rowAlg.pricingMode === 'base_plus_lm') && (
                                  <>
                                    <div>
                                      <label className={labelCls}>
                                        Alapár (EUR)
                                      </label>
                                      <input
                                        type="number"
                                        min={1}
                                        value={rowAlg.basePrice}
                                        onChange={(e) =>
                                          updateRowAlgorithm({
                                            basePrice: Math.max(
                                              1,
                                              Number(e.target.value) || 1
                                            ),
                                          })
                                        }
                                        className="w-full px-2 py-1.5 rounded-lg border border-slate-300 bg-white text-xs font-bold"
                                      />
                                    </div>
                                    <div>
                                      <label className={labelCls}>
                                        + Egységár (EUR/{rowAlg.pricingMode === 'base_plus_m2' ? 'm²' : 'fm'})
                                      </label>
                                      <input
                                        type="number"
                                        min={1}
                                        value={rowAlg.unitPrice}
                                        onChange={(e) =>
                                          updateRowAlgorithm({
                                            unitPrice: Math.max(
                                              1,
                                              Number(e.target.value) || 1
                                            ),
                                          })
                                        }
                                        className="w-full px-2 py-1.5 rounded-lg border border-slate-300 bg-white text-xs font-bold"
                                      />
                                    </div>
                                  </>
                                )}

                                {rowAlg.pricingMode === 'percentage' && (
                                  <div>
                                    <label className={labelCls}>
                                      Százalékos kulcs (%)
                                    </label>
                                    <input
                                      type="number"
                                      min={1}
                                      value={rowAlg.percentageRate}
                                      onChange={(e) =>
                                        updateRowAlgorithm({
                                          percentageRate: Math.max(
                                            1,
                                            Number(e.target.value) || 1
                                          ),
                                        })
                                      }
                                      className="w-full px-2 py-1.5 rounded-lg border border-slate-300 bg-white text-xs font-bold"
                                    />
                                  </div>
                                )}

                                {rowAlg.pricingMode !== 'percentage' &&
                                  rowAlg.pricingMode !== 'base_plus_m2' &&
                                  rowAlg.pricingMode !== 'base_plus_lm' && (
                                    <div>
                                      <label className={labelCls}>
                                        Darabszám szorzó (db)
                                      </label>
                                      <input
                                        type="number"
                                        min={1}
                                        value={rowAlg.defaultQuantity || 1}
                                        onChange={(e) =>
                                          updateRowAlgorithm({
                                            defaultQuantity: Math.max(
                                              1,
                                              Number(e.target.value) || 1
                                            ),
                                          })
                                        }
                                        className="w-full px-2 py-1.5 rounded-lg border border-slate-300 bg-white text-xs"
                                      />
                                    </div>
                                  )}
                              </div>
                            </div>
                            )}

                            {isRowExpanded && (
                            <>
                            {/* Row extra controls: Description, Role, Note, and Attach Photo to Product */}
                            <div className="flex flex-wrap items-center gap-2 pl-6">
                              <input
                                type="text"
                                value={row.description || ''}
                                onChange={(e) =>
                                  updateBlock(blk.id, (b) => {
                                    const nextRows = [...(b.rows || [])];
                                    nextRows[rIdx] = {
                                      ...nextRows[rIdx],
                                      description: e.target.value,
                                    };
                                    return { ...b, rows: nextRows };
                                  })
                                }
                                placeholder="Kiegészítő termék-szövegdoboz / műszaki leírás..."
                                className="flex-1 min-w-[180px] px-2.5 py-1 rounded-lg border border-slate-200 text-xs"
                              />

                              <select
                                value={row.itemRole}
                                onChange={(e) =>
                                  updateBlock(blk.id, (b) => {
                                    const nextRows = [...(b.rows || [])];
                                    nextRows[rIdx] = {
                                      ...nextRows[rIdx],
                                      itemRole: e.target.value as any,
                                    };
                                    return recalculateBlockWithAlgorithms(
                                      { ...b, rows: nextRows },
                                      calcCtx,
                                      templates
                                    );
                                  })
                                }
                                className="px-2 py-1 rounded-lg border border-slate-200 text-xs font-semibold"
                              >
                                <option value="base">Alaptétel</option>
                                <option value="optional">Opció</option>
                                <option value="gift">Ajándék</option>
                              </select>

                              <input
                                type="text"
                                value={row.note}
                                onChange={(e) =>
                                  updateBlock(blk.id, (b) => {
                                    const nextRows = [...(b.rows || [])];
                                    nextRows[rIdx] = {
                                      ...nextRows[rIdx],
                                      note: e.target.value,
                                    };
                                    return { ...b, rows: nextRows };
                                  })
                                }
                                placeholder="Opcionális felirat (pl. Ajándék)"
                                className="w-40 px-2 py-1 rounded-lg border border-slate-200 text-xs"
                              />

                              <label className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold cursor-pointer">
                                <ImageIcon className="w-3 h-3 text-emerald-600" />
                                Fotó
                                <input
                                  type="file"
                                  accept="image/*"
                                  className="hidden"
                                  onChange={async (e) => {
                                    const file = e.target.files?.[0];
                                    if (!file) return;
                                    const url = await onUploadImage(file);
                                    if (url) {
                                      updateBlock(blk.id, (b) => {
                                        const nextRows = [...(b.rows || [])];
                                        const existingPhotos =
                                          nextRows[rIdx].photos || [];
                                        nextRows[rIdx] = {
                                          ...nextRows[rIdx],
                                          photos: [
                                            ...existingPhotos,
                                            {
                                              id: `rp_${Date.now()}`,
                                              imageUrl: url,
                                              titleAbove: nextRows[rIdx].name,
                                              captionBelow: '',
                                              widthPct: 68,
                                              align: 'center',
                                            },
                                          ],
                                        };
                                        return { ...b, rows: nextRows };
                                      });
                                    }
                                  }}
                                />
                              </label>
                            </div>
                            </>
                            )}

                            {/* Product-level attached photos + caption text boxes */}
                            {row.photos && row.photos.length > 0 && (
                              <div className="pl-6 pt-1 space-y-2">
                                {row.photos.map((rp, rpIdx) => (
                                  <div
                                    key={rp.id}
                                    className="p-2.5 rounded-xl bg-emerald-50/50 border border-emerald-200 flex items-start gap-3"
                                  >
                                    <img
                                      src={thumbUrl(rp.imageUrl)}
                                      loading="lazy"
                                      decoding="async"
                                      alt=""
                                      className="w-20 h-16 object-cover rounded-lg border border-slate-200 shrink-0"
                                    />
                                    <div className="flex-1 space-y-1">
                                      <div className="text-xs font-bold text-emerald-950">
                                        Termékfotó alatti szövegdoboz ({row.name}):
                                      </div>
                                      <textarea
                                        rows={2}
                                        value={rp.captionBelow}
                                        onChange={(e) =>
                                          updateBlock(blk.id, (b) => {
                                            const nextRows = [
                                              ...(b.rows || []),
                                            ];
                                            const nextPhotos = [
                                              ...(nextRows[rIdx].photos || []),
                                            ];
                                            nextPhotos[rpIdx] = {
                                              ...nextPhotos[rpIdx],
                                              captionBelow: e.target.value,
                                            };
                                            nextRows[rIdx] = {
                                              ...nextRows[rIdx],
                                              photos: nextPhotos,
                                            };
                                            return { ...b, rows: nextRows };
                                          })
                                        }
                                        placeholder="Írj szöveget a termékhez csatolt fotó alá..."
                                        className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 bg-white text-xs"
                                      />
                                    </div>
                                    <button
                                      type="button"
                                      onClick={() =>
                                        updateBlock(blk.id, (b) => {
                                          const nextRows = [...(b.rows || [])];
                                          nextRows[rIdx] = {
                                            ...nextRows[rIdx],
                                            photos: (
                                              nextRows[rIdx].photos || []
                                            ).filter((_, i) => i !== rpIdx),
                                          };
                                          return { ...b, rows: nextRows };
                                        })
                                      }
                                      className="p-1 text-rose-500 hover:bg-rose-100 rounded"
                                    >
                                      <Trash2 className="w-3.5 h-3.5" />
                                    </button>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>

                    {/* Price adjustments with reason + visibility toggle */}
                    <AdjustmentsEditor
                      adjustments={blk.adjustments || []}
                      onChange={(next) =>
                        updateBlock(blk.id, (b) =>
                          recalculateBlockTotals({ ...b, adjustments: next }, eurHufRate)
                        )
                      }
                    />

                    {/* Section total: internal breakdown (never in the PDF) + optional manual total */}
                    <div className="rounded-xl bg-slate-50 border border-slate-200 px-4 py-3 space-y-2">
                      <PriceSummaryLine
                        breakdown={computeBlockBreakdown(blk, eurHufRate)}
                        eurHufRate={eurHufRate}
                        manualTotal={
                          (blk.manualTotalEur ?? null) !== null || (blk.manualTotalHuf ?? null) !== null
                        }
                      />
                      <div className="flex items-center justify-end gap-2 text-[13px] text-slate-600">
                        Végösszeg kézzel
                        {(() => {
                          const cur = blk.manualTotalCurrency || 'EUR';
                          const value = cur === 'HUF' ? blk.manualTotalHuf : blk.manualTotalEur;
                          const hasManual =
                            (blk.manualTotalEur ?? null) !== null || (blk.manualTotalHuf ?? null) !== null;
                          // Pénznem váltáskor a már beírt összeget átszámoljuk
                          const switchTo = (next: 'EUR' | 'HUF') =>
                            updateBlock(blk.id, (b) => {
                              const curVal = cur === 'HUF' ? b.manualTotalHuf : b.manualTotalEur;
                              const converted =
                                curVal === null || curVal === undefined
                                  ? null
                                  : next === 'HUF'
                                  ? roundHuf(Number(curVal), eurHufRate)
                                  : Math.round(Number(curVal) / Math.max(1, eurHufRate));
                              return recalculateBlockTotals(
                                {
                                  ...b,
                                  manualTotalCurrency: next,
                                  manualTotalEur: next === 'EUR' ? converted : null,
                                  manualTotalHuf: next === 'HUF' ? converted : null,
                                },
                                eurHufRate
                              );
                            });
                          return (
                            <>
                              <input
                                type="number"
                                value={value ?? ''}
                                onChange={(e) =>
                                  updateBlock(blk.id, (b) => {
                                    const v = e.target.value === '' ? null : Number(e.target.value);
                                    return recalculateBlockTotals(
                                      {
                                        ...b,
                                        manualTotalEur: cur === 'EUR' ? v : null,
                                        manualTotalHuf: cur === 'HUF' ? v : null,
                                      },
                                      eurHufRate
                                    );
                                  })
                                }
                                placeholder="automatikus"
                                className="w-32 px-2.5 py-1 rounded-lg border border-slate-300 bg-white text-[13px] text-right tabular-nums"
                              />
                              <div className="inline-flex p-0.5 rounded-lg bg-slate-200/70">
                                {(['EUR', 'HUF'] as const).map((c) => (
                                  <button
                                    key={c}
                                    type="button"
                                    onClick={() => c !== cur && switchTo(c)}
                                    className={`px-2 py-0.5 rounded-md text-xs ${
                                      c === cur
                                        ? 'bg-white text-slate-950 font-semibold shadow-sm'
                                        : 'text-slate-600 hover:text-slate-950'
                                    }`}
                                  >
                                    {c === 'HUF' ? 'Ft' : 'EUR'}
                                  </button>
                                ))}
                              </div>
                              {hasManual && (
                                <button
                                  type="button"
                                  onClick={() =>
                                    updateBlock(blk.id, (b) =>
                                      recalculateBlockTotals(
                                        { ...b, manualTotalEur: null, manualTotalHuf: null },
                                        eurHufRate
                                      )
                                    )
                                  }
                                  title="Vissza az automatikus végösszegre"
                                  className="p-1 rounded-lg text-slate-500 hover:bg-slate-200"
                                >
                                  <RotateCcw className="w-3.5 h-3.5" />
                                </button>
                              )}
                            </>
                          );
                        })()}
                      </div>
                    </div>
                  </div>

                  {/* Section Closing Text Box */}
                  <div>
                    <label className={labelCls}>
                      Záró szöveg (a táblázat alatt)
                    </label>
                    <textarea
                      rows={2}
                      value={blk.sectionClosingText || ''}
                      onChange={(e) =>
                        updateBlock(blk.id, (b) => ({
                          ...b,
                          sectionClosingText: e.target.value,
                        }))
                      }
                      placeholder="Írj ide bármilyen megjegyzést vagy kiegészítő szöveget a táblázat alá..."
                      className="w-full px-3.5 py-2 rounded-xl border border-slate-300 text-xs"
                    />
                  </div>
                </div>
              )}

              {/* BLOCK TYPE 4: PAGE BREAK */}
              {blk.type === 'page_break' && (
                <div className="px-4 py-3 text-center text-xs font-semibold text-slate-500 bg-slate-50">
                  --- Itt új A4-es oldal kezdődik a PDF-ben ---
                </div>
              )}
              </>)}
            </div>
            </React.Fragment>
          ))}
          {renderInsertBar(blocks.length)}
        </div>

        {/* RIGHT COLUMN: élő PDF előnézet (széles képernyőn a tartalom mellett) */}
        <div className="hidden xl:block min-w-0 xl:sticky xl:top-4">{renderPreviewCard('h-[720px]')}</div>
      </div>
      {stepNav}
      </>)}

      {editorStep === 3 && (
        <div className="space-y-4">
          <div className="bg-white rounded-2xl border border-slate-200 p-4 flex flex-wrap items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="text-sm font-semibold text-slate-950">Kész az ajánlat?</div>
              <p className="text-[13px] text-slate-600">
                Nézd át az előnézetet, majd töltsd le a PDF-et vagy küldd el e-mailben. Letöltés és küldés előtt automatikusan ment.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              disabled={savingPdf}
              onClick={() => handleSaveAndDownload('download')}
              className={btn.secondary}
            >
              <Download className="w-4 h-4" />
              PDF
            </button>
            {onSendQuote && (
              <button
                type="button"
                disabled={savingPdf}
                onClick={() => handleSaveAndDownload('send')}
                className={btn.primary}
                title="Mentés, majd küldés e-mailben PDF melléklettel"
              >
                <Send className="w-4 h-4" />
                {savingPdf ? 'Mentés…' : 'Küldés'}
              </button>
            )}
            </div>
          </div>
          {renderPreviewCard('h-[75vh] min-h-[480px]')}
          {stepNav}
        </div>
      )}

      {/* Fullscreen PDF Modal */}
      {fullscreenPreview && pdfPreviewUrl && (
        <div className="fixed inset-0 z-50 bg-slate-900/80 backdrop-blur-sm flex flex-col p-4">
          <div className="flex items-center justify-between text-white pb-3">
            <h3 className="text-sm font-bold">
              Teljes képernyős A4 PDF előnézet - {customerName}
            </h3>
            <button
              type="button"
              onClick={() => setFullscreenPreview(false)}
              className="px-4 py-1.5 rounded-xl bg-white/15 hover:bg-white/25 text-xs font-bold"
            >
              Bezárás
            </button>
          </div>
          <iframe
            src={pdfPreviewUrl}
            title="Teljes PDF"
            className="w-full flex-1 rounded-xl bg-white border-0"
          />
        </div>
      )}
    </div>
  );
}
