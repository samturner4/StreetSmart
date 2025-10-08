import type { KeyValueStore } from '@walksafe/shared/platform/KeyValueStore';

export const webKeyValueStore: KeyValueStore = {
  async getItem(key: string) {
    if (typeof window === 'undefined') return null;
    return window.localStorage.getItem(key);
  },
  async setItem(key: string, value: string) {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(key, value);
  },
  async removeItem(key: string) {
    if (typeof window === 'undefined') return;
    window.localStorage.removeItem(key);
  }
};
