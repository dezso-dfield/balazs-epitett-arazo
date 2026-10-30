import { NextRequest, NextResponse } from 'next/server';
import { loadDb, persistDb } from '@/lib/db';
import {
  ProductCategory,
  ProductMenu,
  QuoteTemplate,
  SystemConfig,
} from '@/lib/types';

export const dynamic = 'force-dynamic';

export async function GET() {
  const db = await loadDb();
  return NextResponse.json({
    ok: true,
    config: db.config,
    menus: db.menus,
    categories: db.categories,
    templates: db.templates,
  });
}

export async function PUT(req: NextRequest) {
  try {
    const body = await req.json();
    const db = await loadDb();

    if (body.config && typeof body.config === 'object') {
      db.config = {
        ...db.config,
        ...(body.config as Partial<SystemConfig>),
      };
    }

    if (Array.isArray(body.menus)) {
      db.menus = body.menus as ProductMenu[];
    }

    if (Array.isArray(body.categories)) {
      db.categories = body.categories as ProductCategory[];
    }

    if (Array.isArray(body.templates)) {
      db.templates = body.templates as QuoteTemplate[];
    }

    // Single category upsert
    if (body.upsertCategory) {
      const cat = body.upsertCategory as ProductCategory;
      const idx = db.categories.findIndex((c) => c.id === cat.id);
      if (idx >= 0) {
        db.categories[idx] = cat;
      } else {
        db.categories.push(cat);
      }
    }

    // Single category delete
    if (body.deleteCategoryId) {
      const delId = String(body.deleteCategoryId);
      db.categories = db.categories.filter((c) => c.id !== delId);
      db.templates = db.templates.filter((t) => t.categoryId !== delId);
    }

    // Single template upsert
    if (body.upsertTemplate) {
      const tpl = body.upsertTemplate as QuoteTemplate;
      const idx = db.templates.findIndex((t) => t.id === tpl.id);
      if (idx >= 0) {
        db.templates[idx] = tpl;
      } else {
        db.templates.push(tpl);
      }
    }

    // Single template delete
    if (body.deleteTemplateId) {
      const delId = String(body.deleteTemplateId);
      db.templates = db.templates.filter((t) => t.id !== delId);
    }

    await persistDb(db);

    return NextResponse.json({
      ok: true,
      config: db.config,
      menus: db.menus,
      categories: db.categories,
      templates: db.templates,
    });
  } catch (err: any) {
    return NextResponse.json(
      { ok: false, error: err?.message || 'Hiba a mentés során' },
      { status: 500 }
    );
  }
}
