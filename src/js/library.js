// The Library: folders are shelves, .tome files are books on them.
import { el, dialog, promptBox, toast, confirmBox, popup } from './ui.js';

const SPINE_COLORS = ['#6b1e16', '#24452c', '#1f2f55', '#5a3c12', '#4b1f45', '#7a5a1c', '#2c2c2c', '#6e3a1e', '#38542a', '#3b2a6b', '#5c1a2e', '#20484a'];
const hash = (s) => [...s].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7);

// ---------------------------------------------------------------------------------------------
// A real 3D bookcase. The scroller has a fixed point of view at the centre of the screen
// (CSS perspective), so as it scrolls, shelves above eye level show their undersides and
// shelves below show their tops: parallax for free.
const CASE = { left: 260, top: 196, width: 1200, post: 46, depth: 170, row: 240, board: 26, bookDepth: 132, inset: 14 };
let pulled = null;

function face(cls, style) {
  const f = el('div', { class: 'f3 ' + cls });
  for (const [k, v] of Object.entries(style)) { if (k.startsWith('--')) f.style.setProperty(k, v); else f.style[k] = v; }
  return f;
}

let lastPick = null, onMoved = null;
export async function renderLibrary(onPick, moved) {
  lastPick = onPick; if (moved) onMoved = moved;
  const lib = await window.scribe.library.list();
  const scroller = document.getElementById('lib-scroll');
  const keep = scroller.scrollTop;
  const kase = document.getElementById('bookcase');
  kase.innerHTML = '';
  pulled = null;
  const C = CASE, inner = C.width - 2 * C.post - 24;
  // lay books into rows: each shelf (folder) starts a fresh board
  const rows = [];
  for (const shelf of lib.shelves) {
    let row = { shelf, first: true, books: [], used: 0 };
    rows.push(row);
    for (const b of shelf.books) {
      const h = hash(b.title + b.file);
      const w = 44 + ((h >> 5) % 18);
      if (row.used + w > inner && row.books.length) { row = { shelf, first: false, books: [], used: 0 }; rows.push(row); }
      row.books.push({ b, h, w, ht: 150 + (h % 34) }); row.used += w + 3;
    }
  }
  // only real shelves: below the last one the case simply ends on a plinth
  const H = rows.length * C.row;
  kase.style.cssText = `left:${C.left}px;top:${C.top}px;width:${C.width}px;height:${H}px`;
  document.getElementById('lib-inner').style.height = (C.top + H + 200) + 'px';

  const inW = C.width - 2 * C.post;
  // Chrome only paints about a screen's height of any one 3D surface, so the case is built
  // row by row: every piece is at most one shelf tall.
  kase.append(face('under', { left: C.post + 'px', top: '0', width: inW + 'px', height: C.depth + 'px', transformOrigin: 'top', transform: 'rotateX(-90deg)' }),
    face('crown', { left: '-22px', top: '-58px', width: (C.width + 44) + 'px', height: '58px' }));
  rows.forEach((row, i) => {
    const y0 = i * C.row, boardTop = (i + 1) * C.row - C.board;
    kase.append(
      face('back', { left: C.post + 'px', top: y0 + 'px', width: inW + 'px', height: C.row + 'px', transform: `translateZ(${-C.depth}px)` }),
      face('side l', { left: C.post + 'px', top: y0 + 'px', width: C.depth + 'px', height: (C.row + 1) + 'px', transformOrigin: 'left', transform: 'translateZ(-1px) rotateY(90deg)' }),
      face('side r', { left: (C.width - C.post - C.depth) + 'px', top: y0 + 'px', width: C.depth + 'px', height: (C.row + 1) + 'px', transformOrigin: 'right', transform: 'translateZ(-1px) rotateY(-90deg)' }),
      face('board-top', { left: C.post + 'px', top: boardTop + 'px', width: inW + 'px', height: (C.depth - 2) + 'px', transformOrigin: 'top', transform: 'translateZ(-2px) rotateX(-90deg)' }),
      face('board-under', { left: C.post + 'px', top: (boardTop + C.board) + 'px', width: inW + 'px', height: (C.depth - 2) + 'px', transformOrigin: 'top', transform: 'translateZ(-2px) rotateX(-90deg)' }),
      face('post l', { left: '0', top: (i ? y0 - 1 : -30) + 'px', width: C.post + 'px', height: (C.row + 2 + (i ? 0 : 30)) + 'px' }),
      face('post r', { left: (C.width - C.post) + 'px', top: (i ? y0 - 1 : -30) + 'px', width: C.post + 'px', height: (C.row + 2 + (i ? 0 : 30)) + 'px' }),
    );
    const front = face('board-front', { left: C.post + 'px', top: boardTop + 'px', width: inW + 'px', height: C.board + 'px' });
    if (row.shelf && row.first) front.append(el('span', { class: 'shelf-plaque' }, row.shelf.name));
    kase.append(front);
    let x = C.post + 14;
    for (const { b, h, w, ht } of row.books) {
      const color = b.leather || SPINE_COLORS[h % SPINE_COLORS.length];
      const d = C.bookDepth;
      const book = el('div', { class: 'book3d clickable' + (b.broken ? ' broken' : ''), style: `left:${x}px;top:${boardTop - ht}px;width:${w}px;height:${ht}px`,
        'data-tip': b.broken ? `${b.file} — this tome seems damaged` : `${b.title}${b.author ? ' — ' + b.author : ''}${b.sealed ? ' (sealed with magic words)' : ''}` });
      const spine = face('spine', { width: w + 'px', height: ht + 'px', background: color, transform: `translateZ(${-C.inset}px)` });
      spine.append(el('span', {}, b.title));
      if (b.sealed) spine.append(el('img', { class: 'wax', src: '../assets/props/seal_idle.svg', alt: '' }));
      book.append(spine,
        face('btop', { width: w + 'px', height: d + 'px', transformOrigin: 'top', transform: `translateZ(${-C.inset}px) rotateX(-90deg)`, '--c': color }),
        face('bside', { width: d + 'px', height: ht + 'px', background: color, transformOrigin: 'left', transform: `translateZ(${-C.inset}px) rotateY(90deg)` }),
        face('bside', { left: (w - d) + 'px', width: d + 'px', height: ht + 'px', background: color, transformOrigin: 'right', transform: `translateZ(${-C.inset}px) rotateY(-90deg)` }));
      book.addEventListener('click', (e) => { e.stopPropagation(); pull(book, b, onPick); });
      book.addEventListener('contextmenu', (e) => { e.preventDefault(); window.scribe.library.reveal(b.path); });
      kase.append(book);
      x += w + 3;
    }
  });
  kase.append(face('plinth', { left: '-22px', top: H + 'px', width: (C.width + 44) + 'px', height: '64px' }));
  scroller.scrollTop = keep;
  return lib;
}

/** slide a book out toward the reader, and ask what to do with it */
function pull(book, b, onPick) {
  if (pulled && pulled.book === book) return;
  pushBack();
  if (b.broken) { toast('This tome seems damaged and will not open.'); return; }
  book.classList.add('pulled');
  pulled = { book };
  const go = (mode) => { const box = document.getElementById('book-card'); pushBack(); box?.close(); onPick(b.path, mode); };
  setTimeout(() => {
    if (!pulled || pulled.book !== book) return;
    pulled.card = popup('book-card', book, (box) => {
      box.append(...[el('div', { class: 'bc-title' }, b.title),
        b.author ? el('div', { class: 'bc-author' }, 'by ' + b.author) : null,
        b.sealed ? el('div', { class: 'bc-sealed' }, 'Sealed with magic words') : null,
        el('div', { class: 'bc-btns' },
          el('button', { class: 'btn', onclick: () => go('read') }, 'Read it'),
          el('button', { class: 'btn primary', onclick: () => go('write') }, 'Write in it')),
        el('button', { class: 'linkish clickable bc-move', onclick: () => { pushBack(); document.getElementById('book-card')?.close(); moveFlow(b); } }, 'Move to another shelf…')].filter(Boolean));
    }, { side: 'right', onClose: () => { if (pulled && pulled.book === book) { book.classList.remove('pulled'); pulled = null; } } });
  }, 330);
}
export function pushBack() {
  if (!pulled) return;
  pulled.book.classList.remove('pulled');
  const c = pulled.card; pulled = null;
  c?.close?.();
}

/** carry a book to a different shelf */
async function moveFlow(b) {
  const lib = await window.scribe.library.list();
  const here = lib.shelves.find(s => s.books.some(x => x.path === b.path))?.name;
  const pick = el('div', { class: 'shelf-pick two' });
  lib.shelves.forEach((s) => pick.append(el('label', {}, el('input', { type: 'radio', name: 'mv', value: s.name, checked: s.name === here }), s.name)));
  const newName = el('input', { class: 'field', placeholder: 'name of the new shelf', style: 'font-size:18px;padding:3px 8px' });
  const newRadio = el('input', { type: 'radio', name: 'mv', value: '__new__' });
  newName.addEventListener('focus', () => { newRadio.checked = true; });
  pick.append(el('label', { class: 'wide' }, newRadio, '✚ Build a new shelf:', newName));
  const shelf = await dialog({
    title: 'Move to Another Shelf', body: el('div', {}, el('p', {}, `Upon which shelf shall “${b.title}” rest?`), pick),
    buttons: [{ label: 'Nay', value: null }, { label: 'Move it', kind: 'primary', value: () => {
      const r = pick.querySelector('input[name=mv]:checked');
      return r?.value === '__new__' ? (newName.value.trim() || 'New Shelf') : r?.value;
    } }],
  });
  if (!shelf || shelf === here) return;
  try {
    const dest = await window.scribe.library.move(b.path, shelf);
    onMoved?.(b.path, dest);
    toast(`“${b.title}” now rests upon ${shelf}.`);
    await renderLibrary(lastPick);
  } catch (e) { toast('The tome would not move: ' + (e.message || e)); }
}

export async function addShelfFlow() {
  const name = await promptBox('Build a New Shelf', 'What shall this shelf be called? (Fantasy, Letters, Recipes…)', '', 'Build it');
  if (!name) return null;
  const made = await window.scribe.library.addShelf(name);
  toast(`A new shelf is raised: ${made}`);
  return made;
}

/** asks which shelf & name to save under. returns {shelf, filename} | {path} | null */
export async function chooseShelf(book, { title = 'Shelve this Tome' } = {}) {
  const lib = await window.scribe.library.list();
  const fname = el('input', { class: 'field', value: (book.title || 'Untitled Tome').replace(/[<>:"/\\|?*]/g, '') });
  const pick = el('div', { class: 'shelf-pick' });
  lib.shelves.forEach((s, i) => pick.append(el('label', {}, el('input', { type: 'radio', name: 'shelf', value: s.name, checked: i === 0 }), `${s.name}`, el('span', { class: 'small' }, `  (${s.books.length} book${s.books.length === 1 ? '' : 's'})`))));
  const newName = el('input', { class: 'field', placeholder: 'name of the new shelf', style: 'font-size:18px;padding:3px 8px' });
  const newRadio = el('input', { type: 'radio', name: 'shelf', value: '__new__' });
  newName.addEventListener('focus', () => { newRadio.checked = true; });
  pick.append(el('label', {}, newRadio, '✚ Build a new shelf:', newName));
  const body = el('div', {},
    el('p', {}, 'Name of the tome:'), fname,
    el('p', { style: 'margin-top:16px' }, 'Upon which shelf shall it rest?'), pick);
  const result = await dialog({
    title, body,
    buttons: [
      { label: 'Elsewhere on thy computer…', value: 'elsewhere' },
      { label: 'Nay', value: null },
      { label: 'Shelve it', kind: 'primary', value: () => {
        const r = pick.querySelector('input[name=shelf]:checked');
        let shelf = r ? r.value : 'My Books';
        if (shelf === '__new__') shelf = newName.value.trim() || 'New Shelf';
        return { shelf, filename: fname.value.trim() || 'Untitled Tome', isNew: r?.value === '__new__' };
      } },
    ],
  });
  if (result === 'elsewhere') {
    const p = await window.scribe.tome.saveDialog(book.title || 'Untitled Tome');
    return p ? { path: p } : null;
  }
  if (!result) return null;
  if (result.isNew) result.shelf = await window.scribe.library.addShelf(result.shelf);
  if (await window.scribe.tome.exists(result.shelf, result.filename)) {
    const ok = await confirmBox('A tome of that name already rests there', `“${result.filename}” already sits upon “${result.shelf}”. Replace it with this one?`, 'Replace it', 'Nay');
    if (!ok) return null;
  }
  return result;
}
