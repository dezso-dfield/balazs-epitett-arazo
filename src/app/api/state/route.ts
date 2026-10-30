import { NextResponse } from 'next/server';
import { createEmptyDatabase, loadDb, persistDb } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET() {
  const db = await loadDb();
  return NextResponse.json({
    ok: true,
    config: db.config,
    menus: db.menus,
    categories: db.categories,
    templates: db.templates,
    quotes: db.quotes,
    mediaLibrary: db.mediaLibrary,
    trackingEvents: db.trackingEvents.slice(0, 100),
  });
}

export async function DELETE() {
  const empty = createEmptyDatabase();
  await persistDb(empty);
  return NextResponse.json({
    ok: true,
    ...empty,
  });
}
