/**
 * Formázott szöveg az ajánlatokban (mint a Wordben): félkövér, dőlt, aláhúzott, szín és betűméret.
 * Tárolás egyszerű jelölőkkel, hogy a szöveg sima szövegként is olvasható maradjon:
 *   [b]…[/b]  [i]…[/i]  [u]…[/u]  [c=#1f3864]…[/c]  [s=12]…[/s]   (s: pont, mint a PDF-ben)
 * A szerkesztő HTML-t mutat (contentEditable), a PDF futamokra bontva rajzolja.
 */

export interface RichRun {
  text: string;
  b?: boolean;
  i?: boolean;
  u?: boolean;
  color?: string; // #rrggbb
  size?: number; // pt
}

const TAG_RE = /\[(\/?)(b|i|u|c|s)(?:=([^\]]{1,20}))?\]/g;

export const hasRich = (t: string | undefined | null) => !!t && /\[\/?(b|i|u|c|s)(=[^\]]{1,20})?\]/.test(t);

export const stripRich = (t: string | undefined | null) => String(t || '').replace(TAG_RE, '');

/** A szerkesztő képpont mérete egy PDF pontnyi betűhöz (13px képernyőn ≈ 10pt a PDF-ben) */
export const PX_PER_PT = 1.3;

export function parseRich(text: string): RichRun[] {
  const runs: RichRun[] = [];
  const st = { b: 0, i: 0, u: 0 };
  const colors: string[] = [];
  const sizes: number[] = [];
  let last = 0;
  const push = (t: string) => {
    if (!t) return;
    const r: RichRun = { text: t };
    if (st.b) r.b = true;
    if (st.i) r.i = true;
    if (st.u) r.u = true;
    if (colors.length) r.color = colors[colors.length - 1];
    if (sizes.length) r.size = sizes[sizes.length - 1];
    runs.push(r);
  };
  for (const m of String(text || '').matchAll(TAG_RE)) {
    push(text.slice(last, m.index));
    last = (m.index || 0) + m[0].length;
    const close = m[1] === '/';
    const tag = m[2] as 'b' | 'i' | 'u' | 'c' | 's';
    if (tag === 'c') {
      if (close) colors.pop();
      else if (/^#[0-9a-f]{6}$/i.test(m[3] || '')) colors.push(m[3].toLowerCase());
      else colors.push(colors[colors.length - 1] || '#000000');
    } else if (tag === 's') {
      if (close) sizes.pop();
      else sizes.push(Math.min(40, Math.max(6, Number(m[3]) || 10)));
    } else st[tag] = Math.max(0, st[tag] + (close ? -1 : 1));
  }
  push(text.slice(last));
  return runs;
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** Jelölt szöveg → a szerkesztő HTML-je */
export function richToHtml(text: string): string {
  return parseRich(text)
    .map((r) => {
      let h = esc(r.text).replace(/\n/g, '<br>');
      if (r.u) h = `<u>${h}</u>`;
      if (r.i) h = `<i>${h}</i>`;
      if (r.b) h = `<b>${h}</b>`;
      const css = [r.color ? `color:${r.color}` : '', r.size ? `font-size:${+(r.size * PX_PER_PT).toFixed(1)}px` : ''].filter(Boolean).join(';');
      if (css) h = `<span style="${css}">${h}</span>`;
      return h;
    })
    .join('');
}

const toHex = (c: string): string | undefined => {
  if (!c) return undefined;
  if (/^#[0-9a-f]{6}$/i.test(c)) return c.toLowerCase();
  if (/^#[0-9a-f]{3}$/i.test(c)) return `#${c.slice(1).split('').map((x) => x + x).join('')}`.toLowerCase();
  const m = c.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
  return m ? `#${[m[1], m[2], m[3]].map((x) => Number(x).toString(16).padStart(2, '0')).join('')}` : undefined;
};

/**
 * A szerkesztő DOM-ja → jelölt szöveg. A sortöréseket (<br>, <div>, <p>) \n-né alakítja,
 * a formázást a fenti jelölőkre (a böngésző b/strong/i/em/u/font és style formáit is felismeri).
 */
export function domToRich(root: Node, baseColor?: string, basePx?: number): string {
  let out = '';
  const walk = (n: Node, inherited: { color?: string; size?: number }) => {
    if (n.nodeType === 3) {
      out += (n.textContent || '').replace(/ /g, ' ');
      return;
    }
    if (n.nodeType !== 1) return;
    const el = n as HTMLElement;
    const tag = el.tagName.toLowerCase();
    if (tag === 'br') {
      out += '\n';
      return;
    }
    const block = tag === 'div' || tag === 'p' || tag === 'li';
    if (block && out && !out.endsWith('\n')) out += '\n';
    if (tag === 'li') out += '• ';
    const s = el.style;
    const b = tag === 'b' || tag === 'strong' || s.fontWeight === 'bold' || Number(s.fontWeight) >= 600;
    const i = tag === 'i' || tag === 'em' || s.fontStyle === 'italic';
    const u = tag === 'u' || /underline/.test(s.textDecoration || s.textDecorationLine || '');
    let color = toHex(s.color || (tag === 'font' ? el.getAttribute('color') || '' : ''));
    if (color && (color === inherited.color || color === baseColor)) color = undefined;
    let size: number | undefined;
    const px = parseFloat(s.fontSize);
    if (px && Math.abs(px - (basePx || 0)) > 0.3) size = Math.round((px / PX_PER_PT) * 2) / 2;
    if (size && size === inherited.size) size = undefined;
    const open = `${b ? '[b]' : ''}${i ? '[i]' : ''}${u ? '[u]' : ''}${color ? `[c=${color}]` : ''}${size ? `[s=${size}]` : ''}`;
    const close = `${size ? '[/s]' : ''}${color ? '[/c]' : ''}${u ? '[/u]' : ''}${i ? '[/i]' : ''}${b ? '[/b]' : ''}`;
    out += open;
    el.childNodes.forEach((c) => walk(c, { color: color || inherited.color, size: size || inherited.size }));
    out += close;
    if (block && el.nextSibling && !out.endsWith('\n')) out += '\n';
  };
  root.childNodes.forEach((c) => walk(c, {}));
  return normalizeRich(out.replace(/\n$/, ''));
}

/** Üres és egymás után ismétlődő jelölők összevonása, egymásba ágyazott azonos jelölők kiszűrése */
export function normalizeRich(t: string): string {
  let prev = '';
  let s = t;
  while (s !== prev) {
    prev = s;
    s = s
      .replace(/\[(b|i|u)\]\[\/\1\]/g, '')
      .replace(/\[(c|s)=[^\]]+\]\[\/\1\]/g, '')
      .replace(/\[\/(b|i|u)\]\[\1\]/g, '')
      .replace(/\[\/c\]\[c=(#[0-9a-f]{6})\]/g, (m, c, off, str) => (str.slice(0, off).match(/\[c=(#[0-9a-f]{6})\][^[]*$/)?.[1] === c ? '' : m))
      .replace(/\[(b|i|u)\]([^[]*)\[\1\]([^[]*)\[\/\1\]([^[]*)\[\/\1\]/g, '[$1]$2$3$4[/$1]');
  }
  return s;
}
