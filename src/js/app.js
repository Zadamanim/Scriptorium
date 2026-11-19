// Scriptorium — renderer entry. The app is a room you look around:
//   the Window (start) ─ left: the Doorway (leave) ─ right: the Library ─ down: the Desk.
import { loadAssets, Prop, applyCursors } from './assets.js';
import { initFonts, registerEmbedded, familiesUsedIn } from './fonts.js';
import { newBook, normalizeBook } from './book.js';
import { initTooltips, dialog, toast, dialogOpen, el, confirmBox, STAY } from './ui.js';
import * as E from './editor.js';
import { initDesk, props, openCrystal } from './desk.js';
import { renderLibrary, chooseShelf, addShelfFlow } from './library.js';
import { initMessenger, lookNow } from './messenger.js';

const S = { settings: null, view: null, book: null, path: null, dirty: false, seal: null, leaving: false, W: 1720, H: 1000 };
let candle, door;

// ------------------------------------------------------------------ boot
(async function boot() {
  document.body.classList.add('busy');
  const init = await window.scribe.init();
  S.settings = init.settings; S.version = init.version;
  setUiScale(S.settings.uiScale || 1, false);
  await loadAssets();
  if (S.settings.cursorSize && S.settings.cursorSize !== 32) await applyCursors(S.settings.cursorSize);
  await initFonts();
  initTooltips();
  fitStage(); window.addEventListener('resize', fitStage);
  makeStars();

  candle = new Prop(document.getElementById('prop-candle'), 'candle', { onClick: () => leaveDesk() });
  props.candle = candle;
  door = new Prop(document.getElementById('prop-door'), 'door', { onClick: () => leaveThroughDoor() });
  new Prop(document.getElementById('prop-torch-l'), 'torch', { hover: false });
  new Prop(document.getElementById('prop-torch-r'), 'torch', { hover: false });

  document.getElementById('lib-new-shelf').addEventListener('click', async () => { if (await addShelfFlow()) showLibrary(); });
  document.getElementById('lib-reveal').addEventListener('click', () => window.scribe.library.reveal());
  document.getElementById('lib-open-elsewhere').addEventListener('click', async () => { const p = await window.scribe.tome.openDialog(); if (p) openPath(p); });
  document.querySelectorAll('.edge').forEach(e => e.addEventListener('click', () => EDGES[S.view]?.[e.dataset.dir]?.[1]()));

  initDesk({ save, saveAs, leaveDesk, quitApp, clasp: claspFlow, settings: () => S.settings, lookForEdition: () => lookNow(), version: () => S.version, setUiScale, setCursorSize: async (n) => { S.settings.cursorSize = n; await applyCursors(n); window.scribe.setSettings({ cursorSize: n }); }, updateSettings: (s) => { S.settings = s; } });
  E.initBookChrome();
  initMessenger({ toWindow: async () => { if (S.view === 'desk') await leaveDesk(); else if (S.view === 'door') await look('hall', 'right'); else if (S.view === 'library') await look('hall', 'left'); } });
  E.ed.onDirty = () => setDirty(true);
  E.ed.onTitle = () => updateTitle();
  E.ed.onClasp = () => claspFlow();
  E.ed.onUnlock = () => unlockFlow();

  window.scribe.onCloseRequested(() => quitApp());
  window.scribe.onOpenPath((p) => openPath(p));
  document.addEventListener('keydown', onKey);
  document.body.classList.remove('busy');
  if (init.openPath) { show('hall'); openPath(init.openPath); } else show('hall');
})();

// The stage always fills the window. The 1720x1000 design box sits in its middle,
// and every background bleeds out to the edges, however wide the screen.
function fitStage() {
  const st = document.getElementById('stage');
  const s = Math.min(window.innerWidth / 1720, window.innerHeight / 1000);
  S.W = window.innerWidth / s; S.H = window.innerHeight / s;
  st.style.width = S.W + 'px'; st.style.height = S.H + 'px';
  st.style.transform = `scale(${s})`;
  document.documentElement.style.setProperty('--fit', Math.max(0.85, Math.min(1.8, s)).toFixed(3));
}
function setUiScale(v, persist = true) {
  document.documentElement.style.setProperty('--ui', v);
  if (persist) { S.settings.uiScale = v; clearTimeout(setUiScale.t); setUiScale.t = setTimeout(() => window.scribe.setSettings({ uiScale: v }), 300); }
}
function makeStars() {
  const box = document.getElementById('stars');
  let seed = 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  for (let i = 0; i < 70; i++) {
    const s = el('span');
    s.style.left = (rnd() * 610) + 'px'; s.style.top = (rnd() * 430) + 'px';
    const z = 1 + rnd() * 2.4; s.style.width = s.style.height = z + 'px';
    s.style.animationDelay = (-rnd() * 3).toFixed(2) + 's'; s.style.animationDuration = (2 + rnd() * 4).toFixed(2) + 's';
    box.append(s);
  }
}

// ------------------------------------------------------------------ looking around the room
const EDGES = {
  hall: {
    left: ['Look left — the Doorway', () => look('door', 'left')],
    right: ['Look right — the Library', () => showLibrary('right')],
    down: ['Look down — the desk: begin a new book', () => startNewBook()],
  },
  door: { right: ['Look right — back to the Window', () => look('hall', 'right')] },
  library: { left: ['Look left — back to the Window', () => look('hall', 'left')] },
  desk: { up: ['Look up from the desk — back to the Window', () => leaveDesk()] },
};
function setEdges(view) {
  const cfg = EDGES[view] || {};
  document.querySelectorAll('.edge').forEach(e => {
    const c = cfg[e.dataset.dir];
    e.classList.toggle('on', !!c);
    e.querySelector('.edge-label').textContent = c ? c[0] : '';
  });
}
function show(view) {
  S.view = view;
  document.querySelectorAll('.screen').forEach(s => s.classList.toggle('active', s.id === 'view-' + view));
  document.querySelectorAll('#ui-layer .popup').forEach(p => p.close && p.close());
  setEdges(view);
  updateTitle();
}
let looking = false;
/** turn to another part of the room; dir is which way the eyes move */
function look(to, dir) {
  if (looking || S.view === to) { if (S.view !== to) return Promise.resolve(); show(to); return Promise.resolve(); }
  looking = true;
  const from = document.getElementById('view-' + S.view);
  const next = document.getElementById('view-' + to);
  const v = { left: [-1, 0], right: [1, 0], up: [0, -1], down: [0, 1] }[dir];
  const dx = v[0] * S.W, dy = v[1] * S.H;
  show(to);
  from.classList.add('active');
  const opts = { duration: 650, easing: 'cubic-bezier(.65,0,.35,1)' };
  from.animate([{ transform: 'none' }, { transform: `translate(${-dx}px, ${-dy}px)` }], opts);
  const anim = next.animate([{ transform: `translate(${dx}px, ${dy}px)` }, { transform: 'none' }], opts);
  return anim.finished.then(() => { from.classList.remove('active'); looking = false; });
}

function updateTitle() {
  const t = S.view === 'desk' ? `${S.dirty ? '• ' : ''}${S.book?.title || 'Untitled Tome'} — Scriptorium` : 'Scriptorium';
  document.title = t;
}
function setDirty(d) {
  if (S.dirty === d) return;
  S.dirty = d; window.scribe.setDirty(d); updateTitle();
}

// ------------------------------------------------------------------ book lifecycle
async function guardUnsaved(verb = 'leave this book') {
  if (!S.dirty || S.view !== 'desk') return true;
  const r = await dialog({
    title: 'Thy ink is still wet',
    body: `<p>This book holds writing not yet dried and shelved. Dry the ink before thou ${verb}?</p>`,
    buttons: [{ label: 'Keep writing', value: 'stay' }, { label: 'Leave it wet', value: 'discard', kind: 'danger' }, { label: 'Dry the ink', value: 'save', kind: 'primary' }],
    cancelValue: 'stay',
  });
  if (r === 'stay') return false;
  if (r === 'save') return await save();
  return true;
}
function enterDesk() { candle.release(); document.getElementById('view-desk').classList.remove('dark'); }

async function startNewBook() {
  S.book = newBook(); S.path = null; S.seal = null;
  E.ed.locked = false; E.ed.sealed = false;
  enterDesk();
  E.openBook(S.book, { spread: 1 });
  setDirty(false);
  await look('desk', 'down');
  const first = S.book.pages.findIndex(p => p.kind === 'text');
  E.focusPageText(first, 'end');
}

async function showLibrary(dir) {
  if (dir) { const p = renderLibrary((x) => openPath(x)); await look('library', dir); await p; }
  else { show('library'); await renderLibrary((p) => openPath(p)); }
}

async function openPath(p, words) {
  if (S.path === p && S.view === 'desk' && !E.ed.locked) return;
  if (!(await guardUnsaved('open another'))) return;
  document.body.classList.add('busy');
  try {
    const t = await window.scribe.tome.open(p, words);
    if (t.wrongWords) return 'wrong';
    await registerEmbedded(t.fonts || []);
    const unlockingSame = E.ed.locked && S.path === p && S.view === 'desk';
    S.path = t.path;
    if (t.locked) {
      S.book = normalizeBook({ title: t.manifest.title, author: t.manifest.author });
      S.seal = null; S.hint = t.hint;
      E.ed.locked = true; E.ed.sealed = true; E.ed.hint = t.hint;
    } else {
      S.book = normalizeBook(t.book);
      S.seal = words != null ? { words, hint: t.hint } : null;
      E.ed.locked = false; E.ed.sealed = !!S.seal;
    }
    setDirty(false);
    if (unlockingSame) {
      E.ed.book = S.book; E.applyBookSettings(); E.render();
      await E.goToSpread(S.book.title ? 1 : 0);
      return 'ok';
    }
    enterDesk();
    E.openBook(S.book, { spread: -1 });
    if (S.view !== 'desk') await look('desk', 'down');
    return 'ok';
  } catch (e) {
    console.error(e);
    dialog({ title: 'This tome will not open', body: `<p>The file seems damaged, or is not a tome.</p><p class="small">${String(e.message || e)}</p>`, buttons: [{ label: 'Alas', value: true, kind: 'primary' }] });
  } finally { document.body.classList.remove('busy'); }
}

function payload() {
  return { book: S.book, fontFamilies: familiesUsedIn(S.book), images: {}, seal: S.seal };
}
async function writeTo(target) {
  document.body.classList.add('busy');
  try {
    props.pounce?.play('click');
    const r = await window.scribe.tome.save(target, payload());
    S.path = r.path; setDirty(false);
    const shelf = r.path.split(/[\\/]/).slice(-2, -1)[0];
    toast(`The ink is dry. Shelved upon “${shelf}”.`);
    if (r.restrictedFonts?.length) setTimeout(() => toast(`Mind: ${r.restrictedFonts.join(', ')} forbid embedding by their makers’ licences.`, 4500), 2700);
    return true;
  } catch (e) {
    console.error(e);
    dialog({ title: 'The ink would not dry', body: `<p>Thy book could not be saved.</p><p class="small">${String(e.message || e)}</p>`, buttons: [{ label: 'Alas', value: true, kind: 'primary' }] });
    return false;
  } finally { document.body.classList.remove('busy'); }
}
async function save() {
  if (!S.book || S.view !== 'desk') return false;
  if (E.ed.locked) { toast('This book is sealed. Speak the magic words first.'); return false; }
  if (S.path) return writeTo({ path: S.path });
  return saveAs();
}
async function saveAs() {
  if (!S.book || E.ed.locked) return false;
  const target = await chooseShelf(S.book);
  if (!target) return false;
  return writeTo(target);
}

// ------------------------------------------------------------------ magic words
async function claspFlow() {
  if (!S.book || E.ed.locked) return;
  if (S.seal) {
    const r = await dialog({
      title: 'This Book is Sealed',
      body: '<p>Whoever opens it must first speak the magic words.</p>',
      buttons: [{ label: 'Leave it be', value: null }, { label: 'Break the seal', value: 'break', kind: 'danger' }, { label: 'Change the words', value: 'change', kind: 'primary' }],
    });
    if (r === 'break') {
      if (!(await confirmBox('Break the seal?', 'Anyone will be able to open and read this book again.', 'Break it', 'Nay'))) return;
      S.seal = null; E.ed.sealed = false; E.render(); setDirty(true);
      if (S.path) await save(); else toast('The seal is broken.');
    } else if (r === 'change') await setWords();
    return;
  }
  await setWords();
}
async function setWords() {
  const w1 = el('input', { class: 'field', type: 'password', placeholder: 'the magic words' });
  const w2 = el('input', { class: 'field', type: 'password', placeholder: 'speak them once more', style: 'margin-top:8px' });
  const hint = el('input', { class: 'field', placeholder: 'a riddle to remind thee (optional — anyone can read it)', style: 'margin-top:14px;font-size:18px' });
  const err = el('p', { class: 'small', style: 'color:#8b1a12;min-height:1.2em;margin:8px 0 0' });
  const body = el('div', {},
    el('p', {}, 'Choose the magic words. Anyone who opens this book must speak them first; without them its pages cannot be read at all.'),
    w1, w2, hint, err,
    el('p', { class: 'small', style: 'margin-top:10px' }, '⚠ If the words are forgotten, the book is lost for good. No one, not even the Scriptorium, can open it.'));
  const r = await dialog({
    title: 'Seal with Magic Words', body,
    buttons: [{ label: 'Nay', value: null }, { label: 'Seal it', kind: 'primary', value: () => {
      if (!w1.value) { err.textContent = 'Thou must choose some words.'; return STAY; }
      if (w1.value !== w2.value) { err.textContent = 'The two do not match.'; return STAY; }
      return { words: w1.value, hint: hint.value.trim() };
    } }],
  });
  if (!r) return;
  S.seal = r; E.ed.sealed = true; E.render(); setDirty(true);
  if (S.path) { if (await save()) toast('Sealed. Only the magic words will open it now.'); }
  else toast('The seal takes hold once the ink is dried (saved).', 3600);
}

async function unlockFlow() {
  const words = el('input', { class: 'field', type: 'password', placeholder: 'speak the magic words' });
  const body = el('div', {}, el('p', {}, `“${S.book.title || 'This book'}” is sealed with magic words.`),
    S.hint ? el('p', { class: 'small' }, `A riddle is scratched beside the seal: “${S.hint}”`) : null, words);
  const w = await dialog({ title: 'Speak the Magic Words', body, buttons: [{ label: 'Nay', value: null }, { label: 'Speak', kind: 'primary', value: () => words.value }] });
  if (w == null || w === '') return;
  const r = await openPath(S.path, w);
  if (r === 'wrong') toast('The seal holds fast. Those are not the words.', 3200);
}

// ------------------------------------------------------------------ leaving
async function leaveDesk() {
  if (S.view !== 'desk' || S.leaving) return;
  if (!(await guardUnsaved('look up from the desk'))) return;
  S.leaving = true;
  document.querySelectorAll('#ui-layer .popup').forEach(p => p.close && p.close());
  candle.play('snuff', async () => {
    candle.hold('out');
    document.getElementById('view-desk').classList.add('dark');
    setTimeout(async () => {
      await look('hall', 'up');
      S.book = null; S.path = null; S.seal = null; E.ed.locked = false; setDirty(false);
      S.leaving = false;
    }, 350);
  });
}
async function quitApp() {
  if (!(await guardUnsaved('leave the Scriptorium'))) return;
  document.getElementById('darkness').classList.add('on');
  setTimeout(() => window.scribe.quit(), 1300);
}
function leaveThroughDoor() {
  door.locked = false;
  door.play('open', () => { door.hold('open'); door.frame = 2; door.draw(); quitApp(); });
}

// ------------------------------------------------------------------ keys
function onKey(e) {
  const ctrl = e.ctrlKey || e.metaKey;
  if (e.key === 'F11') { e.preventDefault(); window.scribe.toggleFullscreen(); return; }
  if (dialogOpen() || looking) return;
  if (S.view !== 'desk') {
    const dir = { ArrowLeft: 'left', ArrowRight: 'right', ArrowUp: 'up', ArrowDown: 'down' }[e.key];
    const c = dir && EDGES[S.view]?.[dir];
    if (c && !e.target.closest('input')) { e.preventDefault(); c[1](); }
    return;
  }
  if (ctrl && e.key.toLowerCase() === 's') { e.preventDefault(); e.shiftKey ? saveAs() : save(); }
  else if (e.key === 'F1') { e.preventDefault(); openCrystal(); }
  else if (ctrl && e.key === 'PageDown') { e.preventDefault(); E.turn(1); }
  else if (ctrl && e.key === 'PageUp') { e.preventDefault(); E.turn(-1); }
  else if (e.altKey && e.key === 'ArrowRight') { e.preventDefault(); E.turn(1); }
  else if (e.altKey && e.key === 'ArrowLeft') { e.preventDefault(); E.turn(-1); }
}

// test hooks (harmless in production; used by the automated checks)
window.__book = () => S.book;
window.__rerender = () => E.render();
window.__goto = (s) => { E.ed.spread = s; E.render(); return new Promise(r => setTimeout(r, 30)); };
window.__flowAll = () => E.flowPages(2, S.book.pages.length - 1, { keepBreaks: true });
