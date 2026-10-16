// analyze_nf.js — pixel-level analysis of the not-found shots (vision substitute
// for this session: the Read tool returns no usable visual content for PNGs here).
const fs = require('fs');
function decodePng(buf) {
  let pos = 8, idat = [], w = 0, h = 0, ct = -1;
  while (pos < buf.length) {
    const len = buf.readUInt32BE(pos);
    const type = buf.toString('ascii', pos + 4, pos + 8);
    if (type === 'IHDR') { w = buf.readUInt32BE(pos + 8); h = buf.readUInt32BE(pos + 12); ct = buf[pos + 17]; }
    else if (type === 'IDAT') idat.push(buf.subarray(pos + 8, pos + 8 + len));
    else if (type === 'IEND') break;
    pos += 12 + len;
  }
  if (w === 0 || ct !== 2) return {};
  const zlib = require('zlib');
  let raw; try { raw = zlib.inflateSync(Buffer.concat(idat)); } catch (e) { return {}; }
  const stride = 1 + w * 3;
  const rows = new Array(h); let prev = Buffer.alloc(w * 3);
  for (let y = 0; y < h; y++) {
    const off = y * stride; const f = raw[off];
    const line = raw.subarray(off + 1, off + stride); const out = Buffer.alloc(w * 3);
    if (f === 0) line.copy(out);
    else if (f === 1) for (let i = 0; i < out.length; i++) out[i] = (line[i] + (i >= 3 ? out[i - 3] : 0)) & 255;
    else if (f === 2) for (let i = 0; i < out.length; i++) out[i] = (line[i] + prev[i]) & 255;
    else if (f === 3) for (let i = 0; i < out.length; i++) { const a = i >= 3 ? out[i - 3] : 0; const b = prev[i]; out[i] = (line[i] + ((a + prev[i]) >> 1)) & 255; }
    else if (f === 4) { for (let i = 0; i < out.length; i++) { const a = i >= 3 ? out[i - 3] : 0; const b = prev[i]; const c = i >= 3 ? prev[i - 3] : 0; const pp = a + b - c; const pa = Math.abs(pp - a), pb = Math.abs(pp - b), pc = Math.abs(pp - c); const pr = pa <= pb && pa <= pc ? a : (pb <= pc ? b : c); out[i] = (line[i] + pr) & 255; } }
    rows[y] = out; prev = out;
  }
  return { width: w, height: h, rows };
}
const file = process.argv[2];
const img = decodePng(fs.readFileSync(file));
if (!img.width) { console.log(file, 'DECODE FAIL'); process.exit(1); }
let minX = 1e9, maxX = -1, minY = 1e9, maxY = -1, redPx = 0;
for (let y = 0; y < img.height; y++) for (let x = 0; x < img.width; x++) {
  const o = x * 3; const r = img.rows[y][o], g = img.rows[y][o + 1], b = img.rows[y][o + 2];
  if (r > 140 && g < 90 && b < 90) { redPx++; minX = Math.min(minX, x); maxX = Math.max(maxX, x); minY = Math.min(minY, y); maxY = Math.max(maxY, y); }
}
console.log('red-text bbox: x', minX, '-', maxX, ' y', minY, '-', maxY, ' px=' + redPx);
let bminX = 1e9, bmaxX = -1, bminY = 1e9, bmaxY = -1, bluePx = 0;
for (let y = 0; y < img.height; y++) for (let x = 0; x < img.width; x++) {
  const o = x * 3; const r = img.rows[y][o], g = img.rows[y][o + 1], b = img.rows[y][o + 2];
  if (b > 140 && r < 80 && g > 60 && g < 140) { bluePx++; bminX = Math.min(bminX, x); bmaxX = Math.max(bmaxX, x); bminY = Math.min(bminY, y); bmaxY = Math.max(bmaxY, y); }
}
console.log('blue-button bbox: x', bminX, '-', bmaxX, ' y', bminY, '-', bmaxY, ' px=' + bluePx);
const darkRows = [];
for (let y = 0; y < img.height; y++) { let d = 0; for (let x = 0; x < img.width; x += 3) { const o = x * 3; const lum = (img.rows[y][o] * 299 + img.rows[y][o + 1] * 587 + img.rows[y][o + 2] * 114) / 1000; if (lum < 80) d++; } if (d > img.width * 0.5) darkRows.push(y); }
console.log('dark full-width rows:', darkRows.length ? darkRows[0] + '-' + darkRows[darkRows.length - 1] : 'none');
