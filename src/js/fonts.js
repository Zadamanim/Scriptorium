// Font registry in the renderer: loads faces with the FontFace API so no font ever
// needs installing. Fonts embedded in a .tome are registered straight from the file.
const families = new Map(); // family -> { family, source, category, faces:[{id,weight,style}], loaded, fsType, license }
const loaded = new Set();   // `${family}|${weight}|${style}`

const SOURCE_RANK = { embedded: 0, bundled: 1, user: 2, system: 3 };

export async function initFonts() {
  const list = await window.scribe.fonts.list();
  for (const f of list) addFace(f);
  // bundled faces are tiny: load them all up front
  await Promise.all([...families.values()].filter(f => f.source === 'bundled').map(f => ensureFamily(f.family)));
}

function addFace(f) {
  let fam = families.get(f.family);
  if (!fam) {
    fam = { family: f.family, source: f.source, category: f.category || 'body', faces: [], license: f.license, fsType: f.fsType || 0 };
    families.set(f.family, fam);
  } else if (SOURCE_RANK[f.source] < SOURCE_RANK[fam.source]) fam.source = f.source;
  if (!fam.faces.some(x => x.weight === f.weight && x.style === f.style)) fam.faces.push({ id: f.id, weight: f.weight, style: f.style, source: f.source });
  fam.fsType = Math.max(fam.fsType, f.fsType || 0) === 2 ? 2 : fam.fsType;
}

export async function refreshFonts() {
  const list = await window.scribe.fonts.list();
  for (const f of list) addFace(f);
}

export async function ensureFamily(family) {
  const fam = families.get(family);
  if (!fam) return false;
  await Promise.all(fam.faces.map(async (face) => {
    const key = `${family}|${face.weight}|${face.style}`;
    if (loaded.has(key) || !face.id) return;
    loaded.add(key);
    try {
      const data = await window.scribe.fonts.read(face.id);
      if (!data) return;
      const ff = new FontFace(family, data, { weight: String(face.weight), style: face.style });
      await ff.load();
      document.fonts.add(ff);
    } catch (e) { console.warn('font failed', family, e); }
  }));
  return true;
}

/** fonts that came inside a .tome */
export async function registerEmbedded(list) {
  for (const f of list) {
    const key = `${f.family}|${f.weight}|${f.style}`;
    addFace({ family: f.family, weight: f.weight, style: f.style, source: 'embedded' });
    if (loaded.has(key)) continue;
    loaded.add(key);
    try {
      const ff = new FontFace(f.family, f.data, { weight: String(f.weight), style: f.style });
      await ff.load(); document.fonts.add(ff);
    } catch (e) { console.warn('embedded font failed', f.family, e); }
  }
}

export function allFamilies() {
  return [...families.values()].sort((a, b) => a.family.localeCompare(b.family));
}
export function familyInfo(name) { return families.get(name); }

export function cssFamily(name) { return `"${name.replace(/"/g, '')}"`; }

/** every family a book relies on — these get embedded in the .tome */
export function familiesUsedIn(book) {
  const used = new Set();
  const s = book.settings || {};
  [s.bodyFont, s.capFont, s.titleFont].forEach(f => f && used.add(f));
  const re = /font-family:\s*([^;"]+|"[^"]*")/gi;
  for (const p of book.pages) {
    const html = ((p.html || '') + (p.boxes ? JSON.stringify(p.boxes) : '')).replace(/&quot;/g, '"').replace(/&#39;/g, "'");
    let m;
    while ((m = re.exec(html))) {
      const first = m[1].replace(/&quot;/g, '"').split(',')[0].trim().replace(/^["']|["']$/g, '');
      if (first) used.add(first);
    }
  }
  return [...used].filter(f => families.has(f));
}
