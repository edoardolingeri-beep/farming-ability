import { defineConfig } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';

// `npm run build`          → dist/ for GitHub Pages (relative paths)
// `npm run build:single`   → dist-single/index.html, one self-contained file
export default defineConfig(({ mode }) => {
  const single = mode === 'single';
  return {
    base: './',
    plugins: single ? [viteSingleFile()] : [],
    build: {
      outDir: single ? 'dist-single' : 'dist',
      target: 'es2020',
      chunkSizeWarningLimit: 1200,
      assetsInlineLimit: single ? 100_000_000 : 4096,
    },
  };
});
