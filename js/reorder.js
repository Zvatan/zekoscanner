// Izgaradaki sayfaları basılı tutup sürükleyerek sıralama. Kısa dokunuş
// onTap'e gider; sürükleme bitince yeni kimlik sırası onReorder'a verilir.

const HOLD_MS = 380;
const SLOP = 8;

export function enableReorder(grid, { itemSelector, scroller, onTap, onReorder }) {
  let st = null;
  let raf = 0;

  const items = () => [...grid.querySelectorAll(itemSelector)];

  grid.addEventListener('contextmenu', (e) => e.preventDefault());
  // iOS'ta sürüklerken sayfanın kaymasını engelle.
  grid.addEventListener(
    'touchmove',
    (e) => {
      if (st && st.dragging) e.preventDefault();
    },
    { passive: false },
  );
  // Klavye ile etkinleştirme (detail === 0) için tıklama.
  grid.addEventListener('click', (e) => {
    const item = e.target.closest(itemSelector);
    if (item && e.detail === 0) onTap(item);
  });

  grid.addEventListener('pointerdown', (e) => {
    const item = e.target.closest(itemSelector);
    if (!item || st || (e.pointerType === 'mouse' && e.button !== 0)) return;
    st = { item, id: e.pointerId, x0: e.clientX, y0: e.clientY, x: e.clientX, y: e.clientY, dragging: false, moved: false };
    st.timer = setTimeout(startDrag, HOLD_MS);
    item.classList.add('is-pressed');
  });

  window.addEventListener(
    'pointermove',
    (e) => {
      if (!st || e.pointerId !== st.id) return;
      st.x = e.clientX;
      st.y = e.clientY;
      if (!st.dragging) {
        if (Math.hypot(st.x - st.x0, st.y - st.y0) > SLOP) {
          st.moved = true;
          cancel();
        }
        return;
      }
      e.preventDefault();
      follow();
    },
    { passive: false },
  );

  window.addEventListener('pointerup', (e) => finish(e, false));
  window.addEventListener('pointercancel', (e) => finish(e, true));

  function cancel() {
    if (!st) return;
    clearTimeout(st.timer);
    st.item.classList.remove('is-pressed');
    if (!st.dragging) st = null;
  }

  function startDrag() {
    if (!st) return;
    st.dragging = true;
    const r = st.item.getBoundingClientRect();
    st.offX = st.x - r.left;
    st.offY = st.y - r.top;
    st.item.classList.remove('is-pressed');
    st.item.classList.add('is-dragging');
    grid.classList.add('is-reordering');
    follow();
    tick();
  }

  // Sürüklenen öğeyi parmağın altında tutar ve gerekirse yer değiştirir.
  function follow() {
    const item = st.item;
    const g = grid.getBoundingClientRect();
    // İsabet testi yerleşim konumlarıyla yapılır; kayma animasyonundaki
    // dönüşümler hesaba katılırsa öğeler ileri geri yer değiştirir.
    const px = st.x - g.left;
    const py = st.y - g.top;
    const target = items().find(
      (el) =>
        el !== item &&
        px >= el.offsetLeft &&
        px <= el.offsetLeft + el.offsetWidth &&
        py >= el.offsetTop &&
        py <= el.offsetTop + el.offsetHeight,
    );
    if (target) {
      const list = items();
      const before = list.indexOf(target) < list.indexOf(item);
      flip(() => grid.insertBefore(item, before ? target : target.nextSibling));
    }
    const x = st.x - g.left - st.offX - item.offsetLeft;
    const y = st.y - g.top - st.offY - item.offsetTop;
    item.style.transform = `translate(${x}px, ${y}px) scale(1.06)`;
  }

  // Diğer öğelerin yer değişimini yumuşak gösterir (FLIP).
  function flip(mutate) {
    const others = items().filter((el) => el !== st.item);
    const first = new Map(others.map((el) => [el, el.getBoundingClientRect()]));
    mutate();
    for (const el of others) {
      const a = first.get(el);
      const b = el.getBoundingClientRect();
      const dx = a.left - b.left;
      const dy = a.top - b.top;
      if (!dx && !dy) continue;
      el.style.transition = 'none';
      el.style.transform = `translate(${dx}px, ${dy}px)`;
      requestAnimationFrame(() => {
        el.style.transition = '';
        el.style.transform = '';
      });
    }
  }

  // Kenara yaklaşınca kaydır.
  function tick() {
    if (!st || !st.dragging) return;
    const r = scroller.getBoundingClientRect();
    const edge = 70;
    let v = 0;
    if (st.y < r.top + edge) v = -Math.ceil((r.top + edge - st.y) / 6);
    else if (st.y > r.bottom - edge) v = Math.ceil((st.y - (r.bottom - edge)) / 6);
    if (v) {
      scroller.scrollTop += v;
      follow();
    }
    raf = requestAnimationFrame(tick);
  }

  function finish(e, cancelled) {
    if (!st || e.pointerId !== st.id) return;
    clearTimeout(st.timer);
    cancelAnimationFrame(raf);
    const s = st;
    st = null;
    s.item.classList.remove('is-pressed');
    if (s.dragging) {
      s.item.classList.remove('is-dragging');
      s.item.style.transform = '';
      grid.classList.remove('is-reordering');
      onReorder(items().map((el) => el.dataset.id));
    } else if (!cancelled && !s.moved) {
      onTap(s.item);
    }
  }
}
