'use client';

import { thumbUrl } from '@/lib/thumb';
import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Copy,
  Edit3,
  FileText,
  FolderPlus,
  Image as ImageIcon,
  Layers,
  Package,
  Plus,
  Save,
  Sparkles,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import {
  DIMENSION_SOURCE_OPTIONS,
  extraPresetToMaterial,
  formatDotNumber,
  MOUNT_TYPES,
  PRICING_MODE_OPTIONS,
  PROFIT_MODE_OPTIONS,
  QUICK_CATEGORY_SUGGESTIONS,
  replaceTemplateVariables,
  TEMPLATE_STATUS_OPTIONS,
  TEMPLATE_VARIABLES_HELP,
} from '@/lib/constants';
import {
  calculateTemplateRows,
  createDefaultMaterialAlgorithm,
  parseMatrixPaste,
} from '@/lib/pricing-engine';
import {
  CatalogReference,
  ConditionalSizeRule,
  CustomMatrixTable,
  CustomTextBlock,
  DimensionSource,
  M2PriceTier,
  PhotoCaptionBlock,
  PricingFormulaConfig,
  ProductCategory,
  ProductMenu,
  ProductPricingMode,
  ProfitMode,
  QuoteTemplate,
  SystemConfig,
  TemplateMaterialItem,
  ModuleSplitRule,
  MountType,
  SizeAxis,
  TemplateSizeLimits,
  TemplateStatus,
  UploadedMediaItem,
} from '@/lib/types';
import { AutoTextarea, btn, PageHeader, Stepper } from '@/components/ui';
import { ColorOptionsEditor } from '@/components/ColorOptions';
import { EXTRA_GROUP_ORDER, presentExtra } from '@/lib/extra-groups';

interface TemplateBuilderViewProps {
  config: SystemConfig;
  menus: ProductMenu[];
  categories: ProductCategory[];
  templates: QuoteTemplate[];
  mediaLibrary: UploadedMediaItem[];
  onSaveCategory: (category: ProductCategory) => Promise<void>;
  onDeleteCategory: (categoryId: string) => Promise<void>;
  onSaveTemplate: (template: QuoteTemplate) => Promise<void>;
  onDeleteTemplate: (templateId: string) => Promise<void>;
  onUploadImage: (file: File) => Promise<string | null>;
  onStartGuidedPricing?: () => void;
  openTemplateId?: string | null;
  onOpenTemplateHandled?: () => void;
  onWizardClosed?: () => void;
}

function createDefaultMaterial(): TemplateMaterialItem {
  return createDefaultMaterialAlgorithm();
}

/** Kis szegmentált fülsor a hosszú lapok tagolásához */
function SubTabs<T extends string>({
  value,
  onChange,
  tabs,
}: {
  value: T;
  onChange: (v: T) => void;
  tabs: [T, string][];
}) {
  return (
    <div
      className="grid sm:flex gap-1 p-1 rounded-xl bg-slate-100 border border-slate-200"
      style={{ gridTemplateColumns: `repeat(${tabs.length}, minmax(0, 1fr))` }}
    >
      {tabs.map(([id, label]) => (
        <button
          key={id}
          type="button"
          onClick={() => onChange(id)}
          className={`min-w-0 px-1.5 sm:px-3 py-1.5 rounded-lg text-[13px] sm:text-sm leading-tight text-center break-words transition ${
            value === id ? 'bg-white text-slate-950 font-semibold shadow-sm' : 'text-slate-600 hover:text-slate-950'
          }`}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

export function TemplateBuilderView({
  config,
  menus,
  categories,
  templates,
  mediaLibrary,
  onSaveCategory,
  onDeleteCategory,
  onSaveTemplate,
  onDeleteTemplate,
  onUploadImage,
  onStartGuidedPricing,
  openTemplateId,
  onOpenTemplateHandled,
  onWizardClosed,
}: TemplateBuilderViewProps) {
  const [selectedCategoryId, setSelectedCategoryId] = useState<string>(
    categories[0]?.id || 'ALL'
  );

  // Category modal state
  const [categoryModalOpen, setCategoryModalOpen] = useState(false);
  const [editingCategory, setEditingCategory] =
    useState<ProductCategory | null>(null);
  const [catName, setCatName] = useState('');
  const [catDescription, setCatDescription] = useState('');
  const [catQuestion, setCatQuestion] = useState('');
  const [catType, setCatType] = useState<'main_structure' | 'accessory'>(
    'main_structure'
  );
  const [catAllowMultiple, setCatAllowMultiple] = useState(true);
  const [catMenuId, setCatMenuId] = useState<string>('');

  // Template Wizard state
  const [wizardOpen, setWizardOpen] = useState(false);
  const [wizardStep, setWizardStep] = useState<1 | 2 | 3 | 4 | 5>(1);
  const [editingTemplateId, setEditingTemplateId] = useState<string | null>(
    null
  );
  const [tplCategoryId, setTplCategoryId] = useState<string>('');
  const [tplName, setTplName] = useState('');
  const [tplSubtitle, setTplSubtitle] = useState('');
  const [tplIntroText, setTplIntroText] = useState('');
  const [tplClosingText, setTplClosingText] = useState('');
  const [tplTextBlocks, setTplTextBlocks] = useState<CustomTextBlock[]>([]);
  const [tplInfoText, setTplInfoText] = useState('');
  const [tplPhotos, setTplPhotos] = useState<PhotoCaptionBlock[]>([]);
  const [tplMaterials, setTplMaterials] = useState<TemplateMaterialItem[]>([]);
  const [tplStatus, setTplStatus] = useState<TemplateStatus>('active');
  const [tplOrder, setTplOrder] = useState<number | undefined>(undefined);
  const [tplSizeLimits, setTplSizeLimits] = useState<TemplateSizeLimits>({});
  const [tplModuleSplits, setTplModuleSplits] = useState<ModuleSplitRule[]>([]);
  const [tplMountTypes, setTplMountTypes] = useState<MountType[]>([]);
  const [tplAlsoInCategoryIds, setTplAlsoInCategoryIds] = useState<string[]>([]);
  const [tplSizeRules, setTplSizeRules] = useState<ConditionalSizeRule[]>([]);
  const [tplCatalogRef, setTplCatalogRef] = useState<CatalogReference>({});
  const [tplPricingOverride, setTplPricingOverride] = useState<
    Partial<PricingFormulaConfig> | undefined
  >(undefined);

  // Active material being edited inside Step 2
  const [activeMaterialIdx, setActiveMaterialIdx] = useState<number>(0);
  const [basicTab, setBasicTab] = useState<'general' | 'size' | 'pricing'>('general');
  const [itemTab, setItemTab] = useState<'basic' | 'pricing' | 'rules' | 'media'>('basic');
  const [addMenuOpen, setAddMenuOpen] = useState(false);
  const [addingCategory, setAddingCategory] = useState(false);
  const [newCatName, setNewCatName] = useState('');
  const [newCatMenuId, setNewCatMenuId] = useState('');
  const [newMatrixRowInput, setNewMatrixRowInput] = useState('');
  const [newMatrixColInput, setNewMatrixColInput] = useState('');
  const [matrixPasteText, setMatrixPasteText] = useState('');
  const [matrixPasteError, setMatrixPasteError] = useState('');
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [savingTemplate, setSavingTemplate] = useState(false);

  // Step 5 live test preview parameters
  const [testCustomerName, setTestCustomerName] = useState('Kovács János');
  const [testWidthCm, setTestWidthCm] = useState(600);
  const [testProjCm, setTestProjCm] = useState(400);
  const [testHeightCm, setTestHeightCm] = useState(250);

  // Open Category Modal
  const openNewCategoryModal = (preset?: {
    name: string;
    questionPrompt: string;
    categoryType: 'main_structure' | 'accessory';
    description: string;
  }) => {
    setEditingCategory(null);
    setCatName(preset?.name || '');
    setCatDescription(preset?.description || '');
    setCatQuestion(
      preset?.questionPrompt ||
        (preset?.name
          ? `Kér az ügyfél ${preset.name.toLowerCase()}t?`
          : 'Kér ilyet az ügyfél?')
    );
    setCatType(preset?.categoryType || 'main_structure');
    setCatAllowMultiple(true);
    setCatMenuId(menus[0]?.id || '');
    setCategoryModalOpen(true);
  };

  const openEditCategoryModal = (cat: ProductCategory) => {
    setEditingCategory(cat);
    setCatName(cat.name);
    setCatDescription(cat.description);
    setCatQuestion(cat.questionPrompt);
    setCatType(cat.categoryType);
    setCatAllowMultiple(cat.allowMultipleTemplates);
    setCatMenuId(cat.menuId || menus[0]?.id || '');
    setCategoryModalOpen(true);
  };

  // Új kategória közvetlenül a sablonszerkesztőből
  const createCategoryInline = async () => {
    const name = newCatName.trim();
    if (!name) return;
    const cat: ProductCategory = {
      id: `cat_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      name,
      shortName: name,
      description: '',
      questionPrompt: `Kér az ügyfél ${name.toLowerCase()}t?`,
      categoryType: 'main_structure',
      allowMultipleTemplates: true,
      order: categories.length + 1,
      menuId: newCatMenuId || menus[0]?.id,
    };
    await onSaveCategory(cat);
    setTplCategoryId(cat.id);
    setNewCatName('');
    setAddingCategory(false);
  };

  const handleSaveCategorySubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!catName.trim()) return;
    const id =
      editingCategory?.id ||
      `cat_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const newCat: ProductCategory = {
      id,
      name: catName.trim(),
      shortName: catName.trim(),
      description: catDescription.trim(),
      questionPrompt:
        catQuestion.trim() || `Kér az ügyfél ${catName.trim().toLowerCase()}t?`,
      categoryType: catType,
      allowMultipleTemplates: catAllowMultiple,
      order: editingCategory?.order ?? categories.length + 1,
      menuId: catMenuId || menus[0]?.id,
    };
    await onSaveCategory(newCat);
    setSelectedCategoryId(newCat.id);
    setCategoryModalOpen(false);
  };

  // Open Template Wizard
  const openNewTemplateWizard = (defaultCatId?: string) => {
    const targetCatId =
      defaultCatId && defaultCatId !== 'ALL'
        ? defaultCatId
        : categories[0]?.id || '';
    setEditingTemplateId(null);
    setTplCategoryId(targetCatId);
    setTplName('');
    setTplSubtitle('');
    setTplIntroText(
      'A kiválasztott {{meret_m}} ({{meret}}) méretű konstrukció prémium alapanyagokból, egyedi méretre gyártva készül.'
    );
    setTplClosingText(
      'A fenti összegek tartalmazzák a gyártást és a választott műszaki tartalmat.'
    );
    setTplTextBlocks([]);
    setTplInfoText('');
    setTplPhotos([]);
    setTplStatus('active');
    setTplOrder(undefined);
    setTplSizeLimits({});
    setTplModuleSplits([]);
    setTplMountTypes([]);
    setTplAlsoInCategoryIds([]);
    setTplSizeRules([]);
    setTplCatalogRef({});
    setTplPricingOverride(undefined);
    setTplMaterials([
      {
        ...createDefaultMaterial(),
        name: 'Alapszerkezet / Fő termék',
        description: 'Egyedi méretre gyártott kivitel',
      },
    ]);
    setActiveMaterialIdx(0);
    setWizardStep(1);
    setWizardOpen(true);
  };

  const openEditTemplateWizard = (tpl: QuoteTemplate) => {
    setEditingTemplateId(tpl.id);
    setTplCategoryId(tpl.categoryId);
    setTplName(tpl.name);
    setTplSubtitle(tpl.subtitle || '');
    setTplIntroText(tpl.introText || '');
    setTplClosingText(tpl.closingText || '');
    setTplInfoText(tpl.infoText || '');
    setTplTextBlocks(
      (tpl.textBlocks || []).map((tb) => ({ ...tb }))
    );
    setTplPhotos((tpl.photos || []).map((p) => ({ ...p })));
    setTplStatus(tpl.status || (tpl.enabled === false ? 'inactive' : 'active'));
    setTplOrder(tpl.order);
    setTplSizeLimits({ ...(tpl.sizeLimits || {}) });
    setTplModuleSplits(
      (tpl.moduleSplits?.length ? tpl.moduleSplits : tpl.moduleSplit ? [tpl.moduleSplit] : []).map(
        (r) => ({ ...r })
      )
    );
    setTplMountTypes([...(tpl.mountTypes || [])]);
    setTplAlsoInCategoryIds([...(tpl.alsoInCategoryIds || [])]);
    setTplSizeRules((tpl.sizeRules || []).map((r) => ({ ...r })));
    setTplCatalogRef({ ...(tpl.catalogRef || {}) });
    setTplPricingOverride(
      tpl.pricingOverride ? { ...tpl.pricingOverride } : undefined
    );

    const rawMats =
      tpl.materials && tpl.materials.length > 0
        ? tpl.materials
        : [createDefaultMaterial()];
    const hasNonPctBase = rawMats.some(
      (m) => m.pricingMode !== 'percentage' && m.itemRole === 'base'
    );

    setTplMaterials(
      rawMats.map((m, idx) => ({
        ...m,
        pricingMode:
          !hasNonPctBase && idx === 0 && m.pricingMode === 'percentage'
            ? 'per_m2'
            : m.pricingMode,
        basePrice: Math.max(1, Number(m.basePrice) || 1500),
        unitPrice: Math.max(1, Number(m.unitPrice) || 350),
        minPrice: Math.max(1, Number(m.minPrice) || 300),
        m2Tiers: (m.m2Tiers || []).map((t) => ({
          ...t,
          pricePerM2: Math.max(1, Number(t.pricePerM2) || 350),
        })),
        photos: (m.photos || []).map((p) => ({ ...p })),
      }))
    );
    setActiveMaterialIdx(0);
    setWizardStep(1);
    setWizardOpen(true);
  };

  const closeWizard = () => {
    setWizardOpen(false);
    onWizardClosed?.();
  };

  // A sablonkezelőből érkező "szerkesztés" kérés
  useEffect(() => {
    if (!openTemplateId) return;
    if (openTemplateId.startsWith('new:')) {
      openNewTemplateWizard(openTemplateId.slice(4));
    } else {
      const tpl = templates.find((t) => t.id === openTemplateId);
      if (tpl) openEditTemplateWizard(tpl);
    }
    onOpenTemplateHandled?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openTemplateId]);

  const handleDuplicateTemplate = async (tpl: QuoteTemplate) => {
    const now = new Date().toISOString();
    const copy: QuoteTemplate = {
      ...JSON.parse(JSON.stringify(tpl)),
      id: `tpl_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      name: `${tpl.name} (Másolat)`,
      createdAt: now,
      updatedAt: now,
    };
    await onSaveTemplate(copy);
  };

  const updateMaterial = (
    idx: number,
    patch: Partial<TemplateMaterialItem>
  ) => {
    setTplMaterials((prev) =>
      prev.map((m, i) => (i === idx ? { ...m, ...patch } : m))
    );
  };

  const handleAddMaterial = (role: TemplateMaterialItem['itemRole'] = 'base') => {
    const base = createDefaultMaterial();
    const nextMat: TemplateMaterialItem = {
      ...base,
      itemRole: role,
      defaultSelected: role !== 'optional',
      name:
        role === 'optional' ? 'Új extra' : role === 'gift' ? 'Új ajándék' : base.name,
      pricingMode: role === 'base' ? base.pricingMode : 'fixed',
      excludeFromPercentBase: role !== 'base' || undefined,
    };
    setItemTab('basic');
    setTplMaterials((prev) => {
      const updated = [...prev, nextMat];
      setActiveMaterialIdx(updated.length - 1);
      return updated;
    });
  };

  // Gyors extra a megbeszélt listából: opcionális tétel, ár nélkül (1 EUR), amíg Balázs meg nem adja
  const handleAddPresetMaterial = (overrides: Partial<TemplateMaterialItem>) => {
    const nextMat = createDefaultMaterialAlgorithm({
      itemRole: 'optional',
      defaultSelected: false,
      minPrice: 1,
      listPriceMultiplier: config.defaultListPriceMultiplier || 1.25,
      description: '',
      ...overrides,
    });
    setTplMaterials((prev) => {
      const updated = [...prev, nextMat];
      setActiveMaterialIdx(updated.length - 1);
      return updated;
    });
  };

  const handleRemoveMaterial = (idx: number) => {
    setTplMaterials((prev) => {
      const next = prev.filter((_, i) => i !== idx);
      if (activeMaterialIdx >= next.length) {
        setActiveMaterialIdx(Math.max(0, next.length - 1));
      }
      return next;
    });
  };

  const handleSaveTemplateFinal = async () => {
    if (!tplName.trim() || !tplCategoryId) return;
    setSavingTemplate(true);
    try {
      const now = new Date().toISOString();
      const hasNonPctBase = tplMaterials.some(
        (m) => m.pricingMode !== 'percentage' && m.itemRole === 'base'
      );
      const tpl: QuoteTemplate = {
        id:
          editingTemplateId ||
          `tpl_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        categoryId: tplCategoryId,
        name: tplName.trim(),
        subtitle: tplSubtitle.trim(),
        enabled: tplStatus !== 'inactive',
        status: tplStatus,
        order:
          tplOrder ??
          templates.filter((t) => t.categoryId === tplCategoryId).length + 1,
        sizeLimits: tplSizeLimits,
        moduleSplits: tplModuleSplits,
        mountTypes: tplMountTypes,
        sizeRules: tplSizeRules,
        alsoInCategoryIds: tplAlsoInCategoryIds.filter((id) => id !== tplCategoryId),
        catalogRef: tplCatalogRef,
        pricingOverride: tplPricingOverride,
        introText: tplIntroText,
        closingText: tplClosingText,
        textBlocks: tplTextBlocks,
        infoText: tplInfoText.trim() ? tplInfoText : undefined,
        photos: tplPhotos,
        materials: tplMaterials.map((m, i) => {
          // Fix tételnél a 0 ár = "még nincs ár", ezt nem írjuk felül alapértékkel
          const noPrice = m.pricingMode === 'fixed' && !Number(m.basePrice) && !Number(m.unitPrice);
          return {
          ...m,
          pricingMode:
            !hasNonPctBase && i === 0 && m.pricingMode === 'percentage'
              ? 'per_m2'
              : m.pricingMode,
          basePrice: noPrice ? 0 : Math.max(1, Number(m.basePrice) || 1500),
          unitPrice: noPrice ? 0 : Math.max(1, Number(m.unitPrice) || 350),
          minPrice: Math.max(1, Number(m.minPrice) || 300),
          name: m.name.trim() || `${i + 1}. Termék / Anyag tétel`,
          };
        }),
        createdAt: now,
        updatedAt: now,
      };
      await onSaveTemplate(tpl);
      closeWizard();
    } finally {
      setSavingTemplate(false);
    }
  };

  const currentMaterial = tplMaterials[activeMaterialIdx] || null;

  const filteredTemplates = (
    selectedCategoryId === 'ALL'
      ? templates
      : templates.filter((t) => t.categoryId === selectedCategoryId)
  )
    .slice()
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));

  // Live preview calculation for Step 5
  const previewDraftTemplate: QuoteTemplate = {
    id: editingTemplateId || 'preview_tpl',
    categoryId: tplCategoryId,
    name: tplName || 'Új Sablon',
    subtitle: tplSubtitle,
    enabled: true,
    introText: tplIntroText,
    closingText: tplClosingText,
    textBlocks: tplTextBlocks,
    photos: tplPhotos,
    materials: tplMaterials,
    pricingOverride: tplPricingOverride,
    moduleSplits: tplModuleSplits,
    mountTypes: tplMountTypes,
    sizeRules: tplSizeRules,
    createdAt: '',
    updatedAt: '',
  };

  const previewCalc = calculateTemplateRows(previewDraftTemplate, {
    widthCm: testWidthCm,
    projectionCm: testProjCm,
    heightCm: testHeightCm,
    mountType: 'Épülethez rögzített',
    eurHufRate: config.defaultEurHufRate || 400,
    formula: config.pricingFormula,
  });

  return (
    <div className="space-y-6">
      <PageHeader
        title="Sablonok"
        subtitle="Sablononként a termékek, árazási képletek, fotók és szövegek."
        actions={
          <>
            <button type="button" onClick={() => openNewCategoryModal()} className={btn.secondary}>
              <FolderPlus className="w-4 h-4" />
              Kategória
            </button>
            <button
              type="button"
              onClick={() => openNewTemplateWizard(selectedCategoryId)}
              disabled={categories.length === 0}
              className={btn.primary}
            >
              <Plus className="w-4 h-4" />
              Sablon
            </button>
          </>
        }
      />

      {/* Quick Start Empty State if 0 categories */}
      {categories.length === 0 ? (
        <div className="bg-white rounded-2xl border-2 border-dashed border-slate-300 p-8 text-center">
          <div className="w-14 h-14 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center mx-auto mb-4">
            <Layers className="w-7 h-7" />
          </div>
          <h2 className="text-xl font-bold text-slate-900">
            Tiszta lappal indulunk! Hozd létre az első termék-kategóriádat
          </h2>
          <p className="text-sm text-slate-600 max-w-xl mx-auto mt-2">
            Kattints az alábbi gyorsgombok valamelyikére (vagy hozz létre saját
            nevű kategóriát), majd azon belül máris építheted a sablonokat,
            termékeket, árazási szabályokat és fotókat!
          </p>
          <div className="flex flex-wrap justify-center gap-2.5 mt-6">
            {QUICK_CATEGORY_SUGGESTIONS.map((sug) => (
              <button
                key={sug.name}
                type="button"
                onClick={() => openNewCategoryModal(sug)}
                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-slate-100 hover:bg-emerald-50 hover:text-emerald-700 hover:border-emerald-300 border border-slate-200 text-slate-800 text-sm font-medium transition"
              >
                <Plus className="w-4 h-4 text-emerald-600" />
                {sug.name}
              </button>
            ))}
          </div>
          <div className="mt-6">
            <button
              type="button"
              onClick={() => openNewCategoryModal()}
              className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-sm font-semibold shadow"
            >
              <FolderPlus className="w-4 h-4" />
              Teljesen egyedi kategória létrehozása
            </button>
          </div>
        </div>
      ) : (
        <>
          {/* Category Filter Bar + Quick Add Chips */}
          <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-sm space-y-3">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <span className="text-[13px] font-medium text-slate-600">
                Felvett Kategóriák ({categories.length} db)
              </span>
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="text-xs text-slate-500 mr-1">
                  Gyors kategória felvétel:
                </span>
                {QUICK_CATEGORY_SUGGESTIONS.filter(
                  (s) =>
                    !categories.some(
                      (c) => c.name.toLowerCase() === s.name.toLowerCase()
                    )
                ).map((sug) => (
                  <button
                    key={sug.name}
                    type="button"
                    onClick={() => openNewCategoryModal(sug)}
                    className="px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-emerald-50 text-slate-700 hover:text-emerald-700 text-xs font-medium border border-slate-200 transition"
                  >
                    + {sug.name}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => setSelectedCategoryId('ALL')}
                className={`px-4 py-2 rounded-xl text-sm font-semibold transition border ${
                  selectedCategoryId === 'ALL'
                    ? 'bg-slate-900 text-white border-slate-900'
                    : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                }`}
              >
                Összes sablon ({templates.length})
              </button>

              {categories.map((cat) => {
                const count = templates.filter(
                  (t) => t.categoryId === cat.id
                ).length;
                const isActive = selectedCategoryId === cat.id;
                return (
                  <div
                    key={cat.id}
                    className={`inline-flex items-center rounded-xl border transition ${
                      isActive
                        ? 'bg-emerald-600 text-white border-emerald-600 shadow-sm'
                        : 'bg-white text-slate-800 border-slate-200 hover:bg-slate-50'
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => setSelectedCategoryId(cat.id)}
                      className="px-3.5 py-2 text-sm font-semibold flex items-center gap-2"
                    >
                      <span>{cat.name}</span>
                      <span
                        className={`text-xs px-1.5 py-0.5 rounded-md ${
                          isActive
                            ? 'bg-emerald-700 text-white'
                            : 'bg-slate-100 text-slate-600'
                        }`}
                      >
                        {count} sablon
                      </span>
                    </button>
                    <button
                      type="button"
                      onClick={() => openEditCategoryModal(cat)}
                      title="Kategória szerkesztése"
                      className={`p-2 border-l ${
                        isActive
                          ? 'border-emerald-500 text-emerald-100 hover:text-white'
                          : 'border-slate-200 text-slate-400 hover:text-slate-700'
                      }`}
                    >
                      <Edit3 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Templates Grid */}
          {filteredTemplates.length === 0 ? (
            <div className="bg-white rounded-2xl border border-slate-200 p-10 text-center">
              <Package className="w-10 h-10 text-slate-400 mx-auto mb-3" />
              <h3 className="text-lg font-bold text-slate-900">
                Ebben a kategóriában még nincs sablon
              </h3>
              <p className="text-sm text-slate-600 mt-1 mb-5">
                Hozz létre 1, 2, 3 vagy akárhány sablont ebben a kategóriában
                saját termékekkel, anyagokkal, fotókkal és szövegdobozokkal!
              </p>
              <button
                type="button"
                onClick={() => openNewTemplateWizard(selectedCategoryId)}
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-semibold shadow-sm"
              >
                <Plus className="w-4 h-4" />
                + Sablon létrehozása a Varázslóval
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
              {filteredTemplates.map((tpl) => {
                const cat = categories.find((c) => c.id === tpl.categoryId);
                const coverPhoto =
                  tpl.photos?.[0]?.imageUrl ||
                  tpl.materials?.find((m) => m.photos?.length > 0)?.photos?.[0]
                    ?.imageUrl;
                const sampleCalc = calculateTemplateRows(tpl, {
                  widthCm: 600,
                  projectionCm: 400,
                  heightCm: 250,
                  mountType: 'Épülethez rögzített',
                  eurHufRate: config.defaultEurHufRate || 400,
                  formula: config.pricingFormula,
                });
                const statusOpt = TEMPLATE_STATUS_OPTIONS.find(
                  (o) => o.id === (tpl.status || 'active')
                );

                return (
                  <div
                    key={tpl.id}
                    className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden flex flex-col justify-between hover:border-emerald-400 transition"
                  >
                    <div>
                      {coverPhoto ? (
                        <div className="h-44 bg-slate-100 relative overflow-hidden border-b border-slate-100">
                          <img
                            src={thumbUrl(coverPhoto)}
                            loading="lazy"
                            decoding="async"
                            alt={tpl.name}
                            className="w-full h-full object-cover"
                          />
                          <span className="absolute top-3 left-3 px-2.5 py-1 rounded-lg bg-slate-900/80 text-white text-xs font-semibold backdrop-blur-sm">
                            {cat?.name || 'Kategória'}
                          </span>
                        </div>
                      ) : (
                        <div className="h-28 bg-gradient-to-br from-slate-800 to-slate-900 p-4 flex flex-col justify-between">
                          <span className="inline-block self-start px-2.5 py-1 rounded-lg bg-white/15 text-white text-xs font-semibold">
                            {cat?.name || 'Kategória'}
                          </span>
                          <span className="text-xs text-slate-300">
                            {tpl.photos?.length || 0} sablonfotó •{' '}
                            {tpl.materials?.length || 0} termék/anyag tétel
                          </span>
                        </div>
                      )}

                      <div className="p-5">
                        <div className="flex items-start justify-between gap-2">
                          <h3 className="text-lg font-bold text-slate-900">
                            {tpl.name}
                          </h3>
                          {statusOpt && (
                            <span
                              className={`shrink-0 px-2 py-0.5 rounded-md border text-xs font-bold ${statusOpt.badgeClass}`}
                            >
                              {statusOpt.label}
                            </span>
                          )}
                        </div>
                        {tpl.subtitle && (
                          <p className="text-xs text-slate-500 mt-1 line-clamp-2">
                            {tpl.subtitle}
                          </p>
                        )}

                        <div className="mt-3 p-2.5 rounded-xl bg-emerald-50 border border-emerald-200 flex items-center justify-between">
                          <span className="text-xs text-slate-600">
                            Példa ár (6 × 4 m)
                          </span>
                          <span className="text-xs font-extrabold text-emerald-950">
                            {formatDotNumber(sampleCalc.totalBaseEur)} EUR (
                            {formatDotNumber(sampleCalc.totalBaseHuf)} Ft)
                          </span>
                        </div>

                        <div className="mt-3 space-y-1.5">
                          <div className="text-xs font-semibold text-slate-700">
                            Termékek és algoritmusok ({tpl.materials?.length || 0} db):
                          </div>
                          <div className="flex flex-wrap gap-1.5">
                            {(tpl.materials || []).slice(0, 5).map((m) => {
                              const modeLabel =
                                PRICING_MODE_OPTIONS.find(
                                  (pm) => pm.id === m.pricingMode
                                )?.shortLabel || m.pricingMode;
                              return (
                                <span
                                  key={m.id}
                                  className="px-2 py-0.5 rounded-md bg-slate-100 text-slate-700 text-xs border border-slate-200"
                                >
                                  {m.name} ({modeLabel})
                                </span>
                              );
                            })}
                            {(tpl.materials?.length || 0) > 5 && (
                              <span className="px-2 py-0.5 rounded-md bg-slate-100 text-slate-500 text-xs">
                                +{(tpl.materials?.length || 0) - 5} további
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="px-5 py-3.5 bg-slate-50 border-t border-slate-100 flex items-center justify-between gap-2">
                      <button
                        type="button"
                        onClick={() => openEditTemplateWizard(tpl)}
                        className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold transition"
                      >
                        <Edit3 className="w-3.5 h-3.5" />
                        Sablon & Termékek szerkesztése
                      </button>
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => handleDuplicateTemplate(tpl)}
                          title="Sablon duplikálása"
                          className="p-2 rounded-lg text-slate-600 hover:bg-slate-200 transition"
                        >
                          <Copy className="w-4 h-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            if (
                              window.confirm(
                                `Biztosan törlöd a(z) "${tpl.name}" sablont?`
                              )
                            ) {
                              onDeleteTemplate(tpl.id);
                            }
                          }}
                          title="Sablon törlése"
                          className="p-2 rounded-lg text-rose-600 hover:bg-rose-50 transition"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {templates.length > 0 && onStartGuidedPricing && (
            <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-5 flex flex-col sm:flex-row items-center justify-between gap-4">
              <div>
                <h4 className="text-base font-bold text-emerald-950">
                  Készen állnak a sablonok? Indítsd el a Végigvezetett Árazót!
                </h4>
                <p className="text-xs text-emerald-800 mt-0.5">
                  A végigvezetett árazóban megadhatod az ügyfél nevét, a
                  méreteket, és bekattinthatod, milyen sablonokat és termékeket
                  kér az ügyfél.
                </p>
              </div>
              <button
                type="button"
                onClick={onStartGuidedPricing}
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-semibold shadow-sm shrink-0"
              >
                Tovább a Végigvezetett Árazóba
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          )}
        </>
      )}

      {/* ===================================================================== */}
      {/* CATEGORY MODAL                                                        */}
      {/* ===================================================================== */}
      {categoryModalOpen && createPortal(
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-xl border border-slate-200 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="text-lg font-bold text-slate-900">
                {editingCategory
                  ? 'Kategória szerkesztése'
                  : 'Új Termék-kategória létrehozása'}
              </h3>
              <button
                type="button"
                onClick={() => setCategoryModalOpen(false)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveCategorySubmit} className="space-y-4">
              <div>
                <label className="block text-[13px] font-medium text-slate-700 mb-1.5">
                  Kategória megnevezése *
                </label>
                <input
                  type="text"
                  required
                  value={catName}
                  onChange={(e) => {
                    setCatName(e.target.value);
                    if (!editingCategory) {
                      setCatQuestion(
                        `Kér az ügyfél ${e.target.value.toLowerCase()}t?`
                      );
                    }
                  }}
                  placeholder="pl. Pergola, Előtető, Napellenző, Üvegfal, LED világítás..."
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-sm focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-[13px] font-medium text-slate-700 mb-1.5">
                  Melyik menüponthoz tartozik?
                </label>
                <select
                  value={catMenuId}
                  onChange={(e) => setCatMenuId(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-sm font-semibold"
                >
                  {[...menus]
                    .sort((a, b) => a.order - b.order)
                    .map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.name}
                      </option>
                    ))}
                </select>
              </div>

              <div>
                <label className="block text-[13px] font-medium text-slate-700 mb-1.5">
                  Kérdés a végigvezetett árazóban
                </label>
                <input
                  type="text"
                  value={catQuestion}
                  onChange={(e) => setCatQuestion(e.target.value)}
                  placeholder="pl. Kér az ügyfél napellenzőt?"
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-sm focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                />
                <p className="text-xs text-slate-500 mt-1">
                  Amikor bejön egy megkeresés, ezzel a kérdéssel vezeti végig az
                  árazót a rendszer (Igen / Nem bekattintással).
                </p>
              </div>

              <div>
                <label className="block text-[13px] font-medium text-slate-700 mb-1.5">
                  Kategória típusa
                </label>
                <div className="grid grid-cols-2 gap-2.5">
                  <button
                    type="button"
                    onClick={() => setCatType('main_structure')}
                    className={`p-3 rounded-xl border text-left transition ${
                      catType === 'main_structure'
                        ? 'border-emerald-600 bg-emerald-50 text-emerald-950'
                        : 'border-slate-200 hover:bg-slate-50 text-slate-700'
                    }`}
                  >
                    <div className="text-xs font-bold">Fő szerkezet</div>
                    <div className="text-xs text-slate-500 mt-0.5">
                      pl. Pergola, Előtető, Üvegtető
                    </div>
                  </button>
                  <button
                    type="button"
                    onClick={() => setCatType('accessory')}
                    className={`p-3 rounded-xl border text-left transition ${
                      catType === 'accessory'
                        ? 'border-emerald-600 bg-emerald-50 text-emerald-950'
                        : 'border-slate-200 hover:bg-slate-50 text-slate-700'
                    }`}
                  >
                    <div className="text-xs font-bold">
                      Kiegészítő / Árnyékoló / Extra
                    </div>
                    <div className="text-xs text-slate-500 mt-0.5">
                      pl. Napellenző, Üvegfal, LED, ZIP
                    </div>
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-[13px] font-medium text-slate-700 mb-1.5">
                  Rövid leírás (opcionális)
                </label>
                <input
                  type="text"
                  value={catDescription}
                  onChange={(e) => setCatDescription(e.target.value)}
                  placeholder="pl. 3-4 választható napellenző sablon képekkel és anyagokkal"
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-sm focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                />
              </div>

              <div className="flex items-center justify-between pt-3 border-t border-slate-100">
                {editingCategory ? (
                  <button
                    type="button"
                    onClick={async () => {
                      if (
                        window.confirm(
                          `Biztosan törlöd a(z) "${editingCategory.name}" kategóriát és a benne lévő sablonokat?`
                        )
                      ) {
                        await onDeleteCategory(editingCategory.id);
                        setCategoryModalOpen(false);
                        setSelectedCategoryId('ALL');
                      }
                    }}
                    className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-rose-600 hover:bg-rose-50 text-xs font-semibold"
                  >
                    <Trash2 className="w-4 h-4" />
                    Kategória törlése
                  </button>
                ) : (
                  <div />
                )}
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setCategoryModalOpen(false)}
                    className="px-4 py-2 rounded-xl border border-slate-200 text-slate-600 text-sm font-medium"
                  >
                    Mégse
                  </button>
                  <button
                    type="submit"
                    className="px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-semibold shadow-sm"
                  >
                    Mentés
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>,
        document.body
      )}

      {/* ===================================================================== */}
      {/* 5-STEP TEMPLATE & PRODUCT BUILDER WIZARD MODAL                        */}
      {/* ===================================================================== */}
      {wizardOpen && createPortal(
        <div className="fixed inset-0 z-[150] bg-slate-900/70 backdrop-blur-sm flex items-stretch sm:items-center justify-center p-0 sm:p-4 overscroll-contain">
          <div className="bg-white sm:rounded-2xl max-w-6xl w-full h-full sm:h-auto sm:max-h-[94vh] flex flex-col shadow-2xl sm:border border-slate-200 overflow-hidden">
            {/* Wizard Top Header */}
            <div className="px-4 sm:px-6 pt-3 sm:pt-5 pb-2 sm:pb-3 flex items-center justify-between gap-2">
              <h2 className="min-w-0 text-base sm:text-xl font-semibold text-slate-950 break-words">
                {editingTemplateId ? tplName || 'Sablon' : 'Új sablon'}
              </h2>
              <div className="flex items-center gap-1 shrink-0">
              <button
                type="button"
                disabled={!tplName.trim() || !tplCategoryId || savingTemplate}
                onClick={handleSaveTemplateFinal}
                className="sm:hidden px-3 py-1.5 rounded-lg bg-slate-900 text-white text-sm font-semibold disabled:opacity-50"
              >
                {savingTemplate ? 'Mentés…' : 'Mentés'}
              </button>
              <button
                type="button"
                onClick={() => closeWizard()}
                className="p-2 rounded-lg text-slate-500 hover:text-slate-950 hover:bg-slate-100"
                title="Bezárás"
              >
                <X className="w-5 h-5" />
              </button>
              </div>
            </div>

            {/* Lépések: mindig mind az öt látszik (telefonon rövid címkével) */}
            <div className="border-b border-slate-200 px-3 sm:px-6 pb-2">
              <Stepper
                className="mt-0"
                current={wizardStep}
                onSelect={(n) => setWizardStep(n)}
                steps={[
                  { num: 1 as const, label: 'Alapadatok', short: 'Alap' },
                  { num: 2 as const, label: 'Tételek & árazás', short: 'Tételek' },
                  { num: 3 as const, label: 'Fotók', short: 'Fotók' },
                  { num: 4 as const, label: 'Szövegek', short: 'Szövegek' },
                  { num: 5 as const, label: 'Teszt & mentés', short: 'Mentés' },
                ]}
              />
            </div>

            {/* Wizard Body */}
            <div className="p-3 sm:p-6 overflow-y-auto flex-1 space-y-6">
              {/* STEP 1: KATEGÓRIA & NÉV */}
              {wizardStep === 1 && (
                <div className="max-w-2xl mx-auto space-y-5">
                  <SubTabs<'general' | 'size' | 'pricing'>
                    value={basicTab}
                    onChange={setBasicTab}
                    tabs={[
                      ['general', 'Általános'],
                      ['size', 'Méretek és modulok'],
                      ['pricing', 'Katalógus és árképzés'],
                    ]}
                  />
                  {basicTab === 'general' && (<>
                  <div className="space-y-3">
                    <label className="block">
                      <span className="block text-[13px] font-medium text-slate-700 mb-1.5">Kategória *</span>
                      <div className="flex flex-wrap gap-2">
                        <select
                          value={tplCategoryId}
                          onChange={(e) => {
                            if (e.target.value === '__new') setAddingCategory(true);
                            else setTplCategoryId(e.target.value);
                          }}
                          className="min-w-0 flex-1 px-3 py-2.5 rounded-xl border border-slate-300 bg-white text-sm"
                        >
                          {[...menus, { id: '', name: 'Menü nélkül' } as ProductMenu].map((m) => {
                            const cats = categories.filter((c) => (c.menuId || '') === m.id);
                            if (!cats.length) return null;
                            return (
                              <optgroup key={m.id || 'none'} label={m.name}>
                                {cats.map((c) => (
                                  <option key={c.id} value={c.id}>
                                    {c.name}
                                  </option>
                                ))}
                              </optgroup>
                            );
                          })}
                          <option value="__new">+ Új kategória…</option>
                        </select>
                        {!addingCategory && (
                          <button type="button" onClick={() => setAddingCategory(true)} className={btn.secondary}>
                            <Plus className="w-4 h-4" />
                            Új kategória
                          </button>
                        )}
                      </div>
                    </label>
                    {addingCategory && (
                      <div className="flex flex-wrap items-end gap-2 p-3 rounded-xl border border-slate-200 bg-slate-50">
                        <label className="block min-w-0 flex-1 basis-48">
                          <span className="block text-xs font-semibold text-slate-500">Új kategória neve</span>
                          <input
                            autoFocus
                            value={newCatName}
                            onChange={(e) => setNewCatName(e.target.value)}
                            onKeyDown={(e) => e.key === 'Enter' && createCategoryInline()}
                            placeholder="pl. Kocsibeálló"
                            className="w-full px-3 py-2 rounded-lg border border-slate-300 bg-white text-sm"
                          />
                        </label>
                        <label className="block basis-40">
                          <span className="block text-xs font-semibold text-slate-500">Menü</span>
                          <select
                            value={newCatMenuId || menus[0]?.id || ''}
                            onChange={(e) => setNewCatMenuId(e.target.value)}
                            className="w-full px-3 py-2 rounded-lg border border-slate-300 bg-white text-sm"
                          >
                            {menus.map((m) => (
                              <option key={m.id} value={m.id}>
                                {m.name}
                              </option>
                            ))}
                          </select>
                        </label>
                        <button type="button" onClick={createCategoryInline} className={btn.primary}>
                          Létrehozás
                        </button>
                        <button type="button" onClick={() => setAddingCategory(false)} className={btn.ghost}>
                          Mégse
                        </button>
                      </div>
                    )}
                    {categories.length > 1 && (
                      <details className="group">
                        <summary className="cursor-pointer select-none text-[13px] font-medium text-slate-700 mb-1.5">
                          Megjelenik más kategóriákban is
                          <span className="ml-1 text-slate-500 font-normal">
                            {tplAlsoInCategoryIds.length
                              ? `: ${categories
                                  .filter((c) => tplAlsoInCategoryIds.includes(c.id))
                                  .map((c) => c.name)
                                  .join(', ')}`
                              : '(nincs)'}
                          </span>
                        </summary>
                        <div className="flex flex-wrap gap-1.5">
                          {categories
                            .filter((cat) => cat.id !== tplCategoryId)
                            .map((cat) => {
                              const on = tplAlsoInCategoryIds.includes(cat.id);
                              return (
                                <button
                                  key={cat.id}
                                  type="button"
                                  aria-pressed={on}
                                  onClick={() =>
                                    setTplAlsoInCategoryIds((prev) =>
                                      on ? prev.filter((x) => x !== cat.id) : [...prev, cat.id]
                                    )
                                  }
                                  className={`px-2.5 py-1 rounded-lg border text-xs transition ${
                                    on ? 'border-slate-900 bg-slate-900 text-white' : 'border-slate-200 text-slate-600 hover:border-slate-400'
                                  }`}
                                >
                                  {cat.name}
                                </button>
                              );
                            })}
                        </div>
                      </details>
                    )}
                  </div>

                  <div>
                    <label className="block text-[13px] font-medium text-slate-700 mb-1.5">
                      Sablon megnevezése *
                    </label>
                    <AutoTextarea
                      value={tplName}
                      onChange={(e) => setTplName(e.target.value)}
                      placeholder="pl. 1. Sablon - Prémium Bioklimatikus Pergola / Kazettás Napellenző..."
                      className="w-full px-4 py-3 rounded-xl border border-slate-300 text-sm font-medium focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                    />
                  </div>

                  <div>
                    <label className="block text-[13px] font-medium text-slate-700 mb-1.5">
                      Rövid alcím / Műszaki összefoglaló (Szövegdoboz a cím alatt)
                    </label>
                    <AutoTextarea
                      value={tplSubtitle}
                      onChange={(e) => setTplSubtitle(e.target.value)}
                      placeholder="pl. Extrudált alumínium vázszerkezet, motoros vezérléssel, 10 év garanciával"
                      className="w-full px-4 py-2.5 rounded-xl border border-slate-300 text-sm focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                    />
                  </div>

                  <div>
                    <label className="block text-[13px] font-medium text-slate-700 mb-1.5">
                      Sablon állapota
                    </label>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                      {TEMPLATE_STATUS_OPTIONS.map((opt) => (
                        <button
                          key={opt.id}
                          type="button"
                          onClick={() => setTplStatus(opt.id)}
                          className={`px-3 py-2 rounded-xl border text-xs font-bold transition ${
                            tplStatus === opt.id
                              ? `${opt.badgeClass} ring-2 ring-emerald-500/30`
                              : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                          }`}
                        >
                          {opt.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  </>)}

                  {basicTab === 'size' && (<>
                  <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-2">
                    <div className="text-sm font-semibold text-slate-950">
                      Beépítési módok
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {MOUNT_TYPES.map((mt) => {
                        const on = tplMountTypes.includes(mt.id);
                        return (
                          <label
                            key={mt.id}
                            className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border text-sm cursor-pointer ${
                              on ? 'border-slate-900 bg-white' : 'border-slate-200 bg-white text-slate-600'
                            }`}
                          >
                            <input
                              type="checkbox"
                              checked={on}
                              onChange={() =>
                                setTplMountTypes((prev) =>
                                  on ? prev.filter((x) => x !== mt.id) : [...prev, mt.id]
                                )
                              }
                            />
                            {mt.label}
                          </label>
                        );
                      })}
                    </div>
                    <p className="text-xs text-slate-500">
                      Ha egyik sincs bejelölve, bármelyik beépítéssel kérhető. Más beépítésnél az
                      árazóban pirossal, indoklással jelenik meg.
                    </p>
                  </div>

                  <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-2">
                    <div className="text-sm font-semibold text-slate-950">
                      Mérethatárok a teljes kért méretre (cm) - okos szűrő
                    </div>
                    <div className="grid grid-cols-2 gap-x-3 gap-y-2">
                      {(
                        [
                          ['minWidthCm', 'Szélesség min'],
                          ['maxWidthCm', 'Szélesség max'],
                          ['minProjectionCm', 'Kinyúlás min'],
                          ['maxProjectionCm', 'Kinyúlás max'],
                          ['minHeightCm', 'Magasság min'],
                          ['maxHeightCm', 'Magasság max'],
                        ] as [keyof TemplateSizeLimits, string][]
                      ).map(([key, label]) => (
                        <label key={key} className="block">
                          <span className="block text-xs font-semibold text-slate-500">
                            {label}
                          </span>
                          <input
                            type="number"
                            min={0}
                            value={tplSizeLimits[key] || ''}
                            onChange={(e) =>
                              setTplSizeLimits((prev) => ({
                                ...prev,
                                [key]: Math.max(0, Number(e.target.value) || 0),
                              }))
                            }
                            placeholder="nincs korlát"
                            className="w-full px-3 py-2 rounded-lg border border-slate-300 bg-white text-sm font-semibold"
                          />
                        </label>
                      ))}
                    </div>
                    <p className="text-xs text-slate-500">
                      Ha a kért méret ezen kívül esik, az árazóban a sablon
                      pirossal jelenik meg.
                    </p>
                  </div>

                  <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-3">
                    <div className="text-sm font-semibold text-slate-950">
                      Modulokra bontás
                    </div>
                    {(['width', 'projection'] as const).map((axis) => {
                      const rule = tplModuleSplits.find((r) => r.axis === axis);
                      const setRule = (next: ModuleSplitRule | undefined) =>
                        setTplModuleSplits((prev) => [
                          ...prev.filter((r) => r.axis !== axis),
                          ...(next ? [next] : []),
                        ]);
                      return (
                        <div key={axis} className="flex flex-wrap items-center gap-2 text-sm text-slate-700">
                          <label className="inline-flex items-center gap-2 cursor-pointer min-w-[9rem]">
                            <input
                              type="checkbox"
                              checked={Boolean(rule)}
                              onChange={(e) =>
                                setRule(e.target.checked ? { axis, maxCm: 500, maxModules: 2 } : undefined)
                              }
                            />
                            {axis === 'width' ? 'Szélesség szerint' : 'Kinyúlás szerint'}
                          </label>
                          {rule && (
                            <>
                              <span>egy modul max.</span>
                              <input
                                type="number"
                                min={1}
                                value={rule.maxCm}
                                onChange={(e) =>
                                  setRule({ ...rule, maxCm: Math.max(1, Number(e.target.value) || 1) })
                                }
                                className="w-20 px-2 py-1.5 rounded-lg border border-slate-300 bg-white text-right"
                              />
                              <span>cm, legfeljebb</span>
                              <input
                                type="number"
                                min={1}
                                value={rule.maxModules ?? ''}
                                placeholder="∞"
                                onChange={(e) =>
                                  setRule({
                                    ...rule,
                                    maxModules: e.target.value === '' ? undefined : Math.max(1, Number(e.target.value) || 1),
                                  })
                                }
                                className="w-16 px-2 py-1.5 rounded-lg border border-slate-300 bg-white text-right"
                              />
                              <span>modul</span>
                              <label className="flex items-center gap-2 w-full sm:w-auto sm:ml-2">
                                <span className="text-slate-500">vagy határok:</span>
                                <input
                                  type="text"
                                  inputMode="numeric"
                                  defaultValue={(rule.breakpointsCm || []).join(', ')}
                                  onBlur={(e) => {
                                    const bps = e.target.value
                                      .split(/[,; ]+/)
                                      .map((v) => Number(v))
                                      .filter((v) => v > 0)
                                      .sort((a, b) => a - b);
                                    setRule({ ...rule, breakpointsCm: bps.length ? bps : undefined });
                                  }}
                                  placeholder="pl. 500, 900, 1300"
                                  className="min-w-0 flex-1 sm:w-40 px-2 py-1.5 rounded-lg border border-slate-300 bg-white"
                                />
                              </label>
                            </>
                          )}
                        </div>
                      );
                    })}
                    <p className="text-xs text-slate-500">
                      Pl. egy modul max. 700 cm széles: 701-1400 cm között 2 modul. Egyenetlen
                      lépcsőknél a határokat add meg (pl. 500, 900, 1300: 500-ig 1, 900-ig 2, 1300-ig 3
                      modul). Két tengelynél a
                      modulszám a kettő szorzata. A tételeknél megadható, melyik modulszámnál
                      szerepeljenek (pl. a gyártó 2 modulos ártáblája).
                    </p>
                  </div>

                  <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-2">
                    <div className="text-sm font-semibold text-slate-950">
                      Feltételes méretkorlátok
                    </div>
                    {tplSizeRules.length === 0 && (
                      <p className="text-xs text-slate-500">
                        Pl. „Szabadon állóként max. 450 × 500 cm” vagy „800 cm szélesség felett max.
                        400 cm kinyúlás”.
                      </p>
                    )}
                    {tplSizeRules.map((rule, idx) => {
                      const update = (patch: Partial<ConditionalSizeRule>) =>
                        setTplSizeRules((prev) => prev.map((r, i) => (i === idx ? { ...r, ...patch } : r)));
                      const num = (v: string) => (v === '' ? undefined : Math.max(0, Number(v) || 0));
                      const field = (
                        key: 'ifWidthOverCm' | 'ifProjectionOverCm' | 'maxWidthCm' | 'maxProjectionCm' | 'maxHeightCm',
                        label: string
                      ) => (
                        <label className="block">
                          <span className="block text-xs font-semibold text-slate-500">{label}</span>
                          <input
                            type="number"
                            min={0}
                            value={rule[key] ?? ''}
                            onChange={(e) => update({ [key]: num(e.target.value) })}
                            placeholder="-"
                            className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 bg-white text-sm"
                          />
                        </label>
                      );
                      return (
                        <div key={rule.id} className="rounded-lg border border-slate-200 bg-white p-3 space-y-2">
                          <div className="flex items-center gap-2">
                            <input
                              value={rule.label || ''}
                              onChange={(e) => update({ label: e.target.value })}
                              placeholder="Magyarázat az árazóban (pl. szabadon álló kivitel)"
                              className="min-w-0 flex-1 px-2.5 py-1.5 rounded-lg border border-slate-300 text-sm"
                            />
                            <button
                              type="button"
                              onClick={() => setTplSizeRules((prev) => prev.filter((_, i) => i !== idx))}
                              className="p-1.5 rounded-md text-slate-400 hover:text-rose-600 hover:bg-rose-50"
                              title="Korlát törlése"
                              aria-label="Korlát törlése"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                          <div className="text-xs font-semibold text-slate-600">Ha…</div>
                          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                            <label className="block">
                              <span className="block text-xs font-semibold text-slate-500">Beépítés</span>
                              <select
                                value={rule.mountType || ''}
                                onChange={(e) => update({ mountType: (e.target.value || undefined) as MountType | undefined })}
                                className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 bg-white text-sm"
                              >
                                <option value="">bármelyik</option>
                                {MOUNT_TYPES.map((mt) => (
                                  <option key={mt.id} value={mt.id}>
                                    {mt.label}
                                  </option>
                                ))}
                              </select>
                            </label>
                            {field('ifWidthOverCm', 'Szélesség nagyobb, mint')}
                            {field('ifProjectionOverCm', 'Kinyúlás nagyobb, mint')}
                          </div>
                          <div className="text-xs font-semibold text-slate-600">…akkor legfeljebb</div>
                          <div className="grid grid-cols-3 gap-2">
                            {field('maxWidthCm', 'Szélesség')}
                            {field('maxProjectionCm', 'Kinyúlás')}
                            {field('maxHeightCm', 'Magasság')}
                          </div>
                        </div>
                      );
                    })}
                    <button
                      type="button"
                      onClick={() =>
                        setTplSizeRules((prev) => [
                          ...prev,
                          { id: `rule_${Date.now()}_${Math.random().toString(36).slice(2, 6)}` },
                        ])
                      }
                      className="inline-flex items-center gap-1 text-[13px] text-slate-600 hover:text-slate-950"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      Feltételes korlát
                    </button>
                  </div>

                  </>)}

                  {basicTab === 'pricing' && (<>
                  <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-2">
                    <div className="text-sm font-semibold text-slate-950">
                      Katalógus hivatkozás (hol találjuk az árat)
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {(
                        [
                          ['pdfFile', 'Ár PDF fájl neve', 'pl. Pergola_arlista_2026.pdf'],
                          ['pages', 'Oldal(ak)', 'pl. 47-49'],
                          ['productAlias', 'Gyártói / fantázianév', 'pl. Algarve Classic'],
                          ['note', 'Megjegyzés', ''],
                        ] as [keyof CatalogReference, string, string][]
                      ).map(([key, label, placeholder]) => (
                        <label key={key} className="block">
                          <span className="block text-xs font-semibold text-slate-500">
                            {label}
                          </span>
                          <input
                            type="text"
                            value={tplCatalogRef[key] || ''}
                            onChange={(e) =>
                              setTplCatalogRef((prev) => ({
                                ...prev,
                                [key]: e.target.value,
                              }))
                            }
                            placeholder={placeholder}
                            className="w-full px-3 py-2 rounded-lg border border-slate-300 bg-white text-sm"
                          />
                        </label>
                      ))}
                    </div>
                  </div>

                  <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-2">
                    <label className="flex items-center gap-2 text-sm font-semibold text-slate-950 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={Boolean(tplPricingOverride)}
                        onChange={(e) =>
                          setTplPricingOverride(
                            e.target.checked
                              ? {
                                  profitMode: config.pricingFormula.profitMode,
                                  profitValue: config.pricingFormula.profitValue,
                                  assemblyFixedEur:
                                    config.pricingFormula.assemblyFixedEur,
                                  assemblyPerM2Eur:
                                    config.pricingFormula.assemblyPerM2Eur,
                                }
                              : undefined
                          )
                        }
                        className="rounded text-emerald-600"
                      />
                      Egyedi haszon / szerelés ennél a sablonnál
                    </label>
                    {!tplPricingOverride ? (
                      <p className="text-xs text-slate-500">
                        A Beállításokban megadott globális képlettel számol.
                      </p>
                    ) : (
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                        <label className="block col-span-2">
                          <span className="block text-xs font-semibold text-slate-500">
                            Haszon módja
                          </span>
                          <select
                            value={tplPricingOverride.profitMode}
                            onChange={(e) =>
                              setTplPricingOverride((prev) => ({
                                ...prev,
                                profitMode: e.target.value as ProfitMode,
                              }))
                            }
                            className="w-full px-2 py-2 rounded-lg border border-slate-300 bg-white text-xs font-semibold"
                          >
                            {PROFIT_MODE_OPTIONS.map((o) => (
                              <option key={o.id} value={o.id}>
                                {o.label}
                              </option>
                            ))}
                          </select>
                        </label>
                        {(
                          [
                            ['profitValue', tplPricingOverride.profitMode === 'fixed' ? 'Haszon X (EUR)' : 'Haszon X (%)'],
                            ['assemblyFixedEur', 'Szerelés X (EUR)'],
                            ['assemblyPerM2Eur', 'Szerelés Y (EUR/m²)'],
                          ] as [keyof PricingFormulaConfig, string][]
                        ).map(([key, label]) => (
                          <label key={key} className="block">
                            <span className="block text-xs font-semibold text-slate-500">
                              {label}
                            </span>
                            <input
                              type="number"
                              min={0}
                              value={Number(tplPricingOverride[key]) || 0}
                              onChange={(e) =>
                                setTplPricingOverride((prev) => ({
                                  ...prev,
                                  [key]: Math.max(0, Number(e.target.value) || 0),
                                }))
                              }
                              className="w-full px-2 py-2 rounded-lg border border-slate-300 bg-white text-sm font-semibold"
                            />
                          </label>
                        ))}
                      </div>
                    )}
                  </div>
                  </>)}
                </div>
              )}

              {/* STEP 2: TERMÉKEK, ANYAGOK ÉS ÁRAZÁSI MÓDOK */}
              {wizardStep === 2 && (
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                  {/* Left list of materials/products in this template */}
                  <div className="lg:col-span-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-[13px] font-medium text-slate-600">
                        Tételek ({tplMaterials.length})
                      </span>
                      <div className="relative">
                        <button
                          type="button"
                          onClick={() => setAddMenuOpen((v) => !v)}
                          className={btn.ghost}
                          aria-expanded={addMenuOpen}
                        >
                          <Plus className="w-4 h-4" />
                          Új tétel
                        </button>
                        {addMenuOpen && (
                          <div className="absolute right-0 top-full mt-1 z-30 w-48 bg-white border border-slate-200 rounded-xl shadow-lg p-1">
                            {(
                              [
                                ['base', 'Alaptétel (az árban)'],
                                ['optional', 'Extra (választható)'],
                                ['gift', 'Ajándék'],
                              ] as const
                            ).map(([role, label]) => (
                              <button
                                key={role}
                                type="button"
                                onClick={() => {
                                  setAddMenuOpen(false);
                                  handleAddMaterial(role);
                                }}
                                className="w-full text-left px-3 py-1.5 rounded-lg text-[13px] text-slate-700 hover:bg-slate-100"
                              >
                                {label}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="space-y-3">
                      {(
                        [
                          ['base', 'Alaptételek'],
                          ['gift', 'Ajándékok'],
                          ['optional', 'Extrák'],
                        ] as const
                      ).map(([role, label]) => {
                        const items = tplMaterials
                          .map((mat, idx) => ({ mat, idx }))
                          .filter(({ mat }) => (mat.itemRole || 'base') === role);
                        if (!items.length) return null;
                        return (
                          <div key={role}>
                            <div className="px-1 pb-1 text-xs font-medium text-slate-500">
                              {label} ({items.length})
                            </div>
                            <div className="rounded-xl border border-slate-200 bg-white divide-y divide-slate-100 overflow-hidden">
                              {items.map(({ mat, idx }) => {
                                const isSel = idx === activeMaterialIdx;
                                const calcRow = previewCalc.rows.find((r) => r.materialId === mat.id);
                                const missingPrice =
                                  calcRow && (calcRow.costEur ?? 0) <= 1 && mat.itemRole !== 'gift';
                                return (
                                  <div
                                    key={mat.id}
                                    onClick={() => setActiveMaterialIdx(idx)}
                                    className={`group flex items-center gap-2 px-3 py-2 cursor-pointer transition ${
                                      isSel ? 'bg-slate-900 text-white' : 'hover:bg-slate-50'
                                    }`}
                                  >
                                    <div className="min-w-0 flex-1">
                                      <div className={`text-[13px] leading-snug break-words ${isSel ? 'text-white' : 'text-slate-900'}`}>
                                        {mat.name || 'Névtelen tétel'}
                                      </div>
                                      {(missingPrice || mat.perSide || mat.mountTypes?.length) && (
                                        <div className={`text-[11px] ${isSel ? 'text-white/70' : 'text-slate-500'}`}>
                                          {[
                                            missingPrice ? 'ár hiányzik' : '',
                                            mat.perSide ? 'oldalanként' : '',
                                            mat.mountTypes?.length ? mat.mountTypes.join(', ').toLowerCase() : '',
                                          ]
                                            .filter(Boolean)
                                            .join(' · ')}
                                        </div>
                                      )}
                                    </div>
                                    <span
                                      className={`text-xs tabular-nums whitespace-nowrap ${
                                        missingPrice ? 'text-rose-500' : isSel ? 'text-white/90' : 'text-slate-600'
                                      }`}
                                    >
                                      {mat.itemRole === 'gift'
                                        ? 'ajándék'
                                        : calcRow
                                        ? `${formatDotNumber(calcRow.discountPriceEur)} EUR`
                                        : '-'}
                                    </span>
                                    {tplMaterials.length > 1 && (
                                      <button
                                        type="button"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          if (window.confirm(`Törlöd: „${mat.name}”?`)) handleRemoveMaterial(idx);
                                        }}
                                        className={`p-1 rounded-md lg:opacity-0 lg:group-hover:opacity-100 ${
                                          isSel ? 'text-white/70 hover:text-white' : 'text-slate-400 hover:text-rose-600'
                                        }`}
                                        title="Tétel törlése"
                                        aria-label="Tétel törlése"
                                      >
                                        <Trash2 className="w-3.5 h-3.5" />
                                      </button>
                                    )}
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    {/* Quick extras from the meeting list */}
                    <details className="rounded-xl border border-slate-200 bg-white px-3 py-2">
                      <summary className="cursor-pointer text-[13px] text-slate-600 select-none">Gyors extra hozzáadása</summary>
                      <div className="flex flex-wrap gap-1.5 pt-2">
                        {(config.extraPresets || []).map((preset) => (
                          <button
                            key={preset.id}
                            type="button"
                            onClick={() => handleAddPresetMaterial(extraPresetToMaterial(preset))}
                            className="px-2.5 py-1 rounded-full border border-slate-300 bg-white hover:bg-slate-50 text-xs text-slate-700"
                          >
                            + {preset.name}
                          </button>
                        ))}
                      </div>
                    </details>

                    {/* Template Total Summary Box in Step 2 */}
                    <div className="p-3.5 rounded-xl bg-white border border-slate-200 space-y-1">
                      <div className="text-[13px] text-slate-500">
                        Sablon ára ({testWidthCm}×{testProjCm} cm):
                      </div>
                      <div className="text-base sm:text-lg font-semibold text-slate-950 tabular-nums">
                        {formatDotNumber(previewCalc.totalBaseEur)} EUR{' '}
                        <span className="text-xs font-normal text-slate-500">
                          ({formatDotNumber(previewCalc.totalBaseHuf)} Ft)
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Right detail editor for selected product/material */}
                  <div className="lg:col-span-8">
                    {currentMaterial ? (
                      <div className="bg-slate-50 rounded-2xl border border-slate-200 p-3 sm:p-5 space-y-5">
                        {/* LIVE ALGORITHM CALCULATION BANNER FOR CURRENT PRODUCT */}
                        {previewCalc.rows[activeMaterialIdx] && (
                          <div className="bg-white border border-slate-200 rounded-xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                            <div>
                              <div className="text-[13px] text-slate-500">
                                Ár {testWidthCm}×{testProjCm}×{testHeightCm} cm példa méretnél
                              </div>
                              <div className="text-sm text-slate-800 mt-0.5">
                                {previewCalc.rows[activeMaterialIdx].formulaSummary}
                              </div>
                            </div>
                            <div className="text-right shrink-0">
                              <div className="text-xs text-slate-500">
                                Listaár:{' '}
                                <span className="font-bold line-through">
                                  {formatDotNumber(
                                    previewCalc.rows[activeMaterialIdx].listPriceEur
                                  )}{' '}
                                  EUR
                                </span>
                              </div>
                              <div className="text-base sm:text-lg font-semibold text-slate-950 tabular-nums">
                                Kedvezményes ár:{' '}
                                {formatDotNumber(
                                  previewCalc.rows[activeMaterialIdx].discountPriceEur
                                )}{' '}
                                EUR
                              </div>
                            </div>
                          </div>
                        )}

                        <SubTabs<'basic' | 'pricing' | 'rules' | 'media'>
                          value={itemTab}
                          onChange={setItemTab}
                          tabs={[
                            ['basic', 'Alap'],
                            ['pricing', 'Árazás'],
                            ['rules', 'Szabályok'],
                            ['media', 'Képek és színek'],
                          ]}
                        />
                        {itemTab === 'basic' && (<>
                        <div className="grid grid-cols-1 gap-4">
                          <div>
                            <label className="block text-[13px] font-medium text-slate-700 mb-1.5">
                              Tétel neve
                            </label>
                            <AutoTextarea
                              value={currentMaterial.name}
                              onChange={(e) =>
                                updateMaterial(activeMaterialIdx, {
                                  name: e.target.value,
                                })
                              }
                              placeholder="pl. Alapszerkezet, Somfy motor, Napellenző ponyva, Szerelés..."
                              className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 bg-white text-sm font-semibold"
                            />
                          </div>
                          <div>
                            <label className="block text-[13px] font-medium text-slate-700 mb-1.5">
                              Műszaki leírás / Anyag megjegyzés
                            </label>
                            <AutoTextarea
                              value={currentMaterial.description}
                              onChange={(e) =>
                                updateMaterial(activeMaterialIdx, {
                                  description: e.target.value,
                                })
                              }
                              placeholder="pl. RAL 7016 antracit, UV-álló akril szövet..."
                              className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 bg-white text-sm"
                            />
                          </div>
                        </div>

                        {/* Item Role & Currency */}
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                          <div>
                            <label className="block text-[13px] font-medium text-slate-700 mb-1.5">
                              Tétel szerepe a PDF-ben
                            </label>
                            <select
                              value={currentMaterial.itemRole}
                              onChange={(e) =>
                                updateMaterial(activeMaterialIdx, {
                                  itemRole: e.target.value as any,
                                })
                              }
                              className="w-full px-3 py-2.5 rounded-xl border border-slate-300 bg-white text-sm font-medium"
                            >
                              <option value="base">
                                Alaptétel (fő összesítésben)
                              </option>
                              <option value="optional">
                                Opcionális tétel (+ Opcióként)
                              </option>
                              <option value="gift">
                                Ajándék tétel (0 EUR kedvezményes ár)
                              </option>
                            </select>
                          </div>

                          <div>
                            <label className="block text-[13px] font-medium text-slate-700 mb-1.5">
                              Pénznem
                            </label>
                            <select
                              value={currentMaterial.currency}
                              onChange={(e) =>
                                updateMaterial(activeMaterialIdx, {
                                  currency: e.target.value as any,
                                })
                              }
                              className="w-full px-3 py-2.5 rounded-xl border border-slate-300 bg-white text-sm font-medium"
                            >
                              <option value="EUR">EUR (€)</option>
                              <option value="HUF">HUF (Ft)</option>
                            </select>
                          </div>

                          <div>
                            <label className="block text-[13px] font-medium text-slate-700 mb-1.5">
                              Opcionális felirat az ár mellett (ha üres, nincs)
                            </label>
                            <input
                              type="text"
                              value={currentMaterial.defaultNote}
                              onChange={(e) =>
                                updateMaterial(activeMaterialIdx, {
                                  defaultNote: e.target.value,
                                })
                              }
                              placeholder="pl. üresen hagyható, vagy Ajándék / -20%"
                              className="w-full px-3 py-2.5 rounded-xl border border-slate-300 bg-white text-sm"
                            />
                          </div>
                        </div>

                        <label className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={Boolean(currentMaterial.perSide)}
                            onChange={(e) =>
                              updateMaterial(activeMaterialIdx, {
                                perSide: e.target.checked,
                              })
                            }
                          />
                          Oldalanként árazott (az árazóban 1-4 oldal választható)
                        </label>

                        </>)}
                        {itemTab === 'rules' && (
                        <details open className="rounded-xl border border-slate-200 bg-white px-4 py-3">
                          <summary className="cursor-pointer text-sm font-medium text-slate-800 select-none">
                            Haladó szabályok (modulok, nettó méret, kerekítés)
                          </summary>
                          <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
                            <div>
                              <span className="block text-[13px] text-slate-600 mb-1">
                                Nettó méret: levonás (cm)
                              </span>
                              <div className="flex gap-1.5">
                                {(
                                  [
                                    ['widthCm', 'szél.'],
                                    ['projectionCm', 'kiny.'],
                                    ['heightCm', 'mag.'],
                                  ] as const
                                ).map(([key, ph]) => (
                                  <input
                                    key={key}
                                    type="number"
                                    value={currentMaterial.dimOffsets?.[key] ?? ''}
                                    onChange={(e) =>
                                      updateMaterial(activeMaterialIdx, {
                                        dimOffsets: {
                                          ...(currentMaterial.dimOffsets || {}),
                                          [key]: e.target.value === '' ? undefined : Number(e.target.value),
                                        },
                                      })
                                    }
                                    placeholder={ph}
                                    title="pl. −17 = 17 cm-rel kisebb méretből számol"
                                    className="w-20 px-2 py-1.5 rounded-lg border border-slate-300 text-right"
                                  />
                                ))}
                              </div>
                            </div>
                            {currentMaterial.pricingMode === 'matrix_cm' && (
                              <div>
                                <span className="block text-[13px] text-slate-600 mb-1">
                                  Mérettábla: sor / oszlop méret, kerekítés
                                </span>
                                <div className="flex flex-wrap gap-1.5">
                                  {(
                                    [
                                      ['matrixRowAxis', 'projection'],
                                      ['matrixColAxis', 'width'],
                                    ] as const
                                  ).map(([key, def]) => (
                                    <select
                                      key={key}
                                      value={currentMaterial[key] || def}
                                      onChange={(e) =>
                                        updateMaterial(activeMaterialIdx, {
                                          [key]: e.target.value as SizeAxis,
                                        })
                                      }
                                      className="px-2 py-1.5 rounded-lg border border-slate-300"
                                    >
                                      <option value="width">szélesség</option>
                                      <option value="projection">kinyúlás</option>
                                      <option value="height">magasság</option>
                                    </select>
                                  ))}
                                  <select
                                    value={currentMaterial.matrixRowSnap || 'up'}
                                    onChange={(e) =>
                                      updateMaterial(activeMaterialIdx, {
                                        matrixRowSnap: e.target.value as 'up' | 'nearest',
                                        matrixColSnap: e.target.value as 'up' | 'nearest',
                                      })
                                    }
                                    className="px-2 py-1.5 rounded-lg border border-slate-300"
                                  >
                                    <option value="up">következő nagyobb méret</option>
                                    <option value="nearest">legközelebbi méret</option>
                                  </select>
                                </div>
                              </div>
                            )}
                            <label className="flex items-center gap-2 cursor-pointer">
                              <input
                                type="checkbox"
                                checked={Boolean(currentMaterial.splitByModule)}
                                onChange={(e) =>
                                  updateMaterial(activeMaterialIdx, { splitByModule: e.target.checked })
                                }
                              />
                              Modulonként árazva (ár × modulszám)
                            </label>
                            <label className="flex items-center gap-2 cursor-pointer">
                              <input
                                type="checkbox"
                                checked={Boolean(currentMaterial.perModule)}
                                onChange={(e) =>
                                  updateMaterial(activeMaterialIdx, { perModule: e.target.checked })
                                }
                              />
                              Darabszám × modulszám (pl. motor modulonként)
                            </label>
                            <div className="flex items-center gap-2">
                              <span className="text-[13px] text-slate-600">Csak ha a modulszám</span>
                              <input
                                type="number"
                                min={1}
                                value={currentMaterial.minModules ?? ''}
                                onChange={(e) =>
                                  updateMaterial(activeMaterialIdx, {
                                    minModules: e.target.value === '' ? undefined : Number(e.target.value),
                                  })
                                }
                                placeholder="min"
                                className="w-16 px-2 py-1.5 rounded-lg border border-slate-300 text-right"
                              />
                              <span className="text-slate-400">-</span>
                              <input
                                type="number"
                                min={1}
                                value={currentMaterial.maxModules ?? ''}
                                onChange={(e) =>
                                  updateMaterial(activeMaterialIdx, {
                                    maxModules: e.target.value === '' ? undefined : Number(e.target.value),
                                  })
                                }
                                placeholder="max"
                                className="w-16 px-2 py-1.5 rounded-lg border border-slate-300 text-right"
                              />
                            </div>
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="text-[13px] text-slate-600">Csak pontosan</span>
                              <input
                                type="number"
                                min={1}
                                value={currentMaterial.modulesWidth ?? ''}
                                onChange={(e) =>
                                  updateMaterial(activeMaterialIdx, {
                                    modulesWidth: e.target.value === '' ? undefined : Number(e.target.value),
                                  })
                                }
                                placeholder="-"
                                className="w-14 px-2 py-1.5 rounded-lg border border-slate-300 text-right"
                              />
                              <span className="text-[13px] text-slate-600">modul szélességben ×</span>
                              <input
                                type="number"
                                min={1}
                                value={currentMaterial.modulesProjection ?? ''}
                                onChange={(e) =>
                                  updateMaterial(activeMaterialIdx, {
                                    modulesProjection: e.target.value === '' ? undefined : Number(e.target.value),
                                  })
                                }
                                placeholder="-"
                                className="w-14 px-2 py-1.5 rounded-lg border border-slate-300 text-right"
                              />
                              <span className="text-[13px] text-slate-600">kinyúlásban</span>
                            </div>
                            <label className="flex items-center gap-2 cursor-pointer">
                              <input
                                type="checkbox"
                                checked={Boolean(currentMaterial.excludeFromPercentBase)}
                                onChange={(e) =>
                                  updateMaterial(activeMaterialIdx, {
                                    excludeFromPercentBase: e.target.checked,
                                  })
                                }
                              />
                              Nem számít a szerelés % alapjába
                            </label>
                            {currentMaterial.itemRole === 'optional' && (() => {
                              const auto = presentExtra({ ...currentMaterial, group: undefined, choiceGroup: undefined }, config.extraGroups);
                              return (
                                <div className="pt-2 border-t border-slate-200 space-y-2">
                                  <div className="text-[13px] font-medium text-slate-700">
                                    Megjelenés az árazóban
                                  </div>
                                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                    <label className="block">
                                      <span className="block text-xs font-semibold text-slate-500">Gyűjtemény</span>
                                      <input
                                        list="extra-group-options"
                                        value={currentMaterial.group || ''}
                                        onChange={(e) => updateMaterial(activeMaterialIdx, { group: e.target.value || undefined })}
                                        placeholder={`automatikus: ${auto.group}`}
                                        className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 text-sm"
                                      />
                                      <datalist id="extra-group-options">
                                        {Array.from(new Set([...(config.extraGroups || []).map((g) => g.name), ...EXTRA_GROUP_ORDER])).map((g) => (
                                          <option key={g} value={g} />
                                        ))}
                                      </datalist>
                                    </label>
                                    <label className="block">
                                      <span className="block text-xs font-semibold text-slate-500">
                                        Opciócsoport (azonos nevűek egy sorban)
                                      </span>
                                      <input
                                        value={currentMaterial.choiceGroup || ''}
                                        onChange={(e) => updateMaterial(activeMaterialIdx, { choiceGroup: e.target.value || undefined })}
                                        placeholder={auto.choiceGroup ? `automatikus: ${auto.choiceGroup}` : 'pl. LED a keresztgerendákban'}
                                        className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 text-sm"
                                      />
                                    </label>
                                    <label className="block">
                                      <span className="block text-xs font-semibold text-slate-500">Rövid címke a gombon</span>
                                      <input
                                        value={currentMaterial.choiceLabel || ''}
                                        onChange={(e) => updateMaterial(activeMaterialIdx, { choiceLabel: e.target.value || undefined })}
                                        placeholder={auto.choiceLabel ? `automatikus: ${auto.choiceLabel}` : 'pl. 3 db'}
                                        className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 text-sm"
                                      />
                                    </label>
                                    <label className="flex items-center gap-2 text-sm cursor-pointer sm:pt-5">
                                      <input
                                        type="checkbox"
                                        checked={Boolean(currentMaterial.choiceMulti)}
                                        onChange={(e) => updateMaterial(activeMaterialIdx, { choiceMulti: e.target.checked })}
                                      />
                                      Több is választható a csoportból
                                    </label>
                                  </div>
                                </div>
                              );
                            })()}
                          </div>
                        </details>


                        )}
                        {itemTab === 'pricing' && (<>
                        {currentMaterial.priceSource && (() => {
                          const srcTpl = templates.find((t) => t.id === currentMaterial.priceSource!.templateId);
                          const srcMat = srcTpl?.materials.find((m) => m.id === currentMaterial.priceSource!.materialId);
                          return (
                            <div className="rounded-xl border border-sky-200 bg-sky-50 p-3 text-[13px] text-slate-700 space-y-1.5">
                              <div className="font-semibold text-slate-950">Az ár egy másik termékből jön</div>
                              <p>
                                Forrás: <b>{srcTpl?.name || 'ismeretlen termék'}</b>
                                {srcMat ? <> → {srcMat.name}</> : null}. Ugyanazzal a táblázattal és szerelési
                                százalékkal számol, mint az önálló termék, így mindenhol ugyanazt az árat adja.
                                A táblázatot a forrásterméknél frissítsd.
                              </p>
                              <button
                                type="button"
                                onClick={() => {
                                  if (window.confirm('Leválasztod? Ezután ez a tétel saját árazással számol.'))
                                    updateMaterial(activeMaterialIdx, { priceSource: undefined });
                                }}
                                className="text-xs underline text-slate-600 hover:text-slate-950"
                              >
                                Leválasztás (saját árazás)
                              </button>
                            </div>
                          );
                        })()}
                        {/* Pricing Mode Selector */}
                        <div>
                          <label className="block text-[13px] font-medium text-slate-700 mb-1.5">
                            Árazás módja
                          </label>
                          {(() => {
                            const hasOtherNonPctBase = tplMaterials.some(
                              (m, i) => i !== activeMaterialIdx && m.pricingMode !== 'percentage' && m.itemRole === 'base'
                            );
                            const current = PRICING_MODE_OPTIONS.find((pm) => pm.id === currentMaterial.pricingMode);
                            return (
                              <>
                                <select
                                  value={currentMaterial.pricingMode}
                                  onChange={(e) =>
                                    updateMaterial(activeMaterialIdx, {
                                      pricingMode: e.target.value as ProductPricingMode,
                                      basePrice: Math.max(1, Number(currentMaterial.basePrice) || 1500),
                                      unitPrice: Math.max(1, Number(currentMaterial.unitPrice) || 350),
                                    })
                                  }
                                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 bg-white text-sm font-medium"
                                >
                                  {PRICING_MODE_OPTIONS.map((pm) => (
                                    <option key={pm.id} value={pm.id} disabled={pm.id === 'percentage' && !hasOtherNonPctBase}>
                                      {pm.label}
                                    </option>
                                  ))}
                                </select>
                                {current?.description && (
                                  <p className="text-xs text-slate-500 mt-1.5">{current.description}</p>
                                )}
                              </>
                            );
                          })()}
                        </div>

                        {/* Dimension Source selector for m² and fm modes */}
                        {['per_m2', 'tiered_m2', 'base_plus_m2', 'per_lm', 'base_plus_lm'].includes(
                          currentMaterial.pricingMode
                        ) && (
                          <div>
                            <label className="block text-[13px] font-medium text-slate-700 mb-1.5">
                              Melyik méretből számolja az algoritmus?
                            </label>
                            <select
                              value={currentMaterial.dimensionSource}
                              onChange={(e) =>
                                updateMaterial(activeMaterialIdx, {
                                  dimensionSource: e.target
                                    .value as DimensionSource,
                                })
                              }
                              className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 bg-white text-sm font-medium"
                            >
                              {DIMENSION_SOURCE_OPTIONS.map((ds) => (
                                <option key={ds.id} value={ds.id}>
                                  {ds.label}
                                </option>
                              ))}
                            </select>
                          </div>
                        )}

                        {/* Mode-specific inputs */}
                        {currentMaterial.pricingMode === 'fixed' && (
                          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 bg-white p-4 rounded-xl border border-slate-200">
                            <div>
                              <label className="block text-xs font-bold text-slate-700 mb-1">
                                Fix Egységár ({currentMaterial.currency}) *
                              </label>
                              <input
                                type="number"
                                min={1}
                                value={currentMaterial.basePrice}
                                onChange={(e) =>
                                  updateMaterial(activeMaterialIdx, {
                                    basePrice: Math.max(
                                      1,
                                      Number(e.target.value) || 1
                                    ),
                                  })
                                }
                                className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm font-bold"
                              />
                            </div>
                            <div>
                              <label className="block text-xs font-bold text-slate-700 mb-1">
                                Alapértelmezett mennyiség
                              </label>
                              <input
                                type="number"
                                min={1}
                                value={currentMaterial.defaultQuantity}
                                onChange={(e) =>
                                  updateMaterial(activeMaterialIdx, {
                                    defaultQuantity: Math.max(
                                      1,
                                      Number(e.target.value) || 1
                                    ),
                                  })
                                }
                                className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm"
                              />
                            </div>
                            <div>
                              <label className="block text-xs font-bold text-slate-700 mb-1">
                                Mennyiségi egység
                              </label>
                              <input
                                type="text"
                                value={currentMaterial.unitLabel}
                                onChange={(e) =>
                                  updateMaterial(activeMaterialIdx, {
                                    unitLabel: e.target.value,
                                  })
                                }
                                placeholder="db / szett"
                                className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm"
                              />
                            </div>
                          </div>
                        )}

                        {(currentMaterial.pricingMode === 'per_m2' ||
                          currentMaterial.pricingMode === 'per_lm') && (
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 bg-white p-4 rounded-xl border border-slate-200">
                            <div>
                              <label className="block text-xs font-bold text-slate-700 mb-1">
                                {currentMaterial.pricingMode === 'per_m2'
                                  ? `Négyzetméter ár (${currentMaterial.currency} / m²) *`
                                  : `Folyóméter ár (${currentMaterial.currency} / fm) *`}
                              </label>
                              <input
                                type="number"
                                min={1}
                                value={currentMaterial.unitPrice}
                                onChange={(e) =>
                                  updateMaterial(activeMaterialIdx, {
                                    unitPrice: Math.max(
                                      1,
                                      Number(e.target.value) || 1
                                    ),
                                  })
                                }
                                className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm font-bold"
                              />
                            </div>
                            <div>
                              <label className="block text-xs font-bold text-slate-700 mb-1">
                                Darabszám szorzó (pl. 1 db)
                              </label>
                              <input
                                type="number"
                                min={1}
                                value={currentMaterial.defaultQuantity}
                                onChange={(e) =>
                                  updateMaterial(activeMaterialIdx, {
                                    defaultQuantity: Math.max(
                                      1,
                                      Number(e.target.value) || 1
                                    ),
                                  })
                                }
                                className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm"
                              />
                            </div>
                          </div>
                        )}

                        {(currentMaterial.pricingMode === 'base_plus_m2' ||
                          currentMaterial.pricingMode === 'base_plus_lm') && (
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 bg-white p-4 rounded-xl border border-slate-200">
                            <div>
                              <label className="block text-xs font-bold text-slate-700 mb-1">
                                Fix Induló Alapár ({currentMaterial.currency}) *
                              </label>
                              <input
                                type="number"
                                min={1}
                                value={currentMaterial.basePrice}
                                onChange={(e) =>
                                  updateMaterial(activeMaterialIdx, {
                                    basePrice: Math.max(
                                      1,
                                      Number(e.target.value) || 1
                                    ),
                                  })
                                }
                                className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm font-bold"
                              />
                            </div>
                            <div>
                              <label className="block text-xs font-bold text-slate-700 mb-1">
                                {currentMaterial.pricingMode === 'base_plus_m2'
                                  ? `+ Négyzetméter díj (${currentMaterial.currency} / m²) *`
                                  : `+ Folyóméter díj (${currentMaterial.currency} / fm) *`}
                              </label>
                              <input
                                type="number"
                                min={1}
                                value={currentMaterial.unitPrice}
                                onChange={(e) =>
                                  updateMaterial(activeMaterialIdx, {
                                    unitPrice: Math.max(
                                      1,
                                      Number(e.target.value) || 1
                                    ),
                                  })
                                }
                                className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm font-bold"
                              />
                            </div>
                          </div>
                        )}

                        {currentMaterial.pricingMode === 'tiered_m2' && (
                          <div className="bg-white p-4 rounded-xl border border-slate-200 space-y-3">
                            <div className="flex items-center justify-between">
                              <span className="text-xs font-bold text-slate-800">
                                Sávos m² ártábla ({currentMaterial.currency} / m²)
                              </span>
                              <button
                                type="button"
                                onClick={() => {
                                  const tiers: M2PriceTier[] = [
                                    ...(currentMaterial.m2Tiers || []),
                                    { maxM2: 50, pricePerM2: 300 },
                                  ];
                                  updateMaterial(activeMaterialIdx, {
                                    m2Tiers: tiers,
                                  });
                                }}
                                className="px-2.5 py-1 rounded-lg bg-emerald-50 text-emerald-700 text-xs font-bold border border-emerald-200"
                              >
                                + Új m² sáv
                              </button>
                            </div>
                            <div className="space-y-2">
                              {(currentMaterial.m2Tiers || []).map(
                                (tier, tIdx) => (
                                  <div
                                    key={tIdx}
                                    className="flex items-center gap-3"
                                  >
                                    <div className="flex-1">
                                      <label className="block text-xs text-slate-500">
                                        Max felület (m²-ig)
                                      </label>
                                      <input
                                        type="number"
                                        min={1}
                                        step="0.5"
                                        value={tier.maxM2}
                                        onChange={(e) => {
                                          const next = [
                                            ...(currentMaterial.m2Tiers || []),
                                          ];
                                          next[tIdx] = {
                                            ...next[tIdx],
                                            maxM2: Math.max(
                                              1,
                                              Number(e.target.value) || 1
                                            ),
                                          };
                                          updateMaterial(activeMaterialIdx, {
                                            m2Tiers: next,
                                          });
                                        }}
                                        className="w-full px-3 py-1.5 rounded-lg border border-slate-300 text-sm"
                                      />
                                    </div>
                                    <div className="flex-1">
                                      <label className="block text-xs text-slate-500">
                                        Egységár ({currentMaterial.currency}/m²) *
                                      </label>
                                      <input
                                        type="number"
                                        min={1}
                                        step="0.5"
                                        value={tier.pricePerM2}
                                        onChange={(e) => {
                                          const next = [
                                            ...(currentMaterial.m2Tiers || []),
                                          ];
                                          next[tIdx] = {
                                            ...next[tIdx],
                                            pricePerM2: Math.max(
                                              1,
                                              Number(e.target.value) || 1
                                            ),
                                          };
                                          updateMaterial(activeMaterialIdx, {
                                            m2Tiers: next,
                                          });
                                        }}
                                        className="w-full px-3 py-1.5 rounded-lg border border-slate-300 text-sm font-bold"
                                      />
                                    </div>
                                    {(currentMaterial.m2Tiers || []).length >
                                      1 && (
                                      <button
                                        type="button"
                                        onClick={() => {
                                          const next = (
                                            currentMaterial.m2Tiers || []
                                          ).filter((_, i) => i !== tIdx);
                                          updateMaterial(activeMaterialIdx, {
                                            m2Tiers: next,
                                          });
                                        }}
                                        className="mt-4 p-1.5 text-rose-500 hover:bg-rose-50 rounded-lg"
                                      >
                                        <Trash2 className="w-4 h-4" />
                                      </button>
                                    )}
                                  </div>
                                )
                              )}
                            </div>
                          </div>
                        )}

                        {currentMaterial.pricingMode === 'matrix_cm' && (
                          <div className="bg-white p-4 rounded-xl border border-slate-200 space-y-3">
                            <div className="text-sm font-semibold text-slate-950">
                              Mérettábla (szélesség × kinyúlás, cm)
                            </div>

                            <details className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                              <summary className="cursor-pointer text-sm text-slate-700 select-none">
                                Táblázat beillesztése az ár PDF-ből / Excelből
                              </summary>
                              <div className="mt-2 space-y-2">
                                <p className="text-xs text-slate-500">
                                  Első sor: szélességek (cm). Minden további sor: kinyúlás (cm),
                                  majd az árak. A meglévő táblát felülírja.
                                </p>
                                <textarea
                                  rows={5}
                                  value={matrixPasteText}
                                  onChange={(e) => {
                                    setMatrixPasteText(e.target.value);
                                    setMatrixPasteError('');
                                  }}
                                  placeholder={'cm\t300\t400\t500\n250\t2.200\t2.600\t3.100\n300\t2.500\t2.950\t3.500'}
                                  className="w-full px-3 py-2 rounded-lg border border-slate-300 bg-white font-mono text-xs"
                                />
                                <div className="flex items-center gap-3">
                                  <button
                                    type="button"
                                    onClick={() => {
                                      const parsed = parseMatrixPaste(matrixPasteText, {
                                        rowLabel: currentMaterial.matrixTable?.rowLabel,
                                        colLabel: currentMaterial.matrixTable?.colLabel,
                                      });
                                      if (!parsed) {
                                        setMatrixPasteError(
                                          'Nem sikerült beolvasni. Ellenőrizd, hogy az első sor a szélességeket tartalmazza.'
                                        );
                                        return;
                                      }
                                      updateMaterial(activeMaterialIdx, { matrixTable: parsed });
                                      setMatrixPasteText('');
                                      setMatrixPasteError(
                                        `Beolvasva: ${parsed.rows.length} sor × ${parsed.cols.length} oszlop`
                                      );
                                    }}
                                    className={btn.secondary}
                                  >
                                    Beolvasás
                                  </button>
                                  {matrixPasteError && (
                                    <span className="text-xs text-slate-600">
                                      {matrixPasteError}
                                    </span>
                                  )}
                                </div>
                              </div>
                            </details>
                            <div className="flex flex-wrap items-center gap-2">
                              <input
                                type="number"
                                value={newMatrixRowInput}
                                onChange={(e) =>
                                  setNewMatrixRowInput(e.target.value)
                                }
                                placeholder="Új sor (Kinyúlás cm, pl. 450)"
                                className="px-3 py-1.5 rounded-lg border border-slate-300 text-xs w-48"
                              />
                              <button
                                type="button"
                                onClick={() => {
                                  const val = Number(newMatrixRowInput);
                                  if (!val || val <= 0) return;
                                  const mt: CustomMatrixTable =
                                    currentMaterial.matrixTable || {
                                      rowLabel: 'Kinyúlás (cm)',
                                      colLabel: 'Szélesség (cm)',
                                      rows: [300],
                                      cols: [400],
                                      values: {},
                                    };
                                  if (!mt.rows.includes(val)) {
                                    const nextRows = [...mt.rows, val].sort(
                                      (a, b) => a - b
                                    );
                                    updateMaterial(activeMaterialIdx, {
                                      matrixTable: { ...mt, rows: nextRows },
                                    });
                                  }
                                  setNewMatrixRowInput('');
                                }}
                                className="px-3 py-1.5 rounded-lg bg-slate-900 text-white text-xs font-semibold"
                              >
                                + Sor (Kinyúlás cm)
                              </button>

                              <input
                                type="number"
                                value={newMatrixColInput}
                                onChange={(e) =>
                                  setNewMatrixColInput(e.target.value)
                                }
                                placeholder="Új oszlop (Szélesség cm, pl. 700)"
                                className="px-3 py-1.5 rounded-lg border border-slate-300 text-xs w-48"
                              />
                              <button
                                type="button"
                                onClick={() => {
                                  const val = Number(newMatrixColInput);
                                  if (!val || val <= 0) return;
                                  const mt: CustomMatrixTable =
                                    currentMaterial.matrixTable || {
                                      rowLabel: 'Kinyúlás (cm)',
                                      colLabel: 'Szélesség (cm)',
                                      rows: [300],
                                      cols: [400],
                                      values: {},
                                    };
                                  if (!mt.cols.includes(val)) {
                                    const nextCols = [...mt.cols, val].sort(
                                      (a, b) => a - b
                                    );
                                    updateMaterial(activeMaterialIdx, {
                                      matrixTable: { ...mt, cols: nextCols },
                                    });
                                  }
                                  setNewMatrixColInput('');
                                }}
                                className="px-3 py-1.5 rounded-lg bg-slate-900 text-white text-xs font-semibold"
                              >
                                + Oszlop (Szélesség cm)
                              </button>
                            </div>

                            <div className="overflow-x-auto">
                              <table className="w-full text-xs border-collapse">
                                <thead>
                                  <tr className="bg-slate-100">
                                    <th className="border border-slate-300 p-2 text-left">
                                      Kinyúlás \ Szélesség
                                    </th>
                                    {(
                                      currentMaterial.matrixTable?.cols || []
                                    ).map((c) => (
                                      <th
                                        key={c}
                                        className="border border-slate-300 p-2 text-center"
                                      >
                                        <div className="flex items-center justify-center gap-1">
                                          <span>{c} cm</span>
                                          {(currentMaterial.matrixTable?.cols
                                            .length || 0) > 1 && (
                                            <button
                                              type="button"
                                              onClick={() => {
                                                const mt =
                                                  currentMaterial.matrixTable!;
                                                updateMaterial(
                                                  activeMaterialIdx,
                                                  {
                                                    matrixTable: {
                                                      ...mt,
                                                      cols: mt.cols.filter(
                                                        (x) => x !== c
                                                      ),
                                                    },
                                                  }
                                                );
                                              }}
                                              className="text-rose-500 hover:text-rose-700"
                                            >
                                              ×
                                            </button>
                                          )}
                                        </div>
                                      </th>
                                    ))}
                                  </tr>
                                </thead>
                                <tbody>
                                  {(
                                    currentMaterial.matrixTable?.rows || []
                                  ).map((r) => (
                                    <tr key={r}>
                                      <td className="border border-slate-300 p-2 font-bold bg-slate-50">
                                        <div className="flex items-center justify-between">
                                          <span>{r} cm</span>
                                          {(currentMaterial.matrixTable?.rows
                                            .length || 0) > 1 && (
                                            <button
                                              type="button"
                                              onClick={() => {
                                                const mt =
                                                  currentMaterial.matrixTable!;
                                                updateMaterial(
                                                  activeMaterialIdx,
                                                  {
                                                    matrixTable: {
                                                      ...mt,
                                                      rows: mt.rows.filter(
                                                        (x) => x !== r
                                                      ),
                                                    },
                                                  }
                                                );
                                              }}
                                              className="text-rose-500 hover:text-rose-700"
                                            >
                                              ×
                                            </button>
                                          )}
                                        </div>
                                      </td>
                                      {(
                                        currentMaterial.matrixTable?.cols || []
                                      ).map((c) => {
                                        const cellVal =
                                          currentMaterial.matrixTable?.values?.[
                                            String(r)
                                          ]?.[String(c)] ?? 2500;
                                        return (
                                          <td
                                            key={c}
                                            className="border border-slate-300 p-1"
                                          >
                                            <input
                                              type="number"
                                              min={1}
                                              value={cellVal}
                                              onChange={(e) => {
                                                const mt =
                                                  currentMaterial.matrixTable!;
                                                const nextValues = {
                                                  ...(mt.values || {}),
                                                  [String(r)]: {
                                                    ...(mt.values?.[
                                                      String(r)
                                                    ] || {}),
                                                    [String(c)]: Math.max(
                                                      1,
                                                      Number(e.target.value) ||
                                                        1
                                                    ),
                                                  },
                                                };
                                                updateMaterial(
                                                  activeMaterialIdx,
                                                  {
                                                    matrixTable: {
                                                      ...mt,
                                                      values: nextValues,
                                                    },
                                                  }
                                                );
                                              }}
                                              className="w-20 px-1.5 py-1 rounded border border-slate-200 text-right font-semibold"
                                            />
                                          </td>
                                        );
                                      })}
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          </div>
                        )}

                        {currentMaterial.pricingMode === 'percentage' && (
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 bg-white p-4 rounded-xl border border-slate-200">
                            <div>
                              <label className="block text-xs font-bold text-slate-700 mb-1">
                                Százalékos kulcs (% az alaptételek összegéből) *
                              </label>
                              <input
                                type="number"
                                min={1}
                                step="0.5"
                                value={currentMaterial.percentageRate}
                                onChange={(e) =>
                                  updateMaterial(activeMaterialIdx, {
                                    percentageRate: Math.max(
                                      1,
                                      Number(e.target.value) || 1
                                    ),
                                  })
                                }
                                className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm font-bold"
                              />
                            </div>
                            <div>
                              <label className="block text-xs font-bold text-slate-700 mb-1">
                                Minimum díj ({currentMaterial.currency}) *
                              </label>
                              <input
                                type="number"
                                min={1}
                                value={currentMaterial.minPrice}
                                onChange={(e) =>
                                  updateMaterial(activeMaterialIdx, {
                                    minPrice: Math.max(
                                      1,
                                      Number(e.target.value) || 1
                                    ),
                                  })
                                }
                                className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm"
                              />
                            </div>
                          </div>
                        )}

                        {/* Multipliers & Surcharges */}
                        <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 bg-white p-4 rounded-xl border border-slate-200">
                          <div>
                            <label className="block text-xs font-bold text-slate-600 mb-1">
                              Árszorzó (pl. 1.0 vagy 0.66)
                            </label>
                            <input
                              type="number"
                              min={0.05}
                              step="0.01"
                              value={currentMaterial.multiplier}
                              onChange={(e) =>
                                updateMaterial(activeMaterialIdx, {
                                  multiplier: Math.max(
                                    0.05,
                                    Number(e.target.value) || 1
                                  ),
                                })
                              }
                              className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 text-sm"
                            />
                          </div>
                          <div>
                            <label className="block text-xs font-bold text-slate-600 mb-1">
                              Extra kedvezmény (%)
                            </label>
                            <input
                              type="number"
                              min={0}
                              max={90}
                              value={currentMaterial.extraDiscountPct}
                              onChange={(e) =>
                                updateMaterial(activeMaterialIdx, {
                                  extraDiscountPct: Math.min(
                                    90,
                                    Math.max(0, Number(e.target.value) || 0)
                                  ),
                                })
                              }
                              className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 text-sm"
                            />
                          </div>
                          <div>
                            <label className="block text-xs font-bold text-slate-600 mb-1">
                              Fix felár (+ {currentMaterial.currency})
                            </label>
                            <input
                              type="number"
                              min={0}
                              value={currentMaterial.fixedSurcharge}
                              onChange={(e) =>
                                updateMaterial(activeMaterialIdx, {
                                  fixedSurcharge: Math.max(
                                    0,
                                    Number(e.target.value) || 0
                                  ),
                                })
                              }
                              className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 text-sm"
                            />
                          </div>
                          <div>
                            <label className="block text-xs font-bold text-slate-600 mb-1">
                              Listaár szorzó (pl. 1.25)
                            </label>
                            <input
                              type="number"
                              min={1}
                              step="0.05"
                              value={currentMaterial.listPriceMultiplier}
                              onChange={(e) =>
                                updateMaterial(activeMaterialIdx, {
                                  listPriceMultiplier: Math.max(
                                    1,
                                    Number(e.target.value) || 1.25
                                  ),
                                })
                              }
                              className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 text-sm"
                            />
                          </div>
                        </div>

                        </>)}
                        {itemTab === 'media' && (<>
                        {/* Színválaszték (pl. alapszínek, RAL színek) - a PDF-ben színmintaként */}
                        <div className="bg-white p-4 rounded-xl border border-slate-200 space-y-2">
                          <div className="text-sm font-semibold text-slate-950">Színek</div>
                          <p className="text-xs text-slate-500">
                            Kód és mintaszín - a PDF-ben színmintaként jelenik meg, ha a tétel az ajánlatban van.
                          </p>
                          <ColorOptionsEditor
                            colors={currentMaterial.colorOptions || []}
                            onChange={(next) =>
                              updateMaterial(activeMaterialIdx, { colorOptions: next })
                            }
                            title={currentMaterial.colorTitle}
                            onTitleChange={(t) =>
                              updateMaterial(activeMaterialIdx, { colorTitle: t })
                            }
                          />
                        </div>

                        {/* Product-Specific Photos & Captions below Photo */}
                        <div className="bg-white p-4 rounded-xl border border-slate-200 space-y-3">
                          <div className="flex items-center justify-between flex-wrap gap-2">
                            <div>
                              <div className="text-xs font-bold text-slate-900">
                                Ehhez a termékhez csatolt fotók és fotó alatti szövegdobozok
                              </div>
                              <div className="text-xs text-slate-500">
                                Felcsatolhatsz fotót közvetlenül ehhez a termékhez, és a fotó alá külön szöveget írhatsz!
                              </div>
                            </div>
                            <label className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold cursor-pointer">
                              <Upload className="w-3.5 h-3.5" />
                              {uploadingPhoto
                                ? 'Feltöltés...'
                                : '+ Fotó feltöltése a termékhez'}
                              <input
                                type="file"
                                accept="image/*"
                                className="hidden"
                                onChange={async (e) => {
                                  const file = e.target.files?.[0];
                                  if (!file) return;
                                  setUploadingPhoto(true);
                                  try {
                                    const url = await onUploadImage(file);
                                    if (url) {
                                      const nextPhotos: PhotoCaptionBlock[] = [
                                        ...(currentMaterial.photos || []),
                                        {
                                          id: `mphoto_${Date.now()}`,
                                          imageUrl: url,
                                          titleAbove: currentMaterial.name,
                                          captionBelow: '',
                                          widthPct: 70,
                                          align: 'center',
                                        },
                                      ];
                                      updateMaterial(activeMaterialIdx, {
                                        photos: nextPhotos,
                                      });
                                    }
                                  } finally {
                                    setUploadingPhoto(false);
                                    e.target.value = '';
                                  }
                                }}
                              />
                            </label>
                          </div>

                          {(currentMaterial.photos || []).map((ph, pIdx) => (
                            <div
                              key={ph.id}
                              className="p-3 rounded-xl bg-slate-50 border border-slate-200 flex flex-col sm:flex-row gap-3"
                            >
                              {ph.imageUrl && (
                                <img
                                  src={thumbUrl(ph.imageUrl)}
                                  loading="lazy"
                                  decoding="async"
                                  alt=""
                                  className="w-40 h-28 object-contain bg-white rounded-lg border border-slate-200 shrink-0"
                                />
                              )}
                              <div className="flex-1 space-y-2">
                                <input
                                  type="text"
                                  value={ph.titleAbove || ''}
                                  onChange={(e) => {
                                    const next = [
                                      ...(currentMaterial.photos || []),
                                    ];
                                    next[pIdx] = {
                                      ...next[pIdx],
                                      titleAbove: e.target.value,
                                    };
                                    updateMaterial(activeMaterialIdx, {
                                      photos: next,
                                    });
                                  }}
                                  placeholder="Fotó feletti cím (opcionális)"
                                  className="w-full px-3 py-1.5 rounded-lg border border-slate-300 bg-white text-xs font-semibold"
                                />
                                <textarea
                                  rows={2}
                                  value={ph.captionBelow}
                                  onChange={(e) => {
                                    const next = [
                                      ...(currentMaterial.photos || []),
                                    ];
                                    next[pIdx] = {
                                      ...next[pIdx],
                                      captionBelow: e.target.value,
                                    };
                                    updateMaterial(activeMaterialIdx, {
                                      photos: next,
                                    });
                                  }}
                                  placeholder="Szövegdoboz a fotó alá: írd ide a termék/anyag részletes leírását..."
                                  className="w-full px-3 py-1.5 rounded-lg border border-slate-300 bg-white text-xs"
                                />
                              </div>
                              <button
                                type="button"
                                onClick={() => {
                                  const next = (
                                    currentMaterial.photos || []
                                  ).filter((_, i) => i !== pIdx);
                                  updateMaterial(activeMaterialIdx, {
                                    photos: next,
                                  });
                                }}
                                className="p-1.5 text-rose-500 hover:bg-rose-50 rounded-lg self-start"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </div>
                          ))}
                        </div>
                        </>)}
                      </div>
                    ) : null}
                  </div>
                </div>
              )}

              {/* STEP 3: SABLON FOTÓK ÉS KÉPALÁÍRÁS SZÖVEGDOBOZOK */}
              {wizardStep === 3 && (
                <div className="space-y-5">
                  <div className="flex items-center justify-between flex-wrap gap-3 bg-slate-50 p-4 rounded-2xl border border-slate-200">
                    <div>
                      <h3 className="text-base font-bold text-slate-900">
                        Sablon Fotók és Fotó alatti Szövegdobozok ({tplPhotos.length} db)
                      </h3>
                      <p className="text-xs text-slate-600">
                        Tölts fel tetszőleges számú referenciafotót vagy műszaki
                        képet a sablonhoz, és írj szöveget közvetlenül a fotók
                        alatti szövegdobozba!
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <label className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold cursor-pointer shadow-sm">
                        <Upload className="w-4 h-4" />
                        {uploadingPhoto
                          ? 'Feltöltés...'
                          : '+ Új Fotó Feltöltése a gépről'}
                        <input
                          type="file"
                          accept="image/*"
                          className="hidden"
                          onChange={async (e) => {
                            const file = e.target.files?.[0];
                            if (!file) return;
                            setUploadingPhoto(true);
                            try {
                              const url = await onUploadImage(file);
                              if (url) {
                                setTplPhotos((prev) => [
                                  ...prev,
                                  {
                                    id: `sphoto_${Date.now()}`,
                                    imageUrl: url,
                                    titleAbove: '',
                                    captionBelow: '',
                                    widthPct: 75,
                                    align: 'center',
                                  },
                                ]);
                              }
                            } finally {
                              setUploadingPhoto(false);
                              e.target.value = '';
                            }
                          }}
                        />
                      </label>
                    </div>
                  </div>

                  {/* Media Library quick picker if user already uploaded images */}
                  {mediaLibrary.length > 0 && (
                    <div className="bg-white p-4 rounded-xl border border-slate-200">
                      <div className="text-xs font-bold text-slate-700 mb-2">
                        Korábban feltöltött képek (kattints a hozzáadáshoz):
                      </div>
                      <div className="flex items-center gap-2 overflow-x-auto pb-1">
                        {mediaLibrary.map((m) => (
                          <button
                            key={m.id}
                            type="button"
                            onClick={() =>
                              setTplPhotos((prev) => [
                                ...prev,
                                {
                                  id: `sphoto_${Date.now()}_${Math.random()
                                    .toString(36)
                                    .slice(2, 5)}`,
                                  imageUrl: m.url,
                                  titleAbove: '',
                                  captionBelow: '',
                                  widthPct: 75,
                                  align: 'center',
                                },
                              ])
                            }
                            className="group relative w-20 h-16 rounded-lg overflow-hidden border border-slate-200 hover:border-emerald-500 shrink-0"
                          >
                            <img
                              src={thumbUrl(m.url)}
                              loading="lazy"
                              decoding="async"
                              alt={m.originalName}
                              className="w-full h-full object-cover"
                            />
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {tplPhotos.length === 0 ? (
                    <div className="text-center py-10 border-2 border-dashed border-slate-200 rounded-2xl text-slate-500 text-sm">
                      Még nincs fotó csatolva ehhez a sablonhoz. Kattints a „+
                      Új Fotó Feltöltése” gombra!
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {tplPhotos.map((ph, idx) => {
                        const patch = (p: Partial<typeof ph>) =>
                          setTplPhotos((prev) => prev.map((x, i) => (i === idx ? { ...x, ...p } : x)));
                        const move = (dir: -1 | 1) =>
                          setTplPhotos((prev) => {
                            const j = idx + dir;
                            if (j < 0 || j >= prev.length) return prev;
                            const next = [...prev];
                            [next[idx], next[j]] = [next[j], next[idx]];
                            return next;
                          });
                        const subs = ph.subPhotos || [];
                        return (
                          <div key={ph.id} className="p-3 sm:p-4 rounded-2xl border border-slate-200 bg-white space-y-3">
                            <div className="flex flex-col sm:flex-row gap-3">
                              <img
                                src={thumbUrl(ph.imageUrl)}
                                loading="lazy"
                                decoding="async"
                                alt=""
                                className="w-full sm:w-48 h-36 object-cover rounded-xl border border-slate-200 shrink-0"
                              />
                              <div className="min-w-0 flex-1 space-y-2">
                                <div className="flex items-center justify-between gap-2">
                                  <span className="text-sm font-semibold text-slate-950">
                                    {idx === 0 ? '1. fotó (borítókép)' : `${idx + 1}. fotó`}
                                  </span>
                                  <div className="flex items-center gap-1">
                                    <button type="button" onClick={() => move(-1)} disabled={idx === 0} className={btn.ghost} title="Feljebb">
                                      ↑
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => move(1)}
                                      disabled={idx === tplPhotos.length - 1}
                                      className={btn.ghost}
                                      title="Lejjebb"
                                    >
                                      ↓
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => {
                                        if (window.confirm('Törlöd ezt a fotót (a részletképeivel együtt)?'))
                                          setTplPhotos((prev) => prev.filter((_, i) => i !== idx));
                                      }}
                                      className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-sm text-rose-600 hover:bg-rose-50"
                                    >
                                      <Trash2 className="w-4 h-4" />
                                      Törlés
                                    </button>
                                  </div>
                                </div>
                                <input
                                  type="text"
                                  value={ph.titleAbove || ''}
                                  onChange={(e) => patch({ titleAbove: e.target.value })}
                                  placeholder="Cím a fotó felett (nem kötelező)"
                                  className="w-full px-3 py-2 rounded-xl border border-slate-300 text-sm"
                                />
                                <AutoTextarea
                                  value={ph.captionBelow || ''}
                                  onChange={(e) => patch({ captionBelow: e.target.value })}
                                  placeholder="Szöveg a fotó alatt (nem kötelező)"
                                  className="w-full px-3 py-2 rounded-xl border border-slate-300 text-sm"
                                />
                                <label className="flex items-center gap-2 text-xs text-slate-600">
                                  Méret a PDF-ben: {ph.widthPct || 75}%
                                  <input
                                    type="range"
                                    min={35}
                                    max={100}
                                    value={ph.widthPct || 75}
                                    onChange={(e) => patch({ widthPct: Number(e.target.value) })}
                                    className="w-28"
                                  />
                                </label>
                              </div>
                            </div>
                            {/* Részletképek a fotó alatt (pl. LED, műszaki rajz, színek) */}
                            <div className="border-t border-slate-100 pt-3">
                              <div className="text-xs font-medium text-slate-500 mb-2">
                                Részletképek a fotó alatt ({subs.length})
                              </div>
                              <div className="flex flex-wrap gap-2">
                                {subs.map((sp, si) => (
                                  <div key={sp.id || si} className="relative w-24">
                                    <img
                                      src={thumbUrl(sp.imageUrl)}
                                      loading="lazy"
                                      alt=""
                                      className="w-24 h-16 object-cover rounded-lg border border-slate-200"
                                    />
                                    <button
                                      type="button"
                                      onClick={() => patch({ subPhotos: subs.filter((_, i) => i !== si) })}
                                      className="absolute -top-2 -right-2 w-6 h-6 rounded-full bg-white border border-slate-300 text-rose-600 grid place-items-center shadow-sm hover:bg-rose-50"
                                      title="Részletkép törlése"
                                      aria-label="Részletkép törlése"
                                    >
                                      <X className="w-3.5 h-3.5" />
                                    </button>
                                    {sp.captionBelow && (
                                      <div className="mt-1 text-[11px] text-slate-500 leading-tight line-clamp-2">{sp.captionBelow}</div>
                                    )}
                                  </div>
                                ))}
                                <label className="w-24 h-16 rounded-lg border-2 border-dashed border-slate-300 text-slate-500 text-xs grid place-items-center cursor-pointer hover:border-slate-500 text-center px-1">
                                  + Részletkép
                                  <input
                                    type="file"
                                    accept="image/*"
                                    className="hidden"
                                    onChange={async (e) => {
                                      const file = e.target.files?.[0];
                                      if (!file) return;
                                      setUploadingPhoto(true);
                                      try {
                                        const url = await onUploadImage(file);
                                        if (url)
                                          patch({
                                            subPhotos: [...subs, { id: `sub_${Date.now()}`, imageUrl: url, captionBelow: '' }],
                                          });
                                      } finally {
                                        setUploadingPhoto(false);
                                        e.target.value = '';
                                      }
                                    }}
                                  />
                                </label>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}

              {/* STEP 4: SZÖVEGDOBOZOK ÉS NÉV-AUTOMATIZÁCIÓ */}
              {wizardStep === 4 && (
                <div className="space-y-5">
                  <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-4">
                    <div className="text-xs font-bold text-emerald-950 mb-1.5">
                      Automatikus Név- és Méret-behelyettesítő Változók:
                    </div>
                    <p className="text-xs text-emerald-800 mb-2">
                      Bármelyik szövegdobozba beírhatod az alábbi címkéket, és az
                      árajánlat készítésekor a rendszer automatikusan
                      behelyettesíti az ügyfél nevét, a méreteket és a
                      települést:
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      {TEMPLATE_VARIABLES_HELP.map((v) => (
                        <span
                          key={v.token}
                          className="px-2 py-1 rounded-lg bg-white text-emerald-900 border border-emerald-300 text-xs font-mono font-semibold"
                          title={v.label}
                        >
                          {v.token} - {v.label}
                        </span>
                      ))}
                    </div>
                  </div>

                  <div>
                    <label className="block text-[13px] font-medium text-slate-700 mb-1.5">
                      Sablon Bevezető Szövegdoboza (a fotók és a táblázat előtt)
                    </label>
                    <textarea
                      rows={3}
                      value={tplIntroText}
                      onChange={(e) => setTplIntroText(e.target.value)}
                      placeholder="pl. A(z) {{meret_m}} ({{meret}}) méretű szerkezetet {{beepites}} kivitelben ajánljuk..."
                      className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-sm"
                    />
                  </div>

                  {/* Standalone Custom Text Blocks */}
                  <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200 space-y-3">
                    <div className="flex items-center justify-between">
                      <div>
                        <h4 className="text-sm font-bold text-slate-900">
                          Különálló Szövegrészek / Szövegdobozok ({tplTextBlocks.length} db)
                        </h4>
                        <p className="text-xs text-slate-500">
                          Ide bármennyi külön szövegdobozt felvehetsz, ahová csak
                          szöveget írsz (pl. műszaki leírás, garancia, színek).
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() =>
                          setTplTextBlocks((prev) => [
                            ...prev,
                            {
                              id: `tb_${Date.now()}`,
                              title: '',
                              content: '',
                              position: 'after_table',
                            },
                          ])
                        }
                        className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-slate-900 text-white text-xs font-semibold"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        + Új Külön Szövegdoboz
                      </button>
                    </div>

                    {tplTextBlocks.map((tb, idx) => (
                      <div
                        key={tb.id}
                        className="bg-white p-3.5 rounded-xl border border-slate-200 space-y-2.5"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <input
                            type="text"
                            value={tb.title || ''}
                            onChange={(e) => {
                              const next = [...tplTextBlocks];
                              next[idx] = {
                                ...next[idx],
                                title: e.target.value,
                              };
                              setTplTextBlocks(next);
                            }}
                            placeholder="Szövegdoboz címe (opcionális)"
                            className="flex-1 px-3 py-1.5 rounded-lg border border-slate-300 text-xs font-bold"
                          />
                          <select
                            value={tb.position}
                            onChange={(e) => {
                              const next = [...tplTextBlocks];
                              next[idx] = {
                                ...next[idx],
                                position: e.target.value as any,
                              };
                              setTplTextBlocks(next);
                            }}
                            className="px-2.5 py-1.5 rounded-lg border border-slate-300 text-xs"
                          >
                            <option value="before_photos">Fotók előtt</option>
                            <option value="before_table">Táblázat előtt</option>
                            <option value="after_table">Táblázat után</option>
                          </select>
                          <button
                            type="button"
                            onClick={() =>
                              setTplTextBlocks((prev) =>
                                prev.filter((_, i) => i !== idx)
                              )
                            }
                            className="p-1.5 text-rose-500 hover:bg-rose-50 rounded-lg"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                        <textarea
                          rows={3}
                          value={tb.content}
                          onChange={(e) => {
                            const next = [...tplTextBlocks];
                            next[idx] = {
                              ...next[idx],
                              content: e.target.value,
                            };
                            setTplTextBlocks(next);
                          }}
                          placeholder="Írd ide a szabad szöveget..."
                          className="w-full px-3 py-2 rounded-lg border border-slate-300 text-xs"
                        />
                      </div>
                    ))}
                  </div>

                  <div>
                    <label className="block text-[13px] font-medium text-slate-700 mb-1.5">
                      Sablon Záró Szövegdoboza (az ártáblázat alatt)
                    </label>
                    <textarea
                      rows={3}
                      value={tplClosingText}
                      onChange={(e) => setTplClosingText(e.target.value)}
                      placeholder="pl. A tartószerkezetek RAL alapszínei felár nélkül választhatóak..."
                      className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-sm"
                    />
                  </div>

                  <div>
                    <label className="block text-[13px] font-medium text-slate-700 mb-1">
                      Saját „Információ” blokk (nem kötelező)
                    </label>
                    <p className="text-xs text-slate-500 mb-1.5">
                      Ha kitöltöd, és ez a termék az ajánlat első terméke, az ajánlat végén a
                      Beállításokban megadott általános feltételek helyett ez jelenik meg
                      (pl. más garancia, átfutási idő vagy fizetési feltétel). Üresen hagyva az
                      általános szöveg marad.
                    </p>
                    <AutoTextarea
                      value={tplInfoText}
                      onChange={(e) => setTplInfoText(e.target.value)}
                      placeholder="pl. • Garancia: a motorokra, vezérlőkre 3 év; a szövetekre 5 év"
                      className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-sm"
                    />
                  </div>
                </div>
              )}

              {/* STEP 5: ÉLŐ TESZT & MENTÉS */}
              {wizardStep === 5 && (
                <div className="space-y-5">
                  <div className="bg-slate-50 border border-slate-200 p-5 rounded-2xl flex flex-wrap items-end justify-between gap-4">
                    <div>
                      <h3 className="text-base font-semibold text-slate-950">
                        Próba
                      </h3>
                      <p className="text-[13px] text-slate-500">
                        Így számol a sablon más méretekkel.
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-3">
                      <div>
                        <label className="block text-[13px] font-medium text-slate-700 mb-1">
                          Teszt Ügyfélnév
                        </label>
                        <input
                          type="text"
                          value={testCustomerName}
                          onChange={(e) => setTestCustomerName(e.target.value)}
                          className="px-3 py-1.5 rounded-lg bg-white border border-slate-300 text-sm w-36"
                        />
                      </div>
                      <div>
                        <label className="block text-[13px] font-medium text-slate-700 mb-1">
                          Szélesség (cm)
                        </label>
                        <input
                          type="number"
                          value={testWidthCm}
                          onChange={(e) =>
                            setTestWidthCm(Number(e.target.value))
                          }
                          className="px-3 py-1.5 rounded-lg bg-white border border-slate-300 text-sm w-24"
                        />
                      </div>
                      <div>
                        <label className="block text-[13px] font-medium text-slate-700 mb-1">
                          Kinyúlás (cm)
                        </label>
                        <input
                          type="number"
                          value={testProjCm}
                          onChange={(e) =>
                            setTestProjCm(Number(e.target.value))
                          }
                          className="px-3 py-1.5 rounded-lg bg-white border border-slate-300 text-sm w-24"
                        />
                      </div>
                      <div>
                        <label className="block text-[13px] font-medium text-slate-700 mb-1">
                          Magasság (cm)
                        </label>
                        <input
                          type="number"
                          value={testHeightCm}
                          onChange={(e) =>
                            setTestHeightCm(Number(e.target.value))
                          }
                          className="px-3 py-1.5 rounded-lg bg-white border border-slate-300 text-sm w-24"
                        />
                      </div>
                    </div>
                  </div>

                  {/* Preview Card */}
                  <div className="bg-white rounded-2xl border border-slate-200 p-6 space-y-4 shadow-sm">
                    <div className="text-sm font-bold text-slate-900">
                      {replaceTemplateVariables(
                        `Kedves {{megszolitas}}! - ${
                          tplName || 'Új Sablon'
                        } ({{meret_m}} / {{meret}})`,
                        {
                          customerName: testCustomerName,
                          greetingName: testCustomerName,
                          widthCm: testWidthCm,
                          projectionCm: testProjCm,
                          heightCm: testHeightCm,
                        }
                      )}
                    </div>
                    {tplIntroText && (
                      <p className="text-xs text-slate-600 whitespace-pre-line">
                        {replaceTemplateVariables(tplIntroText, {
                          customerName: testCustomerName,
                          greetingName: testCustomerName,
                          widthCm: testWidthCm,
                          projectionCm: testProjCm,
                          heightCm: testHeightCm,
                        })}
                      </p>
                    )}

                    <table className="w-full text-xs border-collapse">
                      <thead>
                        <tr className="bg-slate-100 text-slate-700">
                          <th className="border border-slate-300 p-2 text-left">
                            Megnevezés / Anyag
                          </th>
                          <th className="border border-slate-300 p-2 text-left">
                            Mennyiség / Méret
                          </th>
                          <th className="border border-slate-300 p-2 text-right">
                            Listaár (EUR)
                          </th>
                          <th className="border border-slate-300 p-2 text-right">
                            Kedvezményes (EUR)
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {previewCalc.rows.map((r) => (
                          <tr key={r.id}>
                            <td className="border border-slate-200 p-2 font-medium">
                              {r.name}
                            </td>
                            <td className="border border-slate-200 p-2 text-slate-600">
                              {r.quantityLabel}
                            </td>
                            <td className="border border-slate-200 p-2 text-right text-slate-500">
                              {formatDotNumber(r.listPriceEur)} EUR
                            </td>
                            <td className="border border-slate-200 p-2 text-right font-bold text-slate-900">
                              {r.itemRole === 'gift'
                                ? '0 EUR (Ajándék)'
                                : r.itemRole === 'optional'
                                ? `+ ${formatDotNumber(r.discountPriceEur)} EUR (Opció)`
                                : `${formatDotNumber(r.discountPriceEur)} EUR`}
                            </td>
                          </tr>
                        ))}
                        <tr className="bg-emerald-50 font-bold">
                          <td
                            colSpan={2}
                            className="border border-slate-300 p-2.5 text-emerald-950"
                          >
                            Alaptételek ÖSSZESEN:
                          </td>
                          <td className="border border-slate-300 p-2.5 text-right text-emerald-900">
                            {formatDotNumber(previewCalc.totalBaseEur)} EUR
                          </td>
                          <td className="border border-slate-300 p-2.5 text-right text-emerald-950">
                            {formatDotNumber(previewCalc.totalBaseHuf)} Ft
                          </td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>

            {/* Wizard Footer */}
            <div className="border-t border-slate-200 px-3 sm:px-6 pt-2.5 sm:py-3 pb-[max(0.625rem,env(safe-area-inset-bottom))] flex items-center justify-between gap-2">
              <button
                type="button"
                onClick={() =>
                  wizardStep > 1
                    ? setWizardStep((s) => (s - 1) as any)
                    : closeWizard()
                }
                className={btn.ghost}
              >
                <ArrowLeft className="w-4 h-4" />
                {wizardStep > 1 ? 'Vissza' : 'Bezárás'}
              </button>

              <div className="flex items-center gap-3">
                {wizardStep < 5 && (
                  <button
                    type="button"
                    onClick={() => setWizardStep((s) => (s + 1) as any)}
                    className={btn.secondary}
                  >
                    Tovább
                    <ArrowRight className="w-4 h-4" />
                  </button>
                )}
                <button
                  type="button"
                  disabled={!tplName.trim() || !tplCategoryId || savingTemplate}
                  onClick={handleSaveTemplateFinal}
                  className={btn.primary}
                >
                  <Save className="w-4 h-4" />
                  {savingTemplate ? 'Mentés…' : 'Mentés'}
                </button>
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
