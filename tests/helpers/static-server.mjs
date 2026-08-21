import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { createServer } from 'node:http';
import { dirname, extname, isAbsolute, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const DEFAULT_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');

const CONTENT_TYPES = new Map([
  ['.css', 'text/css; charset=utf-8'],
  ['.html', 'text/html; charset=utf-8'],
  ['.js', 'text/javascript; charset=utf-8'],
  ['.json', 'application/json; charset=utf-8'],
  ['.mjs', 'text/javascript; charset=utf-8'],
  ['.svg', 'image/svg+xml'],
]);

function sendText(response, statusCode, body) {
  response.writeHead(statusCode, {
    'Cache-Control': 'no-store',
    'Content-Type': 'text/plain; charset=utf-8',
  });
  response.end(body);
}

function resolveRequestPath(root, requestUrl) {
  const url = new URL(requestUrl ?? '/', 'http://127.0.0.1');
  const pathname = decodeURIComponent(url.pathname);
  const relativePath = pathname === '/'
    ? 'dokkan_calc_final.html'
    : pathname.replace(/^\/+/, '');
  const filePath = resolve(root, relativePath);
  const pathFromRoot = relative(root, filePath);

  if (pathFromRoot.startsWith('..') || isAbsolute(pathFromRoot)) {
    return null;
  }

  return filePath;
}

/**
 * Start a loopback-only static server for browser tests.
 *
 * The random port and explicit close function let each test process remain
 * isolated from any development server the owner may already be running.
 */
export async function startStaticServer({ root = DEFAULT_ROOT } = {}) {
  const absoluteRoot = resolve(root);
  const server = createServer(async (request, response) => {
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      response.setHeader('Allow', 'GET, HEAD');
      sendText(response, 405, 'Method Not Allowed');
      return;
    }

    let filePath;
    try {
      filePath = resolveRequestPath(absoluteRoot, request.url);
    } catch {
      sendText(response, 400, 'Bad Request');
      return;
    }

    if (!filePath) {
      sendText(response, 403, 'Forbidden');
      return;
    }

    let fileStat;
    try {
      fileStat = await stat(filePath);
    } catch (error) {
      if (error?.code === 'ENOENT') {
        sendText(response, 404, 'Not Found');
        return;
      }
      sendText(response, 500, 'Internal Server Error');
      return;
    }

    if (!fileStat.isFile()) {
      sendText(response, 404, 'Not Found');
      return;
    }

    response.writeHead(200, {
      'Cache-Control': 'no-store',
      'Content-Length': fileStat.size,
      'Content-Type': CONTENT_TYPES.get(extname(filePath).toLowerCase()) ?? 'application/octet-stream',
    });

    if (request.method === 'HEAD') {
      response.end();
      return;
    }

    const stream = createReadStream(filePath);
    stream.on('error', () => {
      if (!response.headersSent) {
        sendText(response, 500, 'Internal Server Error');
      } else {
        response.destroy();
      }
    });
    stream.pipe(response);
  });

  await new Promise((resolveListen, rejectListen) => {
    server.once('error', rejectListen);
    server.listen(0, '127.0.0.1', () => {
      server.off('error', rejectListen);
      resolveListen();
    });
  });

  const address = server.address();
  if (!address || typeof address === 'string') {
    throw new Error('Static test server did not expose a TCP address.');
  }

  let closed = false;
  return {
    origin: `http://127.0.0.1:${address.port}`,
    root: absoluteRoot,
    async close() {
      if (closed) return;
      closed = true;
      await new Promise((resolveClose, rejectClose) => {
        server.close((error) => error ? rejectClose(error) : resolveClose());
        server.closeAllConnections?.();
      });
    },
  };
}
