// The open book: two-page spread, editing, page breaks, chapters.
import { folio, chapters, uid, sanitizeHTML } from './book.js';
import { el, confirmBox, promptBox, toast } from './ui.js';
import { cssFamily, ensureFamily } from './fonts.js';
import { redistribute } from './flow.js';

export const ed = {
  book: null, spread: 1,
  savedRange: null, savedEditable: null, pendingSize: null,
  sealed: false, locked: false, hint: '', readOnly: false,
  flip: 1, // page-turn speed: 0 instant, 0.55 brisk, 1 usual, 1.7 leisurely
  onDirty: () => {}, onTitle: () => {}, onSelection: () => {}, onClasp: () => {}, onUnlock: () => {}, onFlow: () => {}, onMarkMenu: () => {}, onRunhead: () => {},
};
export function initBookChrome() {
  document.getElementById('front-cover').addEventListener('click', () => { if (ed.locked) ed.onUnlock(); else goToSpread(0); });
  document.getElementById('clasp').addEventListener('click', () => { if (ed.locked) ed.onUnlock(); else if (ed.readOnly) toast('Books are sealed at the writing desk.'); else ed.onClasp(); });
}
const pages = () => ed.book.pages;
const $spread = () => document.getElementById('spread');
const spreadOf = (i) => Math.floor((i + 1) / 2);
const indicesOf = (s) => [s * 2 - 1, s * 2];
const maxSpread = () => spreadOf(pages().length);
const markDirty = () => ed.onDirty();

// ------------------------------------------------------------------ open / settings
export function openBook(book, { spread = 1, focusFirst = false } = {}) {
  ed.book = book; ed.spread = spread; ed.savedRange = null; ed.savedEditable = null;
  applyBookSettings();
  render();
  if (focusFirst) {
    const first = pages().findIndex(p => p.kind === 'text');
    focusPageText(first, 'end');
  }
}

export function setFlipSpeed(k) { ed.flip = k; document.documentElement.style.setProperty('--flip-k', String(k || 0.01)); }
export function applyBookSettings() {
  const s = ed.book.settings, b = document.getElementById('book');
  b.style.setProperty('--body-font', `${cssFamily(s.bodyFont)}, serif`);
  b.style.setProperty('--body-size', `${s.bodySize}px`);
  b.style.setProperty('--cap-font', `${cssFamily(s.capFont)}, serif`);
  b.style.setProperty('--title-font', `${cssFamily(s.titleFont)}, serif`);
}

// ------------------------------------------------------------------ rendering
export function render() {
  const sp = $spread();
  sp.innerHTML = '';
  const book = document.getElementById('book');
  book.classList.toggle('closed', ed.spread < 0);
  book.classList.toggle('sealed', ed.sealed || ed.locked);
  book.classList.toggle('readonly', ed.readOnly);
  renderCover();
  renderRibbons();
  if (ed.spread < 0) return;
  const [l, r] = indicesOf(ed.spread);
  sp.append(renderPage(l, 'left'), renderPage(r, 'right'));
  document.getElementById('turn-prev').classList.toggle('disabled', ed.spread < 0);
  document.getElementById('turn-prev').dataset.tip = ed.spread === 0 ? 'Close the book' : 'Turn back a leaf';
  document.getElementById('turn-next').classList.toggle('disabled', ed.spread >= maxSpread());
  sp.querySelectorAll('.page').forEach(pg => { const t = pg.querySelector('.text'); if (t) checkOverflow(pg, t); });
}

// ------------------------------------------------------------------ ribbons: one silk ribbon per chapter, a cord for each mark
// Like a real book, a ribbon for an earlier page hangs out on the left, a later one on the right,
// and one marking the open pages hangs from the middle.
const RIBBON_COLORS = ['#8b1a12', '#1f3a8a', '#2f6b4f', '#5b1f4f', '#b8902e', '#6e3a1e', '#20484a', '#7e1a22'];
function ribbonItems() {
  const P = pages(), items = [];
  chapters(ed.book).forEach((c, k) => items.push({ kind: 'chapter', index: c.index, name: c.title, color: RIBBON_COLORS[k % RIBBON_COLORS.length] }));
  for (const m of ed.book.marks || []) { const i = P.findIndex(p => p.id === m.pageId); if (i >= 0) items.push({ kind: 'mark', index: i, name: m.name, mark: m }); }
  return items;
}
function renderRibbons() {
  const book = document.getElementById('book');
  let box = document.getElementById('ribbons');
  if (!box) { box = el('div', { id: 'ribbons' }); book.append(box); }
  box.innerHTML = '';
  if (ed.locked) return;
  const items = ribbonItems();
  const closed = ed.spread < 0;
  const [l, r] = closed ? [-1, -1] : indicesOf(ed.spread);
  const put = (list, x0, step) => list.forEach((t, k) => {
    const x = x0 + k * step;
    if (x < 20 || x > 1000) return;
    const len = 70 + ((t.index * 37 + k * 11) % 26);
    const tip = `${t.kind === 'chapter' ? 'Chapter' : 'Mark'}: ${t.name} — page ${folio(t.index) || '—'}` + (t.kind === 'mark' && !ed.readOnly ? ' (right-click to rename or remove)' : '');
    const rb = el('div', { class: `ribbon ${t.kind} clickable`, 'data-tip': tip, style: `left:${x}px;height:${len}px;--rc:${t.color || '#b8902e'}` });
    rb.addEventListener('click', () => { if (ed.locked) return; goToPage(t.index).then(() => { if (!ed.readOnly) focusPageText(t.index, 'start'); }); });
    if (t.mark) rb.addEventListener('contextmenu', (e) => { e.preventDefault(); if (!ed.readOnly) ed.onMarkMenu(t.mark); });
    box.append(rb);
  });
  if (closed) { put(items.sort((a, b) => a.index - b.index), 556, 28); return; }
  put(items.filter(t => t.index < l).sort((a, b) => b.index - a.index), 470, -28);
  put(items.filter(t => t.index === l || t.index === r), 498, 16);
  put(items.filter(t => t.index > r).sort((a, b) => a.index - b.index), 548, 28);
}
export function addMarkHere() {
  if (ed.readOnly) return;
  const i = currentIndex();
  const p = pages()[i];
  if (!p || p.kind !== 'text') { toast('Marks go on pages of writing.'); return; }
  return promptBox('Place a Mark', `What shall the mark on page ${folio(i)} be called?`, `Page ${folio(i)}`, 'Place it').then((name) => {
    if (!name) return;
    (ed.book.marks ||= []).push({ id: uid(), pageId: p.id, name });
    markDirty(); render(); refreshContents();
  });
}
export function renameMark(m, name) { m.name = name; markDirty(); render(); refreshContents(); }
export function removeMark(m) { ed.book.marks = (ed.book.marks || []).filter(x => x !== m); markDirty(); render(); refreshContents(); }

function renderCover() {
  const fc = document.getElementById('front-cover');
  fc.innerHTML = '';
  fc.append(el('div', { class: 'fc-orn' }, '❦'), el('div', { class: 'fc-title' }, ed.book.title || 'Untitled Tome'),
    el('div', { class: 'fc-orn' }, '✠'), el('div', { class: 'fc-author' }, ed.book.author || ''));
  if (ed.locked) fc.append(el('div', { class: 'fc-hint' }, 'Sealed with magic words. Touch the seal to speak them.'));
  fc.dataset.tip = ed.locked ? 'This book is sealed — speak the magic words to open it' : 'Open the book';
  const clasp = document.getElementById('clasp');
  clasp.querySelector('.wax')?.remove();
  if (ed.sealed || ed.locked) clasp.append(el('img', { class: 'wax', src: '../assets/props/seal_idle.svg', alt: '' }));
  clasp.dataset.tip = ed.locked ? 'Sealed — speak the magic words' : ed.sealed ? 'Sealed with magic words — click to change or break the seal' : 'The clasp — seal this book with magic words (a password)';
}

function chapterAt(i) {
  for (let j = i; j >= 0; j--) if (pages()[j]?.chapter) return pages()[j].chapter;
  return null;
}

function renderPage(i, side) {
  const P = pages();
  if (i < 0) {
    return el('div', { class: 'endpaper left' }, el('div', { class: 'bookplate' },
      el('div', { class: 'ex' }, 'Ex Libris'), el('div', { class: 'who' }, ed.book.author || 'a Scribe unknown')));
  }
  if (i >= P.length) {
    if (i === P.length && !ed.readOnly) {
      const pg = el('div', { class: `page ${side}` });
      pg.append(el('button', { class: 'add-leaf clickable', 'data-tip': 'Sew another blank page into the book', onclick: () => addPageAt(P.length, true) }, '✚ Add a fresh leaf'));
      return pg;
    }
    return el('div', { class: `endpaper ${side}` });
  }
  const p = P[i];
  const pg = el('div', { class: `page ${side}`, 'data-index': i, 'data-kind': p.kind });
  if (p.kind === 'title') pg.append(renderTitle());
  else if (p.kind === 'contents') pg.append(renderContents());
  else if (p.kind === 'text') renderText(pg, p, i, side);
  return pg;
}

function renderTitle() {
  const wrap = el('div', { class: 'title-page' });
  const t = el('div', { class: 'book-title', contenteditable: ed.readOnly ? 'false' : 'plaintext-only', spellcheck: 'true', 'data-field': 'title' });
  t.textContent = ed.book.title;
  const a = el('div', { class: 'book-author', contenteditable: ed.readOnly ? 'false' : 'plaintext-only', spellcheck: 'false', 'data-field': 'author' });
  a.textContent = ed.book.author;
  for (const f of [t, a]) {
    f.addEventListener('input', () => { ed.book[f.dataset.field] = f.textContent.replace(/\n/g, ' '); markDirty(); ed.onTitle(); const who = document.querySelector('.bookplate .who'); if (who) who.textContent = ed.book.author || 'a Scribe unknown'; });
    f.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); (f === t ? a : null)?.focus(); if (f === a) f.blur(); } });
  }
  wrap.append(t, el('div', { class: 'ornament' }, '❦ ✠ ❦'), el('div', { class: 'by-line' }, 'set down by the hand of'), a,
    el('div', { class: 'colophon' }, 'Here beginneth the book'));
  return wrap;
}

function renderContents() {
  const wrap = el('div', { class: 'contents-page' });
  wrap.append(el('h2', {}, 'Contents'));
  const ch = chapters(ed.book);
  if (!ch.length) wrap.append(el('div', { class: 'toc-empty' }, 'No chapters yet. Ask the Quill to begin one.'));
  const ul = el('ul', { class: 'toc' });
  for (const c of ch) {
    ul.append(el('li', { class: 'clickable', 'data-tip': 'Turn to this chapter', onclick: () => { goToPage(c.index).then(() => focusPageText(c.index, 'start')); } },
      el('span', { class: 't' }, c.title), el('span', { class: 'dots' }), el('span', { class: 'n' }, folio(c.index))));
  }
  wrap.append(ul);
  const marks = ribbonItems().filter(t => t.kind === 'mark').sort((a, b) => a.index - b.index);
  if (marks.length) {
    wrap.append(el('h2', { class: 'toc-marks' }, 'Marks'));
    const ml = el('ul', { class: 'toc' });
    for (const m of marks) ml.append(el('li', { class: 'clickable', 'data-tip': 'Turn to this mark', onclick: () => { goToPage(m.index).then(() => { if (!ed.readOnly) focusPageText(m.index, 'start'); }); } },
      el('span', { class: 't' }, '⟡ ' + m.name), el('span', { class: 'dots' }), el('span', { class: 'n' }, folio(m.index))));
    wrap.append(ml);
  }
  return wrap;
}

export function refreshContents() {
  const c = document.querySelector('.page[data-kind="contents"]');
  if (c) { c.innerHTML = ''; c.append(renderContents()); }
}

function renderText(pg, p, i, side) {
  if (p.chapter) {
    pg.classList.add('chapter-start');
    if (p.chapter.dropCap) pg.classList.add('dropcap');
    const ct = el('div', { class: 'chapter-title', contenteditable: ed.readOnly ? 'false' : 'plaintext-only', spellcheck: 'true' });
    ct.textContent = p.chapter.title;
    ct.addEventListener('input', () => { p.chapter.title = ct.textContent.replace(/\n/g, ' '); markDirty(); refreshContents(); });
    ct.addEventListener('keydown', (e) => { if (e.key === 'Enter' || (e.key === 'ArrowDown')) { e.preventDefault(); focusPageText(i, 'start'); } });
    pg.append(ct);
  } else {
    const head = side === 'left' ? ed.book.title : (chapterAt(i)?.title || '');
    if (head) pg.append(el('div', { class: 'runhead clickable', 'data-tip': ed.readOnly ? 'Turn to the Contents' : 'Pages & chapters', onclick: () => ed.onRunhead(i) }, head));
  }
  const text = el('div', { class: 'text', contenteditable: ed.readOnly ? 'false' : 'true', spellcheck: ed.readOnly ? 'false' : 'true' });
  text.innerHTML = p.html || '<p><br></p>';
  text.addEventListener('input', () => onTextInput(text, p, pg));
  text.addEventListener('keydown', (e) => onTextKey(e, text, i));
  text.addEventListener('paste', onPaste);
  text.addEventListener('drop', (e) => e.preventDefault());
  pg.append(text, el('div', { class: 'folio' }, folio(i)),
    el('div', { class: 'overflow-flag clickable', 'data-tip': 'This page holds more than its frame can show. Click to let the words flow onto the pages that follow.', onclick: () => ed.onFlow(i) }, 'overfloweth ⤵'));
}

function checkOverflow(pg, text) {
  pg.classList.toggle('overflowing', text.scrollHeight > text.clientHeight + 2);
}

// ------------------------------------------------------------------ editing events
function onTextInput(text, p, pg) {
  if (!text.firstElementChild || text.innerHTML === '<br>') {
    text.innerHTML = '<p><br></p>';
    placeCaret(text.firstChild, 0);
  }
  // keep every line inside a paragraph block
  const r = caretRange();
  if (r && r.collapsed) {
    let n = r.startContainer;
    while (n && n.parentNode !== text) n = n.parentNode;
    if (n && (n.nodeType === 3 || !/^(P|DIV|UL|OL|LI)$/.test(n.nodeName))) document.execCommand('formatBlock', false, 'p');
  }
  fixSizes(text);
  p.html = text.innerHTML;
  markDirty();
  checkOverflow(pg, text);
}

function onTextKey(e, text, i) {
  const k = e.key;
  if (k === 'Tab') {
    e.preventDefault();
    if (inList()) document.execCommand(e.shiftKey ? 'outdent' : 'indent');
    else if (!e.shiftKey) document.execCommand('insertText', false, '\t');
    return;
  }
  if (k === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); pageBreak(); return; }
  if (k === 'Backspace' && !e.ctrlKey && atEdge(text, 'start')) { if (mergeWithPrevious(i)) e.preventDefault(); return; }
  if ((k === 'ArrowDown' || k === 'ArrowRight') && !e.shiftKey && atEdge(text, 'end')) { if (focusNeighbor(i, 1)) e.preventDefault(); return; }
  if ((k === 'ArrowUp' || k === 'ArrowLeft') && !e.shiftKey && atEdge(text, 'start')) { if (focusNeighbor(i, -1)) e.preventDefault(); }
}

function onPaste(e) {
  e.preventDefault();
  const html = e.clipboardData.getData('text/html');
  const plain = e.clipboardData.getData('text/plain');
  if (html) {
    const clean = el('div', { html: sanitizeHTML(html) });
    clean.querySelectorAll('[style]').forEach(n => { ['font-family', 'font-size', 'color', 'line-height', 'margin-left', 'text-indent'].forEach(s => n.style.removeProperty(s)); if (!n.getAttribute('style')) n.removeAttribute('style'); });
    document.execCommand('insertHTML', false, clean.innerHTML);
  } else document.execCommand('insertText', false, plain);
}

// ------------------------------------------------------------------ selection
document.addEventListener('selectionchange', () => {
  const s = getSelection();
  if (!s.rangeCount) return;
  const n = s.anchorNode;
  const host = n && (n.nodeType === 1 ? n : n.parentElement)?.closest('#book [contenteditable]');
  if (host) { ed.savedRange = s.getRangeAt(0).cloneRange(); ed.savedEditable = host; ed.onSelection(); }
});
export function restoreSelection() {
  // if the live cursor is already in the book, trust it (saved copy may lag behind fast typing)
  const live = getSelection();
  if (live.rangeCount) {
    const n = live.anchorNode;
    const host = n && (n.nodeType === 1 ? n : n.parentElement)?.closest('#book [contenteditable]');
    if (host && document.activeElement === host) { ed.savedRange = live.getRangeAt(0).cloneRange(); ed.savedEditable = host; return true; }
  }
  const r = ed.savedRange, h = ed.savedEditable;
  if (!r || !h || !document.contains(h) || !document.contains(r.startContainer)) return false;
  if (document.activeElement !== h) h.focus({ preventScroll: true });
  const s = getSelection(); s.removeAllRanges(); s.addRange(r);
  return true;
}
const caretRange = () => { const s = getSelection(); return s.rangeCount ? s.getRangeAt(0) : null; };
function placeCaret(node, offset) {
  const r = document.createRange(); r.setStart(node, offset); r.collapse(true);
  const s = getSelection(); s.removeAllRanges(); s.addRange(r);
}
function atEdge(root, edge) {
  const r = caretRange();
  if (!r || !r.collapsed) return false;
  const span = document.createRange();
  span.selectNodeContents(root);
  if (edge === 'start') span.setEnd(r.startContainer, r.startOffset); else span.setStart(r.endContainer, r.endOffset);
  if (span.toString().length) return false;
  const f = span.cloneContents();
  return f.querySelectorAll('p,div,li').length <= 1 && f.querySelectorAll('br').length <= (edge === 'end' ? 1 : 0);
}
function inList() {
  const r = caretRange(); if (!r) return false;
  const n = r.startContainer;
  return !!(n.nodeType === 1 ? n : n.parentElement)?.closest('li');
}
export function activeText() {
  const h = ed.savedEditable;
  return h && h.classList.contains('text') && document.contains(h) ? h : null;
}
export function currentIndex() {
  const h = ed.savedEditable;
  const pg = h && document.contains(h) ? h.closest('.page') : null;
  if (pg && pg.dataset.index) return +pg.dataset.index;
  const [l, r] = indicesOf(ed.spread);
  return [r, l].find(i => pages()[i]?.kind === 'text') ?? pages().findIndex(p => p.kind === 'text');
}
function afterCommand() {
  const t = activeText();
  if (t) t.dispatchEvent(new Event('input'));
  else if (ed.savedEditable) ed.savedEditable.dispatchEvent(new Event('input'));
  ed.onSelection();
}

// ------------------------------------------------------------------ navigation
let turning = false;
export function turn(dir) { return goToSpread(ed.spread + dir); }
export function goToPage(i) { return goToSpread(spreadOf(i)); }
export function goToSpread(s) {
  s = Math.max(-1, Math.min(maxSpread(), s));
  if (s === ed.spread || turning) return Promise.resolve();
  if (ed.locked && s >= 0) { ed.onUnlock(); return Promise.resolve(); }
  if (s === -1 || ed.spread === -1) return swingCover(s);
  const fwd = s > ed.spread;
  turning = true;
  const book = document.getElementById('book');
  const k = ed.flip;
  if (!k) { ed.spread = s; ed.savedRange = null; render(); turning = false; return Promise.resolve(); }
  // The leaf that turns carries the real writing: its front is the page being lifted, its back
  // is the page that lands on the other side. The page beneath it is laid out straight away.
  const sp = $spread();
  const [l, r] = indicesOf(s);
  const lifted = fwd ? sp.lastElementChild : sp.firstElementChild;
  const beneath = fwd ? renderPage(r, 'right') : renderPage(l, 'left');
  const landing = fwd ? renderPage(l, 'left') : renderPage(r, 'right');
  const face = (pg, cls) => {
    pg.removeAttribute('data-index');
    pg.querySelectorAll('[contenteditable]').forEach(n => n.setAttribute('contenteditable', 'false'));
    pg.querySelectorAll('.overflow-flag, .add-leaf').forEach(n => n.remove());
    return el('div', { class: 'leaf-face ' + cls }, pg, el('div', { class: 'leaf-shade' }));
  };
  const front = lifted.cloneNode(true);
  const scrolled = lifted.querySelector('.text')?.scrollTop || 0;
  const leaf = el('div', { class: 'turning-leaf ' + (fwd ? 'fwd' : 'back') }, face(front, 'front'), face(landing, 'back'));
  ed.savedRange = null;
  lifted.replaceWith(beneath);
  book.append(leaf);
  const ft = front.querySelector('.text'); if (ft) ft.scrollTop = scrolled;
  return new Promise((res) => {
    setTimeout(() => { ed.spread = s; render(); leaf.remove(); turning = false; res(); }, 430 * k);
  });
}
function coverLeaf(dir) {
  // two-faced: the outside (title in gold) and the inside (marbled endpaper)
  const front = document.getElementById('front-cover').cloneNode(true);
  front.removeAttribute('id'); front.classList.add('face', 'front');
  const plate = document.querySelector('#spread .endpaper.left .bookplate')?.cloneNode(true)
    || el('div', { class: 'bookplate' }, el('div', { class: 'ex' }, 'Ex Libris'), el('div', { class: 'who' }, ed.book.author || 'a Scribe unknown'));
  const back = el('div', { class: 'face back' }, el('div', { class: 'endpaper left' }, plate));
  return el('div', { class: 'cover-leaf ' + dir }, front, back);
}
function swingCover(s) {
  turning = true;
  const book = document.getElementById('book');
  ed.savedRange = null;
  const k = ed.flip;
  if (!k) { ed.spread = s; render(); book.style.transform = ''; turning = false; return Promise.resolve(); }
  const SWING = 600 * k;
  if (s >= 0) { // opening: slide into place, then lift the cover over to the left
    book.style.transform = 'none';
    return new Promise((res) => setTimeout(() => {
      const leaf = coverLeaf('opening');
      book.classList.add('swinging');
      ed.spread = s; render();
      book.append(leaf);
      setTimeout(() => { book.classList.remove('swinging'); leaf.remove(); book.style.transform = ''; turning = false; res(); }, SWING);
    }, 330 * k));
  }
  // closing: the cover swings over from the left, then the book slides to the middle
  renderCover();
  const leaf = coverLeaf('closing');
  book.classList.add('swinging');
  book.append(leaf);
  return new Promise((res) => setTimeout(() => {
    ed.spread = -1; render();
    book.classList.remove('swinging'); leaf.remove();
    setTimeout(() => { turning = false; res(); }, 360 * k);
  }, SWING));
}
export function focusPageText(i, where = 'start') {
  const t = document.querySelector(`.page[data-index="${i}"] .text`);
  if (!t) return false;
  t.focus({ preventScroll: true });
  const r = document.createRange(); r.selectNodeContents(t); r.collapse(where === 'start');
  const s = getSelection(); s.removeAllRanges(); s.addRange(r);
  if (where === 'end') t.scrollTop = t.scrollHeight; else t.scrollTop = 0;
  return true;
}
function focusNeighbor(i, dir) {
  const j = i + dir;
  if (pages()[j]?.kind !== 'text') return false;
  const where = dir > 0 ? 'start' : 'end';
  if (spreadOf(j) === ed.spread) return focusPageText(j, where);
  goToPage(j).then(() => focusPageText(j, where));
  return true;
}

// ------------------------------------------------------------------ page operations
function isEmptyBlock(n) { return n && n.nodeType === 1 && !n.textContent.trim() && !n.querySelector('li'); }
function wrapInline(root) {
  let run = null;
  for (const n of [...root.childNodes]) {
    const inline = n.nodeType === 3 || (n.nodeType === 1 && !/^(P|DIV|UL|OL|LI)$/.test(n.nodeName));
    if (inline) { if (n.nodeType === 3 && !n.nodeValue.length) { n.remove(); continue; } if (!run) { run = document.createElement('p'); n.before(run); } run.append(n); }
    else run = null;
  }
}

/** split the current page at the caret; text after the caret moves onto a new page */
export function pageBreak(extra = {}) {
  if (!restoreSelection()) { toast('Place thy quill (cursor) within a page first.'); return; }
  const text = activeText();
  if (!text) { toast('Place thy quill (cursor) within a page of text first.'); return; }
  const i = +text.closest('.page').dataset.index;
  const r = caretRange();
  if (!r.collapsed) r.deleteContents();
  const tail = document.createRange();
  tail.setStart(r.startContainer, r.startOffset);
  tail.setEnd(text, text.childNodes.length);
  const holder = document.createElement('div');
  holder.append(tail.extractContents());
  wrapInline(text); wrapInline(holder);
  if (text.children.length > 1 && isEmptyBlock(text.lastElementChild)) text.lastElementChild.remove();
  if (holder.children.length > 1 && isEmptyBlock(holder.firstElementChild)) holder.firstElementChild.remove();
  if (!text.textContent.trim() && !text.querySelector('li')) text.innerHTML = '<p><br></p>';
  if (!holder.textContent.trim() && !holder.querySelector('li')) holder.innerHTML = '<p><br></p>';
  pages()[i].html = text.innerHTML;
  pages().splice(i + 1, 0, { id: uid(), kind: 'text', html: holder.innerHTML, hardBreak: true, ...extra });
  markDirty();
  const j = i + 1;
  if (spreadOf(j) === ed.spread) { render(); focusPageText(j, 'start'); }
  else goToPage(j).then(() => focusPageText(j, 'start'));
  refreshContents();
}

/** backspace at the very start of a page pulls it back onto the page before */
function mergeWithPrevious(i) {
  const P = pages(), prev = P[i - 1], cur = P[i];
  if (!prev || prev.kind !== 'text' || !cur || cur.chapter) return false;
  const A = el('div', { html: prev.html }), B = el('div', { html: cur.html });
  wrapInline(A); wrapInline(B);
  const last = A.lastElementChild, first = B.firstElementChild;
  const marker = el('span', { 'data-caret': '1' });
  if (last && first && /^(P|DIV)$/.test(last.nodeName) && /^(P|DIV)$/.test(first.nodeName)) {
    if (!last.textContent.length) last.innerHTML = '';
    last.append(marker);
    if (first.textContent.length) last.append(...first.childNodes);
    first.remove();
  } else (last || A).append(marker);
  A.append(...B.childNodes);
  prev.html = A.innerHTML;
  P.splice(i, 1);
  markDirty();
  const land = () => {
    const m = document.querySelector('#spread [data-caret]');
    if (!m) return;
    const t = m.closest('.text');
    t.focus({ preventScroll: true });
    const r = document.createRange(); r.setStartBefore(m); r.collapse(true);
    const s = getSelection(); s.removeAllRanges(); s.addRange(r);
    m.remove();
    pages()[+t.closest('.page').dataset.index].html = t.innerHTML;
    t.dispatchEvent(new Event('input'));
  };
  if (spreadOf(i - 1) === ed.spread) { render(); land(); } else goToPage(i - 1).then(land);
  return true;
}

export function addPageAt(j, focus = false) {
  pages().splice(j, 0, { id: uid(), kind: 'text', html: '<p><br></p>' });
  markDirty();
  if (spreadOf(j) === ed.spread) render(); else return goToPage(j).then(() => focus && focusPageText(j));
  if (focus) focusPageText(j);
}
export function addLeafAfterCurrent() {
  const i = currentIndex();
  const j = i + 1;
  pages().splice(j, 0, { id: uid(), kind: 'text', html: '<p><br></p>', hardBreak: true });
  markDirty();
  if (spreadOf(j) === ed.spread) { render(); focusPageText(j); } else goToPage(j).then(() => focusPageText(j));
}
export async function tearOutCurrent() {
  const i = currentIndex();
  const p = pages()[i];
  if (!p || p.kind !== 'text') { toast('The title and contents pages cannot be torn out.'); return; }
  if (pages().filter(x => x.kind === 'text').length <= 1) { toast('A book must keep at least one page of writing.'); return; }
  const hasWords = (el('div', { html: p.html }).textContent.trim().length > 0);
  const ok = await confirmBox('Tear out this leaf?', `Page ${folio(i)}${p.chapter ? ` (the start of “${p.chapter.title}”)` : ''} ${hasWords ? 'and all its writing ' : ''}shall be torn from the book.`, 'Tear it out', 'Spare it');
  if (!ok) return;
  pages().splice(i, 1);
  markDirty();
  ed.savedRange = null; ed.savedEditable = null;
  const j = Math.min(i, pages().length - 1);
  ed.spread = Math.min(ed.spread, maxSpread());
  render(); refreshContents();
  if (spreadOf(j) !== ed.spread) goToPage(j);
}

const ORD = ['First', 'Second', 'Third', 'Fourth', 'Fifth', 'Sixth', 'Seventh', 'Eighth', 'Ninth', 'Tenth', 'Eleventh', 'Twelfth', 'Thirteenth', 'Fourteenth', 'Fifteenth', 'Sixteenth', 'Seventeenth', 'Eighteenth', 'Nineteenth', 'Twentieth'];
export async function newChapterHere() {
  const hadSel = restoreSelection() && activeText();
  const n = chapters(ed.book).length + 1;
  const title = await promptBox('Begin a New Chapter', 'What shall this chapter be called?', `Chapter the ${ORD[n - 1] || n}`, 'Begin it');
  if (!title) return;
  const chapter = { title, dropCap: !!ed.book.settings.dropCaps };
  if (hadSel) {
    restoreSelection();
    const t = activeText();
    const i = +t.closest('.page').dataset.index;
    if (atEdge(t, 'start') && !pages()[i].chapter) {
      pages()[i].chapter = chapter; markDirty(); render(); refreshContents(); focusPageText(i, 'start');
    } else pageBreak({ chapter });
  } else {
    // no cursor: add the chapter on a fresh page at the end
    const j = pages().length;
    pages().push({ id: uid(), kind: 'text', html: '<p><br></p>', chapter });
    markDirty(); goToPage(j).then(() => { render(); focusPageText(j); });
  }
}
function chapterIndexForCurrent() {
  for (let j = currentIndex(); j >= 0; j--) if (pages()[j]?.chapter) return j;
  return -1;
}
export async function removeChapterMarkCurrent() {
  const j = chapterIndexForCurrent();
  if (j < 0) { toast('Thou art not within any chapter.'); return; }
  const ok = await confirmBox('Unmark this chapter?', `“${pages()[j].chapter.title}” will no longer be a chapter. Its words stay where they are.`, 'Unmark it', 'Keep it');
  if (!ok) return;
  delete pages()[j].chapter; markDirty(); render(); refreshContents();
}
export function toggleDropCapCurrent() {
  const j = chapterIndexForCurrent();
  if (j < 0) { toast('Fancy first letters belong to chapters. Begin a chapter first.'); return null; }
  const c = pages()[j].chapter; c.dropCap = !c.dropCap; markDirty(); render();
  return c.dropCap;
}
export function setAllDropCaps(on) {
  ed.book.settings.dropCaps = on;
  for (const p of pages()) if (p.chapter) p.chapter.dropCap = on;
  markDirty(); render();
}
export function currentChapter() { const j = chapterIndexForCurrent(); return j >= 0 ? pages()[j].chapter : null; }

// ------------------------------------------------------------------ formatting
document.execCommand('defaultParagraphSeparator', false, 'p');
export function cmd(name, value) {
  if (!restoreSelection()) { toast('Place thy quill (cursor) upon the page first.'); return; }
  document.execCommand('styleWithCSS', false, true);
  document.execCommand(name, false, value);
  afterCommand();
}
function fixSizes(root) {
  root.querySelectorAll('[style*="xxx-large"], font[size="7"]').forEach((s) => {
    const px = (ed.pendingSize || 48) + 'px';
    if (s.tagName === 'FONT') { const sp = document.createElement('span'); sp.style.fontSize = px; sp.append(...s.childNodes); s.replaceWith(sp); }
    else s.style.fontSize = px;
  });
}
export function setFontSize(px) {
  if (!restoreSelection()) { toast('Place thy quill (cursor) upon the page first.'); return; }
  ed.pendingSize = px;
  document.execCommand('styleWithCSS', false, true);
  document.execCommand('fontSize', false, '7');
  if (ed.savedEditable) fixSizes(ed.savedEditable);
  afterCommand();
}
export async function setFontFamily(family) {
  await ensureFamily(family);
  cmd('fontName', family);
}
export function setInk(color) { cmd('foreColor', color); }

function selectedBlocks() {
  const r = caretRange(), root = activeText();
  if (!r || !root) return [];
  let blocks = [...root.querySelectorAll('p,div,li')].filter(b => !b.querySelector('p,div,li') && r.intersectsNode(b));
  if (!blocks.length) {
    document.execCommand('formatBlock', false, 'p');
    const n = caretRange().startContainer;
    const b = (n.nodeType === 1 ? n : n.parentElement).closest('p,div,li');
    if (b && root.contains(b)) blocks = [b];
  }
  return blocks;
}
export function setLineHeight(v) {
  if (!restoreSelection() || !activeText()) { toast('Place thy quill (cursor) within a page of text first.'); return; }
  for (const b of selectedBlocks()) b.style.lineHeight = v === 1.5 ? '' : String(v);
  afterCommand();
}
export function indent(dir) {
  if (!restoreSelection() || !activeText()) { toast('Place thy quill (cursor) within a page of text first.'); return; }
  if (inList()) { document.execCommand(dir > 0 ? 'indent' : 'outdent'); afterCommand(); return; }
  for (const b of selectedBlocks()) {
    const cur = parseFloat(b.style.marginLeft) || 0;
    const next = Math.max(0, Math.min(10, cur + dir * 2));
    b.style.marginLeft = next ? next + 'em' : '';
  }
  afterCommand();
}
export function toggleFirstLineIndent() {
  if (!restoreSelection() || !activeText()) { toast('Place thy quill (cursor) within a page of text first.'); return; }
  const bl = selectedBlocks();
  const on = !bl.every(b => b.style.textIndent);
  for (const b of bl) b.style.textIndent = on ? '2em' : '';
  afterCommand();
}
export function insertTab() { cmd('insertText', '\t'); }

export function queryState() {
  const st = { bold: false, italic: false, underline: false, ul: false, ol: false, align: 'justify', font: ed.book?.settings.bodyFont, size: ed.book?.settings.bodySize, lh: 1.5, firstIndent: false };
  const r = caretRange();
  if (!r || !ed.savedEditable || !ed.savedEditable.contains(r.startContainer)) return st;
  try {
    st.bold = document.queryCommandState('bold'); st.italic = document.queryCommandState('italic'); st.underline = document.queryCommandState('underline');
    st.ul = document.queryCommandState('insertUnorderedList'); st.ol = document.queryCommandState('insertOrderedList');
  } catch {}
  const n = r.startContainer.nodeType === 1 ? r.startContainer : r.startContainer.parentElement;
  const cs = getComputedStyle(n);
  st.font = cs.fontFamily.split(',')[0].trim().replace(/^["']|["']$/g, '');
  st.size = Math.round(parseFloat(cs.fontSize));
  const blk = n.closest('p,div,li');
  if (blk) { const bcs = getComputedStyle(blk); st.align = bcs.textAlign; st.lh = blk.style.lineHeight ? parseFloat(blk.style.lineHeight) : 1.5; st.firstIndent = !!blk.style.textIndent; }
  return st;
}

/** make the font/size at the cursor the book's usual hand */
export function setBookDefaults(font, size) {
  if (font) ed.book.settings.bodyFont = font;
  if (size) ed.book.settings.bodySize = size;
  applyBookSettings(); markDirty();
  document.querySelectorAll('#spread .page').forEach(pg => { const t = pg.querySelector('.text'); if (t) checkOverflow(pg, t); });
}

// ------------------------------------------------------------------ letting words flow across pages
export function chapterBounds(i) {
  const P = pages();
  let a = i; while (a > 2 && !P[a]?.chapter) a--;
  if (P[a]?.kind !== 'text') a = P.findIndex(p => p.kind === 'text');
  let b = a; while (b + 1 < P.length && !P[b + 1].chapter) b++;
  return [a, b];
}
export function flowPages(from, to, opts) {
  const snap = JSON.stringify(pages());
  const r = redistribute(ed.book, from, to, opts);
  const ids = new Set(pages().map(p => p.id));
  ed.book.marks = (ed.book.marks || []).filter(m => ids.has(m.pageId));
  ed.savedRange = null; ed.savedEditable = null;
  ed.spread = Math.min(ed.spread, maxSpread());
  render(); refreshContents(); markDirty();
  return { ...r, snap };
}
export function restorePages(snap) {
  ed.book.pages = JSON.parse(snap);
  ed.spread = Math.min(ed.spread, maxSpread());
  render(); refreshContents(); markDirty();
}
export const textIndexForFolio = (n) => n + 1;
