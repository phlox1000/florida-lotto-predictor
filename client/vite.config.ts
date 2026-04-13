import { defineConfig } from 'vite';
import path from 'path';
import react from '@react-refresh/vite';

export default defineConfig({
  plugins: [react],
  build: {
    output: { format: 'esm' },
    emptyImportMeta: false,
    rollupOptions: {
      output: {
        format: 'esm',
        manualChunks: (id) => {
          if (id.includes('node_modules')) return 'vendor';
          if (id.includes('client/src/pages')) return 'pages';
          if (id.includes('client/src/components')) return 'components';
          return 'index';
        },
        entryFileNames: '[name].js',
      },
    },
  },
  server: { port: 3000 },
  resolve: {
    alias: {
      '@shared': path.resolve(import.meta.dirname, '../shared'),
    },
  },
  esbuild: {
    format: 'esm',
    target: 'node18',
  },
});