import { Readable } from 'node:stream';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { createSubmissionHandler } from './server/submission.js';

export default defineConfig(({ mode }) => {
  const env = { ...loadEnv(mode, process.cwd(), ''), ...process.env };
  return {
    plugins: [react(), {
      name: 'local-survey-api',
      configureServer(server) {
        const submit = createSubmissionHandler({
          env,
          allowLocalHttp: mode === 'test',
          allowTestWebhook: mode === 'development' || mode === 'test',
        });
        server.middlewares.use('/api/submit', async (request, response, next) => {
          try {
            const url = new URL(request.originalUrl || request.url, `http://${request.headers.host}`);
            const webRequest = new Request(url, {
              method: request.method,
              headers: request.headers,
              body: request.method === 'POST' ? Readable.toWeb(request) : undefined,
              ...(request.method === 'POST' ? { duplex: 'half' } : {}),
            });
            const webResponse = await submit(webRequest);
            response.statusCode = webResponse.status;
            webResponse.headers.forEach((value, key) => response.setHeader(key, value));
            response.end(Buffer.from(await webResponse.arrayBuffer()));
          } catch {
            response.statusCode = 500;
            response.setHeader('Content-Type', 'application/json');
            response.setHeader('Cache-Control', 'no-store');
            response.end('{"ok":false}');
          }
        });
      },
    }],
  };
});
