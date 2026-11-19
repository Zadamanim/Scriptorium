// Parchment dialogs, popups, toasts, tooltips.
const layer = () => document.getElementById('ui-layer');

export function el(tag, attrs = {}, ...kids) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') e.className = v;
    else if (k === 'html') e.innerHTML = v;
    else if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
    else if (v !== undefined && v !== null && v !== false) e.setAttribute(k, v === true ? '' : v);
  }
  for (const k of kids.flat()) if (k != null) e.append(k.nodeType ? k : document.createTextNode(k));
  return e;
}
export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/** a button value function may return STAY to keep the dialog open (e.g. failed validation) */
export const STAY = Symbol('stay');
let openDialogs = 0;
export const dialogOpen = () => openDialogs > 0;

/** dialog({title, body: string|Node, buttons:[{label,value,kind}], onOpen(box), cancelValue}) -> Promise<value> */
export function dialog({ title, body, buttons = [{ label: 'So be it', value: true, kind: 'primary' }], onOpen, cancelValue = null, id, locked = false }) {
  return new Promise((resolve) => {
    const box = el('div', { class: 'dialog parch', id });
    if (title) box.append(el('h3', {}, title));
    if (typeof body === 'string') box.append(el('div', { html: body })); else if (body) box.append(body);
    const btns = el('div', { class: 'btns' });
    const scrim = el('div', { class: 'scrim' }, box);
    const close = (v) => { if (v === STAY) return; scrim.remove(); openDialogs--; document.removeEventListener('keydown', onKey, true); resolve(v); };
    box.close = close;
    for (const b of buttons) btns.append(el('button', { class: 'btn ' + (b.kind || ''), onclick: () => close(typeof b.value === 'function' ? b.value(box) : b.value) }, b.label));
    if (buttons.length) box.append(btns);
    const onKey = (e) => {
      if (e.key === 'Escape') { e.stopPropagation(); if (!locked) close(cancelValue); }
      else if (e.key === 'Enter' && !e.shiftKey && e.target.tagName !== 'TEXTAREA') {
        const prim = buttons.find(b => b.kind === 'primary');
        if (prim && !box.noEnter) { e.preventDefault(); e.stopPropagation(); close(typeof prim.value === 'function' ? prim.value(box) : prim.value); }
      }
    };
    document.addEventListener('keydown', onKey, true);
    scrim.addEventListener('mousedown', (e) => { if (e.target === scrim && !locked) close(cancelValue); });
    openDialogs++;
    layer().append(scrim);
    onOpen && onOpen(box);
    const first = box.querySelector('input,textarea,select');
    if (first) setTimeout(() => { first.focus(); first.select && first.select(); }, 30);
  });
}

export function confirmBox(title, text, yes = 'Aye', no = 'Nay') {
  return dialog({ title, body: `<p>${text}</p>`, buttons: [{ label: no, value: false }, { label: yes, value: true, kind: 'primary' }], cancelValue: false });
}

export async function promptBox(title, label, value = '', okLabel = 'So be it') {
  const input = el('input', { class: 'field', value });
  const body = el('div', {}, label ? el('p', {}, label) : null, input);
  return dialog({ title, body, buttons: [{ label: 'Nay', value: null }, { label: okLabel, kind: 'primary', value: () => input.value.trim() || null }] });
}

export function toastAction(text, label, fn, ms = 9000) {
  const b = el('button', { class: 'btn', style: 'margin-left:16px;font-size:15px;padding:4px 12px' }, label);
  const t = el('div', { class: 'toast parch' }, text, b);
  b.addEventListener('click', () => { t.remove(); fn(); });
  layer().append(t);
  setTimeout(() => t.remove(), ms);
}
export function toast(text, ms = 2600) {
  const t = el('div', { class: 'toast parch' }, text);
  layer().append(t);
  setTimeout(() => t.remove(), ms);
}

// ---- anchored popups (one of each id at a time)
export function popup(id, anchor, build, { side: sideWanted = 'left', onClose } = {}) {
  const existing = document.getElementById(id);
  if (existing) { existing.close(); return null; }
  const box = el('div', { class: 'popup parch', id });
  const x = el('button', { class: 'x', title: 'Close', onclick: () => box.close() }, '×');
  box.append(x);
  build(box);
  layer().append(box);
  box.reposition = () => {
    let side = sideWanted;
    const cs = getComputedStyle(document.documentElement); const ui = (parseFloat(cs.getPropertyValue('--ui')) || 1) * (parseFloat(cs.getPropertyValue('--fit')) || 1);
    const r = anchor.getBoundingClientRect();
    const w = box.offsetWidth * ui, h = box.offsetHeight * ui;
    if (side === 'beside') side = r.right + 16 + w < window.innerWidth - 8 ? 'right' : 'edge-right';
    let left = side === 'left' ? r.left - w - 16 : side === 'edge-right' ? window.innerWidth - w - 10 : side === 'edge-left' ? 10 : r.right + 16;
    let top = side.startsWith('edge') ? (window.innerHeight - h) / 2 : r.top + r.height / 2 - h / 2;
    left = Math.max(8, Math.min(window.innerWidth - w - 8, left));
    top = Math.max(8, Math.min(window.innerHeight - h - 8, top));
    box.style.left = left / ui + 'px'; box.style.top = top / ui + 'px';
  };
  box.reposition();
  const onKey = (e) => { if (e.key === 'Escape' && !dialogOpen()) box.close(); };
  document.addEventListener('keydown', onKey);
  box.close = () => { box.remove(); document.removeEventListener('keydown', onKey); onClose && onClose(); };
  return box;
}

// ---- tooltips from data-tip
export function initTooltips() {
  const tip = document.getElementById('tooltip');
  let timer = null, target = null, mx = 0, my = 0;
  const place = () => { const w = tip.offsetWidth; tip.style.left = Math.min(window.innerWidth - w - 8, mx + 18) + 'px'; tip.style.top = Math.min(window.innerHeight - tip.offsetHeight - 8, my + 22) + 'px'; };
  document.addEventListener('mouseover', (e) => {
    const t = e.target.closest('[data-tip]');
    if (t === target) return;
    target = t; clearTimeout(timer); tip.style.display = 'none';
    if (t) timer = setTimeout(() => { tip.textContent = t.dataset.tip; tip.style.display = 'block'; place(); }, 450);
  });
  document.addEventListener('mousemove', (e) => { mx = e.clientX; my = e.clientY; if (tip.style.display === 'block') place(); });
  document.addEventListener('mousedown', () => { clearTimeout(timer); tip.style.display = 'none'; });
}
