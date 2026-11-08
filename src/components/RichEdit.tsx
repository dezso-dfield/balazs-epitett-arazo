'use client';

import React from 'react';
import { AlignCenter, AlignLeft, AlignRight, Bold, Eraser, Italic, List, Redo2, Underline, Undo2 } from 'lucide-react';
import { domToRich, richToHtml } from '@/lib/richtext';
import { ptPx } from '@/lib/doc-design';

/**
 * Word-szerű szövegmező: közvetlenül a dokumentumba írva, formázással (félkövér, dőlt, aláhúzott, szín, méret).
 * A szöveg jelölőkkel tárolódik (lásd lib/richtext), így a PDF ugyanígy rajzolja.
 */
export function RichInline({
  value,
  onChange,
  className = '',
  style,
  placeholder,
  single,
  readOnly,
}: {
  value: string;
  onChange: (v: string) => void;
  className?: string;
  style?: React.CSSProperties;
  placeholder?: string;
  single?: boolean;
  readOnly?: boolean;
}) {
  const ref = React.useRef<HTMLDivElement>(null);
  const emitted = React.useRef<string | null>(null);
  // kívülről érkező érték (pl. mentés, sablon csere) csak akkor írja felül, ha nem épp ebbe írunk
  React.useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (emitted.current === value && el.innerHTML) return;
    if (document.activeElement === el && emitted.current !== null) return;
    el.innerHTML = richToHtml(value || '');
    emitted.current = value;
  }, [value]);
  const emit = () => {
    const el = ref.current;
    if (!el) return;
    let v = domToRich(el);
    if (single) v = v.replace(/\n/g, ' ');
    emitted.current = v;
    if (v !== value) onChange(v);
  };
  return (
    <div
      ref={ref}
      data-rich=""
      contentEditable={!readOnly}
      suppressContentEditableWarning
      spellCheck
      data-placeholder={placeholder || ''}
      onInput={emit}
      onBlur={() => {
        emit();
        // a mentett, egységesített formát mutatja (pl. összevont jelölők)
        if (ref.current && emitted.current !== null) ref.current.innerHTML = richToHtml(emitted.current);
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          if (!single) document.execCommand('insertLineBreak');
        }
      }}
      onPaste={(e) => {
        e.preventDefault();
        const t = e.clipboardData.getData('text/plain');
        document.execCommand('insertText', false, single ? t.replace(/\s*\n\s*/g, ' ') : t.replace(/\r\n/g, '\n'));
      }}
      style={style}
      className={`block w-full whitespace-pre-wrap break-words outline-none rounded-sm min-h-[1.2em] empty:before:content-[attr(data-placeholder)] empty:before:text-slate-300 ${
        readOnly ? '' : 'hover:bg-slate-50 focus:bg-amber-50/60 focus:ring-2 focus:ring-indigo-200'
      } ${className}`}
    />
  );
}

/** Az utolsó kijelölés egy formázható mezőben (a legördülők megnyitása elvenné a fókuszt) */
let lastRange: Range | null = null;

function restoreRange(): HTMLElement | null {
  const r = lastRange;
  if (!r) return null;
  const host = (r.startContainer.nodeType === 1 ? (r.startContainer as Element) : r.startContainer.parentElement)?.closest('[data-rich]') as HTMLElement | null;
  if (!host || !document.contains(host) || host.getAttribute('contenteditable') !== 'true') return null;
  host.focus();
  const sel = window.getSelection();
  sel?.removeAllRanges();
  sel?.addRange(r);
  return host;
}

/** Szöveg beszúrása az utolsó kurzor helyére (pl. {{változó}}) */
export function insertAtCursor(text: string) {
  const host = restoreRange();
  if (!host) return;
  document.execCommand('insertText', false, text);
  host.dispatchEvent(new Event('input', { bubbles: true }));
}

const SIZES = [8, 9, 10, 11, 12, 13, 14, 16, 18, 20, 24];
const COLORS: [string, string][] = [
  ['#000000', 'Fekete'],
  ['#333333', 'Sötétszürke'],
  ['#808080', 'Szürke'],
  ['#343a55', 'Sötétkék (lábléc)'],
  ['#1f4e79', 'Kék'],
  ['#c00000', 'Piros'],
  ['#e36c09', 'Narancs'],
  ['#00803c', 'Zöld'],
];

/**
 * Formázó eszköztár a dokumentum fölött (mint a Wordben). A kijelölést megjegyzi, így a méret / szín
 * választó megnyitása után is arra a szövegre hat, ami ki volt jelölve.
 */
export function FormatToolbar({
  align,
  onAlign,
  extra,
  accent,
}: {
  align?: 'left' | 'center' | 'right' | null;
  onAlign?: (a: 'left' | 'center' | 'right') => void;
  extra?: React.ReactNode;
  accent?: string;
}) {
  const saved = { get current() { return lastRange; }, set current(r: Range | null) { lastRange = r; } };
  const [state, setState] = React.useState({ b: false, i: false, u: false });
  React.useEffect(() => {
    const onSel = () => {
      const sel = window.getSelection();
      if (!sel || !sel.rangeCount) return;
      const node = sel.anchorNode;
      const el = (node?.nodeType === 1 ? (node as Element) : node?.parentElement)?.closest('[data-rich]');
      if (!el) return;
      saved.current = sel.getRangeAt(0).cloneRange();
      try {
        setState({ b: document.queryCommandState('bold'), i: document.queryCommandState('italic'), u: document.queryCommandState('underline') });
      } catch {
        /* régi böngésző */
      }
    };
    document.addEventListener('selectionchange', onSel);
    return () => document.removeEventListener('selectionchange', onSel);
  }, []);

  const restore = restoreRange;
  const fire = (host: HTMLElement | null) => host?.dispatchEvent(new Event('input', { bubbles: true }));
  const cmd = (c: string, v?: string) => {
    const host = restore();
    if (!host) return;
    document.execCommand(c, false, v);
    fire(host);
  };
  /** A kijelölt szöveget egy stílusos <span>-be teszi (méret / szín); a belső azonos stílusokat törli */
  const wrap = (prop: 'fontSize' | 'color', value: string) => {
    const host = restore();
    const sel = window.getSelection();
    if (!host || !sel || !sel.rangeCount) return;
    const range = sel.getRangeAt(0);
    if (range.collapsed) return;
    const span = document.createElement('span');
    span.appendChild(range.extractContents());
    span.querySelectorAll<HTMLElement>('span,font').forEach((s) => {
      if (prop === 'fontSize') s.style.fontSize = '';
      else {
        s.style.color = '';
        s.removeAttribute('color');
      }
    });
    if (value) span.style[prop] = value;
    range.insertNode(span);
    sel.removeAllRanges();
    const r = document.createRange();
    r.selectNodeContents(span);
    sel.addRange(r);
    saved.current = r.cloneRange();
    fire(host);
  };

  const Btn = ({ on, title, active, children }: { on: () => void; title: string; active?: boolean; children: React.ReactNode }) => (
    <button
      type="button"
      title={title}
      onMouseDown={(e) => {
        e.preventDefault();
        on();
      }}
      className={`h-8 min-w-8 px-1.5 inline-flex items-center justify-center rounded-md text-slate-700 hover:bg-slate-100 ${active ? 'bg-indigo-100 text-indigo-800' : ''}`}
    >
      {children}
    </button>
  );
  const sep = <span className="w-px h-6 bg-slate-200 mx-1" />;

  return (
    <div className="sticky top-0 z-20 flex flex-wrap items-center gap-0.5 rounded-xl border border-slate-200 bg-white/95 backdrop-blur px-2 py-1 shadow-sm print:hidden">
      <Btn on={() => cmd('undo')} title="Visszavonás (Ctrl+Z)">
        <Undo2 className="w-4 h-4" />
      </Btn>
      <Btn on={() => cmd('redo')} title="Újra (Ctrl+Y)">
        <Redo2 className="w-4 h-4" />
      </Btn>
      {sep}
      <select
        title="Betűméret"
        defaultValue=""
        onChange={(e) => {
          wrap('fontSize', Number(e.target.value) > 0 ? ptPx(Number(e.target.value)) : '');
          e.target.value = '';
        }}
        className="h-8 rounded-md border border-slate-200 bg-white px-1.5 text-[13px]"
      >
        <option value="">Méret</option>
        <option value="0">Alap méret</option>
        {SIZES.map((s) => (
          <option key={s} value={s}>
            {s} pt
          </option>
        ))}
      </select>
      {sep}
      <Btn on={() => cmd('bold')} title="Félkövér (Ctrl+B)" active={state.b}>
        <Bold className="w-4 h-4" />
      </Btn>
      <Btn on={() => cmd('italic')} title="Dőlt (Ctrl+I)" active={state.i}>
        <Italic className="w-4 h-4" />
      </Btn>
      <Btn on={() => cmd('underline')} title="Aláhúzott (Ctrl+U)" active={state.u}>
        <Underline className="w-4 h-4" />
      </Btn>
      {sep}
      <div className="flex items-center gap-0.5" title="Betűszín">
        {COLORS.map(([c, l]) => (
          <button
            key={c}
            type="button"
            title={l}
            onMouseDown={(e) => {
              e.preventDefault();
              wrap('color', c === '#000000' ? '' : c);
            }}
            className="w-5 h-5 rounded border border-slate-300"
            style={{ background: c === '#343a55' && accent ? accent : c }}
          />
        ))}
        <label className="w-6 h-6 rounded border border-dashed border-slate-300 grid place-items-center cursor-pointer text-[10px] text-slate-500" title="Egyedi szín">
          +
          <input type="color" className="sr-only" onChange={(e) => wrap('color', e.target.value)} />
        </label>
      </div>
      {sep}
      <Btn on={() => cmd('insertText', '• ')} title="Felsorolás jel">
        <List className="w-4 h-4" />
      </Btn>
      <Btn
        on={() => {
          cmd('removeFormat');
          wrap('fontSize', '');
          wrap('color', '');
        }}
        title="Formázás törlése"
      >
        <Eraser className="w-4 h-4" />
      </Btn>
      {onAlign && (
        <>
          {sep}
          {(
            [
              ['left', AlignLeft, 'Balra'],
              ['center', AlignCenter, 'Középre'],
              ['right', AlignRight, 'Jobbra'],
            ] as const
          ).map(([a, Icon, l]) => (
            <Btn key={a} on={() => onAlign(a)} title={`Bekezdés igazítása: ${l}`} active={align === a}>
              <Icon className="w-4 h-4" />
            </Btn>
          ))}
        </>
      )}
      {extra && (
        <>
          {sep}
          {extra}
        </>
      )}
    </div>
  );
}
