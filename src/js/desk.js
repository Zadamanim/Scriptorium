// Desk props: the Quill (text menu), Inkwell (colour), Crystal Ball (help/search),
// Spectacles (comfort & scale), Pounce Pot (dry the ink = save), Candle (look up / back).
import { Prop, manifest } from './assets.js';
import { el, popup, dialog, toast, toastAction, STAY } from './ui.js';
import * as E from './editor.js';
import { folio } from './book.js';
import { allFamilies, ensureFamily, refreshFonts } from './fonts.js';

let app; // callbacks from app.js
export const props = {};
let quillBox = null;
let quillView = 'main';

const SIZES = [8, 9, 10, 11, 12, 14, 16, 18, 20, 22, 24, 28, 32, 36, 48];   // "pt" on the page; 12pt = the book's usual 24px
const SPACINGS = [[1.15, 'Snug', 'tight lines'], [1.5, 'Book', 'the usual 16 lines'], [2, 'Airy', 'roomy'], [3, 'Double', 'very roomy']];
const ALIGNS = [['left', 'Left', '⯇', 'justifyLeft'], ['center', 'Centred', '☩', 'justifyCenter'], ['right', 'Right', '⯈', 'justifyRight'], ['justify', 'Justified', '☰', 'justifyFull']];
export const INKS = [
  ['Iron-Gall', '#1b1712'], ['Lamp Black', '#000000'], ['Sepia', '#5b3a1e'], ['Oak-Gall', '#4a2c17'],
  ['Vermilion', '#b4271b'], ['Madder', '#7e1a22'], ['Ultramarine', '#1f3a8a'], ['Woad', '#2e4a6b'],
  ['Verdigris', '#2f6b4f'], ['Sap Green', '#4b6b1f'], ['Tyrian', '#5b1f4f'], ['Gold Leaf', '#b8902e'],
];
let currentInk = INKS[0][1];

export function initDesk(callbacks) {
  app = callbacks;
  props.quill = new Prop(document.getElementById('prop-quill'), 'quill', { onClick: () => toggleQuillMenu() });
  props.inkwell = new Prop(document.getElementById('prop-inkwell'), 'inkwell', { onClick: () => openInk() });
  props.crystal = new Prop(document.getElementById('prop-crystal'), 'crystal', { onClick: () => openCrystal() });
  props.spectacles = new Prop(document.getElementById('prop-spectacles'), 'spectacles', { onClick: () => openSpectacles() });
  props.pounce = new Prop(document.getElementById('prop-pounce'), 'pounce', { onClick: () => app.save() });
  document.getElementById('prop-pounce').addEventListener('contextmenu', (e) => { e.preventDefault(); props.pounce.play('click'); app.saveAs(); });
  const mask = manifest.inkwell.inkMask;
  if (mask) {
    const ov = el('div', { class: 'ink-overlay' });
    ov.style.webkitMaskImage = `url("../assets/${mask}")`;
    document.getElementById('prop-inkwell').append(ov);
  }
  setInkSwatch(currentInk);
  document.getElementById('turn-prev').addEventListener('click', () => E.turn(-1));
  document.getElementById('turn-next').addEventListener('click', () => E.turn(1));
  E.ed.onSelection = () => { if (quillBox) syncQuill(); };
  E.ed.onFlow = (i) => openFlow(i);
  // keep the writing cursor in the page when clicking menu buttons
  document.getElementById('ui-layer').addEventListener('mousedown', (e) => {
    if (e.target.closest('.qm-btn, .qm-opt, .qm-item, .qm-back, .ink, .font-list .f')) e.preventDefault();
  });
}
function setInkSwatch(c) {
  currentInk = c;
  const ov = document.querySelector('#prop-inkwell .ink-overlay');
  if (ov) ov.style.background = c;
}

// ------------------------------------------------------------------ QUILL MENU
// The first page lists what is chosen right now; each line opens its own page.
export function toggleQuillMenu(forceOpen = false) {
  if (quillBox && forceOpen) return quillBox;
  quillView = 'main';
  quillBox = popup('quill-menu', document.getElementById('prop-quill'), (box) => { box.append(el('div', { class: 'qm-body' })); }, { side: 'beside', onClose: () => { quillBox = null; } });
  if (quillBox) showView('main');
  return quillBox;
}
export function showView(name) {
  if (!quillBox) toggleQuillMenu(true);
  quillView = name;
  const body = quillBox.querySelector('.qm-body');
  body.innerHTML = '';
  VIEWS[name](body, E.queryState());
  syncQuill();
  quillBox.reposition();
}
const back = () => el('button', { class: 'qm-back', onclick: () => showView('main') }, '‹ The Quill');
const opt = (id, ic, label, fn, sub = '') => el('button', { class: 'qm-opt', id, onclick: fn }, el('span', { class: 'ic' }, ic), label, sub ? el('span', { class: 'sub' }, sub) : null);
const item = (id, k, v, view, style) => {
  const val = el('span', { class: 'v' }, v); if (style) Object.assign(val.style, style);
  return el('button', { class: 'qm-item', id, onclick: () => showView(view) }, el('span', { class: 'k' }, k), val, el('span', { class: 'go' }, '›'));
};
const listName = (st) => st.ul ? 'Bulleted list' : st.ol ? 'Numbered list' : (st.firstIndent ? 'First line indented' : 'Plain paragraphs');

const VIEWS = {
  main(b, st) {
    const ch = E.currentChapter();
    const s = E.ed.book.settings;
    b.append(el('h3', {}, 'The Quill'),
      item('qmi-font', 'Typeface', st.font, 'font', { fontFamily: `"${st.font}", serif`, fontSize: '22px' }),
      item('qmi-size', 'Size', `${Math.round(st.size / 2)} pt`, 'size'),
      el('div', { class: 'qm-manner', id: 'qm-manner' }, el('span', { class: 'k' }, 'Manner'),
        el('button', { class: 'qm-btn', id: 'qm-bold', 'data-tip': 'Bold (Ctrl+B)', onclick: () => E.cmd('bold') }, el('b', {}, 'B')),
        el('button', { class: 'qm-btn', id: 'qm-italic', 'data-tip': 'Italic (Ctrl+I)', onclick: () => E.cmd('italic') }, el('i', {}, 'I')),
        el('button', { class: 'qm-btn', id: 'qm-underline', 'data-tip': 'Underline (Ctrl+U)', onclick: () => E.cmd('underline') }, el('u', {}, 'U'))),
      item('qmi-align', 'Alignment', (ALIGNS.find(a => a[0] === normAlign(st.align)) || ALIGNS[3])[1], 'align'),
      item('qmi-spacing', 'Line spacing', (SPACINGS.find(x => Math.abs(x[0] - st.lh) < .01) || [0, `${st.lh}×`])[1], 'spacing'),
      item('qmi-lists', 'Lists & indents', listName(st), 'lists'),
      item('qmi-pages', 'Pages', `Page ${folio(E.currentIndex()) || '—'}${ch ? ' · ' + ch.title : ''}`, 'pages'),
      item('qmi-caps', 'Fancy letters', ch ? (ch.dropCap ? 'On for this chapter' : 'Off for this chapter') : (s.dropCaps ? 'On for new chapters' : 'Off'), 'caps'),
      item('qmi-book', 'Book’s hand', `${s.bodyFont}, ${Math.round(s.bodySize / 2)} pt`, 'book'));
  },
  font(b) {
    const list = el('div', { class: 'font-list', id: 'qm-fontlist' });
    fillFontList(list);
    b.append(back(), el('h3', {}, 'Typeface'), list,
      el('div', { class: 'qm-row', style: 'margin-top:8px' }, el('button', { class: 'qm-btn wide', id: 'qm-import', onclick: importFont, 'data-tip': 'Load a .ttf / .otf / .woff font from thy computer' }, 'Bring a new typeface…')),
      el('div', { class: 'qm-note' }, 'Every typeface thou usest travels inside the book, so readers never need to install it.'));
    setTimeout(() => list.querySelector('.f.on')?.scrollIntoView({ block: 'center' }), 0);
  },
  size(b, st) {
    const grid = el('div', { class: 'qm-sizes', id: 'qm-sizes' });
    for (const v of SIZES) grid.append(el('button', { class: 'qm-btn', 'data-size': v, onclick: () => { E.setFontSize(v * 2); syncQuill(); } }, String(v)));
    const box = el('input', { class: 'field size-box', id: 'qm-sizeval', type: 'number', min: 4, max: 96, value: Math.round(st.size / 2) });
    box.addEventListener('change', () => E.setFontSize(Math.max(4, Math.min(96, +box.value || 12)) * 2));
    b.append(back(), el('h3', {}, 'Size of Letters'), grid,
      el('div', { class: 'qm-row' }, el('button', { class: 'qm-btn', id: 'qm-smaller', onclick: () => stepSize(-1) }, 'A−'), box,
        el('button', { class: 'qm-btn', id: 'qm-bigger', onclick: () => stepSize(1) }, 'A+'), el('span', { class: 'small' }, 'pt')),
      el('div', { class: 'qm-note' }, '12 pt is the book’s usual size: 16 lines to a page.'));
  },
  align(b) {
    b.append(back(), el('h3', {}, 'Alignment'), el('div', { id: 'qm-align' }, ...ALIGNS.map(([k, n, ic, c]) => opt('qm-al-' + k, ic, n, () => { E.cmd(c); syncQuill(); }, k === 'justify' ? 'like a printed book' : ''))));
  },
  spacing(b) {
    b.append(back(), el('h3', {}, 'Space Between Lines'), el('div', { id: 'qm-spacing' }, ...SPACINGS.map(([v, n, sub]) => opt('qm-lh-' + String(v).replace('.', '_'), '≡', n, () => { E.setLineHeight(v); syncQuill(); }, sub))));
  },
  lists(b) {
    b.append(back(), el('h3', {}, 'Lists, Tabs & Indents'),
      opt('qm-ul', '❧', 'Bulleted list', () => { E.cmd('insertUnorderedList'); syncQuill(); }),
      opt('qm-ol', '1.', 'Numbered list', () => { E.cmd('insertOrderedList'); syncQuill(); }),
      opt('qm-tab', '⇥', 'Insert a tab', () => E.insertTab(), 'or press Tab'),
      opt('qm-indent', '→', 'Indent the paragraph', () => E.indent(1)),
      opt('qm-outdent', '←', 'Outdent the paragraph', () => E.indent(-1), 'Shift+Tab in lists'),
      opt('qm-firstindent', '¶', 'Indent the first line', () => { E.toggleFirstLineIndent(); syncQuill(); }));
  },
  pages(b) {
    b.append(back(), el('h3', {}, 'Pages & Chapters'),
      opt('qm-pagebreak', '✂', 'Page break here', () => E.pageBreak(), 'Ctrl+Enter'),
      opt('qm-chapter', '✠', 'Begin a chapter here', () => E.newChapterHere()),
      opt('qm-addleaf', '✚', 'Add a blank leaf after this', () => E.addLeafAfterCurrent()),
      opt('qm-tear', '✄', 'Tear out this leaf', () => E.tearOutCurrent()),
      opt('qm-unchapter', '⊘', 'Unmark this chapter', () => E.removeChapterMarkCurrent(), 'words stay'),
      opt('qm-flow', '⤵', 'Let the words flow…', () => openFlow(), 'spread text so none hides'));
  },
  caps(b) {
    const capThis = el('input', { type: 'checkbox', id: 'qm-dropcap-cb' });
    capThis.addEventListener('change', () => { const v = E.toggleDropCapCurrent(); if (v === null) capThis.checked = false; });
    const capAll = el('input', { type: 'checkbox', id: 'qm-dropcap-all-cb' });
    capAll.addEventListener('change', () => E.setAllDropCaps(capAll.checked));
    b.append(back(), el('h3', {}, 'Fancy First Letters'),
      el('label', { class: 'toggle', id: 'qm-dropcap' }, capThis, 'For this chapter'),
      el('label', { class: 'toggle', id: 'qm-dropcap-all' }, capAll, 'For every chapter'),
      el('div', { class: 'qm-note' }, 'The first letter of a chapter, writ large and red.'));
  },
  book(b) {
    const s = E.ed.book.settings;
    b.append(back(), el('h3', {}, 'The Book’s Usual Hand'),
      el('div', { class: 'qm-note', style: 'font-style:normal;opacity:1' }, `Now: ${s.bodyFont}, ${Math.round(s.bodySize / 2)} pt`),
      opt('qm-default', '✍', 'Use the typeface & size at my cursor', makeDefault),
      el('div', { class: 'qm-note' }, 'Every page without its own choices will follow the usual hand.'));
  },
};
const VIEW_OF = {
  'qm-fontlist': 'font', 'qm-import': 'font', 'qm-sizes': 'size', 'qm-align': 'align', 'qm-spacing': 'spacing',
  'qm-ul': 'lists', 'qm-ol': 'lists', 'qm-tab': 'lists', 'qm-indent': 'lists', 'qm-outdent': 'lists', 'qm-firstindent': 'lists',
  'qm-pagebreak': 'pages', 'qm-flow': 'pages', 'qm-chapter': 'pages', 'qm-addleaf': 'pages', 'qm-tear': 'pages', 'qm-unchapter': 'pages',
  'qm-dropcap': 'caps', 'qm-dropcap-all': 'caps', 'qm-default': 'book', 'qm-bold': 'main', 'qm-italic': 'main', 'qm-underline': 'main', 'qm-manner': 'main',
};

function normAlign(a) { return { start: 'left', end: 'right' }[a] || a; }
function fillFontList(list) {
  list.innerHTML = '';
  const groups = [['bundled', 'OF THE SCRIPTORIUM'], ['embedded', 'CARRIED IN THIS BOOK'], ['user', 'THINE OWN'], ['system', 'OF THY COMPUTER']];
  const fams = allFamilies();
  for (const [src, label] of groups) {
    const g = fams.filter(f => f.source === src);
    if (!g.length) continue;
    list.append(el('div', { class: 'grp' }, label));
    for (const f of g) {
      const it = el('div', { class: 'f clickable', 'data-family': f.family, onclick: () => E.setFontFamily(f.family).then(syncQuill) }, f.family);
      it.style.fontFamily = `"${f.family}", serif`;
      if (f.source === 'system' || f.source === 'user') ensureFamily(f.family);
      if (f.fsType === 2) it.dataset.tip = 'Its maker forbids embedding this typeface in documents. It will still be carried in thy .tome — mind its licence.';
      list.append(it);
    }
  }
}
function syncQuill() {
  if (!quillBox) return;
  const st = E.queryState();
  if (quillView === 'main') {
    const body = quillBox.querySelector('.qm-body'); body.innerHTML = ''; VIEWS.main(body, st);
  }
  const on = (id, v) => quillBox.querySelector('#' + id)?.classList.toggle('on', !!v);
  on('qm-bold', st.bold); on('qm-italic', st.italic); on('qm-underline', st.underline);
  on('qm-ul', st.ul); on('qm-ol', st.ol); on('qm-firstindent', st.firstIndent);
  for (const [k] of ALIGNS) on('qm-al-' + k, k === normAlign(st.align));
  for (const [v] of SPACINGS) on('qm-lh-' + String(v).replace('.', '_'), Math.abs(v - st.lh) < 0.01);
  quillBox.querySelectorAll('#qm-sizes [data-size]').forEach(b => b.classList.toggle('on', +b.dataset.size === Math.round(st.size / 2)));
  const sb = quillBox.querySelector('#qm-sizeval'); if (sb && document.activeElement !== sb) sb.value = Math.round(st.size / 2);
  quillBox.querySelectorAll('.font-list .f').forEach(f => f.classList.toggle('on', f.dataset.family === st.font));
  const ch = E.currentChapter();
  const cb = quillBox.querySelector('#qm-dropcap-cb'); if (cb) cb.checked = !!ch?.dropCap;
  const cba = quillBox.querySelector('#qm-dropcap-all-cb'); if (cba) cba.checked = !!E.ed.book?.settings.dropCaps;
}
function stepSize(dir) {
  const cur = Math.round(E.queryState().size / 2);
  let i = dir > 0 ? SIZES.findIndex(s => s > cur) : SIZES.length - 1 - [...SIZES].reverse().findIndex(s => s < cur);
  if (i < 0 || i >= SIZES.length) i = dir > 0 ? SIZES.length - 1 : 0;
  E.setFontSize(SIZES[i] * 2); syncQuill();
}
function makeDefault() {
  const st = E.queryState();
  E.setBookDefaults(st.font, st.size);
  toast(`The book’s usual hand is now ${st.font}, ${Math.round(st.size / 2)} pt.`);
  showView('book');
}
async function importFont() {
  const added = await window.scribe.fonts.import();
  if (!added.length) return;
  await refreshFonts();
  for (const a of added) await ensureFamily(a.family);
  const restricted = added.filter(a => a.fsType === 2).map(a => a.family);
  toast(`Brought to thy desk: ${added.map(a => a.family).join(', ')}`);
  if (restricted.length) setTimeout(() => toast(`Mind: ${restricted.join(', ')} forbids embedding by its maker’s licence.`, 4500), 2800);
  const list = document.getElementById('qm-fontlist'); if (list) fillFontList(list);
}

// ------------------------------------------------------------------ INKWELL
export function openInk() {
  popup('ink-palette', document.getElementById('prop-inkwell'), (box) => {
    box.append(el('h3', {}, 'Choose thine Ink'));
    const grid = el('div', { class: 'inks' });
    for (const [name, c] of INKS) {
      const i = el('i'); i.style.background = c;
      grid.append(el('div', { class: 'ink' + (c === currentInk ? ' on' : ''), 'data-tip': name, onclick: () => pick(c) }, i, name));
    }
    const custom = el('input', { type: 'color', value: currentInk, style: 'width:60px;height:36px;border:0;background:none;cursor:var(--cur-ink)' });
    custom.addEventListener('change', () => pick(custom.value));
    box.append(grid, el('div', { class: 'qm-row', style: 'margin-top:14px' }, el('span', {}, 'Mix thine own:'), custom));
    function pick(c) { setInkSwatch(c); E.setInk(c); props.inkwell.play('click'); box.close(); }
  }, { side: 'left' });
}

// ------------------------------------------------------------------ SPECTACLES
export function openSpectacles() {
  popup('spectacles-pop', document.getElementById('prop-spectacles'), (box) => {
    box.style.width = '420px';
    const s = app.settings();
    const val = el('span', {}, Math.round(s.uiScale * 100) + '%');
    const slider = el('input', { type: 'range', min: 75, max: 200, step: 5, value: Math.round(s.uiScale * 100), style: 'width:100%;accent-color:#8b1a12' });
    slider.addEventListener('input', () => { val.textContent = slider.value + '%'; app.setUiScale(slider.value / 100); });
    box.append(el('h3', {}, 'Spectacles'),
      el('div', { class: 'qm-note', style: 'font-style:normal;opacity:1' }, 'Size of menus, scrolls & labels'), slider, val,
      el('div', { class: 'qm-note', style: 'font-style:normal;opacity:1;margin-top:14px' }, 'Size of the cursor'),
      el('div', { class: 'qm-row', id: 'sp-cursor' }, ...[[24, 'Small'], [32, 'Usual'], [48, 'Large'], [64, 'Huge']].map(([n, label]) =>
        el('button', { class: 'qm-btn wide' + ((s.cursorSize || 32) === n ? ' on' : ''), onclick: async (e) => {
          await app.setCursorSize(n); box.querySelectorAll('#sp-cursor .qm-btn').forEach(b => b.classList.toggle('on', b === e.currentTarget)); } }, label))),
      el('div', { class: 'qm-row', style: 'margin-top:12px' },
        el('button', { class: 'btn', id: 'sp-full', onclick: () => window.scribe.toggleFullscreen() }, 'Full screen (F11)'),
        el('button', { class: 'btn', id: 'sp-flow', 'data-tip': 'Spread overflowing writing onto the pages that follow', onclick: () => { box.close(); openFlow(); } }, 'Let the words flow…')),
      el('div', { class: 'qm-note', style: 'font-style:normal;opacity:1;margin-top:14px' }, `This is edition ${app.version()} of the Scriptorium.`),
      el('div', { class: 'qm-note', style: 'margin-top:4px' }, '© 2026 Zadamanim. Free software under the GNU GPL v3 or later, with no warranty; its source dwells at github.com/Zadamanim/Scriptorium. Thy books are thine own, to keep or sell as thou wilt.'),
      el('div', { class: 'qm-row', style: 'margin-top:4px' }, el('button', { class: 'btn', id: 'sp-update', onclick: () => { box.close(); app.lookForEdition(); } }, 'Look for a new edition')),
      el('div', { class: 'qm-note', style: 'font-style:normal;opacity:1;margin-top:14px' }, 'Where thy Library dwells:'),
      el('div', { class: 'small', style: 'word-break:break-all' }, s.libraryRoot),
      el('div', { class: 'qm-row', style: 'margin-top:6px' },
        el('button', { class: 'btn', onclick: () => window.scribe.library.reveal() }, 'Show it'),
        el('button', { class: 'btn', onclick: async () => { const ns = await window.scribe.library.chooseRoot(); if (ns) { app.updateSettings(ns); box.close(); toast('The Library hath moved.'); } } }, 'Move it…')));
  }, { side: 'right' });
}

// ------------------------------------------------------------------ CRYSTAL BALL
const W_QUILL = 'upon the Quill';
function actions() {
  return [
    { label: 'Page break', keys: 'page break new page split next page ctrl enter', where: W_QUILL + ' › Pages', ctl: 'qm-pagebreak', run: () => E.pageBreak() },
    { label: 'Let the words flow onto following pages (redistribute)', keys: 'redistribute reflow overflow overfloweth flow spread text pages fit automatically extend distribute too much text', where: W_QUILL + ' › Pages · or click “overfloweth”', ctl: 'qm-flow', run: () => openFlow() },
    { label: 'Begin a new chapter', keys: 'chapter new chapter heading section part', where: W_QUILL + ' › Pages', ctl: 'qm-chapter', run: () => E.newChapterHere() },
    { label: 'Add a blank page', keys: 'add page blank leaf new page insert page more pages', where: W_QUILL + ' › Pages', ctl: 'qm-addleaf', run: () => E.addLeafAfterCurrent() },
    { label: 'Tear out (delete) this page', keys: 'delete page remove page tear erase leaf', where: W_QUILL + ' › Pages', ctl: 'qm-tear', run: () => E.tearOutCurrent() },
    { label: 'Bold', keys: 'bold strong heavy thick', where: W_QUILL + ' · Ctrl+B', ctl: 'qm-bold', run: () => E.cmd('bold') },
    { label: 'Italic', keys: 'italic italics slant emphasis', where: W_QUILL + ' · Ctrl+I', ctl: 'qm-italic', run: () => E.cmd('italic') },
    { label: 'Underline', keys: 'underline underscore line under', where: W_QUILL + ' · Ctrl+U', ctl: 'qm-underline', run: () => E.cmd('underline') },
    { label: 'Change the typeface (font)', keys: 'font typeface face family lettering style script', where: W_QUILL + ' › Typeface', ctl: 'qm-fontlist' },
    { label: 'Bring in a new font', keys: 'import font add font install font load font new typeface ttf otf', where: W_QUILL + ' › Typeface', ctl: 'qm-import', run: () => importFont() },
    { label: 'The book’s usual hand (default font)', keys: 'default font default size whole book body normal font', where: W_QUILL + ' › Book’s hand', ctl: 'qm-default' },
    { label: 'Size of letters', keys: 'size font size bigger smaller larger text size enlarge shrink', where: W_QUILL + ' › Size', ctl: 'qm-sizes' },
    { label: 'Space between lines', keys: 'line spacing leading space between lines double single', where: W_QUILL + ' › Line spacing', ctl: 'qm-spacing' },
    { label: 'Bulleted list', keys: 'bullet bullets bullet points list unordered', where: W_QUILL + ' › Lists', ctl: 'qm-ul', run: () => E.cmd('insertUnorderedList') },
    { label: 'Numbered list', keys: 'numbered list ordered numbers numbering', where: W_QUILL + ' › Lists', ctl: 'qm-ol', run: () => E.cmd('insertOrderedList') },
    { label: 'Indent', keys: 'indent margin push right', where: W_QUILL + ' › Lists', ctl: 'qm-indent', run: () => E.indent(1) },
    { label: 'Outdent', keys: 'outdent unindent push left', where: W_QUILL + ' › Lists', ctl: 'qm-outdent', run: () => E.indent(-1) },
    { label: 'Insert a tab', keys: 'tab tabs tabulate', where: 'Tab key · ' + W_QUILL, ctl: 'qm-tab', run: () => E.insertTab() },
    { label: 'First-line indent', keys: 'first line indent paragraph indent', where: W_QUILL + ' › Lists', ctl: 'qm-firstindent', run: () => E.toggleFirstLineIndent() },
    { label: 'Align: left, centre, right or justified', keys: 'align alignment center centre justify left right', where: W_QUILL + ' › Alignment', ctl: 'qm-align' },
    { label: 'Ink colour', keys: 'color colour ink text colour red blue green gold', where: 'the Inkwell', prop: 'inkwell', run: () => openInk() },
    { label: 'Fancy first letter for this chapter', keys: 'drop cap dropcap fancy first letter initial illuminated capital', where: W_QUILL + ' › Fancy letters', ctl: 'qm-dropcap', run: () => E.toggleDropCapCurrent() },
    { label: 'Fancy first letters for every chapter', keys: 'drop caps all chapters fancy letters every', where: W_QUILL + ' › Fancy letters', ctl: 'qm-dropcap-all' },
    { label: 'Unmark a chapter', keys: 'remove chapter unmark chapter delete chapter', where: W_QUILL + ' › Pages', ctl: 'qm-unchapter', run: () => E.removeChapterMarkCurrent() },
    { label: 'Contents (chapter list)', keys: 'contents table of contents toc chapters list jump skip', where: 'the Contents page, at the front', illum: '.page[data-kind="contents"]', run: () => E.goToSpread(1) },
    { label: 'Title & author', keys: 'title author name book name', where: 'the Title page, at the front', illum: '.title-page', run: () => E.goToSpread(0) },
    { label: 'Close the book (show its cover)', keys: 'close book cover shut front', where: 'turn back past the title page', illum: '#front-cover', run: () => E.goToSpread(-1) },
    { label: 'Turn to the next page', keys: 'next page turn forward', where: 'the lower-right corner · Ctrl+PageDown', illum: '#turn-next', run: () => E.turn(1) },
    { label: 'Turn back a page', keys: 'previous page turn back', where: 'the lower-left corner · Ctrl+PageUp', illum: '#turn-prev', run: () => E.turn(-1) },
    { label: 'Save (dry the ink)', keys: 'save dry store keep', where: 'the Pounce Pot · Ctrl+S', prop: 'pounce', run: () => app.save() },
    { label: 'Save as… (shelve a copy elsewhere)', keys: 'save as copy elsewhere duplicate another shelf move export', where: 'right-click the Pounce Pot · Ctrl+Shift+S', prop: 'pounce', run: () => app.saveAs() },
    { label: 'Seal the book with magic words (password)', keys: 'password lock protect secret diary seal private magic words encrypt', where: 'the clasp on the book’s edge', illum: '#clasp', run: () => app.clasp() },
    { label: 'Scale the menus (comfort)', keys: 'scale zoom bigger interface ui size comfort eyes read', where: 'the Spectacles', prop: 'spectacles', run: () => openSpectacles() },
    { label: 'Size of the cursor (mouse pointer)', keys: 'cursor mouse pointer size bigger arrow large', where: 'the Spectacles', prop: 'spectacles', run: () => openSpectacles() },
    { label: 'Look for a new edition (update)', keys: 'update updates new version edition upgrade latest download raven', where: 'the Spectacles · the raven comes to the window', prop: 'spectacles', run: () => app.lookForEdition() },
    { label: 'Full screen', keys: 'full screen fullscreen maximise maximize', where: 'the Spectacles · F11', prop: 'spectacles', run: () => window.scribe.toggleFullscreen() },
    { label: 'Leave the desk (back to the window)', keys: 'back return menu home main menu window look up leave desk library', where: 'the Candle · or the top edge of the screen', prop: 'candle', run: () => app.leaveDesk() },
    { label: 'Close Scriptorium', keys: 'quit exit close application leave door', where: 'the Doorway: look left from the window', run: () => app.quitApp() },
    { label: 'Undo', keys: 'undo mistake revert', where: 'Ctrl+Z', run: () => E.cmd('undo') },
    { label: 'Redo', keys: 'redo again', where: 'Ctrl+Y', run: () => E.cmd('redo') },
  ];
}
function score(a, q) {
  const words = q.toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return 0;
  const lab = a.label.toLowerCase(), keys = a.keys;
  let s = 0;
  for (const w of words) {
    if (lab.includes(w)) s += 3;
    else if (keys.split(' ').some(k => k === w)) s += 3;
    else if (keys.includes(w)) s += 2;
    else if (w.length > 2 && keys.split(' ').some(k => k.startsWith(w.slice(0, 3)))) s += 1;
    else s -= 1;
  }
  if (keys.includes(q.toLowerCase().trim())) s += 2;
  return s;
}
export function openCrystal() {
  props.crystal.play('hover');
  const input = el('input', { class: 'field', placeholder: 'e.g. “page break”, “bigger letters”, “red ink”, “password”…' });
  const ul = el('ul', { class: 'answers' });
  let found = [], sel = 0;
  const body = el('div', {}, el('div', { class: 'seek' }, 'What dost thou seek?'), input, ul);
  const draw = () => {
    const q = input.value.trim();
    found = q ? actions().map(a => [score(a, q), a]).filter(([s]) => s > 0).sort((x, y) => y[0] - x[0]).slice(0, 8).map(([, a]) => a) : [];
    sel = Math.min(sel, Math.max(0, found.length - 1));
    ul.innerHTML = '';
    if (q && !found.length) ul.append(el('li', { class: 'none' }, 'The mists are cloudy… try other words.'));
    found.forEach((a, i) => ul.append(el('li', { class: i === sel ? 'sel' : '', onclick: () => choose(a) }, el('span', {}, a.label), el('span', { class: 'where' }, a.where || ''))));
  };
  let box;
  const choose = (a) => { box.close(null); setTimeout(() => perform(a), 40); };
  input.addEventListener('input', () => { sel = 0; draw(); });
  input.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown') { sel = Math.min(found.length - 1, sel + 1); draw(); e.preventDefault(); }
    if (e.key === 'ArrowUp') { sel = Math.max(0, sel - 1); draw(); e.preventDefault(); }
    if (e.key === 'Enter' && found[sel]) { e.preventDefault(); e.stopPropagation(); choose(found[sel]); }
  });
  dialog({ id: 'crystal-dialog', title: 'The Crystal Ball', body, buttons: [], onOpen: (b) => { box = b; b.noEnter = true; } });
}
function perform(a) {
  const glow = [];
  if (a.ctl) {
    toggleQuillMenu(true);
    showView(VIEW_OF[a.ctl] || 'main');
    const c = document.getElementById(a.ctl);
    c?.scrollIntoView({ block: 'nearest' });
    glow.push(c, document.getElementById('prop-quill'));
  }
  if (a.prop) glow.push(document.getElementById('prop-' + a.prop));
  if (a.illum) glow.push(document.querySelector(a.illum));
  illuminate(glow);
  Promise.resolve(a.run ? a.run() : null).finally(() => setTimeout(() => {
    const again = [a.illum ? document.querySelector(a.illum) : null, a.ctl ? document.getElementById(a.ctl) : null];
    illuminate(again);
  }, 500));
}
export function illuminate(els) {
  for (const e of els) {
    if (!e) continue;
    e.classList.remove('illuminated'); void e.offsetWidth; e.classList.add('illuminated');
    setTimeout(() => e.classList.remove('illuminated'), 3800);
  }
}

// ------------------------------------------------------------------ LET THE WORDS FLOW (redistribute)
export async function openFlow(pageIndex) {
  const P = E.ed.book.pages;
  const i = Math.max(2, pageIndex ?? E.currentIndex());
  const [a, b] = E.chapterBounds(i);
  const ch = P[a]?.chapter;
  const lastFolio = P.length - 2;
  const radio = (v, label, checked) => el('label', {}, el('input', { type: 'radio', name: 'flow', value: v, checked }), label);
  const fromBox = el('input', { class: 'field', type: 'number', min: 1, max: lastFolio, value: folio(i), style: 'width:80px;font-size:18px;padding:2px 6px' });
  const toBox = el('input', { class: 'field', type: 'number', min: 1, max: lastFolio, value: lastFolio, style: 'width:80px;font-size:18px;padding:2px 6px' });
  const keep = el('input', { type: 'checkbox', checked: true });
  const range = el('label', {}, el('input', { type: 'radio', name: 'flow', value: 'range' }), 'Only pages ', fromBox, ' to ', toBox);
  [fromBox, toBox].forEach(x => x.addEventListener('focus', () => { range.querySelector('input').checked = true; }));
  const err = el('p', { class: 'small', style: 'color:#8b1a12;min-height:1.1em;margin:4px 0 0' });
  const body = el('div', {},
    el('p', {}, 'Spread the writing across pages so nothing hides below a page’s frame. Pages that hold too little are filled from the pages after them. Picture pages are left as they are.'),
    el('div', { class: 'shelf-pick' },
      radio('chapter', ch ? `This chapter — “${ch.title}” (pages ${folio(a)}–${folio(b)})` : `These pages (${folio(a)}–${folio(b)})`, true),
      radio('book', `The whole book (pages 1–${lastFolio})`, false),
      range),
    el('label', { class: 'toggle' }, keep, 'Keep the page breaks I made myself'),
    el('p', { class: 'small', style: 'margin:2px 0 0 36px' }, 'Chapters always begin on a fresh page.'),
    err);
  const r = await dialog({
    title: 'Let the Words Flow', body,
    buttons: [{ label: 'Nay', value: null }, { label: 'Let them flow', kind: 'primary', value: () => {
      const mode = body.querySelector('input[name=flow]:checked').value;
      if (mode === 'chapter') return [a, b];
      if (mode === 'book') return [2, P.length - 1];
      const f = Math.round(+fromBox.value), t = Math.round(+toBox.value);
      if (!(f >= 1 && t >= f && t <= lastFolio)) { err.textContent = `Choose pages between 1 and ${lastFolio}, the first no later than the last.`; return STAY; }
      return [f + 1, t + 1];
    } }],
  });
  if (!r) return;
  document.body.classList.add('busy');
  await new Promise(res => setTimeout(res, 30));
  try {
    const out = E.flowPages(r[0], r[1], { keepBreaks: keep.checked });
    const msg = out.after === out.before ? `The words have settled on ${out.after} page${out.after === 1 ? '' : 's'}.`
      : out.after > out.before ? `The words flowed onto ${out.after - out.before} more page${out.after - out.before === 1 ? '' : 's'}.`
      : `The words gathered up; ${out.before - out.after} page${out.before - out.after === 1 ? '' : 's'} fewer.`;
    toastAction(msg, 'Undo', () => { E.restorePages(out.snap); toast('Put back as it was.'); });
  } finally { document.body.classList.remove('busy'); }
}
