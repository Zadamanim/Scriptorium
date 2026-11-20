// "Let the words flow onward": re-pours text across pages so nothing hides below a frame.
//
// The book is cut into runs that must stay put at their start:
//   • a chapter always begins on its own page,
//   • a page the writer broke on purpose (page break / added leaf) keeps its break if asked,
//   • picture pages (a later phase) are never touched and split runs too.
// Each run's text is gathered, then poured page by page into an invisible copy of the
// page frame, splitting a paragraph (or list) at a word when a page fills up.
// Pieces of a split paragraph carry data-cont so a later pour can join them again.
import { uid } from './book.js';

let frameHost = null;
function measurer(chapterStart, dropCap) {
  if (!frameHost) {
    frameHost = document.createElement('div');
    document.getElementById('book').append(frameHost);
  }
  frameHost.className = 'page right measure' + (chapterStart ? ' chapter-start' : '') + (dropCap ? ' dropcap' : '');
  frameHost.innerHTML = (chapterStart ? '<div class="chapter-title">x</div>' : '') + '<div class="text"></div>';
  return frameHost.querySelector('.text');
}
const fits = (f) => f.scrollHeight <= f.clientHeight + 1;
const isList = (n) => n.nodeName === 'UL' || n.nodeName === 'OL';

/** turn a page's html into blocks, joining pieces that were split across pages */
function gather(pages) {
  const blocks = [];
  for (const p of pages) {
    const box = document.createElement('div');
    box.innerHTML = p.html || '';
    // stray inline content becomes a paragraph
    let run = null;
    for (const n of [...box.childNodes]) {
      const inline = n.nodeType === 3 || (n.nodeType === 1 && !/^(P|DIV|UL|OL)$/.test(n.nodeName));
      if (inline) { if (n.nodeType === 3 && !n.nodeValue.length) { n.remove(); continue; } if (!run) { run = document.createElement('p'); n.before(run); } run.append(n); }
      else run = null;
    }
    for (const b of [...box.children]) {
      const prev = blocks[blocks.length - 1];
      if (b.dataset.cont && prev && prev.nodeName === b.nodeName) {
        if (isList(b)) {
          const first = b.firstElementChild;
          if (first && first.dataset.cont && prev.lastElementChild) { prev.lastElementChild.append(...first.childNodes); first.remove(); }
          prev.append(...b.children);
        } else prev.append(...b.childNodes);
        continue;
      }
      delete b.dataset.cont;
      blocks.push(b);
    }
  }
  // drop trailing empty paragraphs (they would only make empty pages)
  while (blocks.length > 1 && isEmpty(blocks[blocks.length - 1])) blocks.pop();
  return blocks;
}
const isEmpty = (b) => !isList(b) && !b.textContent.trim();

// --- splitting a paragraph at a word -------------------------------------------
function textPoint(block, k) {
  const w = document.createTreeWalker(block, NodeFilter.SHOW_TEXT);
  let n, seen = 0, last = null;
  while ((n = w.nextNode())) { last = n; if (seen + n.length >= k) return [n, k - seen]; seen += n.length; }
  return last ? [last, last.length] : [block, block.childNodes.length];
}
function piece(block, from, to) {
  const r = document.createRange();
  if (from == null) r.setStart(block, 0); else r.setStart(...from);
  if (to == null) r.setEnd(block, block.childNodes.length); else r.setEnd(...to);
  const e = block.cloneNode(false);
  e.append(r.cloneContents());
  return e;
}
/** the largest head of `block` that still fits below what is already in `frame` — cut only between words */
function splitText(block, frame, container = frame) {
  const text = block.textContent;
  if (text.length < 2) return null;
  // every place a word ends: candidates for the cut
  const ends = [];
  for (const m of text.matchAll(/\S+/g)) ends.push(m.index + m[0].length);
  const tryCut = (k) => {
    const h = piece(block, null, textPoint(block, k));
    container.append(h);
    const ok = fits(frame);
    h.remove();
    return ok;
  };
  // binary search for the last word that still fits
  let lo = -1, hi = ends.length - 1;
  while (lo < hi) {
    const mid = Math.ceil((lo + hi + 1) / 2);
    if (tryCut(ends[mid])) lo = mid; else hi = mid - 1;
  }
  if (lo < 0) return null;
  if (lo === ends.length - 1) return [block.cloneNode(true), null];
  // keep the space after the word on this page; the next page starts at the next word
  let k = ends[lo];
  while (k < text.length && /\s/.test(text[k])) k++;
  const head = piece(block, null, textPoint(block, k));
  const tail = piece(block, textPoint(block, k), null);
  tail.dataset.cont = '1';
  tail.style.textIndent = '0';
  const t = document.createTreeWalker(tail, NodeFilter.SHOW_TEXT).nextNode();
  if (t) t.nodeValue = t.nodeValue.replace(/^\s+/, '');
  return [head, tail];
}
/** split a list between items, or inside an item if one item alone is too tall */
function splitList(list, frame) {
  const head = list.cloneNode(false);
  frame.append(head);
  const items = [...list.children];
  let i = 0;
  for (; i < items.length; i++) {
    head.append(items[i].cloneNode(true));
    if (!fits(frame)) { head.lastElementChild.remove(); break; }
  }
  let partHead = null, partTail = null;
  if (i < items.length) {
    const s = splitText(items[i], frame, head);
    if (s) { [partHead, partTail] = s; }
  }
  head.remove();
  if (i === 0 && !partHead) return null;
  if (partHead) head.append(partHead);
  const tail = list.cloneNode(false);
  tail.dataset.cont = '1';
  if (partTail) { partTail.style.listStyleType = 'none'; tail.append(partTail); }
  for (const it of items.slice(i + (partHead ? 1 : 0))) tail.append(it.cloneNode(true));
  if (list.nodeName === 'OL') tail.setAttribute('start', String((+list.getAttribute('start') || 1) + i));
  if (!tail.children.length) return [head, null];
  return [head, tail];
}

/** pour blocks into as many pages as needed; returns array of html strings */
function pour(blocks, firstIsChapter, dropCap) {
  const out = [];
  let first = true;
  while (blocks.length || first) {
    const frame = measurer(first && firstIsChapter, first && dropCap);
    while (blocks.length) {
      const b = blocks[0];
      frame.append(b);
      if (fits(frame)) { blocks.shift(); continue; }
      b.remove();
      const split = isList(b) ? splitList(b, frame) : splitText(b, frame);
      if (split && split[0]) {
        frame.append(split[0]);
        if (split[1]) blocks[0] = split[1]; else blocks.shift();
      } else if (!frame.childNodes.length) {
        frame.append(b); blocks.shift();      // a single unbreakable thing taller than a page
      }
      break;
    }
    out.push(frame.innerHTML || '<p><br></p>');
    first = false;
    if (out.length > 5000) break; // safety
  }
  return out;
}

/**
 * Re-pour pages[from..to] (indices into book.pages, inclusive).
 * Returns { before, after } page counts for the touched runs.
 */
export function redistribute(book, from, to, { keepBreaks = true } = {}) {
  const P = book.pages;
  from = Math.max(0, from); to = Math.min(P.length - 1, to);
  // build runs
  const runs = [];
  let cur = null;
  for (let i = from; i <= to; i++) {
    const p = P[i];
    if (p.kind !== 'text') { cur = null; continue; }
    const starts = !cur || p.chapter || (keepBreaks && p.hardBreak);
    if (starts) { cur = { start: i, end: i }; runs.push(cur); } else cur.end = i;
  }
  let before = 0, after = 0;
  // last run first, so earlier indices stay true while pages are added/removed
  for (const run of runs.reverse()) {
    const pages = P.slice(run.start, run.end + 1);
    const head = pages[0];
    const htmls = pour(gather(pages), !!head.chapter, !!head.chapter?.dropCap);
    before += pages.length; after += htmls.length;
    const fresh = htmls.map((h, k) => {
      if (k === 0) return { ...head, html: h };
      const old = pages[k];
      const p = old ? { ...old, html: h } : { id: uid(), kind: 'text', html: h };
      delete p.chapter;
      if (!keepBreaks) delete p.hardBreak;
      return p;
    });
    P.splice(run.start, pages.length, ...fresh);
  }
  if (frameHost) { frameHost.remove(); frameHost = null; }
  return { before, after, runs: runs.length };
}
