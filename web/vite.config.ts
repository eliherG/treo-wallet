import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    strictPort: true,
    // The browser sends its own localhost:5173 Origin. Express validates it on cookie refresh/logout.
    proxy: { '/api/v1': { target: 'http://127.0.0.1:3000', changeOrigin: false } },
  },
  test: { environment: 'jsdom', setupFiles: ['./src/tests/setup.ts'], css: false },
});
