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
  { name: 'pounce', base: [166, 662], H: 135 },
  { name: 'inkwell', base: [1540, 940], H: 125, dMin: 0.55 },
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
              : `--c:${(-Sx / c.H).toFixed(4)};--d:${(-(Math.sign(Sy) || 1) * Math.max(Math.abs(Sy / c.H), c.dMin || 0.3)).toFixed(4)}`);
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
  host.append(Object.assign(document.createElement('div'), { className: 'cast-ring' }));
  castSpectacles(host);
  castLegs();
}

// art → desk mapping for a prop (its box, position and CSS transform)
function propMatrix(prop, art) {
  const cs = getComputedStyle(prop);
  const [ox, oy] = cs.transformOrigin.split(' ').map(parseFloat);
  const w = parseFloat(cs.width), h = parseFloat(cs.height);
  return new DOMMatrix().translate(parseFloat(cs.left) + ox, parseFloat(cs.top) + oy)
    .multiply(new DOMMatrix(cs.transform === 'none' ? undefined : cs.transform)).translate(-ox, -oy).scale(w / art[0], h / art[1]);
}

// The spectacles rest on four points: the bottom of each rim and the two tips of the arms. The rims stand
// up from the desk and the arms slope down from the hinges to their tips, so each piece's shadow is pinned
// where it touches and slides away from the flame in proportion to how high it rises.
function castSpectacles(host) {
  const prop = document.getElementById('prop-spectacles');
  if (!prop) return;
  const ART = [220, 160], RIM_FOOT = 146, HINGE = 104, TIP = 4, HINGE_RISE = RIM_FOOT - HINGE;
  const T = propMatrix(prop, ART), Ti = T.inverse();
  const foot = T.transformPoint(new DOMPoint(110, RIM_FOOT));
  const dx = foot.x - LIGHT[0], dy = foot.y - LIGHT[1], dist = Math.hypot(dx, dy);
  const g = dist / (LIGHT_H * 1.5);             // how far a point is pushed per px it rises
  const ux = dx / dist * g, uy = dy / dist * g;
  // rise as an affine function of the desk point p: rise = A*(Ti p).y + B
  const pieces = [
    { clip: '34px 0, 186px 0, 186px 100px, 220px 100px, 220px 160px, 0 160px, 0 100px, 34px 100px', A: -1, B: RIM_FOOT },
    { clip: '0 0, 34px 0, 34px 100px, 0 100px', A: HINGE_RISE / (HINGE - TIP), B: -TIP * HINGE_RISE / (HINGE - TIP) },
    { clip: '186px 0, 220px 0, 220px 100px, 186px 100px', A: HINGE_RISE / (HINGE - TIP), B: -TIP * HINGE_RISE / (HINGE - TIP) },
  ];
  const cs = getComputedStyle(prop);
  for (const pc of pieces) {
    // rise(p) = A*(Ti.b*x + Ti.d*y + Ti.f) + B = al*x + be*y + ga ; shadow point = p + rise(p) * u
    const al = pc.A * Ti.b, be = pc.A * Ti.d, ga = pc.A * Ti.f + pc.B;
    const outer = document.createElement('div');
    outer.className = 'cast cast-spectacles';
    const v = { m1: ux * al, m2: uy * al, m3: ux * be, m4: uy * be, m5: ux * ga, m6: uy * ga };
    outer.style.cssText = 'transform-origin:0 0;--op:.62;--blur:2px;' + Object.entries(v).map(([k, n]) => `--${k}:${n.toFixed(5)}`).join(';');
    const shape = document.createElement('div');
    shape.className = 'cast-shape';
    Object.assign(shape.style, { left: cs.left, top: cs.top, width: cs.width, height: cs.height, transform: cs.transform, transformOrigin: cs.transformOrigin, clipPath: `polygon(${pc.clip})` });
    const setSrc = (src) => { if (src) shape.style.setProperty('--src', `url("${src}")`); };
    setSrc(prop.querySelector('img')?.src);
    prop.addEventListener('frame', (e) => setSrc(e.detail));
    outer.append(shape);
    host.append(outer);
  }
}

// the writing stand's two legs: long shadows running away from the flame until they leave the desk
function castLegs() {
  let host = document.getElementById('leg-shadows');
  if (!host) {
    host = Object.assign(document.createElement('div'), { id: 'leg-shadows' });
    document.querySelector('#view-desk .lectern-shadow')?.after(host);
  }
  host.innerHTML = '';
  for (const [x, y] of [[435, 962], [1285, 962]]) {
    const a = Math.atan2(y - LIGHT[1], x - LIGHT[0]);
    const s = document.createElement('div');
    s.className = 'cast-leg';
    s.style.cssText = `left:${x}px;top:${y - 30}px;width:1500px;--a:${a}rad`;
    host.append(s);
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
