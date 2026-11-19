// Loads assets/manifest.json, sets custom cursors, and animates props frame-by-frame
// (old adventure-game style: 2–3 frame loops on hover / click).
export let manifest = null;
const ASSET = (p) => '../assets/' + p;

export async function loadAssets() {
  manifest = await window.scribe.manifest();
  await applyCursors(32);
  // warm the cache so first hover never flickers
  for (const [k, v] of Object.entries(manifest)) {
    if (k.startsWith('_')) continue;
    for (const st of Object.values(v)) if (Array.isArray(st)) st.forEach(f => { if (typeof f !== 'string') return; const i = new Image(); i.src = ASSET(f); });
  }
}

// Custom cursors, drawn at any size (Spectacles › cursor size). 32 is the usual.
const cursorSvg = {};
export async function applyCursors(size = 32) {
  const root = document.documentElement.style;
  const fallbacks = { default: 'default', pointer: 'pointer', text: 'text', wait: 'wait', grab: 'grab', ink: 'pointer',
    'look-left': 'w-resize', 'look-right': 'e-resize', 'look-up': 'n-resize', 'look-down': 's-resize' };
  const k = size / 32;
  for (const [name, c] of Object.entries(manifest._cursors || {})) {
    let url = ASSET(c.file);
    if (/\.svg$/i.test(c.file)) {
      if (!(c.file in cursorSvg)) cursorSvg[c.file] = await window.scribe.assetText(c.file);
      const src = cursorSvg[c.file];
      if (src) url = 'data:image/svg+xml;utf8,' + encodeURIComponent(src.replace(/width="\d+" height="\d+"/, `width="${size}" height="${size}"`));
    }
    root.setProperty(`--cur-${name}`, `url("${url}") ${Math.round(c.hot[0] * k)} ${Math.round(c.hot[1] * k)}, ${fallbacks[name] || 'auto'}`);
  }
}

export class Prop {
  constructor(el, key, { onClick, hover = true } = {}) {
    this.el = el; this.key = key; this.def = manifest[key];
    this.img = document.createElement('img');
    this.img.draggable = false; this.img.alt = '';
    el.appendChild(this.img);
    this.state = null; this.frame = 0; this.once = null; this.locked = false;
    this.setState('idle');
    if (hover) {
      el.addEventListener('mouseenter', () => { this.hovering = true; if (!this.once && !this.locked) this.setState('hover'); });
      el.addEventListener('mouseleave', () => { this.hovering = false; if (!this.once && !this.locked) this.setState('idle'); });
    }
    if (onClick) el.addEventListener('click', (e) => {
      if (this.locked) return;
      if (this.def.click) this.play('click');
      onClick(e);
    });
  }
  frames(st) { return this.def[st] && this.def[st].length ? this.def[st] : this.def.idle; }
  setState(st) {
    if (!this.def) return;
    if (this.state === st) return;
    this.state = st; this.frame = 0; this.draw();
    clearInterval(this.timer);
    const fr = this.frames(st);
    if (fr.length > 1) this.timer = setInterval(() => this.tick(), 1000 / (this.def.fps || 6));
  }
  tick() {
    const fr = this.frames(this.state);
    this.frame++;
    if (this.frame >= fr.length) {
      if (this.once) { const done = this.once; this.once = null; this.frame = fr.length - 1; this.draw(); done(); return; }
      this.frame = 0;
    }
    this.draw();
  }
  draw() { const fr = this.frames(this.state); this.img.src = ASSET(fr[Math.min(this.frame, fr.length - 1)]); }
  // play a state once, then return to hover/idle (or call `then`)
  play(st, then) {
    if (!this.def[st]) { then && then(); return; }
    this.state = null; clearInterval(this.timer);
    this.state = st; this.frame = 0; this.draw();
    this.once = () => { clearInterval(this.timer); this.state = null; if (then) then(); else this.setState(this.hovering ? 'hover' : 'idle'); };
    this.timer = setInterval(() => this.tick(), 1000 / (this.def.fps || 6));
  }
  hold(st) { this.locked = true; clearInterval(this.timer); this.state = st; this.frame = 0; this.draw(); }
  release() { this.locked = false; this.state = null; this.setState('idle'); }
}

export function assetUrl(p) { return ASSET(p); }
