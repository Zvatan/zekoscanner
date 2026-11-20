// Tek bir düzenleme oturumunun piksel verisini tutan işlemci. Web Worker
// içinde çalışır; worker kullanılamazsa ana iş parçacığında da çalışabilir.
import { findDocument } from './detect.js';
import { outputSize } from './geometry.js';
import { warpPerspective, fitWithin, rotate90 } from './imageops.js';
import { applyFilter, FILTERS } from './filters.js';

export const PREVIEW_MAX = 1600;
export const THUMB_MAX = 240;
// Kenarlardan bırakılan pay (A4'te ≈ 0,6 mm): köşe birkaç piksel kaysa bile
// sayfa kenarında zemin şeridi kalmaz.
const EDGE_INSET = 0.003;

export function createSession() {
  let src = null; // { data, w, h } kaynak fotoğraf
  let warped = null; // düzeltilmiş ve döndürülmüş tam çözünürlük
  let preview = null; // ekran önizlemesi
  let thumb = null; // filtre küçük resimleri için taban

  function rebuildPreviews() {
    const p = fitWithin(warped.data, warped.w, warped.h, PREVIEW_MAX);
    preview = { data: p.data, w: p.w, h: p.h };
    const t = fitWithin(preview.data, preview.w, preview.h, THUMB_MAX);
    thumb = { data: t.data, w: t.w, h: t.h };
  }

  function requireWarped() {
    if (!warped) throw new Error('Önce kırpma uygulanmalı');
  }

  return {
    load({ buffer, w, h, detect }) {
      src = { data: new Uint8ClampedArray(buffer), w, h };
      warped = preview = thumb = null;
      if (!detect) return { corners: null };
      const found = findDocument(src.data, w, h);
      return { corners: found ? found.corners : null };
    },

    warp({ corners, rotation = 0 }) {
      if (!src) throw new Error('Kaynak görüntü yok');
      const size = outputSize(corners, src.w, src.h);
      const data = warpPerspective(src.data, src.w, src.h, corners, size.w, size.h, EDGE_INSET);
      warped = rotate90(data, size.w, size.h, Math.round(rotation / 90));
      rebuildPreviews();
      return { w: warped.w, h: warped.h };
    },

    rotate({ quarter = 1 }) {
      requireWarped();
      warped = rotate90(warped.data, warped.w, warped.h, quarter);
      preview = rotate90(preview.data, preview.w, preview.h, quarter);
      thumb = rotate90(thumb.data, thumb.w, thumb.h, quarter);
      return { w: warped.w, h: warped.h };
    },

    preview({ mode }) {
      requireWarped();
      const out = applyFilter(preview.data, preview.w, preview.h, mode);
      return { buffer: out.buffer, w: preview.w, h: preview.h };
    },

    thumbs() {
      requireWarped();
      return FILTERS.map((f) => ({
        id: f.id,
        buffer: applyFilter(thumb.data, thumb.w, thumb.h, f.id).buffer,
        w: thumb.w,
        h: thumb.h,
      }));
    },

    render({ mode }) {
      requireWarped();
      const out = applyFilter(warped.data, warped.w, warped.h, mode);
      return { buffer: out.buffer, w: warped.w, h: warped.h };
    },

    release() {
      src = warped = preview = thumb = null;
      return {};
    },
  };
}

// Sonuçtaki ArrayBuffer'ları (kopyalamadan aktarmak için) toplar.
export function transferablesOf(result) {
  const list = [];
  const visit = (v) => {
    if (!v || typeof v !== 'object') return;
    if (v instanceof ArrayBuffer) list.push(v);
    else if (Array.isArray(v)) v.forEach(visit);
    else if (v.buffer instanceof ArrayBuffer) list.push(v.buffer);
  };
  visit(result);
  return list;
}
