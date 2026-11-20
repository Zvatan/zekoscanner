// Belge köşesi algılama. DOM kullanmaz.
//
// Akış: hafif bulanıklaştırma -> renk kanallarında Sobel -> kenar inceltme
// (NMS) + histerezis -> parlaklık yönünü koruyan Hough dönüşümü -> güçlü
// doğrulardan dörtgen adayları -> kenar desteğiyle puanlama -> tam
// çözünürlükte alt-piksel iyileştirme.
import { intersectLines, isConvex, signedArea, normalizeQuad, toArray } from './geometry.js';
import { fitWithin } from './imageops.js';

const DEG = Math.PI / 180;
const TAN22 = 0.41421356;
const ALIGN_COS = Math.cos(25 * DEG);

export const DETECT_SIZE = 480;

// Kaynak görüntüde belgeyi arar. Bulursa köşeleri kaynak koordinatlarında
// döndürür, bulamazsa null.
export function findDocument(src, w, h) {
  const small = fitWithin(src, w, h, DETECT_SIZE);
  const found = detectQuad(small.data, small.w, small.h);
  if (!found) return null;
  // Algılama piksel indeksleriyle çalışır (piksel merkezi = tam sayı).
  // Küçük görüntüdeki i indeksi, büyükte (i + 0.5) * inv - 0.5 indeksidir.
  const inv = 1 / small.scale;
  const sides = found.sides.map((s) => {
    const k = 0.5 * (s.nx + s.ny);
    return { ...s, rho: (s.rho + k) * inv - k };
  });
  const corners = found.corners.map((v) => (v + 0.5) * inv - 0.5);
  const refined = refineQuad(src, w, h, corners, sides, inv);
  // Kesintisiz koordinatlara geç: piksel x, [x, x+1) aralığını kaplar.
  const continuous = refined.map((v, i) => Math.min(Math.max(v + 0.5, 0), i % 2 === 0 ? w : h));
  return { corners: normalizeQuad(continuous), score: found.score };
}

// Küçük görüntüde dörtgen arar. corners küçük görüntü koordinatındadır;
// sides[k], k. köşeden k+1. köşeye giden kenarın doğrusudur.
export function detectQuad(rgba, w, h, debug = null) {
  const n = w * h;
  const R = new Float32Array(n);
  const G = new Float32Array(n);
  const B = new Float32Array(n);
  for (let i = 0, p = 0; i < n; i++, p += 4) {
    R[i] = rgba[p];
    G[i] = rgba[p + 1];
    B[i] = rgba[p + 2];
  }
  const tmp = new Float32Array(n);
  blur5(R, tmp, w, h);
  blur5(G, tmp, w, h);
  blur5(B, tmp, w, h);

  const { gx, gy, mag } = sobelDominant(R, G, B, w, h);
  const edge = cannyEdges(gx, gy, mag, w, h, debug);
  const lines = houghLines(edge, gx, gy, w, h);
  if (debug) Object.assign(debug, { edge, lines });
  if (lines.length < 2) return null;

  for (const l of lines) l.profile = supportProfile(l, edge, gx, gy, mag, w, h);
  return bestQuad(lines.concat(borderLines(w, h)), w, h);
}

// [1 4 6 4 1]/16 ayrılabilir çekirdek, yerinde.
function blur5(a, tmp, w, h) {
  for (let y = 0; y < h; y++) {
    const o = y * w;
    for (let x = 0; x < w; x++) {
      const x0 = x > 1 ? x - 2 : 0;
      const x1 = x > 0 ? x - 1 : 0;
      const x3 = x < w - 1 ? x + 1 : w - 1;
      const x4 = x < w - 2 ? x + 2 : w - 1;
      tmp[o + x] = (a[o + x0] + 4 * a[o + x1] + 6 * a[o + x] + 4 * a[o + x3] + a[o + x4]) / 16;
    }
  }
  for (let y = 0; y < h; y++) {
    const y0 = (y > 1 ? y - 2 : 0) * w;
    const y1 = (y > 0 ? y - 1 : 0) * w;
    const y2 = y * w;
    const y3 = (y < h - 1 ? y + 1 : h - 1) * w;
    const y4 = (y < h - 2 ? y + 2 : h - 1) * w;
    for (let x = 0; x < w; x++) {
      a[y2 + x] = (tmp[y0 + x] + 4 * tmp[y1 + x] + 6 * tmp[y2 + x] + 4 * tmp[y3 + x] + tmp[y4 + x]) / 16;
    }
  }
}

// Her pikselde gradyanı en güçlü renk kanalından alır; böylece parlaklığı
// benzer ama rengi farklı zeminlerde de kenar bulunur.
function sobelDominant(R, G, B, w, h) {
  const n = w * h;
  const gx = new Float32Array(n);
  const gy = new Float32Array(n);
  const mag = new Float32Array(n);
  const chans = [R, G, B];
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x;
      let bx = 0, by = 0, bm = -1;
      for (let c = 0; c < 3; c++) {
        const a = chans[c];
        const tl = a[i - w - 1], t = a[i - w], tr = a[i - w + 1];
        const l = a[i - 1], r = a[i + 1];
        const bl = a[i + w - 1], b = a[i + w], br = a[i + w + 1];
        const sx = tr + 2 * r + br - (tl + 2 * l + bl);
        const sy = bl + 2 * b + br - (tl + 2 * t + tr);
        const m = sx * sx + sy * sy;
        if (m > bm) {
          bm = m;
          bx = sx;
          by = sy;
        }
      }
      gx[i] = bx;
      gy[i] = by;
      mag[i] = Math.sqrt(bm);
    }
  }
  return { gx, gy, mag };
}

function cannyEdges(gx, gy, mag, w, h, debug) {
  const n = w * h;
  const nms = new Float32Array(n);
  const hist = new Uint32Array(1500);
  let total = 0;
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x;
      const m = mag[i];
      if (m < 4) continue;
      const ax = Math.abs(gx[i]);
      const ay = Math.abs(gy[i]);
      let m1, m2;
      if (ay <= ax * TAN22) {
        m1 = mag[i - 1];
        m2 = mag[i + 1];
      } else if (ax <= ay * TAN22) {
        m1 = mag[i - w];
        m2 = mag[i + w];
      } else if (gx[i] * gy[i] > 0) {
        m1 = mag[i - w - 1];
        m2 = mag[i + w + 1];
      } else {
        m1 = mag[i - w + 1];
        m2 = mag[i + w - 1];
      }
      if (m >= m1 && m > m2) {
        nms[i] = m;
        hist[Math.min(1499, m | 0)]++;
        total++;
      }
    }
  }
  // Eşikler: metin kenarları çok güçlü olduğundan yalnız üst yüzdeliğe
  // bakmak soluk kağıt kenarlarını eler; gürültü düzeyi (medyan) de sınırlar.
  const p50 = percentile(hist, total, 0.5);
  const p85 = percentile(hist, total, 0.85);
  const hi = Math.max(20, Math.min(p85 * 0.6, 3 * p50));
  const lo = Math.max(10, hi * 0.45);
  if (debug) Object.assign(debug, { p50, p85, hi, lo });

  const edge = new Uint8Array(n);
  const stack = new Int32Array(n);
  let sp = 0;
  for (let i = 0; i < n; i++) {
    if (nms[i] >= hi && !edge[i]) {
      edge[i] = 1;
      stack[sp++] = i;
      while (sp > 0) {
        const j = stack[--sp];
        const jx = j % w;
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            if (!dx && !dy) continue;
            const kx = jx + dx;
            if (kx < 0 || kx >= w) continue;
            const k = j + dy * w + dx;
            if (k < 0 || k >= n) continue;
            if (!edge[k] && nms[k] >= lo) {
              edge[k] = 1;
              stack[sp++] = k;
            }
          }
        }
      }
    }
  }
  return edge;
}

function percentile(hist, total, q) {
  const target = total * q;
  let acc = 0;
  for (let i = 0; i < hist.length; i++) {
    acc += hist[i];
    if (acc >= target) return i;
  }
  return hist.length - 1;
}

// Yön (0..359°) ve uzaklıkla parametrelenen Hough dönüşümü. Normal yönü,
// gradyan yönüdür (koyudan açığa); böylece kağıt kenarı ile çevresindeki
// zıt yönlü kenarlar karışmaz.
function houghLines(edge, gx, gy, w, h) {
  const NT = 360;
  const diag = Math.ceil(Math.hypot(w, h));
  const NR = 2 * diag + 1;
  const cosT = new Float32Array(NT);
  const sinT = new Float32Array(NT);
  for (let t = 0; t < NT; t++) {
    cosT[t] = Math.cos(t * DEG);
    sinT[t] = Math.sin(t * DEG);
  }
  const acc = new Float32Array(NT * NR);
  const WIN = 6;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if (!edge[i]) continue;
      const t0 = Math.round(Math.atan2(gy[i], gx[i]) / DEG);
      for (let d = -WIN; d <= WIN; d++) {
        const t = (t0 + d + 720) % NT;
        const r = Math.round(x * cosT[t] + y * sinT[t]) + diag;
        acc[t * NR + r] += 1;
      }
    }
  }
  // ρ yönünde 3'lü toplam: hafif eğrilik ve yuvarlama kayıplarını toplar.
  const sm = new Float32Array(NT * NR);
  for (let t = 0; t < NT; t++) {
    const o = t * NR;
    for (let r = 1; r < NR - 1; r++) sm[o + r] = acc[o + r - 1] + acc[o + r] + acc[o + r + 1];
  }
  const minVotes = Math.max(12, 0.07 * Math.min(w, h));
  const peaks = [];
  const DT = 3;
  const DR = 5;
  for (let t = 0; t < NT; t++) {
    const o = t * NR;
    for (let r = DR; r < NR - DR; r++) {
      const v = sm[o + r];
      if (v < minVotes) continue;
      let isMax = true;
      for (let dt = -DT; dt <= DT && isMax; dt++) {
        const oo = ((t + dt + NT) % NT) * NR;
        for (let dr = -DR; dr <= DR; dr++) {
          if (!dt && !dr) continue;
          const u = sm[oo + r + dr];
          if (u > v || (u === v && (dt < 0 || (dt === 0 && dr < 0)))) {
            isMax = false;
            break;
          }
        }
      }
      if (isMax) peaks.push({ t, r: r - diag, v });
    }
  }
  peaks.sort((a, b) => b.v - a.v);
  const uniq = [];
  for (const p of peaks) {
    if (uniq.length >= 150) break;
    const dup = uniq.some((l) => angleDiff(l.t, p.t) <= 4 && Math.abs(l.rho - p.r) <= 8);
    if (dup) continue;
    uniq.push({ t: p.t, nx: cosT[p.t], ny: sinT[p.t], rho: p.r, votes: p.v, border: false });
  }
  return selectLines(uniq);
}

function angleDiff(a, b) {
  const d = Math.abs(a - b) % 360;
  return d > 180 ? 360 - d : d;
}

// Doğruları yön gruplarına ayırır ve her gruptan en güçlüleri ile en dıştaki
// (en küçük ve en büyük ρ) doğruları seçer. Metin satırları ve desenli
// zeminler aynı yönde çok sayıda güçlü doğru üretir; kağıt kenarı ise kendi
// yönündeki doğruların en dışında kalır, bu yüzden seçimden düşmez.
function selectLines(lines, maxTotal = 28) {
  const bands = [];
  for (const l of lines) {
    let band = bands.find((b) => angleDiff(b.t, l.t) <= 10);
    if (!band) bands.push((band = { t: l.t, lines: [] }));
    band.lines.push(l);
  }
  const first = new Set();
  const second = new Set();
  for (const b of bands) {
    const strong = b.lines.filter((l) => l.votes >= 0.3 * b.lines[0].votes);
    let lo = strong[0], hi = strong[0];
    for (const l of strong) {
      if (l.rho < lo.rho) lo = l;
      if (l.rho > hi.rho) hi = l;
    }
    first.add(b.lines[0]);
    first.add(lo);
    first.add(hi);
    b.lines.slice(1, 3).forEach((l) => second.add(l));
  }
  const byVotes = (a, b) => b.votes - a.votes;
  const out = [...first].sort(byVotes).slice(0, maxTotal);
  for (const l of [...second].sort(byVotes)) {
    if (out.length >= maxTotal) break;
    if (!first.has(l)) out.push(l);
  }
  return out;
}

// Görüntü kenarları: belge kadrajın dışına taşıyorsa kenar yerine geçer.
function borderLines(w, h) {
  return [
    { nx: 1, ny: 0, rho: 0, border: true },
    { nx: -1, ny: 0, rho: -(w - 1), border: true },
    { nx: 0, ny: 1, rho: 0, border: true },
    { nx: 0, ny: -1, rho: -(h - 1), border: true },
  ];
}

// Doğru boyunca birim adımlarla "kenar pikseli var mı" bilgisinin önek
// toplamı. Bir dörtgen kenarının desteği böylece O(1) hesaplanır.
function supportProfile(line, edge, gx, gy, mag, w, h) {
  const dx = -line.ny;
  const dy = line.nx;
  const bx = line.rho * line.nx;
  const by = line.rho * line.ny;
  const span = Math.ceil(Math.hypot(w, h));
  const s0 = -span;
  const len = 2 * span + 1;
  const prefix = new Float32Array(len + 1);
  for (let k = 0; k < len; k++) {
    const s = s0 + k;
    let hit = 0;
    for (let o = -2; o <= 2 && !hit; o++) {
      const px = Math.round(bx + s * dx + o * line.nx);
      const py = Math.round(by + s * dy + o * line.ny);
      if (px < 0 || py < 0 || px >= w || py >= h) continue;
      const i = py * w + px;
      if (edge[i] && gx[i] * line.nx + gy[i] * line.ny >= ALIGN_COS * mag[i]) hit = 1;
    }
    prefix[k + 1] = prefix[k] + hit;
  }
  return { s0, prefix, dx, dy };
}

function supportBetween(line, a, b) {
  const { s0, prefix, dx, dy } = line.profile;
  const n = prefix.length - 1;
  let sa = a.x * dx + a.y * dy - s0;
  let sb = b.x * dx + b.y * dy - s0;
  if (sa > sb) [sa, sb] = [sb, sa];
  const ia = Math.max(0, Math.min(n, Math.round(sa)));
  const ib = Math.max(0, Math.min(n, Math.round(sb)));
  return prefix[ib] - prefix[ia];
}

// Dört kenar doğrusundan (sırayla: kenar k, k. köşeden k+1. köşeye) dörtgen
// kurar; geometrik koşulları sağlamazsa null döner.
function makeQuad(sides, w, h) {
  const mx = 0.03 * w;
  const my = 0.03 * h;
  const quad = [];
  for (let k = 0; k < 4; k++) {
    const p = intersectLines(sides[(k + 3) % 4], sides[k]);
    if (!p || p.x < -mx || p.x > w - 1 + mx || p.y < -my || p.y > h - 1 + my) return null;
    quad.push(p);
  }
  if (!isConvex(quad) || Math.abs(signedArea(quad)) < 0.1 * w * h || !anglesOk(quad)) return null;
  return quad;
}

// Kenar desteğine göre puan. Görüntü kenarı kullanan (kadraja sığmayan)
// adaylar yalnız gerçek kenarlarıyla puanlanır ve ayrıca zayıflatılır.
// Kağıt çevresinden açık ya da koyu olabilir ama tüm kenarlar aynı yönde
// geçiş göstermelidir.
function scoreQuad(sides, quad) {
  const cx = (quad[0].x + quad[1].x + quad[2].x + quad[3].x) / 4;
  const cy = (quad[0].y + quad[1].y + quad[2].y + quad[3].y) / 4;
  let pol = 0, sup = 0, unsup = 0, real = 0;
  for (let k = 0; k < 4; k++) {
    const l = sides[k];
    if (l.border) continue;
    const s = l.nx * cx + l.ny * cy - l.rho > 0 ? 1 : -1;
    if (pol === 0) pol = s;
    else if (s !== pol) return -Infinity;
    const u = quad[k];
    const v = quad[(k + 1) % 4];
    const len = Math.hypot(u.x - v.x, u.y - v.y);
    const sp = supportBetween(l, u, v);
    if (sp < 0.25 * len) return -Infinity;
    real++;
    sup += sp;
    unsup += len - sp;
  }
  if (real < 2) return -Infinity;
  const area = Math.abs(signedArea(quad));
  return (sup - 0.5 * unsup + 0.1 * Math.sqrt(area)) * Math.pow(0.7, 4 - real);
}

function bestQuad(lines, w, h) {
  const n = lines.length;
  const minScore = 0.35 * (w + h);
  let best = null;
  const pairings = [
    [0, 1, 2, 3],
    [0, 2, 1, 3],
    [0, 3, 1, 2],
  ];
  for (let a = 0; a < n; a++) {
    for (let b = a + 1; b < n; b++) {
      for (let c = b + 1; c < n; c++) {
        for (let d = c + 1; d < n; d++) {
          const set = [lines[a], lines[b], lines[c], lines[d]];
          if (set.filter((l) => l.border).length > 2) continue;
          for (const [i1, i2, j1, j2] of pairings) {
            const P1 = set[i1], P2 = set[i2], Q1 = set[j1], Q2 = set[j2];
            // Karşılıklı kenarlar kabaca paralel, komşular belirgin açılı olmalı.
            if (Math.abs(P1.nx * P2.nx + P1.ny * P2.ny) < 0.7) continue;
            if (Math.abs(Q1.nx * Q2.nx + Q1.ny * Q2.ny) < 0.7) continue;
            if (Math.abs(P1.nx * Q1.nx + P1.ny * Q1.ny) > 0.87) continue;
            const sides = [P1, Q2, P2, Q1];
            const quad = makeQuad(sides, w, h);
            if (!quad) continue;
            const score = scoreQuad(sides, quad);
            if (score >= minScore && (!best || score > best.score)) best = { score, sides, quad };
          }
        }
      }
    }
  }
  if (!best) return null;
  expandQuad(best, lines, w, h);
  return {
    score: best.score,
    corners: toArray(best.quad),
    sides: best.sides.map((l) => ({ nx: l.nx, ny: l.ny, rho: l.rho, border: l.border })),
  };
}

// Kağıt kenarı, aynı yöndeki metin satırı ve tablo çizgilerinin hep dışında
// kalır. Bir kenarı, aynı yönde daha dışta duran ve yeterince desteklenen bir
// doğruya taşımak mümkünse (komşu kenarların uzayan kısımları da
// destekleniyorsa) taşır.
function expandQuad(best, lines, w, h) {
  for (let iter = 0; iter < 4; iter++) {
    let changed = false;
    for (let k = 0; k < 4; k++) {
      const cur = best.sides[k];
      if (cur.border) continue;
      const q = best.quad;
      const cx = (q[0].x + q[1].x + q[2].x + q[3].x) / 4;
      const cy = (q[0].y + q[1].y + q[2].y + q[3].y) / 4;
      const curS = cur.nx * cx + cur.ny * cy - cur.rho;
      const sign = curS > 0 ? 1 : -1;
      let pick = null;
      let pickDist = Math.abs(curS) + 2;
      for (const m of lines) {
        if (m.border || m === cur) continue;
        if (m.nx * cur.nx + m.ny * cur.ny < Math.cos(8 * DEG)) continue;
        // Merkezden aynı tarafta ve daha uzakta olmalı.
        const d = sign * (m.nx * cx + m.ny * cy - m.rho);
        if (d <= pickDist) continue;
        const sides = best.sides.slice();
        sides[k] = m;
        const quad = makeQuad(sides, w, h);
        if (!quad || scoreQuad(sides, quad) === -Infinity) continue;
        if (!wellSupported(sides, quad, best.quad, k)) continue;
        pick = { sides, quad };
        pickDist = d;
      }
      if (pick) {
        best.sides = pick.sides;
        best.quad = pick.quad;
        best.score = scoreQuad(pick.sides, pick.quad);
        changed = true;
      }
    }
    if (!changed) break;
  }
}

// Taşınan kenar en az yarı yarıya, komşu kenarların yeni uzayan parçaları
// ise büyük ölçüde desteklenmeli; aksi halde yakındaki başka bir nesneye
// atlanmış olur.
function wellSupported(sides, quad, oldQuad, k) {
  const moved = sides[k];
  const u = quad[k];
  const v = quad[(k + 1) % 4];
  if (supportBetween(moved, u, v) < 0.5 * Math.hypot(u.x - v.x, u.y - v.y)) return false;
  const ext = [
    [sides[(k + 3) % 4], oldQuad[k], quad[k]],
    [sides[(k + 1) % 4], oldQuad[(k + 1) % 4], quad[(k + 1) % 4]],
  ];
  for (const [l, a, b] of ext) {
    if (l.border) continue;
    const len = Math.hypot(a.x - b.x, a.y - b.y);
    if (len > 1 && supportBetween(l, a, b) < 0.6 * len) return false;
  }
  return true;
}
// İç açılar 35°–145° aralığında olmalı.
function anglesOk(q) {
  for (let i = 0; i < 4; i++) {
    const p = q[(i + 3) % 4], c = q[i], nx = q[(i + 1) % 4];
    const ax = p.x - c.x, ay = p.y - c.y;
    const bx = nx.x - c.x, by = nx.y - c.y;
    const cos = (ax * bx + ay * by) / (Math.hypot(ax, ay) * Math.hypot(bx, by));
    if (Math.abs(cos) > 0.82) return false;
  }
  return true;
}

// --- Tam çözünürlükte iyileştirme ---------------------------------------

function lumAt(src, w, h, x, y) {
  if (x < 0) x = 0;
  else if (x > w - 1) x = w - 1;
  if (y < 0) y = 0;
  else if (y > h - 1) y = h - 1;
  const x0 = x | 0, y0 = y | 0;
  const x1 = x0 < w - 1 ? x0 + 1 : x0;
  const y1 = y0 < h - 1 ? y0 + 1 : y0;
  const tx = x - x0, ty = y - y0;
  const l = (i) => 0.299 * src[i] + 0.587 * src[i + 1] + 0.114 * src[i + 2];
  const a = l((y0 * w + x0) * 4), b = l((y0 * w + x1) * 4);
  const c = l((y1 * w + x0) * 4), d = l((y1 * w + x1) * 4);
  return (a * (1 - tx) + b * tx) * (1 - ty) + (c * (1 - tx) + d * tx) * ty;
}

// Her kenar boyunca normal doğrultusunda en güçlü ve doğru yönlü parlaklık
// geçişini arar, noktalara doğru oturtur, köşeleri yeniden kesiştirir.
export function refineQuad(src, w, h, corners, sides, scale) {
  const pts = [0, 1, 2, 3].map((k) => ({ x: corners[k * 2], y: corners[k * 2 + 1] }));
  const cx = pts.reduce((s, p) => s + p.x, 0) / 4;
  const cy = pts.reduce((s, p) => s + p.y, 0) / 4;
  const radius = Math.max(4, Math.round(2.5 * scale));
  const lines = [];

  for (let k = 0; k < 4; k++) {
    const side = sides[k];
    const u = pts[k];
    const v = pts[(k + 1) % 4];
    const fallback = { nx: side.nx, ny: side.ny, rho: side.rho };
    if (side.border) {
      lines.push(fallback);
      continue;
    }
    const len = Math.hypot(v.x - u.x, v.y - u.y);
    const tx = (v.x - u.x) / len;
    const ty = (v.y - u.y) / len;
    // İçe bakan normal ve beklenen parlaklık değişimi işareti.
    let mx = -ty, my = tx;
    if (mx * (cx - u.x) + my * (cy - u.y) < 0) {
      mx = -mx;
      my = -my;
    }
    const expect = side.nx * mx + side.ny * my > 0 ? 1 : -1;
    const found = [];
    const N = 40;
    for (let i = 0; i < N; i++) {
      const f = 0.08 + (0.84 * i) / (N - 1);
      const px = u.x + (v.x - u.x) * f;
      const py = u.y + (v.y - u.y) * f;
      let bestT = 0, bestD = 0;
      const ds = [];
      for (let t = -radius - 1; t <= radius + 1; t++) {
        let dsum = 0;
        for (const o of [-2, 0, 2]) {
          const qx = px + t * mx + o * tx;
          const qy = py + t * my + o * ty;
          dsum += lumAt(src, w, h, qx + 1.5 * mx, qy + 1.5 * my) - lumAt(src, w, h, qx - 1.5 * mx, qy - 1.5 * my);
        }
        ds.push(expect * dsum / 3);
      }
      for (let j = 1; j < ds.length - 1; j++) {
        if (ds[j] > bestD) {
          bestD = ds[j];
          bestT = j;
        }
      }
      if (bestD < 10 || bestT === 0) continue;
      const a = ds[bestT - 1], b = ds[bestT], c = ds[bestT + 1];
      const den = a - 2 * b + c;
      const off = den < 0 ? (0.5 * (a - c)) / den : 0;
      const t = bestT - radius - 1 + Math.max(-0.5, Math.min(0.5, off));
      found.push({ x: px + t * mx, y: py + t * my });
    }
    const fit = fitLine(found);
    if (!fit) {
      lines.push(fallback);
      continue;
    }
    // Eski doğrudan çok sapan uyumları reddet.
    const angle = Math.acos(Math.min(1, Math.abs(fit.nx * fallback.nx + fit.ny * fallback.ny)));
    const shift = Math.abs(fit.nx * (u.x + v.x) / 2 + fit.ny * (u.y + v.y) / 2 - fit.rho);
    lines.push(angle < 4 * DEG && shift <= radius + 1 ? fit : fallback);
  }

  const out = [];
  for (let k = 0; k < 4; k++) {
    const p = intersectLines(lines[(k + 3) % 4], lines[k]);
    if (!p) return clampCorners(corners, w, h);
    out.push(p);
  }
  const moved = out.some((p, k) => Math.hypot(p.x - pts[k].x, p.y - pts[k].y) > 3 * radius);
  if (moved || !isConvex(out)) return clampCorners(corners, w, h);
  return clampCorners(toArray(out), w, h);
}

function clampCorners(c, w, h) {
  return c.map((v, i) => Math.min(Math.max(v, 0), i % 2 === 0 ? w : h));
}

// Toplam en küçük kareler doğru uydurma; aykırı noktaları bir kez ayıklar.
function fitLine(points) {
  if (points.length < 10) return null;
  let pts = points;
  let line = null;
  for (let iter = 0; iter < 2; iter++) {
    const n = pts.length;
    let mx = 0, my = 0;
    for (const p of pts) {
      mx += p.x;
      my += p.y;
    }
    mx /= n;
    my /= n;
    let sxx = 0, syy = 0, sxy = 0;
    for (const p of pts) {
      const dx = p.x - mx, dy = p.y - my;
      sxx += dx * dx;
      syy += dy * dy;
      sxy += dx * dy;
    }
    const theta = 0.5 * Math.atan2(2 * sxy, sxx - syy);
    const nx = -Math.sin(theta), ny = Math.cos(theta);
    line = { nx, ny, rho: nx * mx + ny * my };
    if (iter === 1) break;
    const res = pts.map((p) => Math.abs(nx * p.x + ny * p.y - line.rho));
    const sorted = res.slice().sort((a, b) => a - b);
    const mad = sorted[sorted.length >> 1];
    const lim = Math.max(1.5, 2.5 * mad);
    const kept = pts.filter((_, i) => res[i] <= lim);
    if (kept.length < 10) return null;
    pts = kept;
  }
  return line;
}
