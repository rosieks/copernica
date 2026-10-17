import { useEffect, useRef, useSyncExternalStore } from 'react';
import { isSingleKeyEnabled } from './preference';

export type ShortcutGroup = 'Global' | 'Page' | 'Editor' | 'Discussions';

export interface Shortcut {
  /** `KeyboardEvent.key` for single keys ("e", "?"); for modifier shortcuts the key pressed with Ctrl/⌘ ("s", "Enter"). */
  key: string;
  /** Single-key shortcut (no modifier): can be turned off and never fires in text fields. */
  single: boolean;
  description: string;
  group: ShortcutGroup;
  /** Human-readable keys for help and tooltips, e.g. "Ctrl/⌘ S". */
  label: string;
  handler: (event: KeyboardEvent) => void;
}

interface Entry {
  id: number;
  shortcut: Shortcut;
}

let entries: Entry[] = [];
let nextId = 1;
const listeners = new Set<() => void>();
let listening = false;

function emit() {
  listeners.forEach((listener) => listener());
}

/** True when typing would go into a field: shortcuts without modifiers must not fire there (FR-016). */
export function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false;
  if (target.closest('input, textarea, select, [contenteditable=""], [contenteditable="true"], .cm-editor')) return true;
  return target instanceof HTMLElement && target.isContentEditable;
}

/** Single-key shortcuts belong to the page, not to an open dialog or menu on top of it. */
function inOverlay(target: EventTarget | null): boolean {
  return target instanceof Element && target.closest('[role="dialog"], [role="alertdialog"], [role="menu"]') !== null;
}

/** Decides which registered shortcut (if any) handles a keydown; exported for tests. */
export function matchShortcut(event: KeyboardEvent, candidates: readonly Shortcut[], singleKeyEnabled: boolean): Shortcut | undefined {
  if (event.isComposing || event.defaultPrevented) return undefined;
  const modifier = event.ctrlKey || event.metaKey;
  // Search from the most recently registered so the innermost screen wins.
  for (let i = candidates.length - 1; i >= 0; i--) {
    const shortcut = candidates[i]!;
    if (shortcut.single) {
      if (!singleKeyEnabled || modifier || event.altKey || isEditableTarget(event.target) || inOverlay(event.target)) continue;
      if (event.key === shortcut.key) return shortcut;
    } else if (modifier && !event.altKey && event.key.toLowerCase() === shortcut.key.toLowerCase()) {
      return shortcut;
    }
  }
  return undefined;
}

function onKeyDown(event: KeyboardEvent) {
  const shortcut = matchShortcut(
    event,
    entries.map((e) => e.shortcut),
    isSingleKeyEnabled(),
  );
  if (!shortcut) return;
  event.preventDefault();
  shortcut.handler(event);
}

function ensureListening() {
  if (listening || typeof document === 'undefined') return;
  document.addEventListener('keydown', onKeyDown);
  listening = true;
}

/**
 * Registers a shortcut while the calling component is mounted (research R7). Pass
 * `enabled: false` to keep the hook call unconditional.
 */
export function useShortcut(shortcut: Omit<Shortcut, 'handler'> & { handler: (event: KeyboardEvent) => void; enabled?: boolean }) {
  const handler = useRef(shortcut.handler);
  handler.current = shortcut.handler;
  const { key, single, description, group, label, enabled = true } = shortcut;

  useEffect(() => {
    if (!enabled) return;
    ensureListening();
    const entry: Entry = {
      id: nextId++,
      shortcut: { key, single, description, group, label, handler: (event) => handler.current(event) },
    };
    entries = [...entries, entry];
    emit();
    return () => {
      entries = entries.filter((e) => e.id !== entry.id);
      emit();
    };
  }, [key, single, description, group, label, enabled]);
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function snapshot() {
  return entries;
}

/** Shortcuts registered by the mounted screens, for the help dialog. */
export function useRegisteredShortcuts(): Shortcut[] {
  return useSyncExternalStore(subscribe, snapshot, snapshot).map((e) => e.shortcut);
}
