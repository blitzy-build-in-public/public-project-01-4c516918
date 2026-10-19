import { createServer } from 'node:http';

// An empty or whitespace-only override configures nothing, so it is treated exactly like an unset
// variable: only a deliberate value moves the host off loopback or the port off 3000.
const HOST = process.env.HOST?.trim() || '127.0.0.1';
const PORT = readPort(process.env.PORT);
const BODY = 'Hello world';
const NOT_FOUND_BODY = 'Not Found';
const METHOD_NOT_ALLOWED_BODY = 'Method Not Allowed';

/**
 * Resolve the port to bind from the `PORT` environment value.
 *
 * An unset, empty or whitespace-only value configures no port, so the 3000 default applies. Only a
 * decimal literal is taken as written: `Number()` would also accept `0x10`, `1e3` and `3000.5`,
 * silently binding a port other than the one the reader wrote. Anything else resolves to `NaN`,
 * which `start()` rejects before it listens. An explicit `0` means "any free port" and is kept.
 *
 * @param {string|undefined} raw The `PORT` value as the environment supplies it.
 * @returns {number} The port to bind, or `NaN` for a value that is not a decimal port number.
 */
function readPort(raw) {
  if (raw === undefined || raw.trim() === '') return 3000;
  return /^\d+$/.test(raw.trim()) ? Number(raw.trim()) : NaN;
}

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
 * Report one startup failure on stderr, in a single line.
 *
 * A startup failure is the reader's first impression on that path, so it is never a stack trace: the
 * reason in one line, then a non-zero exit status. The reason is collapsed to one line because it can
 * carry text from the environment - a host name, a socket path - that contains newlines, which would
 * otherwise split the report across several lines.
 *
 * @param {string} reason What went wrong.
 * @returns {void}
 */
function reportStartupFailure(reason) {
  console.error(`Could not start the server: ${String(reason).replace(/[\r\n]+/g, ' ')}`);
  process.exitCode = 1;
}

/**
 * Name a rejected port for the failure line.
 *
 * A value that never resolved to a number is `NaN`, which names nothing the reader wrote, so the
 * `PORT` text it was read from is quoted instead; a text that is itself a port number cannot have
 * produced that `NaN`, so it is not consulted.
 *
 * @param {number|string} port The rejected port value.
 * @returns {string} The offending value as the reader wrote it.
 */
function describePort(port) {
  if (typeof port === 'string') return JSON.stringify(port);
  const raw = process.env.PORT;
  if (Number.isNaN(port) && raw !== undefined && Number.isNaN(readPort(raw))) {
    return JSON.stringify(raw);
  }
  return String(port);
}

/**
 * Render a bound address as the host of a URL.
 *
 * An IPv6 address is an IPv6 literal in a URL only between brackets: without them the startup line
 * would tell the reader to call `http://::1:3000`, which no client accepts. An IPv4 address is
 * emitted unchanged.
 *
 * @param {string} address The bound address, as `server.address()` reports it.
 * @returns {string} The host as it appears in a URL.
 */
function urlHost(address) {
  return address.includes(':') ? `[${address}]` : address;
}

/**
 * Start the server and resolve once it is listening.
 *
 * Host and port default to the `HOST` and `PORT` environment overrides; passing them explicitly is
 * how a caller binds an OS-assigned port (`port: 0`) and reads the bound one back from
 * `server.address().port`. Listening happens only where this module is the entry point, so importing
 * it binds no port.
 *
 * A startup failure - an unusable port, or a bind the runtime refuses - is reported on stderr in one
 * line and sets a non-zero exit status, is never retried, and rejects this promise rather than
 * leaving the caller waiting for a bind that will not happen.
 *
 * @param {{ host?: string, port?: number }} [options] The host and port to bind.
 * @returns {Promise<import('node:http').Server>} The listening server.
 * @throws {RangeError|Error} The reason the server could not start listening.
 */
export async function start({ host = HOST, port = PORT } = {}) {
  const server = createServer(handleRequest);
  // An empty host means an unset one, exactly as an empty `HOST` does: the unspecified address it
  // would otherwise resolve to accepts connections from every interface.
  const bindHost = typeof host === 'string' && host.trim() === '' ? HOST : host;

  await new Promise((resolve, reject) => {
    // One listener, registered before the bind, so a refused bind is reported here rather than raised
    // as an unhandled 'error' event, and so that every failure reaches the caller as a rejection.
    const fail = (err) => {
      reportStartupFailure(err.message);
      reject(err);
    };
    server.on('error', fail);

    // Checked before listening: `listen` throws on a port it cannot use, and a non-numeric value
    // would be taken as the path of an IPC listener instead of a TCP port.
    if (!Number.isInteger(port) || port < 0 || port > 65535) {
      const reason = `the port must be an integer from 0 to 65535, but received ${describePort(port)}`;
      fail(new RangeError(reason));
      return;
    }

    // Also checked before listening: on a non-string host, `listen` reads the value as its backlog
    // and binds the unspecified address, which accepts connections from every interface.
    if (typeof bindHost !== 'string') {
      fail(new TypeError(`the host must be a string, but received ${typeof bindHost}`));
      return;
    }

    try {
      server.listen(port, bindHost, () => {
        const address = server.address();
        console.log(`Server listening on http://${urlHost(address.address)}:${address.port}`);
        resolve();
      });
    } catch (err) {
      fail(err);
    }
  });

  return server;
}

// A failed bind has already been reported in one line and its exit status set, so the rejection is
// caught here: it must never surface as the unhandled stack trace the reader would see first.
if (import.meta.main) await start().catch(() => {});
