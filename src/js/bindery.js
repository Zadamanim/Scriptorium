// The Bindery: dress the book itself — the leather of its cover, the colour of the gilt lettering,
// the ornaments above and below the title, and the colour of each chapter's ribbon.
import { el, dialog } from './ui.js';

export const LEATHERS = [
  ['Oxblood', null], ['Forest', '#2f5a34'], ['Midnight', '#1e2f66'], ['Royal Purple', '#4e2a6e'],
  ['Saddle', '#7a4a22'], ['Teal', '#1f5a5a'], ['Plum', '#6a2448'], ['Slate', '#4a5058'], ['Raven', '#1a1716'],
];
export const LETTERING = [
  ['Gilt', null], ['Silver', '#d8dce2'], ['Copper', '#d08a52'], ['Ivory', '#f2e6c8'], ['Scarlet', '#d03a2a'], ['Ink', '#141010'],
];
export const RIBBONS = ['#8b1a12', '#1f3a8a', '#2f6b4f', '#5b1f4f', '#b8902e', '#6e3a1e', '#20484a', '#7e1a22', '#c25a8a', '#e0d6c0', '#1a1716'];
// U+FE0E asks for the plain (not emoji) form of the few symbols that have both
export const ORNAMENTS = ['❦', '❧', '☙', '✠', '☩', '✦', '✧', '✵', '❖', '✤', '✿', '❀', '⚜︎', '♛︎', '⚔︎', '☽︎', '☀︎', '☘︎', ''];
export const DEFAULT_TOP = '❦', DEFAULT_BOTTOM = '✠';

const swatch = (color, label, on, pick) => el('button', {
  class: 'bind-sw clickable' + (on ? ' on' : ''), 'data-tip': label, style: `--sw:${color || 'var(--sw-default)'}`, onclick: pick });

/**
 * @param ctx { book, chapters: [{index, title, color, page}], onChange(), defaultRibbon(k) }
 * @param focus 'cover' | 'ribbons'
 */
export function openBindery(ctx, focus = 'cover') {
  const b = ctx.book;
  b.binding = b.binding || {};
  const changed = () => ctx.onChange();
  const row = (label, ...kids) => el('div', { class: 'bind-row' }, el('div', { class: 'bind-label' }, label), el('div', { class: 'bind-opts' }, ...kids));

  const swatchRow = (list, get, set, defLabelColor) => {
    const wrap = el('div', { class: 'bind-swatches' });
    const draw = () => {
      wrap.innerHTML = '';
      for (const [label, c] of list) wrap.append(swatch(c || defLabelColor, label, (get() || null) === c, () => { set(c); draw(); changed(); }));
      const custom = el('input', { type: 'color', class: 'bind-custom clickable', 'data-tip': 'Mix thine own colour', value: get() || defLabelColor });
      custom.addEventListener('input', () => { set(custom.value); changed(); });
      custom.addEventListener('change', draw);
      wrap.append(custom);
    };
    draw();
    return wrap;
  };

  const ornRow = (key, def) => {
    const wrap = el('div', { class: 'bind-orns' });
    const draw = () => {
      wrap.innerHTML = '';
      const cur = b.binding[key] ?? def;
      for (const g of ORNAMENTS) wrap.append(el('button', { class: 'bind-orn clickable' + (g === cur ? ' on' : ''), 'data-tip': g ? 'Use this ornament' : 'No ornament',
        onclick: () => { b.binding[key] = g === def ? undefined : g; draw(); changed(); } }, g || '∅'));
    };
    draw();
    return wrap;
  };

  const ribbons = el('div', { class: 'bind-ribbons' });
  if (!ctx.chapters.length) ribbons.append(el('p', { class: 'qm-note' }, 'This book has no chapters yet, so it has no ribbons to dye.'));
  ctx.chapters.forEach((c, k) => {
    ribbons.append(el('div', { class: 'bind-ribbon' }, el('span', { class: 'bind-ch' }, c.title || `Chapter ${k + 1}`),
      swatchRow(RIBBONS.map(col => [col === ctx.defaultRibbon(k) ? 'Its first colour' : 'Dye it this colour', col]),
        () => c.page.chapter.color || ctx.defaultRibbon(k), (v) => { c.page.chapter.color = v === ctx.defaultRibbon(k) ? undefined : v; }, ctx.defaultRibbon(k))));
  });

  const body = el('div', { class: 'bindery' },
    el('p', { class: 'bind-intro' }, 'The bookbinder lays out leathers, gilt and silk. Choose, and see it change before thee.'),
    row('Cover leather', swatchRow(LEATHERS, () => b.binding.leather, (v) => { b.binding.leather = v || undefined; }, '#6a2318')),
    row('Lettering', swatchRow(LETTERING, () => b.binding.lettering, (v) => { b.binding.lettering = v || undefined; }, '#e8c97a')),
    row('Ornament above', ornRow('ornTop', DEFAULT_TOP)),
    row('Ornament below', ornRow('ornBottom', DEFAULT_BOTTOM)),
    el('h4', { class: 'bind-h' }, 'Chapter ribbons'), ribbons);
  return dialog({
    title: 'The Bindery', id: 'bindery', body,
    buttons: [{ label: 'Done', kind: 'primary', value: true }],
    onOpen: (box) => { if (focus === 'ribbons') setTimeout(() => ribbons.scrollIntoView({ block: 'center' }), 50); },
  });
}
