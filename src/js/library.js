// The Library: folders are shelves, .tome files are books on them.
import { el, dialog, promptBox, toast, confirmBox } from './ui.js';

const SPINE_COLORS = ['#6b1e16', '#24452c', '#1f2f55', '#5a3c12', '#4b1f45', '#7a5a1c', '#2c2c2c', '#6e3a1e', '#38542a', '#3b2a6b', '#5c1a2e', '#20484a'];
const hash = (s) => [...s].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7);

export async function renderLibrary(onOpen) {
  const lib = await window.scribe.library.list();
  const case_ = document.getElementById('bookcase');
  case_.innerHTML = '';
  for (const shelf of lib.shelves) {
    const row = el('div', { class: 'shelf-row' });
    if (!shelf.books.length) row.append(el('div', { class: 'shelf-empty' }, 'This shelf stands empty.'));
    for (const b of shelf.books) {
      const h = hash(b.title + b.file);
      const spine = el('div', {
        class: 'spine clickable' + (b.broken ? ' broken' : ''),
        'data-tip': b.broken ? `${b.file} — this tome seems damaged` : `${b.title}${b.author ? ' — ' + b.author : ''}${b.sealed ? ' (sealed with magic words)' : ''}`,
        onclick: () => onOpen(b.path),
      }, el('span', {}, b.title), b.sealed ? el('img', { class: 'wax', src: '../assets/props/seal_idle.svg', alt: '' }) : null);
      spine.style.background = SPINE_COLORS[h % SPINE_COLORS.length];
      spine.style.height = (150 + (h % 30)) + 'px';
      spine.style.width = (46 + ((h >> 5) % 16)) + 'px';
      spine.addEventListener('contextmenu', (e) => { e.preventDefault(); window.scribe.library.reveal(b.path); });
      row.append(spine);
    }
    case_.append(el('div', { class: 'shelf' }, el('div', { class: 'shelf-label' }, shelf.name), row));
  }
  return lib;
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
