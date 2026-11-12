import { NextResponse } from 'next/server';

// A rendszer lezárva: minden API hívás (bejelentkezés, megnyitó linkek, követés is) tiltva. Az adatok megmaradtak.
export function middleware() {
  return NextResponse.json({ ok: false, error: 'A rendszer lezárva. Fejlesztés befejezve.' }, { status: 423 });
}

export const config = {
  matcher: ['/api/:path*'],
};
