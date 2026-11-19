// The raven: brings word of a new edition to the window sill.
import { Prop } from './assets.js';
import { el, dialog, toast } from './ui.js';

let raven = null, info = null, hooks = {};

export function initMessenger(h) {
  hooks = h;
  raven = new Prop(document.getElementById('prop-raven'), 'raven', { onClick: () => openLetter() });
  window.scribe.update.onProgress(onProgress);
  setTimeout(() => check(false), 4000);
}

export async function check(force) {
  const r = await window.scribe.update.check(force);
  info = r;
  const show = !!(r.available && (!r.skipped || force));
  document.getElementById('prop-raven').classList.toggle('show', show);
  return r;
}

/** Spectacles / Crystal Ball: look for a new edition now */
export async function lookNow() {
  const r = await check(true);
  if (r.error) { toast(`The messenger could not get through: ${r.error}`, 4200); return; }
  if (!r.configured) { toast('No messenger road is set for this copy of the Scriptorium.', 4200); return; }
  if (r.available) { await hooks.toWindow?.(); openLetter(); }
  else toast(`Thou hast the newest edition (${r.current}).`);
}

function paragraphs(text) {
  return String(text || '').split(/\n{2,}/).map(t => t.replace(/^#+\s*/gm, '').replace(/\*\*/g, '').trim()).filter(Boolean)
    .slice(0, 12).map(t => el('p', { class: 'small', style: 'white-space:pre-line;opacity:1' }, t));
}

export async function openLetter() {
  if (!info?.available) return;
  raven.play('hover');
  const notes = paragraphs(info.notes);
  const body = el('div', {},
    el('p', {}, 'The raven bears a letter sealed in red wax:'),
    el('p', { style: 'font-size:24px;text-align:center;margin:10px 0 14px' }, `A new edition of the Scriptorium: ${info.version}`),
    el('p', { class: 'small', style: 'text-align:center;margin-top:-8px' }, `Thine is ${info.current}.`),
    notes.length ? el('div', { style: 'max-height:200px;overflow:auto;margin:8px 0;padding:6px 10px;background:rgba(255,250,235,.4);border-radius:4px' }, ...notes) : null,
    el('p', { class: 'small', style: 'opacity:1' }, 'Fear not for thy books: before anything changes, thy whole Library is copied to a safe place beside it (“Library Backups”). The new edition never touches thy books.'),
    el('p', { class: 'small' }, 'The Scriptorium will close, install the new edition, and light its candle again by itself.'));
  const r = await dialog({
    title: 'A Messenger at the Window', body,
    buttons: [{ label: 'Shoo (skip this edition)', value: 'skip' }, { label: 'Later', value: null }, { label: 'Fetch the new edition', value: 'go', kind: 'primary' }],
  });
  if (r === 'skip') {
    await window.scribe.update.skip(info.version);
    document.getElementById('prop-raven').classList.remove('show');
    toast('The raven flaps away. It will return with the next edition.');
  } else if (r === 'go') install();
}

let progress = null;
function onProgress({ stage, frac }) {
  if (!progress) return;
  const label = { download: 'The raven flies home with the new edition…', backup: 'Copying thy Library to safety…', install: 'Sewing in the new pages…' }[stage];
  progress.label.textContent = label;
  progress.bar.style.width = Math.round((stage === 'download' ? frac * 0.8 : stage === 'backup' ? 0.9 : 1) * 100) + '%';
}
async function install() {
  const label = el('p', { style: 'text-align:center' }, 'The raven sets off…');
  const bar = el('div', { style: 'height:100%;width:0;background:linear-gradient(90deg,#7c140f,#b8382c);transition:width .2s;border-radius:6px' });
  const body = el('div', {}, label, el('div', { style: 'height:16px;border:2px solid #8a6b40;border-radius:8px;background:rgba(255,250,235,.5);overflow:hidden' }, bar));
  let box;
  dialog({ title: 'A New Edition', body, buttons: [], locked: true, onOpen: (b) => { box = b; } });
  progress = { label, bar };
  try {
    const r = await window.scribe.update.fetchAndInstall();
    if (r.dryRun) { box.close(); progress = null; toast(`(test) Ready to install. Library copied to: ${r.backup}`, 6000); return; }
    label.textContent = 'The candle gutters… the Scriptorium will relight itself in a moment.';
    document.getElementById('darkness').classList.add('on');
  } catch (e) {
    box.close(); progress = null;
    dialog({ title: 'The Raven Returned Empty-Taloned', body: `<p>${String(e.message || e).replace(/^Error invoking remote method '[^']+': (Error: )?/, '')}</p><p class="small">Nothing has changed; thy edition and thy books are as they were.</p>`, buttons: [{ label: 'Alas', value: true, kind: 'primary' }] });
  }
}
