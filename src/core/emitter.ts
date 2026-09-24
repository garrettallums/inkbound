export type Listener = () => void;

export class Emitter {
  private listeners = new Set<Listener>();
  subscribe = (l: Listener) => {
    this.listeners.add(l);
    return () => {
      this.listeners.delete(l);
    };
  };
  emit() {
    for (const l of [...this.listeners]) l();
  }
}
