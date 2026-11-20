// Küçük arayüz yardımcıları: simgeler, bildirim, meşgul katmanı, alt sayfa
// ve iletişim kutuları.

const PATHS = {
  camera:
    '<path d="M3.5 8.5a2 2 0 0 1 2-2h1.8l1.3-2h6.8l1.3 2h1.8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2z"/><circle cx="12" cy="13" r="3.6"/>',
  gallery:
    '<rect x="3" y="4.5" width="18" height="15" rx="2.5"/><circle cx="8.5" cy="9.5" r="1.6"/><path d="M4 17.5l4.6-4.6a1.5 1.5 0 0 1 2.1 0l3.3 3.3M13 15l1.6-1.6a1.5 1.5 0 0 1 2.1 0L20 16.7"/>',
  check: '<path d="M5 12.5l4.2 4.2L19 7"/>',
  close: '<path d="M6 6l12 12M18 6L6 18"/>',
  back: '<path d="M14.5 5.5L8 12l6.5 6.5"/>',
  rotate: '<path d="M19.5 12a7.5 7.5 0 1 1-2.2-5.3"/><path d="M19.5 4.5V9H15"/>',
  crop: '<path d="M7 3v12.5A1.5 1.5 0 0 0 8.5 17H21"/><path d="M3 7h12.5A1.5 1.5 0 0 1 17 8.5V21"/>',
  trash:
    '<path d="M4.5 7h15M9.5 7V5h5v2"/><path d="M6.5 7l.8 12a1.5 1.5 0 0 0 1.5 1.4h6.4a1.5 1.5 0 0 0 1.5-1.4l.8-12"/><path d="M10.2 11v6M13.8 11v6"/>',
  share:
    '<path d="M12 3.5v11M8 7.5l4-4 4 4"/><path d="M7 11H6a1.5 1.5 0 0 0-1.5 1.5v6A1.5 1.5 0 0 0 6 20h12a1.5 1.5 0 0 0 1.5-1.5v-6A1.5 1.5 0 0 0 18 11h-1"/>',
  more:
    '<circle cx="6" cy="12" r="1.4" fill="currentColor" stroke="none"/><circle cx="12" cy="12" r="1.4" fill="currentColor" stroke="none"/><circle cx="18" cy="12" r="1.4" fill="currentColor" stroke="none"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  frame:
    '<path d="M4 9V5.5A1.5 1.5 0 0 1 5.5 4H9M15 4h3.5A1.5 1.5 0 0 1 20 5.5V9M20 15v3.5a1.5 1.5 0 0 1-1.5 1.5H15M9 20H5.5A1.5 1.5 0 0 1 4 18.5V15"/>',
  auto:
    '<path d="M4 8V5.5A1.5 1.5 0 0 1 5.5 4H8M16 4h2.5A1.5 1.5 0 0 1 20 5.5V8M20 16v2.5a1.5 1.5 0 0 1-1.5 1.5H16M8 20H5.5A1.5 1.5 0 0 1 4 18.5V16"/><path d="M8.5 8.3l7.2.9-.8 6.6-6.8-.9z"/>',
  pencil: '<path d="M4 20h4L18.5 9.5a2.1 2.1 0 0 0-3-3L5 17v3z"/><path d="M13.5 8.5l2 2"/>',
  doc: '<path d="M7.5 3.5h6L18 8v11a1.5 1.5 0 0 1-1.5 1.5h-9A1.5 1.5 0 0 1 6 19V5a1.5 1.5 0 0 1 1.5-1.5z"/><path d="M13.5 3.5V8H18M9 12.5h6M9 16h4"/>',
  info: '<circle cx="12" cy="12" r="8.5"/><path d="M12 11v5.5"/><circle cx="12" cy="7.8" r="1" fill="currentColor" stroke="none"/>',
  next: '<path d="M9.5 5.5L16 12l-6.5 6.5"/>',
  download: '<path d="M12 4v11M7.5 10.5L12 15l4.5-4.5"/><path d="M5 19.5h14"/>',
};

export function icon(name, cls = '') {
  return `<svg class="icon ${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${PATHS[name]}</svg>`;
}

// Statik HTML'deki <i data-icon="..."> yer tutucularını SVG ile değiştirir.
export function hydrateIcons(root = document) {
  for (const el of root.querySelectorAll('i[data-icon]')) {
    el.outerHTML = icon(el.dataset.icon, el.className);
  }
}

export function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}

// --- bildirim ------------------------------------------------------------

let toastTimer = 0;
export function toast(message, { action, onAction, duration = 2600 } = {}) {
  const el = document.getElementById('toast');
  el.innerHTML = `<span>${escapeHtml(message)}</span>`;
  if (action) {
    const b = document.createElement('button');
    b.textContent = action;
    b.addEventListener('click', () => {
      el.classList.remove('is-visible');
      onAction?.();
    });
    el.append(b);
  }
  el.classList.add('is-visible');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('is-visible'), action ? duration * 2 : duration);
}

// --- meşgul katmanı ------------------------------------------------------

let busyDepth = 0;
let busyTimer = 0;
export const busy = {
  show(text = 'İşleniyor…') {
    busyDepth++;
    const el = document.getElementById('busy');
    el.querySelector('.busy__text').textContent = text;
    // Kısa işlerde katman göz kırpmasın diye azıcık gecikmeyle görünür.
    clearTimeout(busyTimer);
    if (el.hidden) busyTimer = setTimeout(() => (el.hidden = false), 120);
    document.body.classList.add('is-busy');
  },
  text(text) {
    document.querySelector('#busy .busy__text').textContent = text;
  },
  hide() {
    busyDepth = Math.max(0, busyDepth - 1);
    if (busyDepth) return;
    clearTimeout(busyTimer);
    document.getElementById('busy').hidden = true;
    document.body.classList.remove('is-busy');
  },
};

// --- alt sayfa -----------------------------------------------------------

// İçeriği alttan açılan sayfada gösterir. close() ile kapanır.
export function sheet(build, { onClose } = {}) {
  const root = document.getElementById('overlay-root');
  const wrap = document.createElement('div');
  wrap.className = 'overlay';
  wrap.innerHTML = '<div class="overlay__scrim"></div><div class="sheet" role="dialog" aria-modal="true"><div class="sheet__grip"></div></div>';
  const panel = wrap.querySelector('.sheet');
  let closed = false;
  const close = (value) => {
    if (closed) return;
    closed = true;
    wrap.classList.remove('is-open');
    setTimeout(() => wrap.remove(), 280);
    onClose?.(value);
  };
  wrap.querySelector('.overlay__scrim').addEventListener('click', () => close());
  const mounted = build(panel, close);
  root.append(wrap);
  if (typeof mounted === 'function') mounted();
  requestAnimationFrame(() => requestAnimationFrame(() => wrap.classList.add('is-open')));
  return close;
}

// Seçenek listesi; seçilen değeri döndürür (vazgeçilirse null).
export function actionSheet(title, actions) {
  return new Promise((resolve) => {
    sheet(
      (panel, close) => {
        if (title) panel.insertAdjacentHTML('beforeend', `<div class="sheet__title">${escapeHtml(title)}</div>`);
        const list = document.createElement('div');
        list.className = 'sheet__actions';
        for (const a of actions) {
          const b = document.createElement('button');
          b.className = 'sheet__action' + (a.danger ? ' is-danger' : '');
          b.innerHTML = `${a.icon ? icon(a.icon) : ''}<span>${escapeHtml(a.label)}</span>`;
          b.addEventListener('click', () => close(a.value));
          list.append(b);
        }
        panel.append(list);
        const cancel = document.createElement('button');
        cancel.className = 'btn btn--ghost btn--block';
        cancel.textContent = 'Vazgeç';
        cancel.addEventListener('click', () => close(null));
        panel.append(cancel);
      },
      { onClose: (v) => resolve(v ?? null) },
    );
  });
}

export function confirmDialog({ title, message = '', ok = 'Tamam', danger = false }) {
  return new Promise((resolve) => {
    sheet(
      (panel, close) => {
        panel.insertAdjacentHTML(
          'beforeend',
          `<div class="sheet__title">${escapeHtml(title)}</div>` +
            (message ? `<p class="sheet__text">${escapeHtml(message)}</p>` : '') +
            `<div class="sheet__row"><button class="btn btn--ghost" data-v="0">Vazgeç</button>` +
            `<button class="btn ${danger ? 'btn--danger' : 'btn--primary'}" data-v="1">${escapeHtml(ok)}</button></div>`,
        );
        panel.querySelectorAll('[data-v]').forEach((b) => b.addEventListener('click', () => close(b.dataset.v === '1')));
      },
      { onClose: (v) => resolve(v === true) },
    );
  });
}

export function promptDialog({ title, value = '', ok = 'Kaydet', placeholder = '' }) {
  return new Promise((resolve) => {
    sheet(
      (panel, close) => {
        panel.insertAdjacentHTML(
          'beforeend',
          `<div class="sheet__title">${escapeHtml(title)}</div>` +
            `<form class="sheet__form"><input class="field" maxlength="80" autocomplete="off" enterkeyhint="done">` +
            `<div class="sheet__row"><button type="button" class="btn btn--ghost" data-cancel>Vazgeç</button>` +
            `<button type="submit" class="btn btn--primary">${escapeHtml(ok)}</button></div></form>`,
        );
        const input = panel.querySelector('input');
        input.value = value;
        input.placeholder = placeholder;
        panel.querySelector('[data-cancel]').addEventListener('click', () => close(null));
        panel.querySelector('form').addEventListener('submit', (e) => {
          e.preventDefault();
          const v = input.value.trim();
          close(v || null);
        });
        setTimeout(() => input.select(), 320);
        // iOS klavyeyi yalnız dokunma olayının içinde verilen odakta açar;
        // bu yüzden odak, sayfa belgeye eklenir eklenmez eşzamanlı verilir.
        return () => input.focus({ preventScroll: true });
      },
      { onClose: (v) => resolve(v ?? null) },
    );
  });
}
