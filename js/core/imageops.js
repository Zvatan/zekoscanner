// RGBA piksel tamponları üzerinde temel işlemler: alan ortalamalı küçültme,
// 90° döndürme ve perspektif düzeltme. DOM kullanmaz.
import { squareToQuad } from './geometry.js';

// Alan ortalamalı (kutu filtre) yeniden örnekleme. Küçültmede kenar
// yumuşatmalı, metinde moiré oluşturmayan sonuç verir.
export function resizeArea(src, sw, sh, dw, dh) {
  const dst = new Uint8ClampedArray(dw * dh * 4);
  const sx = sw / dw;
  const sy = sh / dh;

  // Yatay katkılar: her hedef sütun için kaynak sütunlar ve ağırlıkları.
  const start = new Int32Array(dw);
  const count = new Int32Array(dw);
  const idx = [];
  const wts = [];
  for (let x = 0; x < dw; x++) {
    const x0 = x * sx;
    const x1 = Math.min(sw, (x + 1) * sx);
    start[x] = idx.length;
    for (let i = Math.floor(x0); i < Math.ceil(x1); i++) {
      const w = Math.min(i + 1, x1) - Math.max(i, x0);
      if (w > 1e-6) {
        idx.push(i * 4);
        wts.push(w / sx);
      }
    }
    count[x] = idx.length - start[x];
  }
  const hIdx = Int32Array.from(idx);
  const hW = Float32Array.from(wts);

  const row = new Float32Array(dw * 4);
  const acc = new Float32Array(dw * 4);
  let dy = 0;
  let filled = 0; // acc'deki kaynak satır ağırlığı

  for (let y = 0; y < sh && dy < dh; y++) {
    const rowOff = y * sw * 4;
    for (let x = 0, o = 0; x < dw; x++, o += 4) {
      let r = 0, g = 0, b = 0, a = 0;
      const s = start[x];
      const e = s + count[x];
      for (let k = s; k < e; k++) {
        const p = rowOff + hIdx[k];
        const w = hW[k];
        r += src[p] * w;
        g += src[p + 1] * w;
        b += src[p + 2] * w;
        a += src[p + 3] * w;
      }
      row[o] = r;
      row[o + 1] = g;
      row[o + 2] = b;
      row[o + 3] = a;
    }
    let y0 = y;
    const y1 = y + 1;
    while (y0 < y1 - 1e-9 && dy < dh) {
      const rowEnd = (dy + 1) * sy;
      const seg = Math.min(y1, rowEnd) - y0;
      for (let i = 0; i < acc.length; i++) acc[i] += row[i] * seg;
      filled += seg;
      y0 += seg;
      if (y0 >= rowEnd - 1e-9) {
        const inv = 1 / filled;
        const o = dy * dw * 4;
        for (let i = 0; i < acc.length; i++) dst[o + i] = acc[i] * inv + 0.5;
        acc.fill(0);
        filled = 0;
        dy++;
      }
    }
  }
  return dst;
}

// Uzun kenarı en fazla maxLong olacak biçimde küçültür (büyütmez).
export function fitWithin(src, w, h, maxLong) {
  const s = Math.min(1, maxLong / Math.max(w, h));
  if (s >= 1) return { data: src, w, h, scale: 1 };
  const dw = Math.max(1, Math.round(w * s));
  const dh = Math.max(1, Math.round(h * s));
  return { data: resizeArea(src, w, h, dw, dh), w: dw, h: dh, scale: dw / w };
}

// Saat yönünde quarter*90° döndürür.
export function rotate90(src, w, h, quarter) {
  const q = ((quarter % 4) + 4) % 4;
  if (q === 0) return { data: src, w, h };
  const src32 = new Uint32Array(src.buffer, src.byteOffset, w * h);
  const ow = q === 2 ? w : h;
  const oh = q === 2 ? h : w;
  const out = new Uint8ClampedArray(ow * oh * 4);
  const dst32 = new Uint32Array(out.buffer);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let nx, ny;
      if (q === 1) {
        nx = h - 1 - y;
        ny = x;
      } else if (q === 2) {
        nx = w - 1 - x;
        ny = h - 1 - y;
      } else {
        nx = y;
        ny = w - 1 - x;
      }
      dst32[ny * ow + nx] = src32[y * w + x];
    }
  }
  return { data: out, w: ow, h: oh };
}

// Dörtgen bölgeyi dw x dh dikdörtgene düzeltir (çift doğrusal örnekleme).
// inset: belge düzleminde her kenardan bırakılan pay (oran); kenardaki
// yarım pikselin zemin rengi taşımasını önler.
export function warpPerspective(src, sw, sh, quad, dw, dh, inset = 0) {
  const [a, b, c, d, e, f, g, h] = squareToQuad(quad);
  const out = new Uint8ClampedArray(dw * dh * 4);
  const span = 1 - 2 * inset;
  const du = span / dw;
  const maxX = sw - 1;
  const maxY = sh - 1;
  let o = 0;
  for (let y = 0; y < dh; y++) {
    const v = inset + ((y + 0.5) / dh) * span;
    const u0 = inset + 0.5 * du;
    let X = a * u0 + b * v + c;
    let Y = d * u0 + e * v + f;
    let Z = g * u0 + h * v + 1;
    const dX = a * du;
    const dY = d * du;
    const dZ = g * du;
    for (let x = 0; x < dw; x++) {
      const iz = 1 / Z;
      let fx = X * iz - 0.5;
      let fy = Y * iz - 0.5;
      if (fx < 0) fx = 0;
      else if (fx > maxX) fx = maxX;
      if (fy < 0) fy = 0;
      else if (fy > maxY) fy = maxY;
      const x0 = fx | 0;
      const y0 = fy | 0;
      const x1 = x0 < maxX ? x0 + 1 : x0;
      const y1 = y0 < maxY ? y0 + 1 : y0;
      const tx = fx - x0;
      const ty = fy - y0;
      const p00 = (y0 * sw + x0) * 4;
      const p10 = (y0 * sw + x1) * 4;
      const p01 = (y1 * sw + x0) * 4;
      const p11 = (y1 * sw + x1) * 4;
      const w00 = (1 - tx) * (1 - ty);
      const w10 = tx * (1 - ty);
      const w01 = (1 - tx) * ty;
      const w11 = tx * ty;
      out[o] = src[p00] * w00 + src[p10] * w10 + src[p01] * w01 + src[p11] * w11 + 0.5;
      out[o + 1] = src[p00 + 1] * w00 + src[p10 + 1] * w10 + src[p01 + 1] * w01 + src[p11 + 1] * w11 + 0.5;
      out[o + 2] = src[p00 + 2] * w00 + src[p10 + 2] * w10 + src[p01 + 2] * w01 + src[p11 + 2] * w11 + 0.5;
      out[o + 3] = 255;
      o += 4;
      X += dX;
      Y += dY;
      Z += dZ;
    }
  }
  return out;
}
