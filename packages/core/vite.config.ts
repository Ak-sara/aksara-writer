import { defineConfig } from 'vite';
import dts from 'vite-plugin-dts';
import { resolve } from 'path';

export default defineConfig({
  plugins: [dts()],
  build: {
    lib: {
      entry: resolve(__dirname, 'src/index.ts'),
      name: 'AksaraWriterCore',
      fileName: 'index',
      formats: ['es', 'cjs']
    },
    rollupOptions: {
      external: [
        'fs',
        'path',
        'url',
        'puppeteer',
        'pptxgenjs',
        'marked',
        'jszip',
        'gray-matter'
      ]
    }
  }
});