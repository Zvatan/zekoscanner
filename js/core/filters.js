// Görüntü iyileştirme filtreleri. DOM kullanmaz.
//
// Renkli, gri ve siyah-beyaz filtrelerin ortak adımı kağıt arka planını
// tahmin edip görüntüyü ona bölmektir: gölge, ışık düzensizliği ve renk
// kayması temizlenir, kağıt beyaza çekilir. Tüm uzamsal ölçüler görüntü
// boyutuna oranlıdır; önizleme ile tam çözünürlüklü çıktı aynı görünür.

export const FILTERS = [
  { id: 'original', label: 'Orijinal' },
  { id: 'color', label: 'Renkli' },
  { id: 'gray', label: 'Gri' },
  { id: 'bw', label: 'Siyah-beyaz' },
];

export function applyFilter(src, w, h, mode) {
  if (mode === 'original') return new Uint8ClampedArray(src);
  const bg = estimateBackground(src, w, h);
  if (mode === 'color') return colorEnhance(src, w, h, bg);
  if (mode === 'gray') return grayEnhance(src, w, h, bg);
  if (mode === 'bw') return blackWhite(src, w, h, bg);
  throw new Error('Bilinmeyen filtre: ' + mode);
}

// Kaba ızgarada kağıt rengini tahmin eder: her hücrede en parlak %25'lik
// piksellerin ortalaması, ardından metni silmek için kapama (önce en büyük,
// sonra en küçük filtre) ve yumuşatma.
export function estimateBackground(src, w, h) {
  const cell = Math.max(2, Math.round(Math.max(w, h) / 80));
  const gw = Math.ceil(w / cell);
  const gh = Math.ceil(h / cell);
  const gn = gw * gh;
  const BINS = 32;
  const cnt = new Uint32Array(gn * BINS);
  const sr = new Float32Array(gn * BINS);
  const sg = new Float32Array(gn * BINS);
  const sb = new Float32Array(gn * BINS);
  const colOf = new Int32Array(w);
  for (let x = 0; x < w; x++) colOf[x] = (x / cell) | 0;

  for (let y = 0; y < h; y++) {
    const rowCell = ((y / cell) | 0) * gw;
    let p = y * w * 4;
    for (let x = 0; x < w; x++, p += 4) {
      const r = src[p], g = src[p + 1], b = src[p + 2];
      const k = (rowCell + colOf[x]) * BINS + ((r * 77 + g * 150 + b * 29) >> 11);
      cnt[k]++;
      sr[k] += r;
      sg[k] += g;
      sb[k] += b;
    }
  }

  let R = new Float32Array(gn);
  let G = new Float32Array(gn);
  let B = new Float32Array(gn);
  for (let c = 0; c < gn; c++) {
    const o = c * BINS;
    let total = 0;
    for (let k = 0; k < BINS; k++) total += cnt[o + k];
    const target = Math.max(1, total * 0.25);
    let n = 0, r = 0, g = 0, b = 0;
    for (let k = BINS - 1; k >= 0 && n < target; k--) {
      n += cnt[o + k];
      r += sr[o + k];
      g += sg[o + k];
      b += sb[o + k];
    }
    R[c] = n ? r / n : 255;
    G[c] = n ? g / n : 255;
    B[c] = n ? b / n : 255;
  }

  // Kalın başlık gibi küçük koyu alanları sil.
  R = minFilter(maxFilter(R, gw, gh, 1), gw, gh, 1);
  G = minFilter(maxFilter(G, gw, gh, 1), gw, gh, 1);
  B = minFilter(maxFilter(B, gw, gh, 1), gw, gh, 1);

  // Kağıt hücreleri: en parlak, kağıt renginde hücrelerden başlayıp yalnız
  // yumuşak geçişler boyunca büyüyen bölge. Gölge yavaş değiştiği için
  // kağıda katılır; fotoğraf, renkli kutu, parmak gibi keskin sınırlı
  // bölgeler katılmaz ve değerleri çevredeki kağıttan pürüzsüzce
  // doldurulur. Böylece beyaza dönmezler.
  const L = new Float32Array(gn);
  for (let c = 0; c < gn; c++) L[c] = 0.299 * R[c] + 0.587 * G[c] + 0.114 * B[c];
  const ref = quantileIndex(L, 0.9);
  const pl = Math.max(1, L[ref]);
  const pr = R[ref] / pl, pg = G[ref] / pl, pb = B[ref] / pl;
  const chromaOf = (c) => {
    const l = Math.max(1, L[c]);
    return Math.max(Math.abs(R[c] / l - pr), Math.abs(G[c] / l - pg), Math.abs(B[c] / l - pb));
  };
  const paper = new Uint8Array(gn);
  const queue = new Int32Array(gn);
  let qh = 0, qt = 0;
  for (let c = 0; c < gn; c++) {
    if (L[c] >= 0.85 * pl && chromaOf(c) < 0.1) {
      paper[c] = 1;
      queue[qt++] = c;
    }
  }
  while (qh < qt) {
    const c = queue[qh++];
    const x = c % gw;
    const near = [x > 0 ? c - 1 : -1, x < gw - 1 ? c + 1 : -1, c - gw, c + gw];
    for (const nb of near) {
      if (nb < 0 || nb >= gn || paper[nb]) continue;
      if (L[nb] < 0.4 * pl || chromaOf(nb) > 0.12) continue;
      if (Math.abs(L[nb] - L[c]) > 0.08 * Math.max(L[nb], L[c])) continue;
      paper[nb] = 1;
      queue[qt++] = nb;
    }
  }
  if (qt >= 0.1 * gn) {
    fillHoles(R, paper, gw, gh);
    fillHoles(G, paper, gw, gh);
    fillHoles(B, paper, gw, gh);
  } else {
    // Kağıt neredeyse hiç görünmüyor (ör. tam sayfa fotoğraf): yalnız genel
    // beyaz dengesi uygula, yerel aydınlatma düzeltmesi yapma.
    R.fill(R[ref]);
    G.fill(G[ref]);
    B.fill(B[ref]);
  }
  R = boxBlur(boxBlur(R, gw, gh, 1), gw, gh, 1);
  G = boxBlur(boxBlur(G, gw, gh, 1), gw, gh, 1);
  B = boxBlur(boxBlur(B, gw, gh, 1), gw, gh, 1);
  for (let c = 0; c < gn; c++) {
    R[c] = Math.max(R[c], 8);
    G[c] = Math.max(G[c], 8);
    B[c] = Math.max(B[c], 8);
  }
  return { R, G, B, gw, gh, cell };
}

// Sabit olmayan hücreleri komşu ortalamasıyla tekrar tekrar günceller
// (harmonik doldurma): kenarlardaki kağıt değerleri içeri doğru yayılır.
function fillHoles(a, fixed, w, h) {
  let sum = 0, n = 0;
  for (let i = 0; i < a.length; i++) {
    if (fixed[i]) {
      sum += a[i];
      n++;
    }
  }
  const mean = sum / n;
  for (let i = 0; i < a.length; i++) if (!fixed[i]) a[i] = mean;
  for (let iter = 0; iter < 80; iter++) {
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = y * w + x;
        if (fixed[i]) continue;
        let s = 0, k = 0;
        if (x > 0) { s += a[i - 1]; k++; }
        if (x < w - 1) { s += a[i + 1]; k++; }
        if (y > 0) { s += a[i - w]; k++; }
        if (y < h - 1) { s += a[i + w]; k++; }
        a[i] = s / k;
      }
    }
  }
}

function maxFilter(a, w, h, r) {
  return rankFilter(a, w, h, r, Math.max);
}

function minFilter(a, w, h, r) {
  return rankFilter(a, w, h, r, Math.min);
}

function rankFilter(a, w, h, r, op) {
  const tmp = new Float32Array(a.length);
  const out = new Float32Array(a.length);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let v = a[y * w + x];
      for (let k = Math.max(0, x - r); k <= Math.min(w - 1, x + r); k++) v = op(v, a[y * w + k]);
      tmp[y * w + x] = v;
    }
  }
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let v = tmp[y * w + x];
      for (let k = Math.max(0, y - r); k <= Math.min(h - 1, y + r); k++) v = op(v, tmp[k * w + x]);
      out[y * w + x] = v;
    }
  }
  return out;
}

function boxBlur(a, w, h, r) {
  const tmp = new Float32Array(a.length);
  const out = new Float32Array(a.length);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let s = 0, n = 0;
      for (let k = Math.max(0, x - r); k <= Math.min(w - 1, x + r); k++, n++) s += a[y * w + k];
      tmp[y * w + x] = s / n;
    }
  }
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let s = 0, n = 0;
      for (let k = Math.max(0, y - r); k <= Math.min(h - 1, y + r); k++, n++) s += tmp[k * w + x];
      out[y * w + x] = s / n;
    }
  }
  return out;
}

function quantileIndex(a, q) {
  const order = Array.from(a.keys()).sort((i, j) => a[i] - a[j]);
  return order[Math.min(order.length - 1, Math.floor(q * order.length))];
}

// Arka planı satır satır çift doğrusal enterpolasyonla açar ve her piksel
// için kağıda göre normalize edilmiş (≈0..1) değerleri fn'e verir.
function forEachNormalized(src, w, h, bg, fn) {
  const { R, G, B, gw, gh, cell } = bg;
  const x0s = new Int32Array(w);
  const x1s = new Int32Array(w);
  const txs = new Float32Array(w);
  for (let x = 0; x < w; x++) {
    let f = (x + 0.5) / cell - 0.5;
    if (f < 0) f = 0;
    if (f > gw - 1) f = gw - 1;
    x0s[x] = f | 0;
    x1s[x] = Math.min(gw - 1, x0s[x] + 1);
    txs[x] = f - x0s[x];
  }
  const rowR = new Float32Array(gw);
  const rowG = new Float32Array(gw);
  const rowB = new Float32Array(gw);
  for (let y = 0; y < h; y++) {
    let f = (y + 0.5) / cell - 0.5;
    if (f < 0) f = 0;
    if (f > gh - 1) f = gh - 1;
    const y0 = f | 0;
    const y1 = Math.min(gh - 1, y0 + 1);
    const ty = f - y0;
    const o0 = y0 * gw, o1 = y1 * gw;
    for (let x = 0; x < gw; x++) {
      rowR[x] = 1 / (R[o0 + x] * (1 - ty) + R[o1 + x] * ty);
      rowG[x] = 1 / (G[o0 + x] * (1 - ty) + G[o1 + x] * ty);
      rowB[x] = 1 / (B[o0 + x] * (1 - ty) + B[o1 + x] * ty);
    }
    let p = y * w * 4;
    for (let x = 0; x < w; x++, p += 4) {
      const a = x0s[x], b = x1s[x], t = txs[x];
      const ir = rowR[a] + (rowR[b] - rowR[a]) * t;
      const ig = rowG[a] + (rowG[b] - rowG[a]) * t;
      const ib = rowB[a] + (rowB[b] - rowB[a]) * t;
      fn(p, src[p] * ir, src[p + 1] * ig, src[p + 2] * ib);
    }
  }
}

// Normalize değeri (0..~1.3) 8 bite çeviren eğri tablosu.
function makeLut(black, white, gamma) {
  const lut = new Uint8ClampedArray(1025);
  for (let i = 0; i <= 1024; i++) {
    const n = i / 800;
    let v = (n - black) / (white - black);
    v = v <= 0 ? 0 : v >= 1 ? 1 : Math.pow(v, gamma);
    lut[i] = Math.round(v * 255);
  }
  return lut;
}

function lutIndex(n) {
  const i = (n * 800) | 0;
  return i < 0 ? 0 : i > 1024 ? 1024 : i;
}

function colorEnhance(src, w, h, bg) {
  const out = new Uint8ClampedArray(w * h * 4);
  const lut = makeLut(0.1, 0.9, 1.25);
  const SAT = 1.3;
  forEachNormalized(src, w, h, bg, (p, r, g, b) => {
    const R = lut[lutIndex(r)], G = lut[lutIndex(g)], B = lut[lutIndex(b)];
    const Y = 0.299 * R + 0.587 * G + 0.114 * B;
    out[p] = Y + (R - Y) * SAT;
    out[p + 1] = Y + (G - Y) * SAT;
    out[p + 2] = Y + (B - Y) * SAT;
    out[p + 3] = 255;
  });
  return out;
}

function grayEnhance(src, w, h, bg) {
  const out = new Uint8ClampedArray(w * h * 4);
  const lut = makeLut(0.08, 0.92, 1.15);
  forEachNormalized(src, w, h, bg, (p, r, g, b) => {
    const v = lut[lutIndex(0.299 * r + 0.587 * g + 0.114 * b)];
    out[p] = v;
    out[p + 1] = v;
    out[p + 2] = v;
    out[p + 3] = 255;
  });
  return out;
}

function blackWhite(src, w, h, bg) {
  const n = w * h;
  const lum = new Float32Array(n);
  const hist = new Uint32Array(256);
  let i = 0;
  forEachNormalized(src, w, h, bg, (p, r, g, b) => {
    const v = 0.299 * r + 0.587 * g + 0.114 * b;
    lum[i++] = v;
    hist[Math.min(255, (v * 200) | 0)]++;
  });
  // Kağıt (≈1) ile mürekkep arasındaki eşiği Otsu ile seç, makul aralıkta tut.
  const t = Math.min(0.8, Math.max(0.45, otsu(hist, n) / 200));
  const soft = 0.06;
  const out = new Uint8ClampedArray(n * 4);
  for (let k = 0, p = 0; k < n; k++, p += 4) {
    let v = (lum[k] - (t - soft)) / (2 * soft);
    v = v <= 0 ? 0 : v >= 1 ? 255 : v * v * (3 - 2 * v) * 255;
    out[p] = v;
    out[p + 1] = v;
    out[p + 2] = v;
    out[p + 3] = 255;
  }
  return out;
}

function otsu(hist, total) {
  let sum = 0;
  for (let i = 0; i < 256; i++) sum += i * hist[i];
  let sumB = 0, wB = 0, best = 0, th = 140;
  for (let i = 0; i < 256; i++) {
    wB += hist[i];
    if (!wB) continue;
    const wF = total - wB;
    if (!wF) break;
    sumB += i * hist[i];
    const mB = sumB / wB;
    const mF = (sum - sumB) / wF;
    const between = wB * wF * (mB - mF) * (mB - mF);
    if (between > best) {
      best = between;
      th = i;
    }
  }
  return th;
}
