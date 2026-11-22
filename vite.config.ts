import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  clearScreen: false,
  server: {
    port: 5173,
    strictPort: true,
    watch: {
      // No vigilar target/ de cargo: Windows lanza EBUSY con los .dll en build (plantilla oficial Tauri)
      ignored: ['**/src-tauri/**'],
    },
  },
  test: {
    environment: 'node',
  },
});
