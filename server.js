import { createServer } from 'node:http';

const HOST = process.env.HOST ?? '127.0.0.1';
const PORT = Number(process.env.PORT ?? 3000);
const BODY = 'Hello world';
const NOT_FOUND_BODY = 'Not Found';
const METHOD_NOT_ALLOWED_BODY = 'Method Not Allowed';

/**
 * Write one plain-text response: its status, the headers the client needs, and its body.
 *
 * The media type is written in full because Node appends no charset, and the length is measured in
 * bytes rather than characters because Node computes no `Content-Length` on the caller's behalf.
 *
 * @param {import('node:http').ServerResponse} res The response to write.
 * @param {number} status The HTTP status code to send.
 * @param {string} body The response body, sent as UTF-8 plain text.
 * @param {Record<string, string>} [extraHeaders] Headers this outcome adds, such as `Allow`.
 * @returns {void}
 */
function respond(res, status, body, extraHeaders = {}) {
  res.writeHead(status, {
    'Content-Type': 'text/plain; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
    ...extraHeaders,
  });
  res.end(body);
}

/**
 * Answer one request.
 *
 * The URL is matched before the method, which is what makes the boundary deterministic: an unknown
 * path is a `404` whatever its method, and only the exact URL `/hello` under a method other than
 * `GET` is a `405`. `GET /hello` returns `200 OK` with the body `Hello world`; any other URL returns
 * `404 Not Found` with the body `Not Found`; `/hello` under any other method returns
 * `405 Method Not Allowed` with the body `Method Not Allowed` and an `Allow: GET` header.
 *
 * The request stream is never read: the URL and method are compared as literals and nothing sent in
 * a body is parsed, so Node discards an unconsumed request body when the response ends.
 *
 * @param {import('node:http').IncomingMessage} req The incoming request.
 * @param {import('node:http').ServerResponse} res The response to write.
 * @returns {void}
 */
export function handleRequest(req, res) {
  if (req.url !== '/hello') {
    respond(res, 404, NOT_FOUND_BODY);
    return;
  }
  if (req.method !== 'GET') {
    respond(res, 405, METHOD_NOT_ALLOWED_BODY, { Allow: 'GET' });
    return;
  }
  respond(res, 200, BODY);
}

/**
 * Start the server and resolve once it is listening.
 *
 * Host and port default to the `HOST` and `PORT` environment overrides; passing them explicitly is
 * how a caller binds an OS-assigned port (`port: 0`) and reads the bound one back from
 * `server.address().port`. Listening happens only where this module is the entry point, so importing
 * it binds no port.
 *
 * @param {{ host?: string, port?: number }} [options] The host and port to bind.
 * @returns {Promise<import('node:http').Server>} The listening server.
 */
export async function start({ host = HOST, port = PORT } = {}) {
  const server = createServer(handleRequest);
  server.on('error', (err) => {
    console.error(`Could not start the server: ${err.message}`);
    process.exitCode = 1;
  });
  await new Promise((resolve) => {
    server.listen(port, host, () => {
      const address = server.address();
      console.log(`Server listening on http://${address.address}:${address.port}`);
      resolve();
    });
  });
  return server;
}

if (import.meta.main) await start();
