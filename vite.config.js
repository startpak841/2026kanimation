import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  build: {
    outDir: 'dist',
    chunkSizeWarningLimit: 2000, // 단일 컴포넌트가 크므로 경고 상한 상향
  },
  server: {
    port: 5173,
    open: true,
  },
});
