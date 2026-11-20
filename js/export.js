// Belgeyi PDF ya da JPEG olarak hazırlayıp iOS paylaşım menüsüyle verir.
//
// Safari paylaşım menüsünü yalnız dokunma anında (bekleme olmadan) açar. Bu
// yüzden dosyalar sayfa açılırken hazırlanır, "Paylaş" düğmesi hazır dosyayı
// hemen paylaşır.
import { sheet, toast, icon, escapeHtml } from './ui.js';
import * as store from './store.js';
import { buildPdf } from './core/pdf.js';

const PREF_FORMAT = 'zt.exportFormat';
const PREF_SIZE = 'zt.pageSize';

function pref(key, fallback) {
  try {
    return localStorage.getItem(key) || fallback;
  } catch {
    return fallback;
  }
}

function setPref(key, value) {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* özel mod */
  }
}

export function safeFileName(title) {
  const s = String(title || '')
    .replace(/[\\/:*?"<>|\u0000-\u001f]+/g, '-')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 80);
  return s || 'Tarama';
}

function formatSize(bytes) {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1).replace('.', ',')} MB`;
}

async function pageJpegs(doc) {
  const blobs = [];
  for (const id of doc.pageIds) {
    const b = await store.getBlob(`${id}:out`);
    if (b) blobs.push(b);
  }
  return blobs;
}

async function prepareFiles(doc, format, pageSize) {
  const name = safeFileName(doc.title);
  const blobs = await pageJpegs(doc);
  if (!blobs.length) throw new Error('Sayfa bulunamadı');
  if (format === 'jpeg') {
    return blobs.map((b, i) => new File([b], blobs.length > 1 ? `${name}-${i + 1}.jpg` : `${name}.jpg`, { type: 'image/jpeg' }));
  }
  const jpegs = await Promise.all(blobs.map(async (b) => new Uint8Array(await b.arrayBuffer())));
  const parts = buildPdf(jpegs, { pageSize, title: doc.title });
  return [new File(parts, `${name}.pdf`, { type: 'application/pdf' })];
}

function canShare(files) {
  try {
    return !!(navigator.share && navigator.canShare && navigator.canShare({ files }));
  } catch {
    return false;
  }
}

function download(files) {
  for (const f of files) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(f);
    a.download = f.name;
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 30000);
  }
}

export function openExport(doc) {
  const st = { format: pref(PREF_FORMAT, 'pdf'), pageSize: pref(PREF_SIZE, 'auto'), files: null, token: 0 };
  const n = doc.pageIds.length;

  sheet((panel) => {
    panel.insertAdjacentHTML(
      'beforeend',
      `<div class="sheet__title">Dışa aktar</div>
       <div class="sheet__sub">${escapeHtml(doc.title)} · ${n} sayfa</div>
       <div class="seg" data-key="format" role="radiogroup" aria-label="Biçim">
         <button type="button" data-v="pdf" role="radio">${icon('doc')}PDF</button>
         <button type="button" data-v="jpeg" role="radio">${icon('gallery')}JPEG</button>
       </div>
       <div class="opt" data-show="pdf">
         <span class="opt__label">Sayfa boyutu</span>
         <div class="seg seg--small" data-key="pageSize" role="radiogroup" aria-label="Sayfa boyutu">
           <button type="button" data-v="auto" role="radio">Otomatik</button>
           <button type="button" data-v="a4" role="radio">A4</button>
         </div>
       </div>
       <p class="sheet__text" data-info></p>
       <button type="button" class="btn btn--primary btn--block" data-share disabled></button>`,
    );
    const info = panel.querySelector('[data-info]');
    const shareBtn = panel.querySelector('[data-share]');

    const sync = () => {
      for (const seg of panel.querySelectorAll('.seg')) {
        for (const b of seg.querySelectorAll('button')) {
          const on = st[seg.dataset.key] === b.dataset.v;
          b.classList.toggle('is-selected', on);
          b.setAttribute('aria-checked', on);
        }
      }
      panel.querySelector('[data-show="pdf"]').hidden = st.format !== 'pdf';
    };

    const prepare = async () => {
      const token = ++st.token;
      st.files = null;
      shareBtn.disabled = true;
      shareBtn.innerHTML = '<span class="spinner spinner--small"></span>Hazırlanıyor…';
      info.textContent = '';
      try {
        const files = await prepareFiles(doc, st.format, st.pageSize);
        if (token !== st.token) return;
        st.files = files;
        const total = files.reduce((s, f) => s + f.size, 0);
        const sharable = canShare(files);
        shareBtn.disabled = false;
        shareBtn.innerHTML = sharable ? `${icon('share')}Paylaş` : `${icon('download')}İndir`;
        info.textContent =
          st.format === 'pdf'
            ? `${formatSize(total)} PDF. Paylaş menüsünde “Dosyalar’a Kaydet” ile iPhone’a ya da iCloud Drive’a kaydedebilirsin.`
            : `${files.length} görüntü, toplam ${formatSize(total)}. Paylaş menüsünde “Görüntüleri Kaydet” ile Fotoğraflar’a eklenir.`;
      } catch (err) {
        if (token !== st.token) return;
        console.error(err);
        shareBtn.innerHTML = 'Hazırlanamadı';
        info.textContent = err.message;
      }
    };

    for (const seg of panel.querySelectorAll('.seg')) {
      seg.addEventListener('click', (e) => {
        const b = e.target.closest('button');
        if (!b || st[seg.dataset.key] === b.dataset.v) return;
        st[seg.dataset.key] = b.dataset.v;
        setPref(seg.dataset.key === 'format' ? PREF_FORMAT : PREF_SIZE, b.dataset.v);
        sync();
        prepare();
      });
    }

    shareBtn.addEventListener('click', () => {
      const files = st.files;
      if (!files) return;
      if (!canShare(files)) {
        download(files);
        return;
      }
      // Bekleme yok: paylaşım, dokunma olayının içinde başlamalı.
      navigator.share({ files }).catch((err) => {
        if (err && err.name !== 'AbortError') toast('Paylaşılamadı: ' + err.message);
      });
    });

    sync();
    prepare();
  });
}
