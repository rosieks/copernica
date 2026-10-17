import { useSyncExternalStore } from 'react';

/** Browser-only interface preference (data-model.md → Interface preference, FR-017). */
export const SINGLE_KEY_STORAGE_KEY = 'copernica.singleKeyShortcuts';

const listeners = new Set<() => void>();
/** Used when localStorage cannot be written (private mode, blocked storage). */
let fallback: boolean | undefined;

export function readSingleKeyShortcuts(): boolean {
  try {
    // Absent, unknown or corrupt values mean "on".
    return localStorage.getItem(SINGLE_KEY_STORAGE_KEY) !== 'off';
  } catch {
    return true;
  }
}

export function writeSingleKeyShortcuts(enabled: boolean): void {
  try {
    localStorage.setItem(SINGLE_KEY_STORAGE_KEY, enabled ? 'on' : 'off');
  } catch {
    // Storage unavailable: the choice applies until reload.
    fallback = enabled;
  }
  listeners.forEach((listener) => listener());
}

function snapshot(): boolean {
  return fallback ?? readSingleKeyShortcuts();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  // Other tabs change the preference through the storage event.
  const onStorage = (event: StorageEvent) => {
    if (event.key === null || event.key === SINGLE_KEY_STORAGE_KEY) listener();
  };
  window.addEventListener('storage', onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener('storage', onStorage);
  };
}

export function isSingleKeyEnabled(): boolean {
  return snapshot();
}

export function useSingleKeyShortcuts(): [boolean, (enabled: boolean) => void] {
  const enabled = useSyncExternalStore(subscribe, snapshot, () => true);
  return [enabled, writeSingleKeyShortcuts];
}
