// The book model + HTML sanitiser (books come from other people: never trust their markup).
export const uid = () => Math.random().toString(36).slice(2, 10);

export function newBook() {
  return {
    title: '', author: '',
    settings: {
      bodyFont: 'IM Fell English', bodySize: 24,
      capFont: 'UnifrakturMaguntia', titleFont: 'Cinzel Decorative',
      dropCaps: true,
    },
    pages: [
      { id: uid(), kind: 'title' },
      { id: uid(), kind: 'contents' },
      { id: uid(), kind: 'text', chapter: { title: 'Chapter the First', dropCap: true }, html: '<p>The </p>' },
    ],
    marks: [],
  };
}

/** repair anything missing/odd in a loaded book */
/** the dress of a whole-line field: font, size, ink, weight, slant, underline, alignment */
function cleanLook(l) {
  if (!l || typeof l !== 'object') return {};
  const o = {};
  if (typeof l.font === 'string' && l.font.length < 120 && !/[;{}<>"]/.test(l.font)) o.font = l.font;
  if (Number.isFinite(+l.size) && +l.size >= 6 && +l.size <= 200) o.size = +l.size;
  if (typeof l.color === 'string' && /^(#[0-9a-f]{3,8}|rgba?\([\d.,\s%]+\))$/i.test(l.color)) o.color = l.color;
  for (const k of ['bold', 'italic', 'underline']) if (typeof l[k] === 'boolean') o[k] = l[k];
  if (['left', 'center', 'right', 'justify'].includes(l.align)) o.align = l.align;
  return o;
}
export function normalizeBook(b) {
  const book = { ...newBook(), ...b };
  book.settings = { ...newBook().settings, ...(b.settings || {}) };
  book.pages = Array.isArray(b.pages) ? b.pages.filter(p => p && typeof p === 'object') : [];
  if (book.pages[0]?.kind !== 'title') book.pages.unshift({ id: uid(), kind: 'title' });
  if (book.pages[1]?.kind !== 'contents') book.pages.splice(1, 0, { id: uid(), kind: 'contents' });
  book.pages = book.pages.filter((p, i) => i < 2 || (p.kind !== 'title' && p.kind !== 'contents'));
  if (!book.pages.some(p => p.kind === 'text')) book.pages.push({ id: uid(), kind: 'text', html: '<p><br></p>' });
  for (const p of book.pages) {
    p.id = p.id || uid();
    if (p.kind === 'text') {
      p.html = sanitizeHTML(p.html || '<p><br></p>');
      if (p.chapter) p.chapter = { title: String(p.chapter.title || '').slice(0, 200), dropCap: !!p.chapter.dropCap, ...(p.chapter.look ? { look: cleanLook(p.chapter.look) } : {}) };
    }
  }
  book.title = String(book.title || ''); book.author = String(book.author || '');
  book.looks = { title: cleanLook(b.looks?.title), author: cleanLook(b.looks?.author) };
  book.marks = (Array.isArray(b.marks) ? b.marks : []).filter(m => m && m.pageId)
    .map(m => ({ id: String(m.id || uid()), pageId: String(m.pageId), name: String(m.name || 'A mark').slice(0, 120) }));
  return book;
}

const TAGS = new Set(['P', 'DIV', 'BR', 'SPAN', 'B', 'STRONG', 'I', 'EM', 'U', 'S', 'OL', 'UL', 'LI', 'SUB', 'SUP', 'FONT']);
const STYLES = ['font-family', 'font-size', 'font-weight', 'font-style', 'text-decoration', 'text-decoration-line', 'color',
  'line-height', 'text-align', 'margin-left', 'padding-left', 'text-indent', 'list-style-type'];

export function sanitizeHTML(html) {
  const doc = new DOMParser().parseFromString(`<body>${html}</body>`, 'text/html');
  const out = document.createElement('div');
  const walk = (src, dst) => {
    for (const n of [...src.childNodes]) {
      if (n.nodeType === 3) { dst.append(document.createTextNode(n.nodeValue)); continue; }
      if (n.nodeType !== 1) continue;
      if (!TAGS.has(n.tagName)) { walk(n, dst); continue; } // unwrap unknown tags, keep their text
      const tag = n.tagName === 'FONT' ? 'SPAN' : n.tagName;
      const e = document.createElement(tag);
      // styles: whitelist properties, no urls/expressions
      const src = n.style;
      for (const prop of STYLES) {
        const v = src.getPropertyValue(prop);
        if (v && !/url\(|expression|javascript:/i.test(v)) e.style.setProperty(prop, v);
      }
      if (n.tagName === 'FONT') {
        if (n.getAttribute('face')) e.style.fontFamily = n.getAttribute('face');
        if (n.getAttribute('color')) e.style.color = n.getAttribute('color');
      }
      if (tag === 'OL' && /^\d+$/.test(n.getAttribute('start') || '')) e.setAttribute('start', n.getAttribute('start'));
      if (n.getAttribute('data-cont') === '1' && /^(P|DIV|UL|OL|LI)$/.test(tag)) e.setAttribute('data-cont', '1');
      walk(n, e);
      dst.append(e);
    }
  };
  walk(doc.body, out);
  return out.innerHTML || '<p><br></p>';
}

export function chapters(book) {
  const out = [];
  book.pages.forEach((p, i) => { if (p.kind === 'text' && p.chapter) out.push({ index: i, title: p.chapter.title || 'Untitled chapter', page: p }); });
  return out;
}

/** printed page number for page index (front matter has none) */
export const folio = (i) => (i >= 2 ? String(i - 1) : '');
