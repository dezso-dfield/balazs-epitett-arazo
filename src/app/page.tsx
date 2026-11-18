'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import dynamic from 'next/dynamic';
import {
  CheckCircle2,
  Edit3,
  FolderKanban,
  Layers,
  LayoutDashboard,
  LogOut,
  Menu,
  PanelLeftClose,
  PanelLeftOpen,
  Settings,
  Sparkles,
  Wand2,
} from 'lucide-react';
import { DashboardView } from '@/components/DashboardView';
import { LoginView } from '@/components/LoginView';
import { NoticeItem, NotificationsHelp } from '@/components/NotificationsHelp';
import { DEFAULT_SYSTEM_CONFIG } from '@/lib/constants';
import { resolvePriceSources } from '@/lib/pricing-engine';
import {
  ProductCategory,
  ProductMenu,
  QuoteRecord,
  QuoteStatus,
  QuoteTemplate,
  KnownCustomer,
  SystemConfig,
  TrackingEvent,
  UploadedMediaItem,
} from '@/lib/types';

// A nagy nézetek külön csomagban, csak megnyitáskor töltődnek be
const viewLoading = () => <div className="py-16 text-center text-sm text-slate-500">Betöltés…</div>;
const BrandingSettingsView = dynamic(() => import('@/components/BrandingSettingsView').then((m) => m.BrandingSettingsView), { loading: viewLoading });
const CatalogManagerView = dynamic(() => import('@/components/CatalogManagerView').then((m) => m.CatalogManagerView), { loading: viewLoading });
const GuidedQuoteWizardView = dynamic(() => import('@/components/GuidedQuoteWizardView').then((m) => m.GuidedQuoteWizardView), { loading: viewLoading });
const PdfBlockEditorView = dynamic(() => import('@/components/PdfBlockEditorView').then((m) => m.PdfBlockEditorView), { loading: viewLoading });
const SavedQuotesListView = dynamic(() => import('@/components/SavedQuotesListView').then((m) => m.SavedQuotesListView), { loading: viewLoading });
const TemplateBuilderView = dynamic(() => import('@/components/TemplateBuilderView').then((m) => m.TemplateBuilderView), { loading: viewLoading });
const SendEmailModal = dynamic(() => import('@/components/SendEmailModal').then((m) => m.SendEmailModal), { loading: () => null });

type ActiveModule =
  | 'dashboard'
  | 'catalog_manager'
  | 'template_builder'
  | 'guided_wizard'
  | 'pdf_editor'
  | 'saved_quotes'
  | 'settings';

interface ToastNotice {
  id: string;
  title: string;
  message: string;
}

export default function CustomPricerAppPage() {
  const [activeModule, setActiveModule] =
    useState<ActiveModule>('dashboard');

  const [config, setConfig] = useState<SystemConfig>(DEFAULT_SYSTEM_CONFIG);
  const [menus, setMenus] = useState<ProductMenu[]>([]);
  const [categories, setCategories] = useState<ProductCategory[]>([]);
  // Sablonkezelőből szerkesztésre megnyitott sablon
  const [templateToEditId, setTemplateToEditId] = useState<string | null>(
    null
  );
  const [templates, setTemplates] = useState<QuoteTemplate[]>([]);
  // Árforrások azonnal: ha a forrástermék (pl. Refleksol ZIP) ára változik, az extrák is követik
  const pricedTemplates = useMemo(
    () => resolvePriceSources(JSON.parse(JSON.stringify(templates)) as QuoteTemplate[]),
    [templates]
  );
  const [quotes, setQuotes] = useState<QuoteRecord[]>([]);
  const [mediaLibrary, setMediaLibrary] = useState<UploadedMediaItem[]>([]);
  const [trackingEvents, setTrackingEvents] = useState<TrackingEvent[]>([]);
  // A kiküldő ablakban lévő ajánlat
  const [quoteToSend, setQuoteToSend] = useState<QuoteRecord | null>(null);
  const [loading, setLoading] = useState(true);

  // Current quote being edited inside PdfBlockEditorView (either fresh from wizard or reopened saved quote)
  const [activeDraftOrSavedQuote, setActiveDraftOrSavedQuote] =
    useState<Partial<QuoteRecord> | null>(null);

  const [toasts, setToasts] = useState<ToastNotice[]>([]);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  // null = még ellenőrizzük, false = bejelentkező képernyő
  const [authenticated, setAuthenticated] = useState<boolean | null>(null);
  const [authUser, setAuthUser] = useState('');
  const [liveRate, setLiveRate] = useState<{
    exact: number;
    source: string;
    rateDate: string | null;
  } | null>(null);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);

  const showToast = useCallback((title: string, message: string) => {
    const id = `${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    setToasts((prev) => [{ id, title, message }, ...prev.slice(0, 3)]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 4500);
  }, []);

  const fetchState = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const res = await fetch('/api/state', { cache: 'no-store' });
      const data = await res.json();
      if (data.config) setConfig(data.config);
      if (Array.isArray(data.menus)) setMenus(data.menus);
      if (Array.isArray(data.categories)) setCategories(data.categories);
      if (Array.isArray(data.templates)) setTemplates(data.templates);
      if (Array.isArray(data.quotes)) setQuotes(data.quotes);
      if (Array.isArray(data.mediaLibrary)) setMediaLibrary(data.mediaLibrary);
      if (Array.isArray(data.trackingEvents)) setTrackingEvents(data.trackingEvents);
    } catch (e) {
      console.error('Failed to load state:', e);
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetch('/api/auth')
      .then((r) => r.json())
      .then((d) => {
        setAuthenticated(Boolean(d?.authenticated));
        setAuthUser(d?.user || '');
      })
      .catch(() => setAuthenticated(false));
  }, []);

  const handleLogout = async () => {
    await fetch('/api/auth', { method: 'DELETE' });
    setAuthenticated(false);
  };

  useEffect(() => {
    if (!authenticated) return;
    fetchState();
    fetch('/api/exchange-rate')
      .then((r) => r.json())
      .then((d) => d?.exact && setLiveRate(d))
      .catch(() => undefined);
  }, [fetchState, authenticated]);

  // Image Upload helper
  const handleUploadImage = async (file: File): Promise<string | null> => {
    try {
      const formData = new FormData();
      formData.append('file', file);
      const res = await fetch('/api/template-images', {
        method: 'POST',
        body: formData,
      });
      const data = await res.json();
      if (data?.ok && data.url) {
        await fetchState(true);
        showToast('Kép feltöltve', file.name);
        return data.url as string;
      }
    } catch (e) {
      console.error('Upload error:', e);
    }
    return null;
  };

  // Category CRUD
  const handleSaveCategory = async (category: ProductCategory) => {
    const res = await fetch('/api/config', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ upsertCategory: category }),
    });
    const data = await res.json();
    if (data?.ok) {
      setCategories(data.categories || []);
      showToast(
        'Kategória elmentve',
        `„${category.name}” kategória frissítve.`
      );
    }
  };

  const handleDeleteCategory = async (categoryId: string) => {
    const res = await fetch('/api/config', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ deleteCategoryId: categoryId }),
    });
    const data = await res.json();
    if (data?.ok) {
      setCategories(data.categories || []);
      setTemplates(data.templates || []);
      showToast('Kategória törölve', 'A kategória eltávolítva.');
    }
  };

  // Template CRUD
  const handleSaveTemplate = async (template: QuoteTemplate) => {
    const res = await fetch('/api/config', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ upsertTemplate: template }),
    });
    const data = await res.json();
    if (data?.ok) {
      setTemplates(data.templates || []);
      showToast(
        'Sablon elmentve!',
        `„${template.name}” (${template.materials?.length || 0} termék/anyag, ${
          template.photos?.length || 0
        } fotó) készen áll az árazásra.`
      );
    }
  };

  const handleDeleteTemplate = async (templateId: string) => {
    const res = await fetch('/api/config', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ deleteTemplateId: templateId }),
    });
    const data = await res.json();
    if (data?.ok) {
      setTemplates(data.templates || []);
      showToast('Sablon törölve', 'A sablon eltávolítva.');
    }
  };

  // Menürendszer + kategóriák + sablonok sorrendjének/állapotának mentése egyben
  const handleSaveCatalogStructure = async (payload: {
    menus: ProductMenu[];
    categories: ProductCategory[];
    templates: QuoteTemplate[];
  }) => {
    const res = await fetch('/api/config', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (data?.ok) {
      setMenus(data.menus || []);
      setCategories(data.categories || []);
      setTemplates(data.templates || []);
      showToast(
        'Menürendszer elmentve',
        'A menük, kategóriák és sablonok sorrendje és állapota frissült.'
      );
    }
  };

  // Save System Config
  const handleSaveSystemConfig = async (nextConfig: SystemConfig) => {
    const res = await fetch('/api/config', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ config: nextConfig }),
    });
    const data = await res.json();
    if (data?.ok) {
      setConfig(data.config);
      showToast(
        'Beállítások elmentve',
        'A PDF fejléc/lábléc és alapbeállítások frissültek.'
      );
    }
  };

  // Create or Update Quote & Generate PDF
  const handleSaveQuoteAndGeneratePdf = async (
    payload: Partial<QuoteRecord>,
    downloadAfterSave: boolean
  ): Promise<QuoteRecord | null> => {
    const isUpdate = Boolean(payload.id);
    const url = isUpdate ? `/api/quotes/${payload.id}` : '/api/quotes';
    const method = isUpdate ? 'PUT' : 'POST';

    const res = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (data?.ok && data.quote) {
      const savedQuote = data.quote as QuoteRecord;
      setActiveDraftOrSavedQuote(savedQuote);
      // a listák frissítése a háttérben: a letöltés/küldés ne várjon a teljes állapot újratöltésére
      if (downloadAfterSave) void fetchState(true);
      else await fetchState(true);
      showToast(
        isUpdate
          ? 'Szerkesztett PDF frissítve és elmentve!'
          : 'Új PDF Árajánlat legenerálva és elmentve!',
        `${savedQuote.customerName} (${savedQuote.quoteNumber}) - bármikor újra szerkeszthető.`
      );
      if (!downloadAfterSave) {
        setActiveModule('saved_quotes');
      }
      return savedQuote;
    }
    return null;
  };

  const handleDuplicateQuote = async (quote: QuoteRecord) => {
    const copyPayload: Partial<QuoteRecord> = {
      ...JSON.parse(JSON.stringify(quote)),
      id: undefined,
      quoteNumber: undefined,
      customerName: `${quote.customerName} (Másolat)`,
      isEditedAfterGeneration: false,
    };
    await handleSaveQuoteAndGeneratePdf(copyPayload, false);
  };

  const handleDeleteQuote = async (quoteId: string) => {
    await fetch(`/api/quotes/${quoteId}`, { method: 'DELETE' });
    await fetchState(true);
    showToast('Árajánlat törölve', 'Az árajánlat eltávolítva a listából.');
  };

  const handleUpdateQuoteStatus = async (
    quoteId: string,
    status: QuoteStatus
  ) => {
    await fetch(`/api/quotes/${quoteId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    });
    await fetchState(true);
    showToast('Státusz frissítve', `Új státusz: ${status}`);
  };

  // Ismert ügyfelek a korábbi ajánlatokból (a legfrissebb adatokkal), névválasztóhoz
  const knownCustomers: KnownCustomer[] = (() => {
    const byName = new Map<string, KnownCustomer>();
    [...quotes]
      .sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''))
      .forEach((q) => {
        const name = (q.customerName || '').trim();
        if (!name || byName.has(name.toLowerCase())) return;
        byName.set(name.toLowerCase(), {
          name,
          greetingName: q.greetingName || name,
          city: q.city || '',
          email: q.email || '',
          phone: q.phone || '',
        });
      });
    return Array.from(byName.values()).sort((a, b) => a.name.localeCompare(b.name, 'hu'));
  })();

  // Teendők és értesítések a súgó ikon alatt
  const notices: NoticeItem[] = (() => {
    const list: NoticeItem[] = [];
    if (!config.pricingFormula?.confirmedByOwner) {
      list.push({
        id: 'formula',
        tone: 'warn',
        title: 'Az árképlet még ideiglenes',
        detail: 'A haszon (X) és a szerelés képlete még nincs véglegesítve.',
        onClick: () => setActiveModule('settings'),
      });
    }
    const live = templates.filter((t) => t.status !== 'inactive' && t.status !== 'test');
    const noCatalog = live.filter((t) => !(t.catalogRef?.pdfFile || t.catalogRef?.pages)).length;
    const noSize = live.filter((t) => !Object.values(t.sizeLimits || {}).some((v) => Number(v) > 0)).length;
    if (noCatalog || noSize) {
      list.push({
        id: 'catalog',
        tone: 'warn',
        title: 'Hiányos termékadatok',
        detail: [
          noSize ? `${noSize} terméknél nincs méretkorlát` : '',
          noCatalog ? `${noCatalog} terméknél nincs katalógus hivatkozás` : '',
        ]
          .filter(Boolean)
          .join(', '),
        onClick: () => setActiveModule('catalog_manager'),
      });
    }
    const es = config.emailSettings;
    if (!(es?.smtpHost && es?.smtpUser && es?.smtpPass)) {
      list.push({
        id: 'smtp',
        tone: 'warn',
        title: 'Az e-mail küldés nincs beállítva',
        detail: 'SMTP adatok nélkül az ajánlat csak kiküldöttnek jelölhető.',
        onClick: () => setActiveModule('settings'),
      });
    }
    const drafts = quotes.filter((q) => q.status === 'piszkozat').length;
    if (drafts) {
      list.push({
        id: 'drafts',
        tone: 'info',
        title: `${drafts} ajánlat még nincs kiküldve`,
        onClick: () => setActiveModule('dashboard'),
      });
    }
    const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
    trackingEvents
      .filter((ev) => new Date(ev.openedAt).getTime() > weekAgo)
      .slice(0, 3)
      .forEach((ev) => {
        const q = quotes.find((x) => x.id === ev.quoteId);
        list.push({
          id: `open_${ev.id}`,
          tone: 'info',
          title: `${ev.customerName} megnyitotta az ajánlatot`,
          detail: `${q?.quoteNumber || ''} · ${new Date(ev.openedAt).toLocaleString('hu-HU', {
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
          })}`,
          onClick: q
            ? () => {
                setActiveDraftOrSavedQuote(q);
                setActiveModule('pdf_editor');
              }
            : undefined,
        });
      });
    return list;
  })();

  const openPdfEditor = () => {
    if (!activeDraftOrSavedQuote) {
      setActiveDraftOrSavedQuote({
        customerName: 'Minta Ügyfél',
        greetingName: 'Minta Ügyfél',
        city: 'Budapest',
        widthCm: 600,
        projectionCm: 400,
        heightCm: 250,
        mountType: 'Épülethez rögzített',
        eurHufRate: config.defaultEurHufRate || 400,
        deliveryFeeHuf: config.defaultDeliveryFeeHuf ?? 40000,
        blocks: [
          {
            id: `blk_intro_${Date.now()}`,
            type: 'text_box',
            title: 'Kedves Minta Ügyfél!',
            content:
              'Örömmel fogadtuk megkeresését! Kérésének megfelelően küldjük személyre szabott árajánlatunkat.',
            textStyle: 'greeting',
          },
        ],
      });
    }
    setActiveModule('pdf_editor');
  };

  const navGroups: {
    label: string;
    items: {
      id: ActiveModule;
      label: string;
      icon: React.ComponentType<{ className?: string }>;
      count?: number;
      onClick?: () => void;
    }[];
  }[] = [
    {
      label: 'Árazás',
      items: [
        { id: 'dashboard', label: 'Áttekintés', icon: LayoutDashboard },
        { id: 'guided_wizard', label: 'Új ajánlat', icon: Wand2 },
        ...(activeDraftOrSavedQuote
          ? [
              {
                id: 'pdf_editor' as const,
                label: 'Nyitott ajánlat',
                icon: Edit3,
                onClick: openPdfEditor,
              },
            ]
          : []),
        {
          id: 'saved_quotes',
          label: 'Ajánlatok',
          icon: FolderKanban,
          count: quotes.length,
        },
      ],
    },
    {
      label: 'Beállítás',
      items: [
        { id: 'catalog_manager', label: 'Termékek', icon: Layers },
        { id: 'settings', label: 'Beállítások', icon: Settings },
      ],
    },
  ];

  const activeNavItem = navGroups
    .flatMap((g) => g.items)
    .find((i) => i.id === activeModule);

  const companyName = config.companyName || 'OpenSky Pergola Kft.';

  if (authenticated === null) {
    return (
      <div className="min-h-[100dvh] grid place-items-center">
        <div className="spin" />
      </div>
    );
  }

  if (!authenticated) {
    return (
      <LoginView
        companyName={companyName}
        onLoggedIn={(user) => {
          setAuthUser(user);
          setAuthenticated(true);
        }}
      />
    );
  }

  return (
    <div className="app">
      {/* Toast Notifications */}
      <div className="toasts">
        {toasts.map((t) => (
          <div key={t.id} className="toast">
            <CheckCircle2 className="w-4 h-4 text-green-400 shrink-0 mt-0.5" />
            <div>
              <div className="font-semibold">{t.title}</div>
              <div className="text-xs text-white/70 mt-0.5">{t.message}</div>
            </div>
          </div>
        ))}
      </div>

      {quoteToSend && (
        <SendEmailModal
          quote={quoteToSend}
          config={config}
          onClose={() => setQuoteToSend(null)}
          onSent={async (updated, actuallySent) => {
            setQuoteToSend(null);
            await fetchState(true);
            if (activeDraftOrSavedQuote?.id === updated.id) {
              setActiveDraftOrSavedQuote(updated);
            }
            showToast(
              actuallySent ? 'Ajánlat elküldve' : 'Kiküldöttnek jelölve',
              `${updated.quoteNumber} · ${updated.sentToEmail}`
            );
          }}
        />
      )}

      {/* Sidebar */}
      <aside
        className={`sidebar ${sidebarCollapsed ? 'collapsed' : ''} ${
          mobileSidebarOpen ? 'show' : ''
        }`}
      >
        <div className="sb-brand">
          <div className="sb-logo">{companyName.charAt(0)}</div>
          <div className="tx">
            <div className="nm">{companyName}</div>
            <div className="sub">Árazó rendszer</div>
          </div>
        </div>
        <nav className="nav">
          {navGroups.map((group) => (
            <div key={group.label} className="nav-group">
              <div className="nav-label">{group.label}</div>
              <ul>
                {group.items.map((item) => {
                  const Icon = item.icon;
                  return (
                    <li key={item.id}>
                      <button
                        type="button"
                        title={item.label}
                        onClick={() => {
                          if (item.onClick) item.onClick();
                          else setActiveModule(item.id);
                          setMobileSidebarOpen(false);
                        }}
                        className={`nav-link ${
                          activeModule === item.id ? 'active' : ''
                        }`}
                      >
                        <Icon />
                        <span>{item.label}</span>
                        {item.count !== undefined && !sidebarCollapsed && (
                          <span className="count">{item.count}</span>
                        )}
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </nav>
        <div className="sb-foot">
          <button type="button" onClick={handleLogout} title="Kijelentkezés">
            <LogOut />
            <span className="tx">Kijelentkezés</span>
          </button>
          <button
            type="button"
            onClick={() => setSidebarCollapsed((v) => !v)}
            title="Oldalsáv összecsukása"
          >
            {sidebarCollapsed ? <PanelLeftOpen /> : <PanelLeftClose />}
            <span className="tx">Oldalsáv</span>
          </button>
        </div>
      </aside>

      <div className="main">
        <header className="topbar">
          <button
            type="button"
            className="tb-burger"
            onClick={() => setMobileSidebarOpen((v) => !v)}
            aria-label="Menü"
          >
            <Menu />
          </button>
          <div className="crumb">
            <span className="hidden sm:inline">{companyName} / </span>
            <b>{activeNavItem?.label || ''}</b>
          </div>
          <div className="tb-right">
            {liveRate && (
              <span
                className="hidden sm:inline text-[13px] text-slate-500 tabular-nums mr-1"
                title={[liveRate.source, liveRate.rateDate].filter(Boolean).join(' · ')}
              >
                EUR{' '}
                <span className="text-slate-950 font-medium">
                  {liveRate.exact.toFixed(2).replace('.', ',')} Ft
                </span>
              </span>
            )}
            <NotificationsHelp
              items={notices}
              footer={[
                authUser ? `Bejelentkezve: ${authUser}` : '',
                liveRate ? `MNB: ${liveRate.exact.toFixed(2).replace('.', ',')} Ft/EUR` : '',
              ]
                .filter(Boolean)
                .join(' · ')}
            />
          </div>
        </header>

        {/* Main Content Area */}
        <main className="content">
          <div className="max-w-7xl mx-auto">
        {loading ? (
          <div className="py-16 grid place-items-center">
            <div className="spin" />
          </div>
        ) : (
          <>
            {activeModule === 'dashboard' && (
              <DashboardView
                quotes={quotes}
                trackingEvents={trackingEvents}
                onOpenQuote={(q) => {
                  setActiveDraftOrSavedQuote(q);
                  setActiveModule('pdf_editor');
                }}
                onSendQuote={(q) => setQuoteToSend(q)}
                onNewQuote={() => setActiveModule('guided_wizard')}
              />
            )}

            {activeModule === 'catalog_manager' && (
              <CatalogManagerView
                config={config}
                menus={menus}
                categories={categories}
                templates={pricedTemplates}
                onSave={handleSaveCatalogStructure}
                onEditTemplate={(tplId) => {
                  setTemplateToEditId(tplId);
                  setActiveModule('template_builder');
                }}
                onUploadImage={handleUploadImage}
                onNewTemplate={(categoryId) => {
                  setTemplateToEditId(`new:${categoryId}`);
                  setActiveModule('template_builder');
                }}
              />
            )}

            {activeModule === 'template_builder' && (
              <TemplateBuilderView
                config={config}
                menus={menus}
                categories={categories}
                templates={pricedTemplates}
                mediaLibrary={mediaLibrary}
                onSaveCategory={handleSaveCategory}
                onDeleteCategory={handleDeleteCategory}
                onSaveTemplate={handleSaveTemplate}
                onDeleteTemplate={handleDeleteTemplate}
                onUploadImage={handleUploadImage}
                onStartGuidedPricing={() => setActiveModule('guided_wizard')}
                openTemplateId={templateToEditId}
                onOpenTemplateHandled={() => setTemplateToEditId(null)}
                onWizardClosed={() => setActiveModule('catalog_manager')}
              />
            )}

            {activeModule === 'guided_wizard' && (
              <GuidedQuoteWizardView
                knownCustomers={knownCustomers}
                config={config}
                menus={menus}
                categories={categories}
                templates={pricedTemplates}
                onOpenTemplateBuilder={() =>
                  setActiveModule('catalog_manager')
                }
                onFinishWizardToEditor={(draftQuote) => {
                  setActiveDraftOrSavedQuote(draftQuote);
                  setActiveModule('pdf_editor');
                }}
              />
            )}

            {activeModule === 'pdf_editor' && activeDraftOrSavedQuote && (
              <PdfBlockEditorView
                key={activeDraftOrSavedQuote.id || 'draft_editor'}
                knownCustomers={knownCustomers}
                config={config}
                categories={categories}
                templates={pricedTemplates}
                mediaLibrary={mediaLibrary}
                initialQuote={activeDraftOrSavedQuote}
                onUploadImage={handleUploadImage}
                onSaveQuoteAndGeneratePdf={handleSaveQuoteAndGeneratePdf}
                onBackToWizard={() => setActiveModule('guided_wizard')}
                onSendQuote={(saved) => setQuoteToSend(saved)}
                onSaveTemplate={handleSaveTemplate}
                onSaveCategory={async (cat) => {
                  const res = await fetch('/api/config', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ upsertCategory: cat }) });
                  const data = await res.json();
                  if (data?.ok) {
                    setCategories(data.categories || []);
                    showToast('Kategória sablon elmentve', `„${cat.name}” – az új ajánlatokban már így szerepel.`);
                  }
                }}
                onSaveConfigPatch={(patch) => handleSaveSystemConfig({ ...config, ...patch })}
              />
            )}

            {activeModule === 'saved_quotes' && (
              <SavedQuotesListView
                quotes={quotes}
                onEditQuoteInPdfEditor={(quoteToEdit) => {
                  setActiveDraftOrSavedQuote(quoteToEdit);
                  setActiveModule('pdf_editor');
                }}
                onDuplicateQuote={handleDuplicateQuote}
                onDeleteQuote={handleDeleteQuote}
                onUpdateStatus={handleUpdateQuoteStatus}
                onStartNewQuote={() => setActiveModule('guided_wizard')}
                onSendQuote={(q) => setQuoteToSend(q)}
              />
            )}

            {activeModule === 'settings' && (
              <BrandingSettingsView
                config={config}
                onSaveConfig={handleSaveSystemConfig}
                onUploadImage={handleUploadImage}
                categories={categories}
                templates={pricedTemplates}
              />
            )}
          </>
        )}
          </div>
        </main>
      </div>
    </div>
  );
}
