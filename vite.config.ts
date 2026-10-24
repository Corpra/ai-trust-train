import { defineConfig, type Plugin } from 'vite';
import { fileURLToPath } from 'node:url';

/** In dev and preview, `/` goes to `/en/`. In production `public/_redirects` does the same. */
function rootRedirect(): Plugin {
  const handler = (req: any, res: any, next: () => void) => {
    const url: string = req.url ?? '';
    if (url === '/' || url === '/index.html') {
      res.statusCode = 302;
      res.setHeader('Location', '/en/');
      res.end();
      return;
    }
    next();
  };
  return {
    name: 'root-redirect',
    configureServer(server) {
      server.middlewares.use(handler);
    },
    configurePreviewServer(server) {
      server.middlewares.use(handler);
    },
  };
}

export default defineConfig({
  appType: 'mpa',
  plugins: [rootRedirect()],
  build: {
    target: 'es2022',
    chunkSizeWarningLimit: 700,
    rollupOptions: {
      input: {
        en: fileURLToPath(new URL('./en/index.html', import.meta.url)),
        sv: fileURLToPath(new URL('./sv/index.html', import.meta.url)),
      },
    },
  },
});
