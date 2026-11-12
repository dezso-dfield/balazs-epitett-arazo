// A rendszer lezárva. Az eredeti alkalmazás: src/components/AppRoot.tsx (az adatok megmaradtak).
export const dynamic = 'force-static';

export default function LockedPage() {
  return (
    <main style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, background: '#f8fafc', fontFamily: 'system-ui, -apple-system, Segoe UI, sans-serif' }}>
      <div style={{ maxWidth: 560, width: '100%', background: '#fff', border: '1px solid #e2e8f0', borderRadius: 16, padding: '36px 32px', textAlign: 'center', boxShadow: '0 1px 3px rgba(15,23,42,.06)' }}>
        <h1 style={{ margin: '0 0 16px', fontSize: 24, fontWeight: 700, color: '#0f172a' }}>Fejlesztés befejezve</h1>
        <p style={{ margin: 0, fontSize: 16, lineHeight: 1.6, color: '#334155' }}>
          Az ügyfél hanyag hozzáállása és az együttműködés teljes hiánya miatt az árazó rendszert megszüntetjük, a projektet pedig részünkről lezártnak tekintjük.
        </p>
      </div>
    </main>
  );
}
