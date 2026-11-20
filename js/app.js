// Uygulama denetleyicisi: ekranlar, tarama oturumu ve belge iÅŸlemleri.
import { Engine } from './engine.js';
import * as store from './store.js';
import { CropView } from './crop-view.js';
import { fileToCanvas, scaledCanvas, rgbaToCanvas, canvasToBlob, releaseCanvas } from './image-io.js';
import { icon, hydrateIcons, toast, busy, actionSheet, confirmDialog, promptDialog, sheet, escapeHtml } from './ui.js';
import { openExport } from './export.js';
import { enableReorder } from './reorder.js';
import { FILTERS, DEFAULT_STRENGTH } from './core/filters.js';
import { fullFrame, normalizeQuad } from './core/geometry.js';

const VERSION = '1.1.0';
const SCREENS = ['home', 'doc', 'crop', 'filter'];
const $ = (sel, root = document) => root.querySelector(sel);

const engine = new Engine();
const app = {
  doc: null, // aÃ§Ä±k belge
  pages: [], // aÃ§Ä±k belgenin sayfa kayÄ±tlarÄ±
  session: null, // sÃ¼ren tarama/dÃ¼zenleme
  captureTarget: 'new',
  thumbs: new Map(), // sayfaId -> nesne URL'si
};

// --- tercihler -----------------------------------------------------------

function lastFilter() {
  try {
    const v = localStorage.getItem('zt.filter');
    return FILTERS.some((f) => f.id === v) ? v : 'magic';
  } catch {
    return 'magic';
  }
}

function lastStrength() {
  try {
    const v = Number(localStorage.getItem('zt.magic'));
    return localStorage.getItem('zt.magic') !== null && v >= 0 && v <= 100 ? v : DEFAULT_STRENGTH;
  } catch {
    return DEFAULT_STRENGTH;
  }
}

function rememberFilter(id, strength) {
  try {
    localStorage.setItem('zt.filter', id);
    if (FILTERS.find((f) => f.id === id)?.adjustable) localStorage.setItem('zt.magic', String(strength));
  } catch {
    /* Ã¶zel mod */
  }
}

// --- gezinme -------------------------------------------------------------

function go(name) {
  const level = SCREENS.indexOf(name);
  for (const s of SCREENS) {
    const el = document.getElementById('screen-' + s);
    el.classList.toggle('is-active', s === name);
    el.classList.toggle('is-behind', SCREENS.indexOf(s) < level);
    el.inert = s !== name;
  }
}

// --- biÃ§imlendirme -------------------------------------------------------

const dateFmt = new Intl.DateTimeFormat('tr-TR', { day: 'numeric', month: 'short', year: 'numeric' });
const timeFmt = new Intl.DateTimeFormat('tr-TR', { hour: '2-digit', minute: '2-digit' });

function formatDate(ms) {
  const d = new Date(ms);
  const today = new Date();
  const sameDay = d.toDateString() === today.toDateString();
  return sameDay ? `BugÃ¼n ${timeFmt.format(d)}` : dateFmt.format(d);
}

function defaultTitle() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `Tarama ${p(d.getDate())}.${p(d.getMonth() + 1)}.${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

// --- kÃ¼Ã§Ã¼k resimler ------------------------------------------------------

async function thumbUrl(pageId) {
  if (app.thumbs.has(pageId)) return app.thumbs.get(pageId);
  const blob = await store.getBlob(`${pageId}:thumb`);
  const url = blob ? URL.createObjectURL(blob) : '';
  app.thumbs.set(pageId, url);
  return url;
}

function dropThumb(pageId) {
  const url = app.thumbs.get(pageId);
  if (url) URL.revokeObjectURL(url);
  app.thumbs.delete(pageId);
}

// --- Belgelerim ----------------------------------------------------------

const EMPTY_ART = `<svg viewBox="0 0 120 120" fill="none" aria-hidden="true">
  <rect x="8" y="8" width="104" height="104" rx="28" fill="#151922"/>
  <path d="M40 30h28l14 14v44a4 4 0 0 1-4 4H40a4 4 0 0 1-4-4V34a4 4 0 0 1 4-4z" fill="#F4F6FA"/>
  <path d="M68 30v14h14" fill="#C9D3E6"/>
  <path d="M44 56h28M44 64h28M44 72h18" stroke="#9BA4B4" stroke-width="3" stroke-linecap="round"/>
  <path d="M24 38V28a4 4 0 0 1 4-4h10M82 24h10a4 4 0 0 1 4 4v10M96 82v10a4 4 0 0 1-4 4H82M38 96H28a4 4 0 0 1-4-4V82" stroke="#86A9FF" stroke-width="4" stroke-linecap="round"/>
</svg>`;

async function refreshHome() {
  const docs = await store.listDocs();
  const list = $('#home-list');
  list.replaceChildren();
  if (!docs.length) {
    list.innerHTML = `<div class="empty">${EMPTY_ART}<h2>HenÃ¼z belge yok</h2><p>Belgeyi kamerayla tara ya da galeriden bir fotoÄŸraf seÃ§. FotoÄŸraflar yalnÄ±zca bu cihazda iÅŸlenir.</p></div>`;
    return;
  }
  for (const doc of docs) {
    const row = document.createElement('div');
    row.className = 'doc-row';
    row.innerHTML =
      `<button class="doc-row__main"><span class="doc-thumb"><img alt=""></span>` +
      `<span class="doc-row__text"><span class="doc-row__title">${escapeHtml(doc.title)}</span>` +
      `<span class="doc-row__meta">${doc.pageIds.length} sayfa Â· ${formatDate(doc.updatedAt)}</span></span></button>` +
      `<button class="icon-btn" aria-label="${escapeHtml(doc.title)} seÃ§enekleri">${icon('more')}</button>`;
    const [open, more] = row.querySelectorAll('button');
    open.addEventListener('click', () => openDoc(doc.id));
    more.addEventListener('click', () => docMenu(doc));
    if (doc.pageIds[0]) {
      thumbUrl(doc.pageIds[0]).then((u) => {
        if (u) row.querySelector('img').src = u;
      });
    }
    list.append(row);
  }
}

function isIOS() {
  return /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}

function isStandalone() {
  return navigator.standalone === true || matchMedia('(display-mode: standalone)').matches;
}

function showInstallBanner() {
  let dismissed = false;
  try {
    dismissed = localStorage.getItem('zt.installHint') === '1';
  } catch {
    /* yok say */
  }
  if (!isIOS() || isStandalone() || dismissed) return;
  const el = $('#install-banner');
  el.className = 'banner';
  el.innerHTML =
    `${icon('share')}<p><b>Uygulama gibi kullan:</b> Safariâ€™de PaylaÅŸ dÃ¼ÄŸmesine dokunup ` +
    `<b>â€œAna Ekrana Ekleâ€</b>yi seÃ§.</p><button class="icon-btn" aria-label="Kapat">${icon('close')}</button>`;
  el.hidden = false;
  el.querySelector('button').addEventListener('click', () => {
    el.hidden = true;
    try {
      localStorage.setItem('zt.installHint', '1');
    } catch {
      /* yok say */
    }
  });
}

async function showAbout() {
  const used = await store.usage();
  const docs = await store.listDocs();
  const pages = docs.reduce((s, d) => s + d.pageIds.length, 0);
  sheet((panel, close) => {
    panel.insertAdjacentHTML(
      'beforeend',
      `<div class="sheet__title">Zeko Tara</div>
       <div class="sheet__info">
         <p>FotoÄŸraflar <b>yalnÄ±zca bu cihazda</b> iÅŸlenir ve saklanÄ±r; hiÃ§bir sunucuya gÃ¶nderilmez.</p>
         <p><b>${docs.length}</b> belge, <b>${pages}</b> sayfa${used != null ? ` Â· yaklaÅŸÄ±k <b>${(used / 1024 / 1024).toFixed(1).replace('.', ',')} MB</b>` : ''}</p>
         <p>UygulamayÄ± ana ekrandan silersen belgeler de silinir. Ã–nemli belgeleri â€œDÄ±ÅŸa aktarâ€ ile Dosyalarâ€™a kaydet.</p>
         <p>SÃ¼rÃ¼m ${VERSION}</p>
       </div>
       <button class="btn btn--secondary btn--block" data-close>Kapat</button>`,
    );
    panel.querySelector('[data-close]').addEventListener('click', () => close());
  });
}

// --- belge ---------------------------------------------------------------

async function openDoc(id) {
  const doc = await store.getDoc(id);
  if (!doc) {
    await refreshHome();
    go('home');
    return;
  }
  app.doc = doc;
  app.pages = await store.getPages(doc.pageIds);
  renderDoc();
  go('doc');
}

function renderDoc() {
  const doc = app.doc;
  $('#doc-title-text').textContent = doc.title;
  const grid = $('#page-grid');
  grid.replaceChildren();
  doc.pageIds.forEach((id, i) => {
    const tile = document.createElement('button');
    tile.className = 'page-tile';
    tile.dataset.id = id;
    tile.setAttribute('aria-label', `Sayfa ${i + 1}, dÃ¼zenlemek iÃ§in dokun`);
    tile.innerHTML = `<span class="page-tile__img"><img alt="" draggable="false"></span><span class="page-tile__num">${i + 1}</span>`;
    thumbUrl(id).then((u) => {
      if (u) tile.querySelector('img').src = u;
    });
    grid.append(tile);
  });
  $('#doc-hint').hidden = doc.pageIds.length < 2;
}

function renumber() {
  document.querySelectorAll('#page-grid .page-tile').forEach((t, i) => {
    t.querySelector('.page-tile__num').textContent = i + 1;
    t.setAttribute('aria-label', `Sayfa ${i + 1}, dÃ¼zenlemek iÃ§in dokun`);
  });
}

async function renameDoc(doc) {
  const title = await promptDialog({ title: 'Belge adÄ±', value: doc.title });
  if (!title || title === doc.title) return;
  doc.title = title;
  doc.updatedAt = Date.now();
  await store.saveDoc(doc);
  if (app.doc && app.doc.id === doc.id) {
    app.doc = doc;
    $('#doc-title-text').textContent = title;
  }
  await refreshHome();
}

async function deleteDoc(doc) {
  const ok = await confirmDialog({
    title: 'Belge silinsin mi?',
    message: `â€œ${doc.title}â€ ve ${doc.pageIds.length} sayfasÄ± bu cihazdan kalÄ±cÄ± olarak silinir.`,
    ok: 'Sil',
    danger: true,
  });
  if (!ok) return;
  await store.deleteDoc(doc);
  doc.pageIds.forEach(dropThumb);
  if (app.doc && app.doc.id === doc.id) app.doc = null;
  await refreshHome();
  go('home');
  toast('Belge silindi');
}

async function docMenu(doc) {
  const choice = await actionSheet(doc.title, [
    { value: 'export', label: 'DÄ±ÅŸa aktar', icon: 'share' },
    { value: 'rename', label: 'Yeniden adlandÄ±r', icon: 'pencil' },
    { value: 'delete', label: 'Sil', icon: 'trash', danger: true },
  ]);
  if (choice === 'export') openExport(doc);
  else if (choice === 'rename') renameDoc(doc);
  else if (choice === 'delete') deleteDoc(doc);
}

// --- tarama oturumu ------------------------------------------------------
//
// Her yeni sayfa: kÄ±rpma -> gÃ¶rÃ¼nÃ¼m -> kaydet. Galeriden Ã§oklu seÃ§imde
// fotoÄŸraflar sÄ±rayla aynÄ± akÄ±ÅŸtan geÃ§er.

function capture(kind, target) {
  app.captureTarget = target;
  const input = kind === 'camera' ? $('#input-camera') : $('#input-gallery');
  input.value = '';
  input.click();
}

async function onFilesChosen(e) {
  const files = [...e.target.files];
  e.target.value = '';
  if (!files.length || app.session) return;
  const mode = app.captureTarget === 'add' && app.doc ? 'add' : 'new';
  app.session = {
    mode,
    docId: mode === 'add' ? app.doc.id : null,
    queue: files.slice(1),
    total: files.length,
    index: 1,
    saved: 0,
    page: null,
  };
  await loadNewPage(files[0]);
}

async function loadNewPage(file) {
  const s = app.session;
  busy.show(s.total > 1 ? `FotoÄŸraf ${s.index}/${s.total} hazÄ±rlanÄ±yorâ€¦` : 'Belge algÄ±lanÄ±yorâ€¦');
  try {
    s.page = await preparePage(file);
    showCrop();
    if (!s.page.autoCorners) toast('Belge kenarÄ± bulunamadÄ±. KÃ¶ÅŸeleri elle ayarlayÄ±n.');
  } catch (err) {
    console.error(err);
    toast('FotoÄŸraf aÃ§Ä±lamadÄ±');
    releasePage();
    await advance();
  } finally {
    busy.hide();
  }
}

async function preparePage(file) {
  const canvas = await fileToCanvas(file);
  const srcBlob = canvasToBlob(canvas, 'image/jpeg', 0.92);
  srcBlob.catch(() => {});
  let corners;
  try {
    ({ corners } = await engine.load(canvas, { detect: true }));
  } catch (err) {
    releaseCanvas(canvas);
    throw err;
  }
  return {
    id: null,
    canvas,
    srcBlob,
    autoCorners: corners,
    corners: corners || fullFrame(canvas.width, canvas.height),
    rotation: 0,
    filter: lastFilter(),
    strength: lastStrength(),
    createdAt: Date.now(),
  };
}

async function openExistingPage(pageId) {
  const meta = app.pages.find((p) => p.id === pageId);
  if (!meta || app.session) return;
  busy.show('Sayfa aÃ§Ä±lÄ±yorâ€¦');
  let canvas = null;
  try {
    const blob = await store.getBlob(`${pageId}:src`);
    if (!blob) throw new Error('Kaynak fotoÄŸraf yok');
    canvas = await fileToCanvas(blob);
    // KayÄ±tlÄ± kÃ¶ÅŸeler kaynak boyutuna gÃ¶re; boyut deÄŸiÅŸtiyse Ã¶lÃ§ekle.
    const k = canvas.width / (meta.srcW || canvas.width);
    const scale = (c) => (c ? c.map((v) => v * k) : null);
    await engine.load(canvas, { detect: false });
    app.session = {
      mode: 'edit',
      docId: meta.docId,
      queue: [],
      total: 1,
      index: 1,
      saved: 0,
      page: {
        id: meta.id,
        canvas,
        srcBlob: null,
        autoCorners: scale(meta.autoCorners),
        corners: scale(meta.corners),
        rotation: meta.rotation || 0,
        filter: meta.filter || 'original',
        strength: meta.strength ?? lastStrength(),
        createdAt: meta.createdAt,
        warped: true,
      },
    };
    await engine.warp(app.session.page.corners, app.session.page.rotation);
    await showFilter();
  } catch (err) {
    console.error(err);
    toast('Sayfa aÃ§Ä±lamadÄ±');
    if (app.session) releasePage();
    else {
      releaseCanvas(canvas);
      engine.release().catch(() => {});
    }
    app.session = null;
  } finally {
    busy.hide();
  }
}

function releasePage() {
  const s = app.session;
  if (s && s.page) {
    releaseCanvas(s.page.canvas);
    s.page = null;
  }
  cropView.clear();
  engine.release().catch(() => {});
}

async function advance() {
  const s = app.session;
  if (s.queue.length) {
    s.index++;
    await loadNewPage(s.queue.shift());
    return;
  }
  app.session = null;
  if (s.docId) await openDoc(s.docId);
  else {
    await refreshHome();
    go('home');
  }
}

async function cancelSession({ confirmSingle = false } = {}) {
  const s = app.session;
  if (!s) return;
  if (s.queue.length) {
    const ok = await confirmDialog({
      title: 'Tarama durdurulsun mu?',
      message: `Bu fotoÄŸraf ve kalan ${s.queue.length} fotoÄŸraf eklenmeyecek.`,
      ok: 'Durdur',
      danger: true,
    });
    if (!ok) return;
  } else if (confirmSingle) {
    const ok = await confirmDialog({ title: 'Bu sayfa eklenmesin mi?', ok: 'Ekleme', danger: true });
    if (!ok) return;
  }
  releasePage();
  app.session = null;
  if (s.docId) await openDoc(s.docId);
  else {
    await refreshHome();
    go('home');
  }
}

// --- kÄ±rpma ekranÄ± -------------------------------------------------------

export const cropView = new CropView($('#crop-stage'), {
  onInvalid: () => toast('GeÃ§ersiz seÃ§im'),
});

function showCrop() {
  const s = app.session;
  $('#crop-progress').textContent = s.total > 1 ? `${s.index} / ${s.total}` : '';
  $('#crop-all').hidden = s.mode === 'edit' || s.queue.length === 0;
  go('crop');
  cropView.setImage(s.page.canvas);
  cropView.setCorners(s.page.corners);
  updateCropToggle();
}

function sameQuad(a, b) {
  return a && b && a.every((v, i) => Math.abs(v - b[i]) < 0.5);
}

// GÃ¶zlenen davranÄ±ÅŸ: "Otomatik" algÄ±lanan kÃ¶ÅŸelere, "TÃ¼mÃ¼" tÃ¼m fotoÄŸrafa
// geÃ§er; dÃ¼ÄŸme, dokununca geÃ§ilecek seÃ§eneÄŸi gÃ¶sterir.
function updateCropToggle() {
  const p = app.session && app.session.page;
  if (!p) return;
  const full = fullFrame(p.canvas.width, p.canvas.height);
  const btn = $('#crop-toggle');
  const isFull = sameQuad(cropView.getCorners(), full);
  const toAuto = isFull;
  btn.dataset.action = toAuto ? 'auto' : 'full';
  btn.disabled = toAuto && !p.autoCorners;
  btn.innerHTML = toAuto ? `${icon('auto')}<span>Otomatik</span>` : `${icon('frame')}<span>TÃ¼mÃ¼</span>`;
}

cropView.onChange((valid) => {
  $('#crop-apply').disabled = !valid;
  updateCropToggle();
});

$('#crop-toggle').addEventListener('click', () => {
  const p = app.session && app.session.page;
  if (!p) return;
  const action = $('#crop-toggle').dataset.action;
  cropView.setCorners(action === 'auto' && p.autoCorners ? p.autoCorners : fullFrame(p.canvas.width, p.canvas.height));
});

$('#crop-apply').addEventListener('click', async () => {
  const s = app.session;
  if (!s || !s.page) return;
  if (!cropView.valid) {
    toast('GeÃ§ersiz seÃ§im');
    return;
  }
  s.page.corners = normalizeQuad(cropView.getCorners());
  busy.show('Perspektif dÃ¼zeltiliyorâ€¦');
  try {
    await engine.warp(s.page.corners, s.page.rotation);
    s.page.warped = true;
    await showFilter();
  } catch (err) {
    console.error(err);
    toast('Ä°ÅŸlenemedi: ' + err.message);
  } finally {
    busy.hide();
  }
});

// GÃ¶rÃ¼nÃ¼m ekranÄ±ndan kÄ±rpmaya dÃ¶nÃ¼ldÃ¼yse "VazgeÃ§" deÄŸiÅŸikliÄŸi bÄ±rakÄ±p geri
// dÃ¶ner; ilk kÄ±rpmadaysa fotoÄŸrafÄ± eklemekten vazgeÃ§er.
$('#crop-cancel').addEventListener('click', () => {
  const s = app.session;
  if (!s || !s.page) return;
  if (s.page.warped) showFilter();
  else cancelSession();
});

$('#crop-all').addEventListener('click', addAllRemaining);

// --- gÃ¶rÃ¼nÃ¼m ekranÄ± ------------------------------------------------------

const filterCanvas = $('#filter-canvas');
let previewToken = 0;

function buildFilterStrip() {
  const strip = $('#filter-strip');
  for (const f of FILTERS) {
    const b = document.createElement('button');
    b.className = 'filter-chip';
    b.dataset.id = f.id;
    b.setAttribute('role', 'radio');
    b.innerHTML = `<span class="filter-chip__img"><canvas width="1" height="1"></canvas></span><span>${f.label}</span>`;
    b.addEventListener('click', () => selectFilter(f.id));
    strip.append(b);
  }
}

function markFilter(id) {
  for (const b of document.querySelectorAll('.filter-chip')) {
    const on = b.dataset.id === id;
    b.classList.toggle('is-selected', on);
    b.setAttribute('aria-checked', on);
  }
  const p = app.session && app.session.page;
  const adjustable = !!FILTERS.find((f) => f.id === id)?.adjustable;
  $('#filter-strength').hidden = !adjustable;
  if (adjustable && p) showStrength(p.strength);
}

function showStrength(v) {
  const input = $('#strength-input');
  input.value = v;
  input.style.setProperty('--fill', `${v}%`);
  $('#strength-value').textContent = v;
}

async function showFilter() {
  const s = app.session;
  $('#filter-progress').textContent = s.total > 1 ? `${s.index} / ${s.total}` : '';
  $('#filter-delete').hidden = s.mode !== 'edit';
  const label = s.mode === 'edit' ? 'Kaydet' : s.queue.length ? 'Sonraki' : s.mode === 'add' ? 'Ekle' : 'Kaydet';
  $('#filter-save').innerHTML = `${icon(s.queue.length && s.mode !== 'edit' ? 'next' : 'check')}<span>${label}</span>`;
  markFilter(s.page.filter);
  go('filter');
  await Promise.all([renderPreview(), renderThumbs()]);
}

// KaydÄ±rÄ±cÄ± sÃ¼rÃ¼klenirken worker'da iÅŸ birikmesin: aynÄ± anda tek Ã¶nizleme
// Ã§alÄ±ÅŸÄ±r, arada gelen istekler en son deÄŸerle bir kez daha Ã§alÄ±ÅŸtÄ±rÄ±lÄ±r.
let previewRunning = false;
let previewAgain = false;

async function renderPreview() {
  if (previewRunning) {
    previewAgain = true;
    return;
  }
  previewRunning = true;
  try {
    do {
      previewAgain = false;
      await drawPreview();
    } while (previewAgain);
  } finally {
    previewRunning = false;
  }
}

async function drawPreview() {
  const s = app.session;
  if (!s || !s.page) return;
  const token = ++previewToken;
  const spinner = setTimeout(() => ($('#filter-spinner').hidden = false), 250);
  try {
    const r = await engine.preview(s.page.filter, s.page.strength);
    if (token !== previewToken) return;
    rgbaToCanvas(r.buffer, r.w, r.h, filterCanvas);
  } finally {
    clearTimeout(spinner);
    if (token === previewToken) $('#filter-spinner').hidden = true;
  }
}

async function renderThumbs() {
  const s = app.session;
  const list = await engine.thumbs(s && s.page ? s.page.strength : DEFAULT_STRENGTH);
  for (const t of list) {
    const c = $(`.filter-chip[data-id="${t.id}"] canvas`);
    if (c) rgbaToCanvas(t.buffer, t.w, t.h, c);
  }
}

async function selectFilter(id) {
  const s = app.session;
  if (!s || !s.page || s.page.filter === id) return;
  s.page.filter = id;
  markFilter(id);
  await renderPreview();
}

$('#strength-input').addEventListener('input', (e) => {
  const s = app.session;
  if (!s || !s.page) return;
  s.page.strength = Number(e.target.value);
  showStrength(s.page.strength);
  renderPreview();
});

// BÄ±rakÄ±nca filtre kÃ¼Ã§Ã¼k resmi de yeni yoÄŸunluÄŸa gÃ¼ncellenir.
$('#strength-input').addEventListener('change', () => {
  if (app.session && app.session.page) renderThumbs();
});

$('#filter-rotate').addEventListener('click', async () => {
  const s = app.session;
  if (!s || !s.page) return;
  s.page.rotation = (s.page.rotation + 90) % 360;
  await engine.rotate(1);
  await Promise.all([renderPreview(), renderThumbs()]);
});

$('#filter-crop').addEventListener('click', () => {
  if (app.session && app.session.page) showCrop();
});

$('#filter-cancel').addEventListener('click', () => {
  const s = app.session;
  if (!s) return;
  if (s.mode === 'edit') {
    releasePage();
    app.session = null;
    go('doc');
  } else cancelSession({ confirmSingle: true });
});

$('#filter-save').addEventListener('click', async () => {
  const s = app.session;
  if (!s || !s.page) return;
  busy.show(s.total > 1 ? `Sayfa ${s.index}/${s.total} kaydediliyorâ€¦` : 'Kaydediliyorâ€¦');
  try {
    await persistPage();
    releasePage();
    await advance();
  } catch (err) {
    console.error(err);
    toast('Kaydedilemedi: ' + err.message);
  } finally {
    busy.hide();
  }
});

$('#filter-delete').addEventListener('click', async () => {
  const s = app.session;
  if (!s || s.mode !== 'edit') return;
  const ok = await confirmDialog({ title: 'Sayfa silinsin mi?', message: 'Bu sayfa belgeden kalÄ±cÄ± olarak Ã§Ä±karÄ±lÄ±r.', ok: 'Sil', danger: true });
  if (!ok) return;
  const pageId = s.page.id;
  const doc = await store.getDoc(s.docId);
  releasePage();
  app.session = null;
  dropThumb(pageId);
  if (doc.pageIds.length <= 1) {
    await store.deleteDoc(doc);
    app.doc = null;
    await refreshHome();
    go('home');
    toast('Son sayfa silindiÄŸi iÃ§in belge de silindi');
  } else {
    await store.deletePage(doc, pageId);
    await openDoc(doc.id);
    toast('Sayfa silindi');
  }
});

// DÃ¼zeltilmiÅŸ sayfayÄ± seÃ§ilen gÃ¶rÃ¼nÃ¼mle tam Ã§Ã¶zÃ¼nÃ¼rlÃ¼kte iÅŸler ve kaydeder.
async function persistPage() {
  const s = app.session;
  const p = s.page;
  const r = await engine.render(p.filter, p.strength);
  const out = rgbaToCanvas(r.buffer, r.w, r.h);
  const outBlob = await canvasToBlob(out, 'image/jpeg', 0.88);
  const small = scaledCanvas(out, 360);
  const thumbBlob = await canvasToBlob(small, 'image/jpeg', 0.8);
  releaseCanvas(out);
  releaseCanvas(small);

  const now = Date.now();
  let doc = s.docId ? await store.getDoc(s.docId) : null;
  if (!doc) {
    doc = { id: store.newId(), title: defaultTitle(), createdAt: now, updatedAt: now, pageIds: [] };
    s.docId = doc.id;
    store.requestPersistence();
  }
  const id = p.id || store.newId();
  const meta = {
    id,
    docId: doc.id,
    corners: p.corners,
    autoCorners: p.autoCorners,
    rotation: p.rotation,
    filter: p.filter,
    strength: p.strength,
    srcW: p.canvas.width,
    srcH: p.canvas.height,
    outW: r.w,
    outH: r.h,
    createdAt: p.createdAt || now,
    updatedAt: now,
  };
  if (!doc.pageIds.includes(id)) doc.pageIds.push(id);
  doc.updatedAt = now;
  const blobs = { out: outBlob, thumb: thumbBlob };
  if (!p.id) blobs.src = await p.srcBlob;
  await store.savePage(doc, meta, blobs);
  dropThumb(id);
  rememberFilter(p.filter, p.strength);
  s.saved++;
}

// Kalan fotoÄŸraflarÄ± algÄ±lanan kÃ¶ÅŸeler ve son gÃ¶rÃ¼nÃ¼mle tek seferde ekler.
async function addAllRemaining() {
  const s = app.session;
  if (!s || !s.page || !s.queue.length) return;
  if (!cropView.valid) {
    toast('GeÃ§ersiz seÃ§im');
    return;
  }
  const count = s.queue.length + 1;
  const ok = await confirmDialog({
    title: `${count} fotoÄŸraf otomatik eklensin mi?`,
    message: 'KÃ¶ÅŸeler otomatik algÄ±lanÄ±r ve son kullandÄ±ÄŸÄ±n gÃ¶rÃ¼nÃ¼m uygulanÄ±r. SayfalarÄ± sonra tek tek dÃ¼zenleyebilirsin.',
    ok: 'Ekle',
  });
  if (!ok) return;
  let failed = 0;
  busy.show(`Sayfa ${s.index}/${s.total} iÅŸleniyorâ€¦`);
  try {
    s.page.corners = normalizeQuad(cropView.getCorners());
    await engine.warp(s.page.corners, s.page.rotation);
    await persistPage();
    releasePage();
    while (s.queue.length) {
      s.index++;
      busy.text(`Sayfa ${s.index}/${s.total} iÅŸleniyorâ€¦`);
      const file = s.queue.shift();
      try {
        s.page = await preparePage(file);
        await engine.warp(s.page.corners, 0);
        await persistPage();
      } catch (err) {
        console.error(err);
        failed++;
      }
      releasePage();
    }
  } finally {
    busy.hide();
  }
  app.session = null;
  if (s.docId) await openDoc(s.docId);
  else {
    await refreshHome();
    go('home');
  }
  toast(failed ? `${s.saved} sayfa eklendi, ${failed} fotoÄŸraf aÃ§Ä±lamadÄ±` : `${s.saved} sayfa eklendi`);
}

// --- olay baÄŸlama --------------------------------------------------------

function bind() {
  hydrateIcons();
  buildFilterStrip();

  for (const b of document.querySelectorAll('[data-capture]')) {
    b.addEventListener('click', () => capture(b.dataset.capture, b.dataset.target));
  }
  $('#input-camera').addEventListener('change', onFilesChosen);
  $('#input-gallery').addEventListener('change', onFilesChosen);

  $('#home-more').addEventListener('click', showAbout);
  $('#doc-back').addEventListener('click', async () => {
    await refreshHome();
    go('home');
  });
  $('#doc-title').addEventListener('click', () => app.doc && renameDoc(app.doc));
  $('#doc-more').addEventListener('click', () => app.doc && docMenu(app.doc));
  $('#doc-export').addEventListener('click', () => app.doc && openExport(app.doc));

  enableReorder($('#page-grid'), {
    itemSelector: '.page-tile',
    scroller: $('#doc-scroll'),
    onTap: (tile) => openExistingPage(tile.dataset.id),
    onReorder: async (ids) => {
      const doc = app.doc;
      if (!doc || ids.join() === doc.pageIds.join()) return;
      doc.pageIds = ids;
      doc.updatedAt = Date.now();
      renumber();
      await store.saveDoc(doc);
    },
  });
}

function registerServiceWorker() {
  if (!('serviceWorker' in navigator) || location.protocol === 'file:') return;
  // Ä°lk kurulumda denetleyici deÄŸiÅŸimi yeniden yÃ¼kleme gerektirmez.
  const hadController = !!navigator.serviceWorker.controller;
  navigator.serviceWorker.register('./sw.js').then((reg) => {
    const offer = (worker) => {
      toast('Yeni sÃ¼rÃ¼m hazÄ±r', {
        action: 'Yenile',
        onAction: () => worker.postMessage({ type: 'activate' }),
      });
    };
    if (!hadController) return; // ilk kurulum: gÃ¼ncelleme teklif edilmez
    if (reg.waiting) offer(reg.waiting);
    reg.addEventListener('updatefound', () => {
      const w = reg.installing;
      w?.addEventListener('statechange', () => {
        if (w.state === 'installed') offer(w);
      });
    });
  });
  let reloaded = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (reloaded || !hadController) return;
    reloaded = true;
    location.reload();
  });
}

async function main() {
  bind();
  go('home');
  showInstallBanner();
  try {
    await refreshHome();
  } catch (err) {
    console.error(err);
    toast('KayÄ±tlÄ± belgeler okunamadÄ±');
  }
  registerServiceWorker();
}

main();
