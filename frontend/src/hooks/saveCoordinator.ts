import { useSyncExternalStore } from 'react';
export interface SaveEntry {
  dirty: () => boolean;
  flush: () => Promise<void>;
  shutdown: () => void;
}
class SaveCoordinator {
  entries = new Set<SaveEntry>();
  listeners = new Set<() => void>();
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  dirty = () => [...this.entries].some(entry => entry.dirty());
  notify = () => {
    this.listeners.forEach(listener => listener());
  };
  register(entry: SaveEntry) {
    this.entries.add(entry);
    this.notify();
    return () => {
      this.entries.delete(entry);
      this.notify();
    };
  }
  async flush() {
    await Promise.all([...this.entries].map(entry => entry.flush()));
  }
  shutdown() {
    this.entries.forEach(entry => entry.shutdown());
  }
}
export const saves = new SaveCoordinator();
export const useDirty = () => useSyncExternalStore(saves.subscribe, saves.dirty);
