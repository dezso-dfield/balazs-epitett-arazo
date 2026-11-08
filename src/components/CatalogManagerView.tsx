'use client';

import { CategoryDocEditor } from '@/components/CategoryDocEditor';
import { CategoryDesignEditor } from '@/components/TemplateDesigner';
import { templateCoverUrl, thumbUrl } from '@/lib/thumb';
import { isTemplateInCategory } from '@/lib/pricing-engine';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  EyeOff,
  ImagePlus,
  MoreHorizontal,
  Plus,
  RotateCcw,
  Save,
  Trash2,
  X,
} from 'lucide-react';
import { TEMPLATE_STATUS_OPTIONS } from '@/lib/constants';
import {
  CatalogReference,
  ProductCategory,
  ProductMenu,
  QuoteTemplate,
  TemplateSizeLimits,
  TemplateStatus,
  PhotoCaptionBlock,
} from '@/lib/types';
import { AutoTextarea, btn, PageHeader } from '@/components/ui';
import { ColorOptionsEditor } from '@/components/ColorOptions';

interface CatalogManagerViewProps {
  config?: import('@/lib/types').SystemConfig;
  menus: ProductMenu[];
  categories: ProductCategory[];
  templates: QuoteTemplate[];
  onSave: (payload: {
    menus: ProductMenu[];
    categories: ProductCategory[];
    templates: QuoteTemplate[];
  }) => Promise<void>;
  onEditTemplate: (templateId: string) => void;
  onNewTemplate: (categoryId: string) => void;
  onUploadImage: (file: File) => Promise<string | null>;
}

const byOrder = <T extends { order?: number }>(a: T, b: T) =>
  (a.order ?? 0) - (b.order ?? 0);

/**
 * Egy listán belül feljebb/lejjebb mozgat egy elemet, és 1..n sorszámot ad.
 * Csak a `scope`-ba tartozó elemek sorrendje változik.
 */
function moveInScope<T extends { id: string; order?: number }>(
  all: T[],
  inScope: (item: T) => boolean,
  id: string,
  direction: -1 | 1
): T[] {
  const scoped = all.filter(inScope).sort(byOrder);
  const idx = scoped.findIndex((x) => x.id === id);
  const target = idx + direction;
  if (idx < 0 || target < 0 || target >= scoped.length) return all;
  const reordered = [...scoped];
  [reordered[idx], reordered[target]] = [reordered[target], reordered[idx]];
  const newOrder = new Map(reordered.map((x, i) => [x.id, i + 1]));
  return all.map((x) =>
    newOrder.has(x.id) ? { ...x, order: newOrder.get(x.id) } : x
  );
}

const SIZE_ROWS: [string, keyof TemplateSizeLimits, keyof TemplateSizeLimits][] = [
  ['Szélesség', 'minWidthCm', 'maxWidthCm'],
  ['Kinyúlás', 'minProjectionCm', 'maxProjectionCm'],
  ['Magasság', 'minHeightCm', 'maxHeightCm'],
];

function hasSizeLimits(tpl: QuoteTemplate): boolean {
  return Object.values(tpl.sizeLimits || {}).some((v) => Number(v) > 0);
}

function hasCatalogRef(tpl: QuoteTemplate): boolean {
  return Boolean(tpl.catalogRef?.pdfFile || tpl.catalogRef?.pages);
}

// Ár nélküli tétel: 1 EUR (gyors extra még kitöltetlen ára), üres mérettábla vagy sávos ár
function hasMissingPrice(tpl: QuoteTemplate): boolean {
  return (tpl.materials || []).some((m) => {
    if (m.itemRole === 'gift' || m.pricingMode === 'percentage') return false;
    if (m.pricingMode === 'fixed') return !(Number(m.basePrice) > 1);
    if (m.pricingMode === 'matrix_cm')
      return !m.matrixTable?.rows?.length || !m.matrixTable?.cols?.length;
    if (m.pricingMode === 'tiered_m2') return !m.m2Tiers?.length;
    return !(Number(m.unitPrice) > 1);
  });
}

type MissingKey = 'size' | 'catalog' | 'photo' | 'price';

const MISSING_LABELS: Record<MissingKey, string> = {
  size: 'méretkorlát',
  catalog: 'katalógus',
  photo: 'fotó',
  price: 'ár',
};

/** Mi hiányzik még egy sablonból (teszt és inaktív sablonnál nem számít) */
function getMissing(tpl: QuoteTemplate): MissingKey[] {
  if (tpl.status === 'inactive' || tpl.status === 'test') return [];
  const out: MissingKey[] = [];
  if (!hasSizeLimits(tpl)) out.push('size');
  if (!hasCatalogRef(tpl)) out.push('catalog');
  if (!templateCoverUrl(tpl)) out.push('photo');
  if (hasMissingPrice(tpl)) out.push('price');
  return out;
}

async function uploadPhotos(
  files: FileList | null,
  onUploadImage: (file: File) => Promise<string | null>
): Promise<PhotoCaptionBlock[]> {
  const added: PhotoCaptionBlock[] = [];
  for (const file of Array.from(files || [])) {
    const url = await onUploadImage(file);
    if (url) {
      added.push({
        id: `ph_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        imageUrl: url,
        captionBelow: '',
        widthPct: 75,
        align: 'center',
      });
    }
  }
  return added;
}

/**
 * Kis képek sora (részletképek, extrák képei): feliratozható, törölhető, bővíthető.
 */
function MiniPhotos({
  photos,
  onChange,
  onUploadImage,
  addLabel,
}: {
  photos: PhotoCaptionBlock[];
  onChange: (next: PhotoCaptionBlock[]) => void;
  onUploadImage: (file: File) => Promise<string | null>;
  addLabel: string;
}) {
  const [uploading, setUploading] = useState(false);
  return (
    <div className="space-y-2">
      {photos.length > 0 && (
        <div className="space-y-2">
          {photos.map((ph, idx) => (
            <div
              key={ph.id || idx}
              className="flex gap-3 rounded-lg border border-slate-200 bg-white p-2"
            >
              <div className="w-24 h-[4.5rem] sm:w-28 sm:h-20 rounded-md overflow-hidden border border-slate-200 bg-slate-50 shrink-0">
                <img src={thumbUrl(ph.imageUrl)} loading="lazy" decoding="async" alt="" className="w-full h-full object-cover" />
              </div>
              <textarea
                value={ph.captionBelow || ''}
                onChange={(e) =>
                  onChange(photos.map((p, i) => (i === idx ? { ...p, captionBelow: e.target.value } : p)))
                }
                rows={3}
                placeholder="Képaláírás (a PDF-ben a kép alatt)"
                className="min-w-0 flex-1 px-2.5 py-1.5 rounded-lg border border-slate-200 text-sm leading-snug resize-y min-h-[4.5rem] sm:min-h-20"
              />
              <button
                type="button"
                onClick={() => onChange(photos.filter((_, i) => i !== idx))}
                className="self-start p-1.5 rounded-md text-slate-400 hover:text-rose-600 hover:bg-rose-50"
                title="Kép törlése"
                aria-label="Kép törlése"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          ))}
        </div>
      )}
      <label className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-dashed border-slate-300 text-[13px] text-slate-600 hover:bg-slate-50 cursor-pointer">
        <ImagePlus className="w-4 h-4" />
        {uploading ? 'Feltöltés…' : addLabel}
        <input
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={async (e) => {
            setUploading(true);
            const added = await uploadPhotos(e.target.files, onUploadImage);
            e.target.value = '';
            setUploading(false);
            if (added.length) onChange([...photos, ...added]);
          }}
        />
      </label>
    </div>
  );
}

/**
 * Sablon fotói: feltöltés (több is), főkép, sorrend, képaláírás, törlés.
 * Az első kép a főkép: ez látszik az árazóban és nagyban a PDF-ben.
 */
function PhotoStrip({
  photos,
  onChange,
  onUploadImage,
}: {
  photos: PhotoCaptionBlock[];
  onChange: (next: PhotoCaptionBlock[]) => void;
  onUploadImage: (file: File) => Promise<string | null>;
}) {
  const [uploading, setUploading] = useState(false);
  const move = (from: number, to: number) => {
    if (to < 0 || to >= photos.length) return;
    const next = [...photos];
    const [item] = next.splice(from, 1);
    next.splice(to, 0, item);
    onChange(next);
  };
  const upload = async (files: FileList | null) => {
    if (!files?.length) return;
    setUploading(true);
    const added = await uploadPhotos(files, onUploadImage);
    onChange([...photos, ...added]);
    setUploading(false);
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <div className="text-[13px] font-medium text-slate-700">
          Fotók ({photos.length}) - az első a főkép
        </div>
        <label className="text-[13px] text-slate-600 hover:text-slate-950 cursor-pointer inline-flex items-center gap-1">
          <Plus className="w-3.5 h-3.5" />
          {uploading ? 'Feltöltés…' : 'Fotó feltöltése'}
          <input
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={(e) => {
              upload(e.target.files);
              e.target.value = '';
            }}
          />
        </label>
      </div>
      {photos.length === 0 ? (
        <label
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            upload(e.dataTransfer.files);
          }}
          className="block rounded-xl border border-dashed border-slate-300 px-4 py-6 text-center text-sm text-slate-500 cursor-pointer hover:bg-slate-50"
        >
          Húzd ide a fotókat, vagy kattints a feltöltéshez
          <input
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={(e) => {
              upload(e.target.files);
              e.target.value = '';
            }}
          />
        </label>
      ) : (
        <div
          className="space-y-2"
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            upload(e.dataTransfer.files);
          }}
        >
          {photos.map((ph, idx) => (
            <div
              key={ph.id || idx}
              className="flex flex-col sm:flex-row gap-3 rounded-xl border border-slate-200 bg-white p-2.5"
            >
              <a
                href={ph.imageUrl}
                target="_blank"
                rel="noreferrer"
                className="relative w-full sm:w-44 aspect-[16/9] sm:aspect-[4/3] self-start shrink-0 rounded-lg overflow-hidden bg-slate-50 border border-slate-200"
                title="Megnyitás teljes méretben"
              >
                <img src={thumbUrl(ph.imageUrl)} loading="lazy" decoding="async" alt="" className="w-full h-full object-cover" />
                {idx === 0 && (
                  <span className="absolute top-1.5 left-1.5 px-1.5 py-0.5 rounded bg-slate-900 text-white text-[11px] font-semibold">
                    Főkép
                  </span>
                )}
              </a>
              <div className="flex-1 min-w-0 flex flex-col gap-1.5">
                <input
                  value={ph.titleAbove || ''}
                  onChange={(e) =>
                    onChange(photos.map((p, i) => (i === idx ? { ...p, titleAbove: e.target.value } : p)))
                  }
                  placeholder="Cím a kép fölött (opcionális)"
                  className="w-full px-2.5 py-1.5 rounded-lg border border-slate-200 text-sm font-medium"
                />
                <textarea
                  rows={3}
                  value={ph.captionBelow || ''}
                  onChange={(e) =>
                    onChange(photos.map((p, i) => (i === idx ? { ...p, captionBelow: e.target.value } : p)))
                  }
                  placeholder="Képaláírás - ez jelenik meg a kép alatt a PDF-ben"
                  className="w-full flex-1 px-2.5 py-1.5 rounded-lg border border-slate-200 text-sm leading-snug resize-y"
                />
                <div className="flex items-center gap-1 text-slate-500">
                  <button
                    type="button"
                    disabled={idx === 0}
                    onClick={() => move(idx, idx - 1)}
                    className="p-1.5 rounded-lg hover:bg-slate-100 disabled:opacity-30"
                    title="Előrébb"
                  >
                    <ArrowUp className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    disabled={idx === photos.length - 1}
                    onClick={() => move(idx, idx + 1)}
                    className="p-1.5 rounded-lg hover:bg-slate-100 disabled:opacity-30"
                    title="Hátrébb"
                  >
                    <ArrowDown className="w-4 h-4" />
                  </button>
                  {idx !== 0 && (
                    <button
                      type="button"
                      onClick={() => move(idx, 0)}
                      className="px-2 py-1 rounded-lg hover:bg-slate-100 text-[13px]"
                    >
                      Legyen a főkép
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => {
                      if (window.confirm('Törlöd ezt a fotót?')) {
                        onChange(photos.filter((_, i) => i !== idx));
                      }
                    }}
                    className="ml-auto inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[13px] hover:bg-rose-50 hover:text-rose-600"
                  >
                    <Trash2 className="w-4 h-4" />
                    Törlés
                  </button>
                </div>
                <div className="pt-1">
                  <div className="text-xs text-slate-500 mb-1">
                    Részletképek a nagy kép alatt (pl. motor, LED, profil)
                  </div>
                  <MiniPhotos
                    photos={ph.subPhotos || []}
                    onChange={(next) =>
                      onChange(photos.map((p, i) => (i === idx ? { ...p, subPhotos: next } : p)))
                    }
                    onUploadImage={onUploadImage}
                    addLabel="Részletkép hozzáadása"
                  />
                </div>
              </div>
            </div>
          ))}
          <div className="text-xs text-slate-500">
            Új fotót ide is húzhatsz. A cím és a képaláírás a PDF-ben jelenik meg.
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * Név szövegként; a ceruzára kattintva szerkeszthető (Enter / kattintás máshova: kész, Esc: vissza).
 */

function Thumb({ tpl }: { tpl: QuoteTemplate }) {
  const url = templateCoverUrl(tpl);
  return (
    <div className="w-14 h-10 rounded-md border border-slate-200 bg-slate-50 overflow-hidden shrink-0 grid place-items-center">
      {url ? (
        <img src={thumbUrl(url)} loading="lazy" decoding="async" alt="" className="w-full h-full object-cover" />
      ) : (
        <span className="text-[10px] text-slate-400">nincs</span>
      )}
    </div>
  );
}

function MissingNote({ missing }: { missing: MissingKey[] }) {
  if (missing.length === 0) return null;
  return (
    <div className="text-xs text-amber-700 mt-0.5">
      Hiányzik: {missing.map((k) => MISSING_LABELS[k]).join(' · ')}
    </div>
  );
}

/** Helyben szerkeszthető név: Enter / kattintás máshova mentés, Esc mégse */
function InlineInput({
  initial,
  placeholder,
  onDone,
}: {
  initial: string;
  placeholder?: string;
  onDone: (value: string | null) => void;
}) {
  const [value, setValue] = useState(initial);
  return (
    <input
      autoFocus
      value={value}
      placeholder={placeholder}
      onChange={(e) => setValue(e.target.value)}
      onBlur={() => onDone(value.trim() || null)}
      onKeyDown={(e) => {
        if (e.key === 'Enter') onDone(value.trim() || null);
        if (e.key === 'Escape') onDone(null);
      }}
      className="min-w-0 w-44 px-2.5 py-1.5 rounded-lg border border-slate-400 bg-white text-sm"
    />
  );
}

/** „⋯” gomb egy kis műveleti menüvel (kattintásra nyílik, kívül kattintva bezár) */
function RowMenu({
  label,
  items,
  subtle,
}: {
  label: string;
  items: { label: string; onClick: () => void; disabled?: boolean; danger?: boolean }[];
  subtle?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent | TouchEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', close);
    document.addEventListener('touchstart', close);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('touchstart', close);
    };
  }, [open]);
  return (
    <div ref={ref} className="relative shrink-0">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={`p-1.5 rounded-lg text-slate-500 hover:text-slate-950 hover:bg-slate-100 ${
          subtle && !open ? 'lg:opacity-0 lg:group-hover:opacity-100 focus:opacity-100' : ''
        }`}
        aria-label={label}
        title={label}
        aria-expanded={open}
      >
        <MoreHorizontal className="w-4 h-4" />
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-1 z-30 min-w-[12rem] bg-white border border-slate-200 rounded-xl shadow-lg p-1">
          {items.map((it) => (
            <button
              key={it.label}
              type="button"
              disabled={it.disabled}
              onClick={() => {
                setOpen(false);
                it.onClick();
              }}
              className={`w-full text-left px-3 py-1.5 rounded-lg text-[13px] disabled:opacity-40 ${
                it.danger ? 'text-rose-600 hover:bg-rose-50' : 'text-slate-700 hover:bg-slate-100'
              }`}
            >
              {it.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export function CatalogManagerView({
  config,
  menus,
  categories,
  templates,
  onSave,
  onEditTemplate,
  onNewTemplate,
  onUploadImage,
}: CatalogManagerViewProps) {
  const [draftMenus, setDraftMenus] = useState<ProductMenu[]>(menus);
  const [draftCategories, setDraftCategories] =
    useState<ProductCategory[]>(categories);
  const [draftTemplates, setDraftTemplates] =
    useState<QuoteTemplate[]>(templates);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);

  const [selectedMenuId, setSelectedMenuId] = useState<string>(
    [...menus].sort(byOrder)[0]?.id || ''
  );
  const [selectedCategoryId, setSelectedCategoryId] = useState<string>('');
  const [expandedTemplateId, setExpandedTemplateId] = useState<string | null>(
    null
  );
  // Lista: menü → kategória → sablon; Táblázat: minden sablon mérete és katalógus adata egyben
  const [viewMode, setViewMode] = useState<'tree' | 'table'>('tree');

  // Ha nincs mentetlen változás, a szerverről jövő adat az irányadó
  useEffect(() => {
    if (dirty) return;
    setDraftMenus(menus);
    setDraftCategories(categories);
    setDraftTemplates(templates);
  }, [menus, categories, templates, dirty]);

  const sortedMenus = useMemo(() => [...draftMenus].sort(byOrder), [draftMenus]);
  const menuCategories = useMemo(
    () =>
      draftCategories
        .filter((c) => c.menuId === selectedMenuId)
        .sort(byOrder),
    [draftCategories, selectedMenuId]
  );

  useEffect(() => {
    if (!menuCategories.some((c) => c.id === selectedCategoryId)) {
      setSelectedCategoryId(menuCategories[0]?.id || '');
    }
  }, [menuCategories, selectedCategoryId]);

  const expandedTpl = draftTemplates.find((t) => t.id === expandedTemplateId);
  // A részletek panel a három oszlop alatt nyílik: odagörgetünk
  const detailsRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (expandedTemplateId) {
      setTimeout(() => detailsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50);
    }
  }, [expandedTemplateId]);

  const categoryTemplates = useMemo(
    () =>
      draftTemplates
        .filter((t) => isTemplateInCategory(t, selectedCategoryId))
        .sort(byOrder),
    [draftTemplates, selectedCategoryId]
  );

  // Táblázat nézet: menü, kategória és sablon sorrendjében
  const tableRows = useMemo(() => {
    const menuOrder = new Map(sortedMenus.map((m, i) => [m.id, i]));
    return draftTemplates
      .map((tpl) => {
        const cat = draftCategories.find((c) => c.id === tpl.categoryId);
        const menu = draftMenus.find((m) => m.id === cat?.menuId);
        return { tpl, cat, menu };
      })
      .sort(
        (a, b) =>
          (menuOrder.get(a.menu?.id || '') ?? 99) -
            (menuOrder.get(b.menu?.id || '') ?? 99) ||
          (a.cat?.order ?? 0) - (b.cat?.order ?? 0) ||
          (a.tpl.order ?? 0) - (b.tpl.order ?? 0)
      );
  }, [draftTemplates, draftCategories, draftMenus, sortedMenus]);

  const missingCounts = (Object.keys(MISSING_LABELS) as MissingKey[]).map((k) => [
    k,
    draftTemplates.filter((t) => getMissing(t).includes(k)).length,
  ]) as [MissingKey, number][];
  const incompleteCount = draftTemplates.filter((t) => getMissing(t).length > 0).length;
  const [onlyIncomplete, setOnlyIncomplete] = useState(false);

  const markDirty = () => setDirty(true);

  const updateMenu = (id: string, patch: Partial<ProductMenu>) => {
    setDraftMenus((prev) => prev.map((m) => (m.id === id ? { ...m, ...patch } : m)));
    markDirty();
  };

  const updateCategory = (id: string, patch: Partial<ProductCategory>) => {
    setDraftCategories((prev) =>
      prev.map((c) => (c.id === id ? { ...c, ...patch } : c))
    );
    markDirty();
  };

  const updateTemplate = (id: string, patch: Partial<QuoteTemplate>) => {
    setDraftTemplates((prev) =>
      prev.map((t) => (t.id === id ? { ...t, ...patch } : t))
    );
    markDirty();
  };

  const handleAddMenu = (raw: string) => {
    const name = raw.trim();
    if (!name) return;
    const menu: ProductMenu = {
      id: `menu_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      name,
      description: '',
      enabled: true,
      order: draftMenus.length + 1,
    };
    setDraftMenus((prev) => [...prev, menu]);
    setSelectedMenuId(menu.id);
    markDirty();
  };

  const handleDeleteMenu = (menu: ProductMenu) => {
    if (draftCategories.some((c) => c.menuId === menu.id)) {
      window.alert(
        'Ebben a menüpontban még vannak kategóriák. Előbb helyezd át őket egy másik menübe.'
      );
      return;
    }
    if (!window.confirm(`Törlöd a(z) „${menu.name}” menüpontot?`)) return;
    setDraftMenus((prev) => prev.filter((m) => m.id !== menu.id));
    if (selectedMenuId === menu.id) setSelectedMenuId('');
    markDirty();
  };

  const handleAddCategory = (raw: string) => {
    const name = raw.trim();
    if (!name || !selectedMenuId) return;
    const cat: ProductCategory = {
      id: `cat_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      name,
      shortName: name,
      description: '',
      questionPrompt: `Kér az ügyfél ${name.toLowerCase()}t?`,
      categoryType: 'main_structure',
      allowMultipleTemplates: true,
      order: menuCategories.length + 1,
      menuId: selectedMenuId,
    };
    setDraftCategories((prev) => [...prev, cat]);
    setSelectedCategoryId(cat.id);
    markDirty();
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await onSave({
        menus: draftMenus,
        categories: draftCategories,
        templates: draftTemplates.map((t) => ({
          ...t,
          enabled: t.status !== 'inactive',
          updatedAt: new Date().toISOString(),
        })),
      });
      setDirty(false);
    } finally {
      setSaving(false);
    }
  };

  const handleDiscard = () => {
    setDraftMenus(menus);
    setDraftCategories(categories);
    setDraftTemplates(templates);
    setDirty(false);
  };

  const [renameMenuId, setRenameMenuId] = useState<string | null>(null);
  const [editingRefId, setEditingRefId] = useState<string | null>(null);
  const [renameCategoryId, setRenameCategoryId] = useState<string | null>(null);
  const [addingMenu, setAddingMenu] = useState(false);
  const [addingCategory, setAddingCategory] = useState(false);
  const categoryImageInput = useRef<HTMLInputElement>(null);
  const imageTargetCategory = useRef<string | null>(null);

  const selectedMenu = sortedMenus.find((m) => m.id === selectedMenuId);
  const selectedMenuIdx = sortedMenus.findIndex((m) => m.id === selectedMenuId);
  const selectedCategory = menuCategories.find((c) => c.id === selectedCategoryId);

  const pickImageFor = (catId: string) => {
    imageTargetCategory.current = catId;
    categoryImageInput.current?.click();
  };
  const moveMenu = (dir: -1 | 1) => {
    setDraftMenus((prev) => moveInScope(prev, () => true, selectedMenuId, dir));
    markDirty();
  };
  const moveCategory = (catId: string, dir: -1 | 1) => {
    setDraftCategories((prev) => moveInScope(prev, (c) => c.menuId === selectedMenuId, catId, dir));
    markDirty();
  };
  const moveTemplate = (tplId: string, dir: -1 | 1) => {
    setDraftTemplates((prev) => moveInScope(prev, (t) => t.categoryId === selectedCategoryId, tplId, dir));
    markDirty();
  };
  const categoryActions = (cat: ProductCategory, idx: number) => [
    { label: 'Átnevezés', onClick: () => setRenameCategoryId(cat.id) },
    { label: cat.imageUrl ? 'Kép cseréje' : 'Kép feltöltése', onClick: () => pickImageFor(cat.id) },
    { label: 'Feljebb', disabled: idx <= 0, onClick: () => moveCategory(cat.id, -1) },
    { label: 'Lejjebb', disabled: idx === menuCategories.length - 1, onClick: () => moveCategory(cat.id, 1) },
    ...sortedMenus
      .filter((m) => m.id !== cat.menuId)
      .map((m) => ({ label: `Áthelyezés: ${m.name}`, onClick: () => updateCategory(cat.id, { menuId: m.id, order: 999 }) })),
    { label: 'Törlés', danger: true, onClick: () => handleDeleteCategory(cat) },
  ];

  const handleDeleteCategory = (cat: ProductCategory) => {
    if (draftTemplates.some((t) => t.categoryId === cat.id)) {
      window.alert('Ebben a kategóriában még vannak termékek. Előbb helyezd át vagy töröld őket.');
      return;
    }
    if (!window.confirm(`Törlöd a(z) „${cat.name}” kategóriát?`)) return;
    setDraftCategories((prev) => prev.filter((c) => c.id !== cat.id));
    setDraftTemplates((prev) =>
      prev.map((t) =>
        t.alsoInCategoryIds?.includes(cat.id)
          ? { ...t, alsoInCategoryIds: t.alsoInCategoryIds.filter((id) => id !== cat.id) }
          : t
      )
    );
    markDirty();
  };
  const confirmLeave = () =>
    !dirty || window.confirm('Mentetlen változások vannak a Termékek oldalon. Elveted őket?');
  const openTemplate = (tplId: string) => {
    if (!confirmLeave()) return;
    setDirty(false);
    onEditTemplate(tplId);
  };
  // Táblázat nézet mezői (asztali táblázat és telefonos kártyák közösen)
  const sizeInput = (tpl: QuoteTemplate, key: keyof TemplateSizeLimits, ph: string) => {
    const limits = tpl.sizeLimits || {};
    return (
      <input
        type="number"
        inputMode="numeric"
        min={0}
        value={limits[key] || ''}
        onChange={(e) =>
          updateTemplate(tpl.id, { sizeLimits: { ...limits, [key]: Math.max(0, Number(e.target.value) || 0) } })
        }
        placeholder={ph}
        aria-label={`${tpl.name} ${ph}`}
        className={`w-16 px-2 py-1 rounded-lg border text-right tabular-nums text-[13px] ${
          getMissing(tpl).includes('size') ? 'border-amber-400 bg-amber-50/60' : 'border-slate-200'
        }`}
      />
    );
  };
  const catalogCell = (tpl: QuoteTemplate) => {
    const ref: CatalogReference = tpl.catalogRef || {};
    if (editingRefId === tpl.id) {
      return (
        <div className="space-y-1.5">
          <AutoTextarea
            autoFocus
            value={ref.pdfFile || ''}
            onChange={(e) => updateTemplate(tpl.id, { catalogRef: { ...ref, pdfFile: e.target.value } })}
            placeholder="Ár PDF fájl neve"
            className="w-full px-2 py-1 rounded-lg border border-slate-300 text-[13px]"
          />
          <AutoTextarea
            value={ref.pages || ''}
            onChange={(e) => updateTemplate(tpl.id, { catalogRef: { ...ref, pages: e.target.value } })}
            placeholder="Oldal(ak), pl. 47-49"
            className="w-full px-2 py-1 rounded-lg border border-slate-300 text-[13px]"
          />
          <button type="button" onClick={() => setEditingRefId(null)} className="text-xs text-slate-600 underline">
            Kész
          </button>
        </div>
      );
    }
    return (
      <button
        type="button"
        onClick={() => setEditingRefId(tpl.id)}
        className={`w-full text-left rounded-lg px-2 py-1 -mx-2 hover:bg-slate-50 ${
          getMissing(tpl).includes('catalog') ? 'ring-1 ring-amber-300 bg-amber-50/50' : ''
        }`}
        title="Katalógus szerkesztése"
      >
        {ref.pdfFile || ref.pages ? (
          <>
            <span className="block text-[13px] text-slate-900 break-words">{ref.pdfFile || '-'}</span>
            {ref.pages && <span className="block text-xs text-slate-500 break-words">{ref.pages}</span>}
          </>
        ) : (
          <span className="text-[13px] text-slate-400">+ Katalógus megadása</span>
        )}
      </button>
    );
  };
  const aliasCell = (tpl: QuoteTemplate) => {
    const ref: CatalogReference = tpl.catalogRef || {};
    return (
      <AutoTextarea
        value={ref.productAlias || ''}
        onChange={(e) => updateTemplate(tpl.id, { catalogRef: { ...ref, productAlias: e.target.value } })}
        placeholder="pl. Aluprof SB400"
        aria-label={`${tpl.name} gyártói neve`}
        className="w-full min-w-[10rem] px-2 py-1 rounded-lg border border-slate-200 text-[13px]"
      />
    );
  };
  const productHead = (tpl: QuoteTemplate) => {
    const statusOpt = TEMPLATE_STATUS_OPTIONS.find((o) => o.id === (tpl.status || 'active'));
    return (
      <div className="flex items-start gap-2.5">
        <Thumb tpl={tpl} />
        <div className="min-w-0">
          <div className="text-[13px] font-semibold text-slate-950 break-words">{tpl.name}</div>
          <div className="flex flex-wrap items-center gap-2 mt-1">
            <span className={`px-1.5 py-0.5 rounded-md border text-[11px] font-medium ${statusOpt?.badgeClass}`}>
              {statusOpt?.label}
            </span>
            <button
              type="button"
              onClick={() => openTemplate(tpl.id)}
              className="text-[12px] font-medium text-slate-700 underline underline-offset-2 hover:text-slate-950"
            >
              Szerkesztés
            </button>
          </div>
          <MissingNote missing={getMissing(tpl)} />
        </div>
      </div>
    );
  };
  const visibleTableRows = tableRows.filter(({ tpl }) => !onlyIncomplete || getMissing(tpl).length > 0);
  const groupStart = (i: number) =>
    i === 0 ||
    `${visibleTableRows[i - 1].menu?.id}|${visibleTableRows[i - 1].cat?.id}` !==
      `${visibleTableRows[i].menu?.id}|${visibleTableRows[i].cat?.id}`;

  const openNewTemplate = (catId: string) => {
    if (!confirmLeave()) return;
    setDirty(false);
    onNewTemplate(catId);
  };


  return (
    <div className="space-y-5">
      <PageHeader
        title="Termékek"
        subtitle="Menük, kategóriák és termékek. Dupla kattintás egy névre: átnevezés."
        actions={
          <>
            {dirty && (
              <button type="button" onClick={handleDiscard} className={btn.ghost}>
                <RotateCcw className="w-4 h-4" />
                Elvetés
              </button>
            )}
            <button
              type="button"
              onClick={handleSave}
              disabled={!dirty || saving}
              className={btn.primary}
            >
              <Save className="w-4 h-4" />
              {saving ? 'Mentés…' : 'Mentés'}
            </button>
          </>
        }
      />

      {incompleteCount > 0 && (
        <div className="flex flex-wrap items-center gap-2 text-[13px] text-amber-800">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          <span>
            {incompleteCount} sablon hiányos:{' '}
            {missingCounts
              .filter(([, n]) => n > 0)
              .map(([k, n]) => `${MISSING_LABELS[k]} ${n}`)
              .join(' · ')}
          </span>
          <button
            type="button"
            onClick={() => {
              setOnlyIncomplete((v) => !v);
              setViewMode('table');
            }}
            className="underline hover:text-amber-950"
          >
            {onlyIncomplete ? 'Összes mutatása' : 'Csak a hiányosak'}
          </button>
        </div>
      )}

      <div className="inline-flex p-1 rounded-xl bg-slate-100 border border-slate-200">
        {(
          [
            ['tree', 'Lista'],
            ['table', 'Táblázat (méretek, katalógus)'],
          ] as const
        ).map(([mode, label]) => (
          <button
            key={mode}
            type="button"
            onClick={() => setViewMode(mode)}
            className={`px-3 py-1.5 rounded-lg text-sm transition ${
              viewMode === mode
                ? 'bg-white text-slate-950 font-semibold shadow-sm'
                : 'text-slate-600 hover:text-slate-950'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {viewMode === 'table' && (
        <>
          {/* Asztali táblázat */}
          <div className="hidden md:block bg-white rounded-2xl border border-slate-200 overflow-x-auto">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="bg-slate-50 text-slate-500 text-xs border-b border-slate-200">
                  <th className="sticky left-0 z-[1] bg-slate-50 text-left font-medium px-3 py-2 min-w-[15rem]">Termék</th>
                  {SIZE_ROWS.map(([label]) => (
                    <th key={label} className="text-left font-medium px-3 py-2 whitespace-nowrap">
                      {label} (cm)
                    </th>
                  ))}
                  <th className="text-left font-medium px-3 py-2 min-w-[14rem]">Katalógus (ár PDF, oldal)</th>
                  <th className="text-left font-medium px-3 py-2 min-w-[10rem]">Gyártói név</th>
                </tr>
              </thead>
              <tbody>
                {visibleTableRows.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-3 py-6 text-center text-slate-500">
                      Nincs megjeleníthető termék.
                    </td>
                  </tr>
                )}
                {visibleTableRows.map(({ tpl, menu, cat }, i) => (
                  <React.Fragment key={tpl.id}>
                    {groupStart(i) && (
                      <tr className="bg-slate-50/70 border-y border-slate-200">
                        <td colSpan={6} className="sticky left-0 px-3 py-1.5 text-xs font-medium text-slate-600">
                          {menu?.name || 'Menü nélkül'} <span className="text-slate-400">/</span> {cat?.name || 'Kategória nélkül'}
                        </td>
                      </tr>
                    )}
                    <tr className={`border-b border-slate-100 align-top ${tpl.status === 'inactive' ? 'opacity-60' : ''}`}>
                      <td className="sticky left-0 z-[1] bg-white px-3 py-2.5">{productHead(tpl)}</td>
                      {SIZE_ROWS.map(([label, minKey, maxKey]) => (
                        <td key={label} className="px-3 py-2.5 whitespace-nowrap">
                          {sizeInput(tpl, minKey, 'min')}
                          <span className="mx-1 text-slate-400">-</span>
                          {sizeInput(tpl, maxKey, 'max')}
                        </td>
                      ))}
                      <td className="px-3 py-2.5">{catalogCell(tpl)}</td>
                      <td className="px-3 py-2.5">{aliasCell(tpl)}</td>
                    </tr>
                  </React.Fragment>
                ))}
              </tbody>
            </table>
          </div>

          {/* Telefon: termékenként egy kártya */}
          <div className="md:hidden space-y-3">
            {visibleTableRows.length === 0 && (
              <div className="px-3 py-6 text-center text-sm text-slate-500">Nincs megjeleníthető termék.</div>
            )}
            {visibleTableRows.map(({ tpl, menu, cat }, i) => (
              <React.Fragment key={tpl.id}>
                {groupStart(i) && (
                  <div className="pt-2 px-1 text-xs font-medium text-slate-500">
                    {menu?.name || 'Menü nélkül'} / {cat?.name || 'Kategória nélkül'}
                  </div>
                )}
                <div className={`bg-white rounded-2xl border border-slate-200 p-3 space-y-3 ${tpl.status === 'inactive' ? 'opacity-60' : ''}`}>
                  {productHead(tpl)}
                  <div className="space-y-1.5">
                    {SIZE_ROWS.map(([label, minKey, maxKey]) => (
                      <div key={label} className="flex items-center gap-2">
                        <span className="w-20 shrink-0 text-xs text-slate-500">{label}</span>
                        {sizeInput(tpl, minKey, 'min')}
                        <span className="text-slate-400">-</span>
                        {sizeInput(tpl, maxKey, 'max')}
                        <span className="text-xs text-slate-400">cm</span>
                      </div>
                    ))}
                  </div>
                  <div>
                    <div className="text-xs text-slate-500 mb-0.5">Katalógus</div>
                    {catalogCell(tpl)}
                  </div>
                  <div>
                    <div className="text-xs text-slate-500 mb-1">Gyártói név</div>
                    {aliasCell(tpl)}
                  </div>
                </div>
              </React.Fragment>
            ))}
          </div>
        </>
      )}

      {viewMode === 'tree' && (
        <div className="space-y-4">
          {/* MENÜK: fülek, a kiválasztott menü műveletei egy „⋯” menüben */}
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex flex-wrap gap-1 p-1 rounded-xl bg-slate-100 border border-slate-200 max-w-full">
              {sortedMenus.map((menu) => {
                const active = menu.id === selectedMenuId;
                const count = draftCategories.filter((c) => c.menuId === menu.id).length;
                if (renameMenuId === menu.id) {
                  return (
                    <InlineInput
                      key={menu.id}
                      initial={menu.name}
                      onDone={(v) => {
                        if (v) updateMenu(menu.id, { name: v });
                        setRenameMenuId(null);
                      }}
                    />
                  );
                }
                return (
                  <button
                    key={menu.id}
                    type="button"
                    onClick={() => setSelectedMenuId(menu.id)}
                    onDoubleClick={() => setRenameMenuId(menu.id)}
                    className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm transition ${
                      active ? 'bg-white text-slate-950 font-semibold shadow-sm' : 'text-slate-600 hover:text-slate-950'
                    } ${menu.enabled ? '' : 'opacity-50'}`}
                    title={menu.enabled ? undefined : 'Rejtett az árazóban'}
                  >
                    {menu.name}
                    <span className="text-xs text-slate-400 tabular-nums">{count}</span>
                    {!menu.enabled && <EyeOff className="w-3.5 h-3.5" />}
                  </button>
                );
              })}
              {addingMenu ? (
                <InlineInput
                  initial=""
                  placeholder="Új menü neve"
                  onDone={(v) => {
                    setAddingMenu(false);
                    if (v) handleAddMenu(v);
                  }}
                />
              ) : (
                <button
                  type="button"
                  onClick={() => setAddingMenu(true)}
                  className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-sm text-slate-500 hover:text-slate-950"
                >
                  <Plus className="w-4 h-4" />
                  Menü
                </button>
              )}
            </div>
            {selectedMenu && (
              <RowMenu
                label={`„${selectedMenu.name}” menü műveletei`}
                items={[
                  { label: 'Átnevezés', onClick: () => setRenameMenuId(selectedMenu.id) },
                  {
                    label: selectedMenu.enabled ? 'Elrejtés az árazóból' : 'Megjelenítés az árazóban',
                    onClick: () => updateMenu(selectedMenu.id, { enabled: !selectedMenu.enabled }),
                  },
                  { label: 'Balra', disabled: selectedMenuIdx === 0, onClick: () => moveMenu(-1) },
                  { label: 'Jobbra', disabled: selectedMenuIdx === sortedMenus.length - 1, onClick: () => moveMenu(1) },
                  { label: 'Törlés', danger: true, onClick: () => handleDeleteMenu(selectedMenu) },
                ]}
              />
            )}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-[17rem_minmax(0,1fr)] gap-4 items-start">
            {/* KATEGÓRIÁK telefonon: vízszintes gombsor */}
            <div className="lg:hidden flex gap-2 overflow-x-auto pb-1 -mx-1 px-1">
              {menuCategories.map((cat) => {
                const active = cat.id === selectedCategoryId;
                return (
                  <button
                    key={cat.id}
                    type="button"
                    onClick={() => setSelectedCategoryId(cat.id)}
                    className={`shrink-0 inline-flex items-center gap-2 pl-1 pr-3 py-1 rounded-xl border text-sm ${
                      active ? 'border-slate-900 bg-white font-semibold text-slate-950' : 'border-slate-200 bg-white text-slate-700'
                    }`}
                  >
                    <span className="w-8 h-8 rounded-lg bg-slate-100 overflow-hidden shrink-0">
                      {cat.imageUrl && <img src={thumbUrl(cat.imageUrl)} alt="" className="w-full h-full object-cover" />}
                    </span>
                    {cat.name}
                  </button>
                );
              })}
              <button
                type="button"
                disabled={!selectedMenuId}
                onClick={() => setAddingCategory(true)}
                className="shrink-0 inline-flex items-center gap-1 px-3 py-1 rounded-xl border border-dashed border-slate-300 text-sm text-slate-600"
              >
                <Plus className="w-4 h-4" />
                Kategória
              </button>
            </div>

            {/* KATEGÓRIÁK */}
            <div className={`${addingCategory ? '' : 'hidden'} lg:block bg-white rounded-2xl border border-slate-200 p-2`}>
              <div className="px-2 pt-1 pb-2 text-xs font-medium text-slate-500 uppercase tracking-wide">
                Kategóriák
              </div>
              {menuCategories.length === 0 && !addingCategory && (
                <div className="px-2 py-3 text-sm text-slate-500">Ebben a menüben még nincs kategória.</div>
              )}
              <div className="space-y-0.5">
                {menuCategories.map((cat, idx) => {
                  const active = cat.id === selectedCategoryId;
                  const count = draftTemplates.filter((t) => isTemplateInCategory(t, cat.id)).length;
                  return (
                    <div
                      key={cat.id}
                      className={`group flex items-center gap-2 rounded-xl pr-1 transition ${
                        active ? 'bg-slate-100' : 'hover:bg-slate-50'
                      }`}
                    >
                      {renameCategoryId === cat.id ? (
                        <div className="flex-1 p-1.5">
                          <InlineInput
                            initial={cat.name}
                            onDone={(v) => {
                              if (v) updateCategory(cat.id, { name: v, shortName: v });
                              setRenameCategoryId(null);
                            }}
                          />
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setSelectedCategoryId(cat.id)}
                          onDoubleClick={() => setRenameCategoryId(cat.id)}
                          className="min-w-0 flex-1 flex items-center gap-2.5 p-1.5 text-left"
                        >
                          <span className="w-10 h-10 rounded-lg bg-slate-100 border border-slate-200 overflow-hidden grid place-items-center shrink-0">
                            {cat.imageUrl ? (
                              <img src={thumbUrl(cat.imageUrl)} loading="lazy" decoding="async" alt="" className="w-full h-full object-cover" />
                            ) : (
                              <ImagePlus className="w-4 h-4 text-slate-300" />
                            )}
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className={`block text-sm leading-snug break-words ${active ? 'font-semibold text-slate-950' : 'text-slate-800'}`}>
                              {cat.name}
                            </span>
                            <span className="block text-xs text-slate-500">{count} termék</span>
                          </span>
                        </button>
                      )}
                      <RowMenu label={`„${cat.name}” kategória műveletei`} subtle={!active} items={categoryActions(cat, idx)} />
                    </div>
                  );
                })}
              </div>
              <div className="pt-1.5 mt-1.5 border-t border-slate-100">
                {addingCategory ? (
                  <div className="p-1.5">
                    <InlineInput
                      initial=""
                      placeholder="Új kategória neve"
                      onDone={(v) => {
                        setAddingCategory(false);
                        if (v) handleAddCategory(v);
                      }}
                    />
                  </div>
                ) : (
                  <button
                    type="button"
                    disabled={!selectedMenuId}
                    onClick={() => setAddingCategory(true)}
                    className="w-full flex items-center gap-2 px-3 py-2 rounded-xl text-sm text-slate-600 hover:bg-slate-50 hover:text-slate-950 disabled:opacity-40"
                  >
                    <Plus className="w-4 h-4" />
                    Új kategória
                  </button>
                )}
              </div>
              <input
                ref={categoryImageInput}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={async (e) => {
                  const file = e.target.files?.[0];
                  e.target.value = '';
                  const catId = imageTargetCategory.current;
                  if (!file || !catId) return;
                  const url = await onUploadImage(file);
                  if (url) updateCategory(catId, { imageUrl: url });
                }}
              />
            </div>

            {/* TERMÉKEK A KIVÁLASZTOTT KATEGÓRIÁBAN */}
            <div className="bg-white rounded-2xl border border-slate-200 min-w-0">
              {!selectedCategory ? (
                <div className="p-6 text-sm text-slate-500">Válassz vagy hozz létre egy kategóriát.</div>
              ) : (
                <>
                  <div className="flex flex-wrap items-center gap-3 px-4 py-3 border-b border-slate-200">
                    <button
                      type="button"
                      onClick={() => pickImageFor(selectedCategory.id)}
                      className="w-12 h-12 rounded-xl bg-slate-100 border border-slate-200 overflow-hidden grid place-items-center shrink-0 hover:border-slate-400"
                      title="Kategória képe"
                    >
                      {selectedCategory.imageUrl ? (
                        <img src={thumbUrl(selectedCategory.imageUrl)} alt="" className="w-full h-full object-cover" />
                      ) : (
                        <ImagePlus className="w-5 h-5 text-slate-400" />
                      )}
                    </button>
                    <div className="min-w-0 flex-1">
                      {renameCategoryId === selectedCategory.id ? (
                        <InlineInput
                          initial={selectedCategory.name}
                          onDone={(v) => {
                            if (v) updateCategory(selectedCategory.id, { name: v, shortName: v });
                            setRenameCategoryId(null);
                          }}
                        />
                      ) : (
                        <div
                          className="text-base font-semibold text-slate-950 break-words"
                          onDoubleClick={() => setRenameCategoryId(selectedCategory.id)}
                        >
                          {selectedCategory.name}
                        </div>
                      )}
                      <div className="text-xs text-slate-500">{categoryTemplates.length} termék</div>
                    </div>
                    <RowMenu
                      label={`„${selectedCategory.name}” kategória műveletei`}
                      items={categoryActions(selectedCategory, menuCategories.findIndex((c) => c.id === selectedCategory.id))}
                    />
                    <button
                      type="button"
                      onClick={() => openNewTemplate(selectedCategory.id)}
                      className={`${btn.secondary} w-full sm:w-auto`}
                    >
                      <Plus className="w-4 h-4" />
                      Új termék
                    </button>
                  </div>

                  <CategoryDocEditor category={selectedCategory} onChange={(patch) => updateCategory(selectedCategory.id, patch)} />
                  <details className="border-b border-slate-100 px-5 py-3 group/design">
                    <summary className="cursor-pointer text-sm font-semibold text-slate-800 select-none">
                      Kategória dizájn{' '}
                      <span className="font-normal text-slate-500">
                        {Object.keys(selectedCategory.docDesign || {}).length ? '(saját eltérések)' : '(az általánost használja)'}
                      </span>
                    </summary>
                    <div className="pt-3">
                      <CategoryDesignEditor category={selectedCategory} config={config} onChange={(d) => updateCategory(selectedCategory.id, { docDesign: d })} />
                    </div>
                  </details>

                  {categoryTemplates.length === 0 ? (
                    <div className="p-6 text-sm text-slate-500">Ebben a kategóriában még nincs termék.</div>
                  ) : (
                    <div className="divide-y divide-slate-100">
                      {categoryTemplates.map((tpl, idx) => {
                        const status: TemplateStatus = tpl.status || 'active';
                        const statusOpt = TEMPLATE_STATUS_OPTIONS.find((o) => o.id === status);
                        const isExpanded = expandedTemplateId === tpl.id;
                        const limits = tpl.sizeLimits || {};
                        const sizeText =
                          limits.maxWidthCm || limits.maxProjectionCm
                            ? `max. ${limits.maxWidthCm || '?'} × ${limits.maxProjectionCm || '?'} cm`
                            : '';
                        const isSecondary = tpl.categoryId !== selectedCategoryId;
                        return (
                          <div
                            key={tpl.id}
                            className={`flex flex-wrap items-center gap-3 px-4 py-3 ${
                              isExpanded ? 'bg-slate-50' : ''
                            } ${status === 'inactive' ? 'opacity-60' : ''}`}
                          >
                            <Thumb tpl={tpl} />
                            <div className="min-w-0 flex-1 basis-48">
                              <div className="text-sm font-semibold text-slate-950 break-words">{tpl.name}</div>
                              <div className="text-xs text-slate-500 break-words">
                                {[tpl.subtitle, sizeText, isSecondary ? 'más kategóriából is' : '']
                                  .filter(Boolean)
                                  .join(' · ')}
                              </div>
                              <MissingNote missing={getMissing(tpl)} />
                            </div>
                            <div className="flex items-center gap-2 ml-auto">
                              <select
                                value={status}
                                onChange={(e) => updateTemplate(tpl.id, { status: e.target.value as TemplateStatus })}
                                className={`px-2 py-1 rounded-lg border text-xs font-semibold ${statusOpt?.badgeClass}`}
                                aria-label="Állapot"
                              >
                                {TEMPLATE_STATUS_OPTIONS.map((o) => (
                                  <option key={o.id} value={o.id}>
                                    {o.label}
                                  </option>
                                ))}
                              </select>
                              <button
                                type="button"
                                onClick={() => openTemplate(tpl.id)}
                                className="px-3 py-1.5 rounded-lg border border-slate-300 bg-white text-[13px] font-medium text-slate-800 hover:border-slate-500"
                                title="Sablon termékeinek és árainak szerkesztése"
                              >
                                Szerkesztés
                              </button>
                              <RowMenu
                                label={`„${tpl.name}” műveletei`}
                                items={[
                                  {
                                    label: isExpanded ? 'Fotók és méretek bezárása' : 'Fotók és méretek',
                                    onClick: () => setExpandedTemplateId(isExpanded ? null : tpl.id),
                                  },
                                  { label: 'Feljebb', disabled: idx === 0, onClick: () => moveTemplate(tpl.id, -1) },
                                  {
                                    label: 'Lejjebb',
                                    disabled: idx === categoryTemplates.length - 1,
                                    onClick: () => moveTemplate(tpl.id, 1),
                                  },
                                ]}
                              />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Kinyitott sablon részletei teljes szélességben: fotók, méretek, katalógus */}
      {viewMode === 'tree' &&
        expandedTpl &&
        (() => {
          const tpl = expandedTpl;
          const limits = tpl.sizeLimits || {};
          const ref: CatalogReference = tpl.catalogRef || {};
          return (
            <div
              ref={detailsRef}
              className="bg-white rounded-2xl border border-slate-900 p-5 scroll-mt-4"
            >
              <div className="flex items-center gap-3 mb-4">
                <Thumb tpl={tpl} />
                <div className="min-w-0">
                  <div className="text-base font-semibold text-slate-950">{tpl.name}</div>
                  <MissingNote missing={getMissing(tpl)} />
                </div>
                <button
                  type="button"
                  onClick={() => setExpandedTemplateId(null)}
                  className={`${btn.ghost} ml-auto`}
                >
                  Bezár
                </button>
              </div>
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                <div className="lg:col-span-7 space-y-6">
                        <PhotoStrip
                          photos={tpl.photos || []}
                          onChange={(next) => updateTemplate(tpl.id, { photos: next })}
                          onUploadImage={onUploadImage}
                        />
                  {/* Extrák / tételek képei: a PDF-ben csak akkor, ha a tétel az ajánlatban van */}
                  <div className="space-y-3">
                    <div>
                      <div className="text-[13px] font-medium text-slate-700">Képek és színek a tételekhez</div>
                      <p className="text-xs text-slate-500">
                        A PDF-ben csak akkor jelennek meg, ha az adott tétel bekerül az ajánlatba.
                      </p>
                    </div>
                    {(tpl.materials || [])
                      .filter((m) => m.itemRole !== 'gift' && m.pricingMode !== 'percentage')
                      .map((m) => (
                        <div key={m.id} className="rounded-xl border border-slate-200 p-3">
                          <div className="text-sm text-slate-950 mb-2 break-words">
                            {m.name}
                            <span className="ml-2 text-xs text-slate-500">
                              {m.itemRole === 'optional' ? 'extra' : 'alaptétel'}
                            </span>
                          </div>
                          <MiniPhotos
                            photos={m.photos || []}
                            onChange={(next) =>
                              updateTemplate(tpl.id, {
                                materials: tpl.materials.map((x) =>
                                  x.id === m.id ? { ...x, photos: next } : x
                                ),
                              })
                            }
                            onUploadImage={onUploadImage}
                            addLabel="Kép hozzáadása"
                          />
                          <div className="mt-2">
                            <ColorOptionsEditor
                              colors={m.colorOptions || []}
                              onChange={(next) =>
                                updateTemplate(tpl.id, {
                                  materials: tpl.materials.map((x) =>
                                    x.id === m.id ? { ...x, colorOptions: next } : x
                                  ),
                                })
                              }
                              title={m.colorOptions?.length ? m.colorTitle : undefined}
                              onTitleChange={
                                m.colorOptions?.length
                                  ? (t) =>
                                      updateTemplate(tpl.id, {
                                        materials: tpl.materials.map((x) =>
                                          x.id === m.id ? { ...x, colorTitle: t } : x
                                        ),
                                      })
                                  : undefined
                              }
                            />
                          </div>
                        </div>
                      ))}
                  </div>
                </div>
                <div className="lg:col-span-5 space-y-4">

                        <div className="space-y-2">
                          <div className="text-[13px] font-medium text-slate-700">
                            Egy modul mérete (cm)
                          </div>
                          {SIZE_ROWS.map(([label, minKey, maxKey]) => (
                            <div key={label} className="flex items-center gap-2">
                              <span className="w-24 text-sm text-slate-600">{label}</span>
                              {[minKey, maxKey].map((key, kIdx) => (
                                <React.Fragment key={key}>
                                  {kIdx === 1 && <span className="text-slate-400">-</span>}
                                  <input
                                    type="number"
                                    min={0}
                                    value={limits[key] || ''}
                                    onChange={(e) =>
                                      updateTemplate(tpl.id, {
                                        sizeLimits: {
                                          ...limits,
                                          [key]: Math.max(0, Number(e.target.value) || 0),
                                        },
                                      })
                                    }
                                    placeholder={kIdx === 0 ? 'min' : 'max'}
                                    className="w-24 px-2.5 py-1 rounded-lg border border-slate-300 bg-white text-right tabular-nums"
                                  />
                                </React.Fragment>
                              ))}
                            </div>
                          ))}
                          <div className="text-xs text-slate-500">
                            Üresen hagyva nincs korlát. Ha a kért méret kívül esik, az
                            árazóban pirossal jelenik meg.
                          </div>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
                          <div className="sm:col-span-2 text-[13px] font-medium text-slate-700">
                            Katalógus hivatkozás
                          </div>
                          {(
                            [
                              ['pdfFile', 'Ár PDF fájl neve', 'pl. Pergola_arlista_2026.pdf'],
                              ['pages', 'Oldal(ak)', 'pl. 47-49'],
                              ['productAlias', 'Gyártói / fantázianév', 'pl. Algarve Classic'],
                              ['note', 'Megjegyzés', ''],
                            ] as [keyof CatalogReference, string, string][]
                          ).map(([key, label, placeholder]) => (
                            <label key={key} className="block">
                              <span className="block text-xs text-slate-500 mb-0.5">
                                {label}
                              </span>
                              <input
                                type="text"
                                value={ref[key] || ''}
                                onChange={(e) =>
                                  updateTemplate(tpl.id, {
                                    catalogRef: { ...ref, [key]: e.target.value },
                                  })
                                }
                                placeholder={placeholder}
                                className="w-full px-2 py-1 rounded-lg border border-slate-300 bg-white text-xs"
                              />
                            </label>
                          ))}
                        </div>
                </div>
              </div>
            </div>
          );
        })()}
    </div>
  );
}
