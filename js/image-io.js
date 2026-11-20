// Fotoğraf okuma ve kanvas yardımcıları.

// iOS Safari'de kanvas alanı en fazla 16.777.216 pikseldir. Uzun kenar
// 4096 ile sınırlanır; 12 MP iPhone fotoğrafları küçültülmeden işlenir.
export const MAX_SIDE = 4096;
export const MAX_PIXELS = 16_000_000;

function loadImage(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.decoding = 'async';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Görüntü çözülemedi'));
    img.src = url;
  });
}

export function createCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

// iOS'ta kanvas belleği, boyut sıfırlanınca hemen geri verilir.
export function releaseCanvas(c) {
  if (c) {
    c.width = 0;
    c.height = 0;
  }
}

// Dosyayı yönü düzeltilmiş (EXIF) ve boyutu sınırlanmış bir kanvasa çizer.
export async function fileToCanvas(blob, maxSide = MAX_SIDE) {
  const url = URL.createObjectURL(blob);
  try {
    const img = await loadImage(url);
    const w0 = img.naturalWidth;
    const h0 = img.naturalHeight;
    if (!w0 || !h0) throw new Error('Görüntü boyutu okunamadı');
    const s = Math.min(1, maxSide / Math.max(w0, h0), Math.sqrt(MAX_PIXELS / (w0 * h0)));
    const w = Math.max(1, Math.round(w0 * s));
    const h = Math.max(1, Math.round(h0 * s));
    const c = createCanvas(w, h);
    const ctx = c.getContext('2d', { willReadFrequently: true });
    ctx.fillStyle = '#fff'; // saydam PNG'ler siyah görünmesin
    ctx.fillRect(0, 0, w, h);
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(img, 0, 0, w, h);
    return c;
  } finally {
    URL.revokeObjectURL(url);
  }
}

export function scaledCanvas(src, maxSide) {
  const s = Math.min(1, maxSide / Math.max(src.width, src.height));
  const w = Math.max(1, Math.round(src.width * s));
  const h = Math.max(1, Math.round(src.height * s));
  const c = createCanvas(w, h);
  const ctx = c.getContext('2d');
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(src, 0, 0, w, h);
  return c;
}

export function rgbaToCanvas(buffer, w, h, target = null) {
  const c = target || createCanvas(w, h);
  if (c.width !== w) c.width = w;
  if (c.height !== h) c.height = h;
  c.getContext('2d').putImageData(new ImageData(new Uint8ClampedArray(buffer), w, h), 0, 0);
  return c;
}

export function canvasToBlob(c, type = 'image/jpeg', quality = 0.9) {
  return new Promise((resolve, reject) => {
    c.toBlob((b) => (b ? resolve(b) : reject(new Error('Görüntü kodlanamadı'))), type, quality);
  });
}
