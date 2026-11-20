// Görüntü işleme worker'ı: ağır piksel işlerini arayüzü dondurmadan yapar.
import { createSession, transferablesOf } from './core/session.js';

const session = createSession();

self.onmessage = (e) => {
  if (e.data && e.data.ping) {
    self.postMessage({ pong: true });
    return;
  }
  const { id, type, payload } = e.data;
  try {
    const result = session[type](payload || {});
    self.postMessage({ id, ok: true, result }, transferablesOf(result));
  } catch (err) {
    self.postMessage({ id, ok: false, error: (err && err.message) || String(err) });
  }
};
