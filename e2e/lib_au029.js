// lib_au029.js — AU-029 shared helpers: PNG decode + chip-selection classifier.
function decodePng(buf) {
  let pos = 8, idat = [], w = 0, h = 0, colorType = -1;
  while (pos < buf.length) {
    const len = buf.readUInt32BE(pos);
    const type = buf.toString('ascii', pos + 4, pos + 8);
    if (type === 'IHDR') { w = buf.readUInt32BE(pos + 8); h = buf.readUInt32BE(pos + 12); colorType = buf[pos + 17]; }
    else if (type === 'IDAT') idat.push(buf.subarray(pos + 8, pos + 8 + len));
    else if (type === 'IEND') break;
    pos += 12 + len;
  }
  if (w === 0 || (colorType !== 2 && colorType !== 6)) return {};
  const zlib = require('zlib');
  const bpp = colorType === 6 ? 4 : 3;
  let raw; try { raw = zlib.inflateSync(Buffer.concat(idat)); } catch (e) { return {}; }
  const stride = 1 + w * bpp;
  const rows = new Array(h); let prev = Buffer.alloc(w * bpp);
  for (let y = 0; y < h; y++) {
    const off = y * stride, f = raw[off], line = raw.subarray(off + 1, off + stride), out = Buffer.alloc(w * bpp);
    if (f === 0) line.copy(out);
    else if (f === 1) for (let i = 0; i < out.length; i++) out[i] = (line[i] + (i >= bpp ? out[i - bpp] : 0)) & 255;
    else if (f === 2) for (let i = 0; i < out.length; i++) out[i] = (line[i] + prev[i]) & 255;
    else if (f === 3) for (let i = 0; i < out.length; i++) { const a = i >= bpp ? out[i - bpp] : 0; out[i] = (line[i] + ((a + prev[i]) >> 1)) & 255; }
    else if (f === 4) for (let i = 0; i < out.length; i++) {
      const a = i >= bpp ? out[i - bpp] : 0, b = prev[i], c = i >= bpp ? prev[i - bpp] : 0;
      const pp = a + b - c, pa = Math.abs(pp - a), pb = Math.abs(pp - b), pc = Math.abs(pp - c);
      const pr = pa <= pb && pa <= pc ? a : (pb <= pc ? b : c);
      out[i] = (line[i] + pr) & 255;
    }
    rows[y] = out; prev = out;
  }
  return { width: w, height: h, rows, bpp };
}
module.exports = { decodePng };
