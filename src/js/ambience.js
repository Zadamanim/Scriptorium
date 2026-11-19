// Candlelight: the flame flickers, the warm glow and the dark edges breathe with it, and every
// object on the desk casts a soft shadow away from the candle that stretches as the flame dips.
// Spectacles › "Background animations" can make all of this gentle or still.
import { Prop } from './assets.js';

// Where the candle's flame stands, projected down onto the desk (design-box coordinates),
// and how high above the desk it burns.
const LIGHT = [214, 470];
const LIGHT_H = 230;
// Each object's shadow is its own silhouette, turned over at the spot where it meets the desk and
// laid out across the wood away from the flame. Every point is pushed out in proportion to its height
// above that spot, so anything lifted (the pounce pot when shaken) leaves its shadow behind on the desk.
//   base: where it touches the desk · H: its height in px · flat: lies on the desk, so only nudged aside
const CASTERS = [
  { name: 'pounce', base: [166, 670], H: 135 },
  { name: 'inkwell', base: [1540, 940], H: 125 },
  { name: 'quill', base: [1540, 940], H: 470 },
  { name: 'crystal', base: [1545, 444], H: 142 },
];

export function castShadows() {
  const host = document.getElementById('desk-shadows');
  if (!host) return;
  host.innerHTML = '';
  for (const c of CASTERS) {
    const prop = document.getElementById('prop-' + c.name);
    if (!prop) continue;
    const [bx, by] = c.base;
    const dx = bx - LIGHT[0], dy = by - LIGHT[1];
    const dist = Math.hypot(dx, dy) || 1;
    // similar triangles from the flame, tempered so tall things far away don't throw shadows off the desk
    const len = Math.min((c.H * dist) / Math.max(90, LIGHT_H * 1.5 - c.H * 0.5), c.H * 1.25);
    const Sx = (dx / dist) * len, Sy = (dy / dist) * len;
    const outer = document.createElement('div');
    outer.className = 'cast cast-' + c.name + (c.flat ? ' flat' : '');
    const far = Math.min(1, dist / 1600);
    outer.style.cssText = `transform-origin:${bx}px ${by}px;--op:${(0.72 - 0.2 * far).toFixed(2)};--blur:${(1.5 + 3 * far).toFixed(1)}px;` +
      (c.flat ? `--sx:${Sx.toFixed(1)};--sy:${Sy.toFixed(1)}`
              : `--c:${(-Sx / c.H).toFixed(4)};--d:${(-(Math.sign(Sy) || 1) * Math.max(Math.abs(Sy / c.H), 0.3)).toFixed(4)}`);
    const shape = document.createElement('div');
    shape.className = 'cast-shape';
    const cs = getComputedStyle(prop);
    Object.assign(shape.style, { left: cs.left, top: cs.top, width: cs.width, height: cs.height, transform: cs.transform, transformOrigin: cs.transformOrigin });
    const setSrc = (src) => { if (src) shape.style.setProperty('--src', `url("${src}")`); };
    setSrc(prop.querySelector('img')?.src);
    if (!prop.dataset.shadowHooked) { prop.dataset.shadowHooked = '1'; prop.addEventListener('frame', (e) => prop._shadowSrc?.(e.detail)); }
    prop._shadowSrc = setSrc;
    outer.append(shape);
    host.append(outer);
  }
}

let mode = 'full', n = 0.6, timer = null;
export function getAmbient() { return mode; }
export function setAmbient(m) {
  mode = m === 'reduced' || m === 'off' ? m : 'full';
  document.body.dataset.ambient = mode;
  Prop.setAmbient(mode);
  clearTimeout(timer);
  tick();
}
function tick() {
  const root = document.documentElement.style;
  if (mode === 'off') n = 0.6;
  else {
    const target = Math.random();
    n += (target - n) * (mode === 'reduced' ? 0.22 : 0.65);
  }
  // a brighter flame casts shorter shadows and pushes the dark edges back; they move together
  root.setProperty('--flick', (1.09 - 0.18 * n).toFixed(3));
  root.setProperty('--glow', (0.68 + 0.32 * n).toFixed(3));
  root.setProperty('--gloom', (1.04 - 0.16 * n).toFixed(3));
  if (mode !== 'off') timer = setTimeout(tick, mode === 'reduced' ? 420 : 130);
}
