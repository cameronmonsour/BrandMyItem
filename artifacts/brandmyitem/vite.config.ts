import fs from 'node:fs';
import path from 'path';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vite';

import runtimeErrorOverlay from '@replit/vite-plugin-runtime-error-modal';

const rawPort = process.env.PORT;

if (!rawPort) {
  throw new Error(
    'PORT environment variable is required but was not provided.',
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

const basePath = process.env.BASE_PATH;

if (!basePath) {
  throw new Error(
    'BASE_PATH environment variable is required but was not provided.',
  );
}

const publicRoot = path.resolve(import.meta.dirname, 'public');

function realNotFoundPage() {
  return {
    name: 'brandmyitem-real-404',
    configureServer(server: {
      middlewares: {
        use: (
          handler: (
            req: { method?: string; url?: string },
            res: {
              statusCode: number;
              setHeader: (name: string, value: string) => void;
              end: (body?: string) => void;
            },
            next: () => void,
          ) => void,
        ) => void;
      };
    }) {
      server.middlewares.use((req, res, next) => {
        if (!['GET', 'HEAD'].includes(req.method || 'GET')) return next();
        const pathname = decodeURIComponent(
          new URL(req.url || '/', 'http://localhost').pathname,
        );
        if (
          pathname === '/' ||
          pathname === '/index.html' ||
          pathname.startsWith('/api/') ||
          pathname.startsWith('/@') ||
          pathname.startsWith('/src/') ||
          pathname.startsWith('/node_modules/') ||
          pathname.startsWith('/__vite')
        ) {
          return next();
        }
        const candidate = path.resolve(publicRoot, `.${pathname}`);
        if (
          candidate.startsWith(`${publicRoot}${path.sep}`) &&
          fs.existsSync(candidate) &&
          fs.statSync(candidate).isFile()
        ) {
          return next();
        }
        res.statusCode = 404;
        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        res.setHeader('Cache-Control', 'no-store');
        res.end(
          req.method === 'HEAD'
            ? undefined
            : fs.readFileSync(path.join(publicRoot, '404.html'), 'utf8'),
        );
      });
    },
  };
}

export default defineConfig({
  base: basePath,
  plugins: [
    realNotFoundPage(),
    react(),
    tailwindcss(),
    ...(process.env.NODE_ENV !== 'production' ? [runtimeErrorOverlay()] : []),
    ...(process.env.NODE_ENV !== 'production' &&
    process.env.REPL_ID !== undefined
      ? [
          await import('@replit/vite-plugin-cartographer').then((m) =>
            m.cartographer({
              root: path.resolve(import.meta.dirname, '..'),
            }),
          ),
          await import('@replit/vite-plugin-dev-banner').then((m) =>
            m.devBanner(),
          ),
        ]
      : []),
  ],
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, 'src'),
      '@assets': path.resolve(
        import.meta.dirname,
        '..',
        '..',
        'attached_assets',
      ),
    },
    dedupe: ['react', 'react-dom'],
  },
  root: path.resolve(import.meta.dirname),
  build: {
    outDir: path.resolve(import.meta.dirname, 'dist/public'),
    emptyOutDir: true,
  },
  server: {
    port,
    strictPort: true,
    host: '0.0.0.0',
    allowedHosts: true,
    fs: {
      strict: true,
    },
  },
  preview: {
    port,
    host: '0.0.0.0',
    allowedHosts: true,
  },
});
