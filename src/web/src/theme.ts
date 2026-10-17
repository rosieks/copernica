import { setNonce } from 'get-nonce';

const PLACEHOLDER = '__CSP_NONCE__';
let styleNonce = '';

/**
 * Hands the per-response CSP style nonce (see Web/SpaHosting.cs) to the libraries that inject
 * <style> elements: Radix's scroll lock and CodeMirror's style modules (research 002 R3).
 */
export function applyNonce(): void {
  const nonce = document.querySelector<HTMLMetaElement>('meta[name="csp-nonce"]')?.content;
  if (nonce && nonce !== PLACEHOLDER) {
    styleNonce = nonce;
    setNonce(nonce);
  }
}

/** The nonce for `EditorView.cspNonce`; empty when the page has none (dev server, tests). */
export function cspNonce(): string {
  return styleNonce;
}

/** Follows the operating system's light/dark appearance, live and without a reload (FR-025). */
export function startTheme(): void {
  const query = window.matchMedia?.('(prefers-color-scheme: dark)');
  const apply = () => document.documentElement.classList.toggle('dark', query?.matches ?? false);
  apply();
  query?.addEventListener('change', apply);
}
