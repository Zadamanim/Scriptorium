// Candlelight: the flame flickers, the warm glow and the dark edges breathe with it, and every
// object on the desk casts a soft shadow away from the candle that stretches as the flame dips.
// Spectacles › "Background animations" can make all of this gentle or still.
import { Prop } from './assets.js';

// Where the candle's flame stands, projected down onto the desk (design-box coordinates),
// and how high above the desk it burns.
const LIGHT = [214, 470];
const LIGHT_H = 230;
// [prop, base point on the desk, height, width of its footprint]
const CASTERS = [
  ['pounce', [166, 674], 140, 72],
  ['spectacles', [168, 924], 46, 150],
  ['inkwell', [1540, 944], 120, 130],
  ['quill', [1552, 932], 300, 16],
  ['crystal', [1545, 447], 150, 112],
];

export function castShadows() {
  const host = document.getElementById('desk-shadows');
  if (!host) return;
  host.innerHTML = '';
  for (const [name, [bx, by], h, w] of CASTERS) {
    const dx = bx - LIGHT[0], dy = by - LIGHT[1];
    const dist = Math.hypot(dx, dy);
    const len = Math.min((h * dist) / Math.max(60, LIGHT_H - h * 0.4), h * 1.9) + w * 0.3;
    const s = document.createElement('div');
    s.className = 'cast cast-' + name;
    s.style.cssText = `left:${bx}px;top:${by - w / 2}px;width:${len}px;height:${w}px;--a:${Math.atan2(dy, dx)}rad`;
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
  // a brighter flame casts shorter shadows and pushes the dark edges back a little
  root.setProperty('--flick', (1.07 - 0.14 * n).toFixed(3));
  root.setProperty('--glow', (0.7 + 0.3 * n).toFixed(3));
  root.setProperty('--gloom', (1 - 0.1 * n).toFixed(3));
  if (mode !== 'off') timer = setTimeout(tick, mode === 'reduced' ? 420 : 130);
}
