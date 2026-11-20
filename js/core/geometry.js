// Geometri yardımcıları. DOM kullanmaz; tarayıcıda, worker'da ve Node'da çalışır.
// Köşe dizileri [x0,y0, x1,y1, x2,y2, x3,y3] biçimindedir:
// sol üst, sağ üst, sağ alt, sol alt (ekran koordinatlarında saat yönü).

export function toPoints(c) {
  return [
    { x: c[0], y: c[1] },
    { x: c[2], y: c[3] },
    { x: c[4], y: c[5] },
    { x: c[6], y: c[7] },
  ];
}

export function toArray(p) {
  return [p[0].x, p[0].y, p[1].x, p[1].y, p[2].x, p[2].y, p[3].x, p[3].y];
}

export function fullFrame(w, h) {
  return [0, 0, w, 0, w, h, 0, h];
}

export function dist(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

// Ekran koordinatlarında (y aşağı) saat yönündeki çokgen için pozitif.
export function signedArea(p) {
  let s = 0;
  for (let i = 0; i < p.length; i++) {
    const a = p[i];
    const b = p[(i + 1) % p.length];
    s += a.x * b.y - b.x * a.y;
  }
  return s / 2;
}

// Ardışık kenarların çapraz çarpımları aynı işaretliyse dörtgen dışbükeydir.
export function isConvex(p) {
  let sign = 0;
  for (let i = 0; i < 4; i++) {
    const a = p[i];
    const b = p[(i + 1) % 4];
    const c = p[(i + 2) % 4];
    const cross = (b.x - a.x) * (c.y - b.y) - (b.y - a.y) * (c.x - b.x);
    if (Math.abs(cross) < 1e-6) return false;
    const s = cross > 0 ? 1 : -1;
    if (sign === 0) sign = s;
    else if (s !== sign) return false;
  }
  return true;
}

export function minEdgeLength(p) {
  let m = Infinity;
  for (let i = 0; i < 4; i++) m = Math.min(m, dist(p[i], p[(i + 1) % 4]));
  return m;
}

// Kırpma seçimi geçerli mi: köşeler görüntünün içinde, dörtgen dışbükey,
// her kenar en az minEdge uzunlukta.
export function isValidQuad(c, w, h, minEdge = 0) {
  const p = toPoints(c);
  const inside = p.every((q) => q.x >= -0.5 && q.x <= w + 0.5 && q.y >= -0.5 && q.y <= h + 0.5);
  return inside && isConvex(p) && minEdgeLength(p) >= minEdge;
}

// Köşeleri saat yönüne çevirir ve (0,0)'a en yakın köşeyi başa alır.
export function normalizeQuad(c) {
  let p = toPoints(c);
  if (signedArea(p) < 0) p = [p[0], p[3], p[2], p[1]];
  let first = 0;
  let best = Infinity;
  for (let i = 0; i < 4; i++) {
    const d = p[i].x * p[i].x + p[i].y * p[i].y;
    if (d < best) {
      best = d;
      first = i;
    }
  }
  return toArray([0, 1, 2, 3].map((k) => p[(first + k) % 4]));
}

// Sırasız dört noktayı ağırlık merkezi etrafındaki açıya göre dizer.
export function orderPoints(points) {
  const cx = points.reduce((s, q) => s + q.x, 0) / points.length;
  const cy = points.reduce((s, q) => s + q.y, 0) / points.length;
  const sorted = points
    .slice()
    .sort((a, b) => Math.atan2(a.y - cy, a.x - cx) - Math.atan2(b.y - cy, b.x - cx));
  return normalizeQuad(toArray(sorted));
}

export function clampQuad(c, w, h) {
  return c.map((v, i) => Math.min(Math.max(v, 0), i % 2 === 0 ? w : h));
}

export function scaleQuad(c, s) {
  return c.map((v) => v * s);
}

// Birim kareyi dörtgene eşleyen homografi (Heckbert).
// (0,0)->p0, (1,0)->p1, (1,1)->p2, (0,1)->p3.
// x = (a*u + b*v + c) / (g*u + h*v + 1), y = (d*u + e*v + f) / (g*u + h*v + 1)
export function squareToQuad(q) {
  const [x0, y0, x1, y1, x2, y2, x3, y3] = q;
  const sx = x0 - x1 + x2 - x3;
  const sy = y0 - y1 + y2 - y3;
  if (Math.abs(sx) < 1e-9 && Math.abs(sy) < 1e-9) {
    return [x1 - x0, x2 - x1, x0, y1 - y0, y2 - y1, y0, 0, 0];
  }
  const dx1 = x1 - x2;
  const dx2 = x3 - x2;
  const dy1 = y1 - y2;
  const dy2 = y3 - y2;
  const den = dx1 * dy2 - dx2 * dy1;
  const g = (sx * dy2 - dx2 * sy) / den;
  const h = (dx1 * sy - sx * dy1) / den;
  return [x1 - x0 + g * x1, x3 - x0 + h * x3, x0, y1 - y0 + g * y1, y3 - y0 + h * y3, y0, g, h];
}

function cross3(a, b) {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
}

function dot3(a, b) {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

// Perspektif altındaki dikdörtgenin gerçek en/boy oranını tahmin eder
// (Zhang & He, "Whiteboard scanning and image enhancement").
// Ana nokta görüntü merkezi kabul edilir. Güvenilir değilse null döner.
export function estimateAspect(c, imgW, imgH) {
  const u0 = imgW / 2;
  const v0 = imgH / 2;
  const m1 = [c[0] - u0, c[1] - v0, 1]; // sol üst
  const m2 = [c[2] - u0, c[3] - v0, 1]; // sağ üst
  const m4 = [c[4] - u0, c[5] - v0, 1]; // sağ alt
  const m3 = [c[6] - u0, c[7] - v0, 1]; // sol alt
  const d2 = dot3(cross3(m2, m4), m3);
  const d3 = dot3(cross3(m3, m4), m2);
  if (Math.abs(d2) < 1e-9 || Math.abs(d3) < 1e-9) return null;
  const k2 = dot3(cross3(m1, m4), m3) / d2;
  const k3 = dot3(cross3(m1, m4), m2) / d3;
  const n2 = [k2 * m2[0] - m1[0], k2 * m2[1] - m1[1], k2 * m2[2] - m1[2]];
  const n3 = [k3 * m3[0] - m1[0], k3 * m3[1] - m1[1], k3 * m3[2] - m1[2]];
  const scale = Math.max(imgW, imgH);
  // Neredeyse perspektifsiz (afin) durumda odak uzaklığı belirsizdir.
  if (Math.abs(n2[2]) * scale < 1e-3 * Math.hypot(n2[0], n2[1]) ||
      Math.abs(n3[2]) * scale < 1e-3 * Math.hypot(n3[0], n3[1])) {
    return Math.hypot(n2[0], n2[1]) / Math.hypot(n3[0], n3[1]);
  }
  const f2 = -(n2[0] * n3[0] + n2[1] * n3[1]) / (n2[2] * n3[2]);
  if (!(f2 > 0)) return null;
  const f = Math.sqrt(f2);
  // Telefon kameraları için makul odak aralığı dışındaysa tahmine güvenme.
  if (f < 0.35 * scale || f > 8 * scale) return null;
  const a = (n2[0] * n2[0] + n2[1] * n2[1]) / f2 + n2[2] * n2[2];
  const b = (n3[0] * n3[0] + n3[1] * n3[1]) / f2 + n3[2] * n3[2];
  const r = Math.sqrt(a / b);
  return Number.isFinite(r) && r > 0 ? r : null;
}

// Düzeltilmiş belgenin piksel boyutu: kenar uzunluklarından çözünürlük,
// perspektif tahmininden en/boy oranı.
export function outputSize(c, imgW, imgH, { maxLong = 3508, maxPixels = 12e6 } = {}) {
  const p = toPoints(c);
  const top = dist(p[0], p[1]);
  const right = dist(p[1], p[2]);
  const bottom = dist(p[3], p[2]);
  const left = dist(p[0], p[3]);
  const w0 = Math.max(top, bottom);
  const h0 = Math.max(left, right);
  const edgeRatio = (top + bottom) / (left + right);
  let ratio = edgeRatio;
  const est = estimateAspect(c, imgW, imgH);
  if (est && est / edgeRatio < 1.6 && edgeRatio / est < 1.6) ratio = est;
  const h = Math.max(h0, w0 / ratio);
  const w = h * ratio;
  const s = Math.min(1, maxLong / Math.max(w, h), Math.sqrt(maxPixels / (w * h)));
  return { w: Math.max(8, Math.round(w * s)), h: Math.max(8, Math.round(h * s)) };
}

// nx*x + ny*y = rho biçimindeki iki doğrunun kesişimi.
export function intersectLines(a, b) {
  const det = a.nx * b.ny - a.ny * b.nx;
  if (Math.abs(det) < 1e-9) return null;
  return {
    x: (a.rho * b.ny - a.ny * b.rho) / det,
    y: (a.nx * b.rho - a.rho * b.nx) / det,
  };
}
