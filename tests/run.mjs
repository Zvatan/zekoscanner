// Çekirdek modüllerin testleri: node tests/run.mjs [çıktı-klasörü]
// Sentetik fotoğraflarda köşe algılama doğruluğunu ölçer; filtre, düzeltme
// ve PDF çıktılarını görsel kontrol için klasöre yazar.
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { synthPhoto } from './synth.mjs';
import { encodePng, drawQuad } from './png.mjs';
import { findDocument } from '../js/core/detect.js';
import { normalizeQuad, outputSize, isValidQuad } from '../js/core/geometry.js';
import { fitWithin, warpPerspective, rotate90 } from '../js/core/imageops.js';
import { applyFilter, FILTERS } from '../js/core/filters.js';

const out = process.argv[2] || new URL('./out', import.meta.url).pathname.replace(/^\/(\w:)/, '$1');
mkdirSync(out, { recursive: true });

const N = Number(process.env.N || 40);
const errors = [];
let failures = 0;
let totalMs = 0;

for (let seed = 1; seed <= N; seed++) {
  const img = synthPhoto(seed);
  const t0 = performance.now();
  const res = findDocument(img.data, img.w, img.h);
  const ms = performance.now() - t0;
  totalMs += ms;
  const truth = normalizeQuad(img.corners);
  const diag = Math.hypot(img.w, img.h);
  let err = Infinity;
  if (res) {
    err = 0;
    for (let k = 0; k < 4; k++) {
      err = Math.max(err, Math.hypot(res.corners[k * 2] - truth[k * 2], res.corners[k * 2 + 1] - truth[k * 2 + 1]));
    }
  }
  const rel = err / diag;
  errors.push(rel);
  const ok = rel < 0.01;
  if (!ok) failures++;
  const m = img.meta;
  console.log(
    `#${String(seed).padStart(2)} ${ok ? 'OK  ' : 'FAIL'} hata=${Number.isFinite(err) ? err.toFixed(1) + 'px' : 'yok'} ` +
      `(${(rel * 100).toFixed(2)}%) ${ms.toFixed(0)}ms bg=${m.bgBase.join(',')}` +
      `${m.hasShadow ? ' gölge' : ''}${m.hasFinger ? ' parmak' : ''}${m.hasTable ? ' tablo' : ''}${m.hasPhoto ? ' foto' : ''}` +
      `${m.clutter ? ' nesne:' + m.clutter : ''}${m.striped ? ' desen' : ''}${m.blur ? ' bulanık' : ''}${m.barrel ? ' bükülme' : ''}`,
  );
  if (!ok || seed <= 3) {
    const view = fitWithin(img.data, img.w, img.h, 640);
    const vis = new Uint8ClampedArray(view.data);
    drawQuad(vis, view.w, view.h, truth.map((v) => v * view.scale), [0, 220, 0], 1);
    if (res) drawQuad(vis, view.w, view.h, res.corners.map((v) => v * view.scale), [255, 40, 40], 1);
    writeFileSync(join(out, `detect-${seed}.png`), encodePng(vis, view.w, view.h));
  }
}

const sorted = errors.slice().sort((a, b) => a - b);
console.log(
  `\nBaşarı: ${N - failures}/${N}  medyan hata: ${(sorted[N >> 1] * 100).toFixed(2)}%  ` +
    `ortalama süre: ${(totalMs / N).toFixed(0)}ms`,
);

// Düzeltme + filtreler
const img = synthPhoto(Number(process.env.FSEED || 25));
const res = findDocument(img.data, img.w, img.h);
const quad = res ? res.corners : normalizeQuad(img.corners);
console.log('Seçim geçerli mi:', isValidQuad(quad, img.w, img.h, 20));
const size = outputSize(quad, img.w, img.h);
console.log('Çıktı boyutu:', size, 'oran', (size.w / size.h).toFixed(3), '(A4 ≈ 0.707)');
let t = performance.now();
const warped = warpPerspective(img.data, img.w, img.h, quad, size.w, size.h);
console.log(`Perspektif düzeltme: ${(performance.now() - t).toFixed(0)}ms`);
for (const f of FILTERS) {
  t = performance.now();
  const r = applyFilter(warped, size.w, size.h, f.id);
  console.log(`Filtre ${f.id}: ${(performance.now() - t).toFixed(0)}ms`);
  writeFileSync(join(out, `filter-${f.id}.png`), encodePng(r, size.w, size.h));
}
for (const s of [0, 30, 100]) {
  t = performance.now();
  const r = applyFilter(warped, size.w, size.h, 'magic', s);
  console.log(`Sihirli %${s}: ${(performance.now() - t).toFixed(0)}ms`);
  writeFileSync(join(out, `filter-magic-${s}.png`), encodePng(r, size.w, size.h));
}
const rot = rotate90(warped, size.w, size.h, 1);
writeFileSync(join(out, 'rotated.png'), encodePng(rot.data, rot.w, rot.h));
console.log('Çıktılar:', out);
process.exitCode = failures > N * 0.1 ? 1 : 0;
