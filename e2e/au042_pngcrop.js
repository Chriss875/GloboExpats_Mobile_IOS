// usage: node au042_pngcrop.js <png> <y0> <y1> <out.png> [scale]
const fs = require('fs'), zlib = require('zlib');
function dec(buf) {
  let pos = 8, idat = [], w = 0, h = 0, ct = -1;
  while (pos < buf.length) {
    const len = buf.readUInt32BE(pos), t = buf.toString('ascii', pos + 4, pos + 8);
    if (t === 'IHDR') { w = buf.readUInt32BE(pos + 8); h = buf.readUInt32BE(pos + 12); ct = buf[pos + 17]; }
    else if (t === 'IDAT') idat.push(buf.subarray(pos + 8, pos + 8 + len));
    else if (t === 'IEND') break;
    pos += 12 + len;
  }
  if (!w || ct !== 2) return {};
  let raw; try { raw = zlib.inflateSync(Buffer.concat(idat)); } catch (e) { return {}; }
  const stride = 1 + w * 3, rows = new Array(h); let prev = Buffer.alloc(w * 3);
  for (let y = 0; y < h; y++) {
    const off = y * stride, f = raw[off], line = raw.subarray(off + 1, off + stride), out = Buffer.alloc(w * 3);
    if (f === 0) line.copy(out);
    else if (f === 1) for (let i = 0; i < out.length; i++) out[i] = (line[i] + (i >= 3 ? out[i - 3] : 0)) & 255;
    else if (f === 2) for (let i = 0; i < out.length; i++) out[i] = (line[i] + prev[i]) & 255;
    else if (f === 3) for (let i = 0; i < out.length; i++) out[i] = (line[i] + (((i >= 3 ? out[i - 3] : 0) + prev[i]) >> 1)) & 255;
    else if (f === 4) for (let i = 0; i < out.length; i++) {
      const A = i >= 3 ? out[i - 3] : 0, B = prev[i], C = i >= 3 ? prev[i - 3] : 0, pp = A + B - C;
      const pa = Math.abs(pp - A), pb = Math.abs(pp - B), pc = Math.abs(pp - C);
      const pr = pa <= pb && pa <= pc ? A : (pb <= pc ? B : C);
      out[i] = (line[i] + pr) & 255;
    }
    rows[y] = out; prev = out;
  }
  return { width: w, height: h, rows };
}
const [,, src, y0s, y1s, dst] = process.argv;
const { width, height, rows } = dec(fs.readFileSync(src));
if (!rows) { console.error('decode failed'); process.exit(1); }
const y0 = parseInt(y0s), y1 = Math.min(height, parseInt(y1s));
const buf = Buffer.alloc(width * (y1 - y0) * 3 + 15);
let o = buf.write(`P6\n${width} ${y1 - y0}\n255\n`);
for (let y = y0; y < y1; y++) { rows[y].copy(buf, o); o += rows[y].length; }
fs.writeFileSync('/tmp/_au042_crop.ppm', buf);
console.log('decoded', width, 'x', height, 'crop rows', y1 - y0);
