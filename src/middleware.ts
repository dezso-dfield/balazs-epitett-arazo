import { NextRequest, NextResponse } from 'next/server';

// Ugyanaz a munkamenet-süti, amit az /api/auth állít be
const AUTH_COOKIE_NAME = 'opensky_auth_session';
const AUTH_COOKIE_VALUE = 'opensky_balazs_0125_authenticated_v1';

// Bejelentkezés nélkül elérhető: maga a bejelentkezés és az e-mail megnyitás-követő pixel
// /api/open/: aláírt, lejáró link (a Word asztali alkalmazás tölti le az ajánlatot); az aláírást az útvonal ellenőrzi
const PUBLIC_API_PREFIXES = ['/api/auth', '/api/track/', '/api/open/'];

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (PUBLIC_API_PREFIXES.some((p) => pathname.startsWith(p))) {
    return NextResponse.next();
  }
  if (req.cookies.get(AUTH_COOKIE_NAME)?.value !== AUTH_COOKIE_VALUE) {
    return NextResponse.json({ ok: false, error: 'Bejelentkezés szükséges' }, { status: 401 });
  }
  return NextResponse.next();
}

export const config = {
  matcher: ['/api/:path*'],
};
