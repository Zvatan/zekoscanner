// Ana iş parçacığından görüntü işleme worker'ına söz (promise) tabanlı erişim.
// Modül worker'ı desteklenmezse aynı kod ana iş parçacığında çalışır.

export class Engine {
  constructor() {
    this.seq = 0;
    this.pending = new Map();
    this.local = null;
    this.worker = null;
    this.ready = this.startWorker();
  }

  // Worker'ın gerçekten çalıştığını bir "ping" ile doğrular; aksi halde ana
  // iş parçacığına geçer. Aktarılan tamponlar kaybolmasın diye ilk iş ancak
  // bu doğrulamadan sonra gönderilir.
  startWorker() {
    return new Promise((resolve) => {
      let worker;
      try {
        worker = new Worker(new URL('./worker.js', import.meta.url), { type: 'module' });
      } catch {
        resolve(false);
        return;
      }
      const timer = setTimeout(() => done(false), 4000);
      const done = (ok) => {
        clearTimeout(timer);
        if (ok) {
          this.worker = worker;
          worker.onmessage = (e) => this.settle(e.data);
          worker.onerror = (e) => {
            e.preventDefault?.();
            this.crash();
          };
        } else {
          worker.terminate();
        }
        resolve(ok);
      };
      worker.onmessage = (e) => done(e.data && e.data.pong === true);
      worker.onerror = (e) => {
        e.preventDefault?.();
        done(false);
      };
      worker.postMessage({ ping: true });
    });
  }

  settle({ id, ok, result, error }) {
    const p = this.pending.get(id);
    if (!p) return;
    this.pending.delete(id);
    if (ok) p.resolve(result);
    else p.reject(new Error(error));
  }

  // Çalışırken çöken worker (ör. bellek yetersizliği): bekleyen işleri
  // başarısız say, sonraki işleri ana iş parçacığında yap.
  crash() {
    if (this.worker) this.worker.terminate();
    this.worker = null;
    for (const p of this.pending.values()) p.reject(new Error('İşlem yarıda kaldı'));
    this.pending.clear();
  }

  async runLocal(type, payload) {
    if (!this.local) {
      const { createSession } = await import('./core/session.js');
      this.local = createSession();
    }
    await new Promise((r) => setTimeout(r, 0));
    return this.local[type](payload);
  }

  async call(type, payload = {}, transfer = []) {
    await this.ready;
    if (!this.worker) return this.runLocal(type, payload);
    const id = ++this.seq;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.worker.postMessage({ id, type, payload }, transfer);
    });
  }

  // Kanvastaki fotoğrafı işlemciye yükler; istenirse belgeyi algılar.
  async load(canvas, { detect }) {
    await this.ready;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const buffer = img.data.buffer;
    return this.call('load', { buffer, w: canvas.width, h: canvas.height, detect }, [buffer]);
  }

  warp(corners, rotation) {
    return this.call('warp', { corners, rotation });
  }

  rotate(quarter = 1) {
    return this.call('rotate', { quarter });
  }

  preview(mode, strength) {
    return this.call('preview', { mode, strength });
  }

  thumbs(strength) {
    return this.call('thumbs', { strength });
  }

  render(mode, strength) {
    return this.call('render', { mode, strength });
  }

  release() {
    return this.call('release');
  }
}
