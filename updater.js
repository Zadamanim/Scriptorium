// The messenger: checks for a new edition, fetches it, backs up the Library, installs it.
//
// Feed: the latest GitHub Release of package.json → scriptorium.updateRepo ("owner/repo").
// The release's tag is the version (v0.4.0) and it must carry the "Scriptorium Setup x.y.z.exe".
// (SCRIPTORIUM_UPDATE_FEED may point at any URL serving the same JSON, for testing.)
const { app, net } = require('electron');
const path = require('path');
const fs = require('fs');
const fsp = fs.promises;
const crypto = require('crypto');
const { spawn } = require('child_process');
const JSZip = require('jszip');

const pkg = require('./package.json');
const REPO = (pkg.scriptorium && pkg.scriptorium.updateRepo) || '';
const FEED = process.env.SCRIPTORIUM_UPDATE_FEED || (REPO ? `https://api.github.com/repos/${REPO}/releases/latest` : '');

const parse = (v) => String(v || '').replace(/^v/i, '').split(/[.+-]/).slice(0, 3).map(n => parseInt(n, 10) || 0);
function newer(a, b) { // is a newer than b?
  const x = parse(a), y = parse(b);
  for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return x[i] > y[i];
  return false;
}

let cached = null, checkedAt = 0;

async function check({ force = false } = {}) {
  if (!FEED) return { configured: false, current: app.getVersion() };
  if (!force && cached && Date.now() - checkedAt < 6 * 3600e3) return cached;
  const res = await net.fetch(FEED, { headers: { 'User-Agent': 'Scriptorium-Updater', Accept: 'application/vnd.github+json' } });
  if (res.status === 404) return (cached = { configured: true, current: app.getVersion(), available: false, none: true });
  if (!res.ok) throw new Error(`The messenger found no road (${res.status})`);
  const rel = await res.json();
  const version = String(rel.tag_name || rel.name || '').replace(/^v/i, '');
  const asset = (rel.assets || []).find(a => /setup.*\.exe$/i.test(a.name));
  const out = { configured: true, current: app.getVersion(), version, notes: String(rel.body || '').slice(0, 4000), published: rel.published_at || null };
  out.available = !!asset && !rel.draft && !rel.prerelease && newer(version, app.getVersion());
  if (asset) {
    out.asset = { name: asset.name, url: asset.browser_download_url, size: asset.size || 0,
      sha256: (asset.digest && /^sha256:/.test(asset.digest)) ? asset.digest.slice(7).toLowerCase() : null };
  }
  cached = out; checkedAt = Date.now();
  return out;
}

async function download(info, onProgress) {
  const a = info.asset;
  if (!a || !/^https:\/\//.test(a.url) && !process.env.SCRIPTORIUM_UPDATE_FEED) throw new Error('No new edition to fetch');
  const dir = path.join(app.getPath('temp'), 'Scriptorium-update');
  await fsp.mkdir(dir, { recursive: true });
  const file = path.join(dir, path.basename(a.name).replace(/[^\w .()-]/g, '_'));
  const res = await net.fetch(a.url, { headers: { 'User-Agent': 'Scriptorium-Updater' } });
  if (!res.ok || !res.body) throw new Error(`The raven dropped the parcel (${res.status})`);
  const total = +res.headers.get('content-length') || a.size || 0;
  const hash = crypto.createHash('sha256');
  const out = fs.createWriteStream(file);
  let got = 0, lastTick = 0;
  const reader = res.body.getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    const buf = Buffer.from(value);
    hash.update(buf); got += buf.length;
    if (!out.write(buf)) await new Promise(r => out.once('drain', r));
    if (total && Date.now() - lastTick > 100) { lastTick = Date.now(); onProgress(got / total); }
  }
  await new Promise((r, j) => out.end(e => (e ? j(e) : r())));
  onProgress(1);
  const digest = hash.digest('hex');
  if (a.sha256 && digest !== a.sha256) { await fsp.unlink(file).catch(() => {}); throw new Error('The parcel was damaged on the road (checksum mismatch). Nothing was changed.'); }
  if (a.size && got !== a.size) { await fsp.unlink(file).catch(() => {}); throw new Error('The parcel arrived incomplete. Nothing was changed.'); }
  return file;
}

/** zip the whole Library next to it (never inside it, or it would become a shelf); keep the last 5 */
async function backupLibrary(libraryRoot) {
  const zip = new JSZip();
  let count = 0;
  async function walk(dir, rel) {
    for (const e of await fsp.readdir(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name), r = rel ? rel + '/' + e.name : e.name;
      if (e.isDirectory()) { zip.folder(r); await walk(p, r); }
      else if (e.isFile()) { zip.file(r, await fsp.readFile(p)); count++; }
    }
  }
  if (fs.existsSync(libraryRoot)) await walk(libraryRoot, '');
  const dir = path.join(path.dirname(libraryRoot), 'Library Backups');
  await fsp.mkdir(dir, { recursive: true });
  const d = new Date(), z = (n) => String(n).padStart(2, '0');
  const stamp = `${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())} ${z(d.getHours())}.${z(d.getMinutes())}`;
  const file = path.join(dir, `Library before ${app.getVersion()} update, ${stamp}.zip`);
  await fsp.writeFile(file, await zip.generateAsync({ type: 'nodebuffer', compression: 'STORE' }));
  const old = (await fsp.readdir(dir)).filter(f => f.startsWith('Library before ') && f.endsWith('.zip')).sort();
  for (const f of old.slice(0, Math.max(0, old.length - 5))) await fsp.unlink(path.join(dir, f)).catch(() => {});
  return { file, count };
}

/** run the new installer quietly; it closes us, replaces the program, and starts us again */
function install(file) {
  if (process.env.SCRIPTORIUM_UPDATE_DRYRUN) return { dryRun: true };
  if (process.platform !== 'win32') throw new Error('Editions can only be installed on Windows.');
  spawn(file, ['/S', '/RELAUNCH'], { detached: true, stdio: 'ignore' }).unref();
  return { started: true };
}

module.exports = { check, download, backupLibrary, install, configured: () => !!FEED };
