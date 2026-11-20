// Algılama testleri için sentetik "belge fotoğrafı" üretir: dokulu zemin,
// perspektifli kağıt, metin satırları, tablo, gölge ve isteğe bağlı parmak.
import { squareToQuad } from '../js/core/geometry.js';

export function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function invert3(m) {
  const [a, b, c, d, e, f, g, h, i] = m;
  const A = e * i - f * h, B = -(d * i - f * g), C = d * h - e * g;
  const det = a * A + b * B + c * C;
  return [
    A / det, -(b * i - c * h) / det, (b * f - c * e) / det,
    B / det, (a * i - c * g) / det, -(a * f - c * d) / det,
    C / det, -(a * h - b * g) / det, (a * e - b * d) / det,
  ];
}

function valueNoise(rand, gw, gh) {
  const g = new Float32Array((gw + 1) * (gh + 1)).map(() => rand());
  return (x, y) => {
    const fx = x * gw, fy = y * gh;
    const x0 = Math.min(gw - 1, fx | 0), y0 = Math.min(gh - 1, fy | 0);
    const tx = fx - x0, ty = fy - y0;
    const s = (xx, yy) => g[yy * (gw + 1) + xx];
    const a = s(x0, y0) * (1 - tx) + s(x0 + 1, y0) * tx;
    const b = s(x0, y0 + 1) * (1 - tx) + s(x0 + 1, y0 + 1) * tx;
    return a * (1 - ty) + b * ty;
  };
}

const BACKGROUNDS = [
  [120, 82, 52], // ahşap
  [70, 72, 78], // gri masa
  [35, 45, 70], // lacivert örtü
  [190, 180, 165], // açık bej masa (düşük kontrast)
  [150, 150, 150], // açık gri
  [25, 25, 28], // siyah
  [212, 210, 204], // beyaza yakın masa (çok düşük kontrast)
];

const CLUTTER = [
  [240, 240, 236], // başka kağıt
  [30, 30, 34], // telefon
  [170, 40, 40], // kitap
  [60, 110, 170], // defter
  [200, 190, 60], // yapışkan not
];

export function synthPhoto(seed, W = 1600, H = 1200) {
  const rand = rng(seed);
  const bgBase = BACKGROUNDS[Math.floor(rand() * BACKGROUNDS.length)];
  const portraitImg = rand() < 0.5;
  if (portraitImg) [W, H] = [H, W];

  let corners;
  for (let tries = 0; ; tries++) {
    const dh = (0.5 + 0.38 * rand()) * Math.min(W, H) * (portraitImg ? 1.25 : 0.95);
    const dw = dh * 0.707;
    const cx = W / 2 + (rand() - 0.5) * 0.15 * W;
    const cy = H / 2 + (rand() - 0.5) * 0.15 * H;
    const ang = (rand() - 0.5) * 0.6;
    const ca = Math.cos(ang), sa = Math.sin(ang);
    const base = [[-dw / 2, -dh / 2], [dw / 2, -dh / 2], [dw / 2, dh / 2], [-dw / 2, dh / 2]];
    // Perspektif: üst kenarı daralt/genişlet + küçük rastgele sapmalar.
    const k = (rand() - 0.5) * 0.25;
    corners = [];
    base.forEach(([x, y], i) => {
      const shrink = i < 2 ? 1 - k : 1 + k;
      let px = x * shrink + (rand() - 0.5) * 0.05 * dh;
      let py = y + (rand() - 0.5) * 0.05 * dh;
      corners.push(cx + px * ca - py * sa, cy + px * sa + py * ca);
    });
    const ok = corners.every((v, i) => (i % 2 ? v > 0.02 * H && v < 0.98 * H : v > 0.02 * W && v < 0.98 * W));
    if (ok || tries > 50) break;
  }

  const [a, b, c, d, e, f, g, h] = squareToQuad(corners);
  const inv = invert3([a, b, c, d, e, f, g, h, 1]);

  const nz = valueNoise(rand, 8, 8);
  const grain = valueNoise(rand, 60, 4);
  const hasShadow = rand() < 0.4;
  const shadowAng = rand() * Math.PI * 2;
  const shadowPos = 0.3 + rand() * 0.4;
  const hasFinger = rand() < 0.3;
  const fingerSide = Math.floor(rand() * 4);
  const fingerT = 0.3 + rand() * 0.4;
  const hasTable = rand() < 0.5;
  const hasPhoto = rand() < 0.4;
  const words = [];
  for (let row = 0; row < 34; row++) {
    const ws = [];
    let u = 0.08 + (row === 0 ? 0.15 : 0);
    const end = row % 7 === 6 ? 0.5 : 0.92;
    while (u < end) {
      const len = 0.02 + rand() * 0.09;
      ws.push([u, Math.min(end, u + len)]);
      u += len + 0.015;
    }
    words.push(ws);
  }

  const fp = (() => {
    const i0 = fingerSide * 2, i1 = ((fingerSide + 1) % 4) * 2;
    return {
      x: corners[i0] + (corners[i1] - corners[i0]) * fingerT,
      y: corners[i0 + 1] + (corners[i1 + 1] - corners[i0 + 1]) * fingerT,
    };
  })();
  const fr = 0.05 * Math.min(W, H);

  // Zemin üzerinde dağınık nesneler (belgenin altında kalır).
  const clutter = [];
  const nClutter = rand() < 0.5 ? 1 + Math.floor(rand() * 3) : 0;
  for (let i = 0; i < nClutter; i++) {
    const cw = (0.1 + rand() * 0.25) * W, chh = (0.1 + rand() * 0.3) * H;
    clutter.push({
      x: rand() * W - cw / 2, y: rand() * H - chh / 2, w: cw, h: chh,
      a: (rand() - 0.5) * 0.8, col: CLUTTER[Math.floor(rand() * CLUTTER.length)],
    });
  }
  const striped = rand() < 0.2;
  const stripeAng = rand() * Math.PI;
  const blur = rand() < 0.35 ? 1 + Math.floor(rand() * 2) : 0;
  const barrel = rand() < 0.5 ? (rand() - 0.3) * 0.06 : 0;

  const background = (px, py) => {
    for (const o of clutter) {
      const dx = px - o.x - o.w / 2, dy = py - o.y - o.h / 2;
      const ca = Math.cos(o.a), sa = Math.sin(o.a);
      const lx = dx * ca + dy * sa, ly = -dx * sa + dy * ca;
      if (Math.abs(lx) < o.w / 2 && Math.abs(ly) < o.h / 2) return o.col;
    }
    // Zemin parlaklığı dalgalanır ama beyaz kağıdı geçmez (gerçekçi sınır).
    let t = 0.8 + 0.35 * nz(px / W, py / H) + 0.1 * (grain(px / W, py / H) - 0.5);
    if (striped) {
      const s = px * Math.cos(stripeAng) + py * Math.sin(stripeAng);
      t *= Math.sin(s / 9) > 0 ? 1 : 0.8;
    }
    return [bgBase[0] * t, bgBase[1] * t, bgBase[2] * t];
  };

  const paper = (u, v) => {
    let r = 246, gg = 244, bb = 238;
    // Metin satırları
    const row = Math.floor((v - 0.1) / 0.024);
    if (row >= 0 && row < words.length && !(hasPhoto && u > 0.55 && u < 0.9 && v > 0.55 && v < 0.75)) {
      const vy = (v - 0.1) / 0.024 - row;
      const thick = row === 0 ? 0.55 : 0.35;
      if (vy > 0.3 && vy < 0.3 + thick) {
        for (const [u0, u1] of words[row]) {
          if (u >= u0 && u <= u1) {
            const letter = ((u - u0) * 260) % 1;
            if (letter < 0.7) {
              r = 40;
              gg = 42;
              bb = 50;
            }
            break;
          }
        }
      }
    }
    if (hasTable && v > 0.78 && v < 0.92 && u > 0.08 && u < 0.92) {
      const onLine = Math.abs(v - 0.78) < 0.002 || Math.abs(v - 0.92) < 0.002 ||
        Math.abs(u - 0.08) < 0.002 || Math.abs(u - 0.92) < 0.002 || Math.abs(u - 0.5) < 0.0015;
      if (onLine) {
        r = 60;
        gg = 60;
        bb = 70;
      }
    }
    if (hasPhoto && u > 0.55 && u < 0.9 && v > 0.55 && v < 0.75) {
      r = 60 + 120 * u;
      gg = 90 + 60 * v;
      bb = 140;
    }
    return [r, gg, bb];
  };

  const data = new Uint8ClampedArray(W * H * 4);
  const SS = [0.25, 0.75];
  const R0 = Math.hypot(W, H) / 2;
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      let R = 0, G = 0, B = 0;
      for (const oy of SS) {
        for (const ox of SS) {
          let px = x + ox, py = y + oy;
          if (barrel) {
            // Mercek bükülmesi: düz kağıt kenarları hafif eğri görünür.
            const dx = (px - W / 2) / R0, dy = (py - H / 2) / R0;
            const k = 1 + barrel * (dx * dx + dy * dy);
            px = W / 2 + dx * k * R0;
            py = H / 2 + dy * k * R0;
          }
          const z = inv[6] * px + inv[7] * py + inv[8];
          const u = (inv[0] * px + inv[1] * py + inv[2]) / z;
          const v = (inv[3] * px + inv[4] * py + inv[5]) / z;
          let col = u >= 0 && u <= 1 && v >= 0 && v <= 1 ? paper(u, v) : background(px, py);
          if (hasFinger && Math.hypot((px - fp.x) / 1.6, py - fp.y) < fr) col = [205, 150, 125];
          R += col[0];
          G += col[1];
          B += col[2];
        }
      }
      // Işık: köşelere doğru kararma ve isteğe bağlı yumuşak gölge
      const vx = x / W - 0.5, vy = y / H - 0.5;
      let light = 1 - 0.35 * (vx * vx + vy * vy);
      if (hasShadow) {
        const s = (x / W - 0.5) * Math.cos(shadowAng) + (y / H - 0.5) * Math.sin(shadowAng) + 0.5 - shadowPos;
        light *= 1 - 0.35 / (1 + Math.exp(-s * 25));
      }
      const o = (y * W + x) * 4;
      data[o] = (R / 4) * light;
      data[o + 1] = (G / 4) * light;
      data[o + 2] = (B / 4) * light;
      data[o + 3] = 255;
    }
  }
  if (blur) boxBlurRgba(data, W, H, blur);
  for (let o = 0; o < data.length; o += 4) {
    data[o] += (rand() - 0.5) * 10;
    data[o + 1] += (rand() - 0.5) * 10;
    data[o + 2] += (rand() - 0.5) * 10;
  }
  // Bükülme varsa gerçek köşelerin görüntüdeki yerini ters çevirerek bul.
  const truth = corners.slice();
  if (barrel) {
    for (let k = 0; k < 4; k++) {
      const cx = corners[k * 2], cy = corners[k * 2 + 1];
      let px = cx, py = cy;
      for (let it = 0; it < 30; it++) {
        const dx = (px - W / 2) / R0, dy = (py - H / 2) / R0;
        const s = 1 + barrel * (dx * dx + dy * dy);
        px = W / 2 + (cx - W / 2) / s;
        py = H / 2 + (cy - H / 2) / s;
      }
      truth[k * 2] = px;
      truth[k * 2 + 1] = py;
    }
  }
  return {
    data, w: W, h: H, corners: truth,
    meta: { bgBase, hasShadow, hasFinger, hasTable, hasPhoto, clutter: clutter.length, striped, blur, barrel },
  };
}

function boxBlurRgba(d, w, h, r) {
  const tmp = new Float32Array(d.length);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      for (let c = 0; c < 3; c++) {
        let s = 0, n = 0;
        for (let k = Math.max(0, x - r); k <= Math.min(w - 1, x + r); k++, n++) s += d[(y * w + k) * 4 + c];
        tmp[(y * w + x) * 4 + c] = s / n;
      }
    }
  }
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      for (let c = 0; c < 3; c++) {
        let s = 0, n = 0;
        for (let k = Math.max(0, y - r); k <= Math.min(h - 1, y + r); k++, n++) s += tmp[(k * w + x) * 4 + c];
        d[(y * w + x) * 4 + c] = s / n;
      }
    }
  }
}
