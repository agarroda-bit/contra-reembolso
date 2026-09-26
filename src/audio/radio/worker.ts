// Worker de la radio: genera las muestras (batería, cuerdas, voces...) fuera del hilo
// principal para que el juego no dé tirones. Recibe un encargo y devuelve los canales.
import { runSpec, type Spec } from './render';

const scope = self as unknown as {
  onmessage: ((e: MessageEvent<{ id: number; spec: Spec }>) => void) | null;
  postMessage(msg: unknown, transfer: Transferable[]): void;
};

scope.onmessage = (e) => {
  const { id, spec } = e.data;
  try {
    const out = runSpec(spec);
    const chans = Array.isArray(out) ? out : [out];
    scope.postMessage({ id, chans }, chans.map((c) => c.buffer as ArrayBuffer));
  } catch (err) {
    scope.postMessage({ id, error: String(err) }, []);
  }
};
