// Minimal sfnt (TTF/OTF) reader: family name, weight, italic, embedding permissions (OS/2 fsType).
// fsType: 0 installable, 2 restricted (no embedding), 4 preview & print, 8 editable.
function readFontInfo(buf) {
  try {
    const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
    const tag = dv.getUint32(0);
    // 0x00010000 TrueType, 'OTTO' CFF, 'true'
    if (tag !== 0x00010000 && tag !== 0x4f54544f && tag !== 0x74727565) return null;
    const numTables = dv.getUint16(4);
    const tables = {};
    for (let i = 0; i < numTables; i++) {
      const o = 12 + i * 16;
      const t = String.fromCharCode(dv.getUint8(o), dv.getUint8(o + 1), dv.getUint8(o + 2), dv.getUint8(o + 3));
      tables[t] = { offset: dv.getUint32(o + 8), length: dv.getUint32(o + 12) };
    }
    const info = { fsType: 0, weight: 400, italic: false, family: null, subfamily: null };
    if (tables['OS/2']) {
      const o = tables['OS/2'].offset;
      info.weight = dv.getUint16(o + 4) || 400;
      info.fsType = dv.getUint16(o + 8) & 0x000f;
      const fsSelection = dv.getUint16(o + 62);
      info.italic = !!(fsSelection & 1);
    }
    if (tables.name) {
      const base = tables.name.offset;
      const count = dv.getUint16(base + 2);
      const strOff = base + dv.getUint16(base + 4);
      const names = {};
      for (let i = 0; i < count; i++) {
        const r = base + 6 + i * 12;
        const platform = dv.getUint16(r), nameId = dv.getUint16(r + 6), len = dv.getUint16(r + 8), off = dv.getUint16(r + 10);
        if (![1, 2, 16, 17].includes(nameId)) continue;
        let s = '';
        if (platform === 3 || platform === 0) {
          for (let j = 0; j < len; j += 2) s += String.fromCharCode(dv.getUint16(strOff + off + j));
          names[nameId] = s;
        } else if (platform === 1 && names[nameId] == null) {
          for (let j = 0; j < len; j++) s += String.fromCharCode(dv.getUint8(strOff + off + j));
          names[nameId] = s;
        }
      }
      info.family = (names[16] || names[1] || '').trim() || null;
      info.subfamily = (names[17] || names[2] || '').trim() || null;
      if (info.subfamily && /italic|oblique/i.test(info.subfamily)) info.italic = true;
    }
    return info;
  } catch { return null; }
}
module.exports = { readFontInfo };
