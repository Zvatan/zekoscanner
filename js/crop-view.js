// Dokunmatik kırpma görünümü: dört köşe ve dört kenar tutamacı, sürüklerken
// büyüteç, geçersiz seçimde kırmızı çerçeve ve parmak kalkınca son geçerli
// konuma yaylı geri dönüş.
import { isValidQuad, toPoints, toArray } from './core/geometry.js';
import { scaledCanvas, releaseCanvas } from './image-io.js';

const PAD = 26; // tutamaçlar ekran kenarına yapışmasın
const CORNER_HIT = 38;
const EDGE_HIT = 30;
const MIN_EDGE = 40; // ekran pikseli
const LOUPE = 120;
const ZOOM = 2.6;
const ACCENT = '#6E9BFF';
const DANGER = '#FF5A5F';

export class CropView {
  constructor(stage, { onInvalid } = {}) {
    this.stage = stage;
    this.onInvalid = onInvalid;
    this.canvas = document.createElement('canvas');
    this.canvas.className = 'crop-canvas';
    this.loupe = document.createElement('canvas');
    this.loupe.className = 'loupe';
    this.loupe.hidden = true;
    stage.append(this.canvas, this.loupe);
    this.ctx = this.canvas.getContext('2d');
    this.lctx = this.loupe.getContext('2d');
    this.src = null;
    this.display = null;
    this.pts = [];
    this.drag = null;
    this.valid = true;
    this.anim = 0;
    this.listeners = new Set();

    this.canvas.addEventListener('pointerdown', (e) => this.down(e));
    this.canvas.addEventListener('pointermove', (e) => this.move(e));
    this.canvas.addEventListener('pointerup', (e) => this.up(e));
    this.canvas.addEventListener('pointercancel', (e) => this.up(e));
    new ResizeObserver(() => this.layout()).observe(stage);
  }

  onChange(fn) {
    this.listeners.add(fn);
  }

  emit() {
    for (const fn of this.listeners) fn(this.valid);
  }

  setImage(srcCanvas) {
    this.src = srcCanvas;
    releaseCanvas(this.display);
    this.display = null;
    this.layout();
  }

  setCorners(c) {
    cancelAnimationFrame(this.anim);
    this.pts = toPoints(c);
    this.validate();
    this.draw();
    this.emit();
  }

  getCorners() {
    return toArray(this.pts);
  }

  clear() {
    this.src = null;
    releaseCanvas(this.display);
    this.display = null;
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
  }

  layout() {
    const r = this.stage.getBoundingClientRect();
    if (!r.width || !r.height) return;
    this.cssW = r.width;
    this.cssH = r.height;
    this.dpr = Math.min(window.devicePixelRatio || 1, 3);
    this.canvas.width = Math.round(r.width * this.dpr);
    this.canvas.height = Math.round(r.height * this.dpr);
    this.canvas.style.width = r.width + 'px';
    this.canvas.style.height = r.height + 'px';
    const ld = Math.round(LOUPE * this.dpr);
    this.loupe.width = ld;
    this.loupe.height = ld;
    if (!this.src) return;
    const sw = this.src.width;
    const sh = this.src.height;
    this.scale = Math.min((r.width - 2 * PAD) / sw, (r.height - 2 * PAD) / sh);
    this.ox = (r.width - sw * this.scale) / 2;
    this.oy = (r.height - sh * this.scale) / 2;
    // Her karede büyük fotoğrafı küçültmemek için ekran çözünürlüğünde kopya.
    const need = Math.ceil(Math.max(sw, sh) * this.scale * this.dpr);
    if (!this.display || Math.abs(Math.max(this.display.width, this.display.height) - need) > 64) {
      releaseCanvas(this.display);
      this.display = scaledCanvas(this.src, need);
    }
    this.validate();
    this.draw();
  }

  toScreen(p) {
    return { x: this.ox + p.x * this.scale, y: this.oy + p.y * this.scale };
  }

  local(e) {
    const r = this.canvas.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }

  validate() {
    if (!this.src || this.pts.length !== 4) return;
    const minEdge = this.scale ? MIN_EDGE / this.scale : 0;
    this.valid = isValidQuad(toArray(this.pts), this.src.width, this.src.height, minEdge);
  }

  // --- dokunma ---------------------------------------------------------

  down(e) {
    if (this.drag || !this.src) return;
    const p = this.local(e);
    const S = this.pts.map((q) => this.toScreen(q));
    let target = null;
    let best = Infinity;
    S.forEach((q, i) => {
      const d = Math.hypot(q.x - p.x, q.y - p.y);
      if (d < CORNER_HIT && d < best) {
        best = d;
        target = { type: 'corner', i };
      }
    });
    if (!target) {
      S.forEach((q, i) => {
        const n = S[(i + 1) % 4];
        const d = Math.hypot((q.x + n.x) / 2 - p.x, (q.y + n.y) / 2 - p.y);
        if (d < EDGE_HIT && d < best) {
          best = d;
          target = { type: 'edge', i };
        }
      });
    }
    if (!target) return;
    e.preventDefault();
    cancelAnimationFrame(this.anim);
    this.canvas.setPointerCapture(e.pointerId);
    const start = this.pts.map((q) => ({ ...q }));
    let normal = null;
    if (target.type === 'edge') {
      const a = start[target.i];
      const b = start[(target.i + 1) % 4];
      const len = Math.hypot(b.x - a.x, b.y - a.y) || 1;
      normal = { x: -(b.y - a.y) / len, y: (b.x - a.x) / len };
    }
    this.drag = { ...target, id: e.pointerId, start, p0: p, normal };
    this.updateLoupe();
    this.draw();
  }

  move(e) {
    const d = this.drag;
    if (!d || e.pointerId !== d.id) return;
    e.preventDefault();
    const p = this.local(e);
    const dx = (p.x - d.p0.x) / this.scale;
    const dy = (p.y - d.p0.y) / this.scale;
    const W = this.src.width;
    const H = this.src.height;
    if (d.type === 'corner') {
      const q = d.start[d.i];
      this.pts[d.i] = { x: clamp(q.x + dx, 0, W), y: clamp(q.y + dy, 0, H) };
    } else {
      // Kenar, kendi normali doğrultusunda paralel kayar.
      const n = d.normal;
      let t = dx * n.x + dy * n.y;
      for (const k of [d.i, (d.i + 1) % 4]) {
        const q = d.start[k];
        t = clampAlong(t, q.x, n.x, W);
        t = clampAlong(t, q.y, n.y, H);
      }
      for (const k of [d.i, (d.i + 1) % 4]) {
        const q = d.start[k];
        this.pts[k] = { x: q.x + t * n.x, y: q.y + t * n.y };
      }
    }
    const was = this.valid;
    this.validate();
    if (was !== this.valid) this.emit();
    this.updateLoupe();
    this.draw();
  }

  up(e) {
    const d = this.drag;
    if (!d || e.pointerId !== d.id) return;
    this.drag = null;
    this.loupe.hidden = true;
    if (!this.valid) {
      this.springBack(d.start);
      this.onInvalid?.();
    } else {
      this.draw();
      this.emit();
    }
  }

  // Gözlenen davranış: 200 ms, hafif aşmalı yumuşama.
  springBack(target) {
    const from = this.pts.map((q) => ({ ...q }));
    const t0 = performance.now();
    const step = (now) => {
      const l = Math.min((now - t0) / 200, 1);
      const c = 1 - Math.pow(1 - l, 3) * Math.cos(l * Math.PI * 0.8);
      this.pts = from.map((q, i) => ({ x: q.x + (target[i].x - q.x) * c, y: q.y + (target[i].y - q.y) * c }));
      if (l < 1) {
        this.draw();
        this.anim = requestAnimationFrame(step);
      } else {
        this.pts = target.map((q) => ({ ...q }));
        this.validate();
        this.draw();
        this.emit();
      }
    };
    this.anim = requestAnimationFrame(step);
  }

  // --- çizim -----------------------------------------------------------

  draw() {
    const ctx = this.ctx;
    if (!this.cssW) return;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.clearRect(0, 0, this.cssW, this.cssH);
    if (!this.src || !this.display || this.pts.length !== 4) return;
    const dw = this.src.width * this.scale;
    const dh = this.src.height * this.scale;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(this.display, this.ox, this.oy, dw, dh);

    const S = this.pts.map((q) => this.toScreen(q));
    const color = this.valid ? ACCENT : DANGER;

    // Seçim dışını karart.
    ctx.beginPath();
    ctx.rect(this.ox, this.oy, dw, dh);
    ctx.moveTo(S[0].x, S[0].y);
    for (let i = 3; i >= 1; i--) ctx.lineTo(S[i].x, S[i].y);
    ctx.closePath();
    ctx.fillStyle = 'rgba(6, 8, 12, 0.55)';
    ctx.fill('evenodd');

    // Çerçeve
    ctx.beginPath();
    S.forEach((q, i) => (i ? ctx.lineTo(q.x, q.y) : ctx.moveTo(q.x, q.y)));
    ctx.closePath();
    ctx.lineJoin = 'round';
    ctx.lineWidth = 2;
    ctx.strokeStyle = color;
    ctx.setLineDash(this.valid ? [] : [7, 5]);
    ctx.stroke();
    ctx.setLineDash([]);

    // Kenar tutamaçları
    for (let i = 0; i < 4; i++) {
      const a = S[i];
      const b = S[(i + 1) % 4];
      const active = this.drag && this.drag.type === 'edge' && this.drag.i === i;
      ctx.save();
      ctx.translate((a.x + b.x) / 2, (a.y + b.y) / 2);
      ctx.rotate(Math.atan2(b.y - a.y, b.x - a.x));
      const w = active ? 32 : 26;
      roundRect(ctx, -w / 2, -4, w, 8, 4);
      ctx.fillStyle = '#fff';
      ctx.fill();
      ctx.lineWidth = 2;
      ctx.strokeStyle = color;
      ctx.stroke();
      ctx.restore();
    }

    // Köşe tutamaçları
    S.forEach((q, i) => {
      const active = this.drag && this.drag.type === 'corner' && this.drag.i === i;
      ctx.beginPath();
      ctx.arc(q.x, q.y, active ? 13 : 10, 0, Math.PI * 2);
      ctx.fillStyle = active ? 'rgba(255,255,255,0.25)' : '#fff';
      ctx.fill();
      ctx.lineWidth = 3;
      ctx.strokeStyle = color;
      ctx.stroke();
    });
  }

  updateLoupe() {
    const d = this.drag;
    if (!d || d.type !== 'corner') {
      this.loupe.hidden = true;
      return;
    }
    const q = this.pts[d.i];
    const s = this.toScreen(q);
    // Parmağın üstünde göster; yer yoksa altına al.
    let top = s.y - LOUPE - 48;
    if (top < 8) top = s.y + 48;
    const left = clamp(s.x - LOUPE / 2, 8, this.cssW - LOUPE - 8);
    this.loupe.style.transform = `translate(${left}px, ${top}px)`;
    this.loupe.hidden = false;

    const ctx = this.lctx;
    const L = LOUPE * this.dpr;
    const k = this.scale * ZOOM; // ekran pikseli / kaynak pikseli
    const half = LOUPE / 2 / k;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = '#0b0d12';
    ctx.fillRect(0, 0, L, L);
    ctx.imageSmoothingQuality = 'high';
    // Kaynak dışına taşan kısım için hedef dikdörtgeni kırp.
    const sx = q.x - half;
    const sy = q.y - half;
    const x0 = Math.max(0, sx);
    const y0 = Math.max(0, sy);
    const x1 = Math.min(this.src.width, q.x + half);
    const y1 = Math.min(this.src.height, q.y + half);
    if (x1 > x0 && y1 > y0) {
      const f = L / (2 * half);
      ctx.drawImage(this.src, x0, y0, x1 - x0, y1 - y0, (x0 - sx) * f, (y0 - sy) * f, (x1 - x0) * f, (y1 - y0) * f);
    }
    // Köşede birleşen iki kenar ve artı işareti
    const f = L / (2 * half);
    const toL = (p) => ({ x: (p.x - sx) * f, y: (p.y - sy) * f });
    const c = toL(q);
    const prev = toL(this.pts[(d.i + 3) % 4]);
    const next = toL(this.pts[(d.i + 1) % 4]);
    ctx.lineWidth = 2 * this.dpr;
    ctx.strokeStyle = this.valid ? ACCENT : DANGER;
    ctx.beginPath();
    ctx.moveTo(prev.x, prev.y);
    ctx.lineTo(c.x, c.y);
    ctx.lineTo(next.x, next.y);
    ctx.stroke();
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 1.5 * this.dpr;
    const r = 9 * this.dpr;
    ctx.beginPath();
    ctx.moveTo(c.x - r, c.y);
    ctx.lineTo(c.x + r, c.y);
    ctx.moveTo(c.x, c.y - r);
    ctx.lineTo(c.x, c.y + r);
    ctx.stroke();
  }
}

function clamp(v, lo, hi) {
  return Math.min(Math.max(v, lo), hi);
}

// q + t*n değeri [0, max] aralığında kalacak şekilde t'yi sınırlar.
function clampAlong(t, q, n, max) {
  if (Math.abs(n) < 1e-9) return t;
  const a = (0 - q) / n;
  const b = (max - q) / n;
  return clamp(t, Math.min(a, b), Math.max(a, b));
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
