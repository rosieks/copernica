import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

const server = 'http://127.0.0.1:8080';

export default defineConfig({
  plugins: [react()],
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    // Strict CSP: no inline scripts or styles may be emitted.
    assetsInlineLimit: 0,
    modulePreload: { polyfill: false },
    rollupOptions: {
      // Second entry: the isolated diagram renderer (004), so Mermaid never enters the main bundle.
      input: { main: 'index.html', diagramRenderer: 'diagram-renderer.html' },
    },
  },
  server: {
    proxy: { '/api': server, '/auth': server, '/health': server },
    // Visual editor tests (007): the fidelity corpus reads the repository's specs, and the URL
    // test pins the scheme list against the server sanitizer.
    fs: { allow: ['.', '../../specs', '../Copernica/Rendering'] },
  },
  test: {
    environment: 'jsdom',
  },
});
