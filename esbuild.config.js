// esbuild.config.js for server/_core
import { build } from 'esbuild';

const isDev = process.env.NODE_ENV === 'development';

build({
  entryPoints: ['server/_core/index.ts'],
  bundle: true,
  platform: 'node',
  format: 'cjs', // Use CommonJS for Node.js compatibility
  outdir: 'dist',
  external: ['@prisma/client'], // Externalize if needed
  minify: !isDev,
  sourcemap: isDev,
  target: 'node20',
  logLevel: 'info',
}).catch(() => process.exit(1));