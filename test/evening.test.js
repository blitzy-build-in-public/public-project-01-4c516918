import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { start } from '../server.js';

let server;
let base;

before(async () => {
  // Port 0 lets the OS choose, so the suite never needs the tutorial's port 3000.
  server = await start({ port: 0 });
  // An inherited HOST would decide the bound address, so the client URL is derived from the address
  // actually bound rather than from the environment; a wildcard bind is reached over loopback, and an
  // IPv6 literal is bracketed because a URL host cannot carry one bare.
  const { address, port } = server.address();
  const host = address === '0.0.0.0' || address === '::' ? '127.0.0.1' : address;
  const urlHost = host.includes(':') ? `[${host}]` : host;
  base = `http://${urlHost}:${port}`;
});

after(async () => {
  if (!server) return;
  // fetch keeps its sockets alive, so they are closed first: server.close() alone would wait out
  // the keep-alive timeout before the suite could finish.
  server.closeAllConnections();
  await new Promise((resolve) => {
    server.close(resolve);
  });
});

test('GET /evening returns 200 with the exact body Good evening', async () => {
  const res = await fetch(`${base}/evening`);
  assert.strictEqual(res.status, 200);
  assert.strictEqual(res.headers.get('content-type'), 'text/plain; charset=utf-8');
  assert.strictEqual(res.headers.get('content-length'), '12');
  assert.strictEqual(await res.text(), 'Good evening');
  // Left on, the framework's defaults would advertise it (`X-Powered-By`) on every response it handles,
  // this endpoint's and the hand-written one's alike, while an entity tag is generated only for a
  // response the framework writes itself; neither response here is one, and both defaults are turned
  // off, so their absence is the header surface the contract publishes.
  assert.strictEqual(res.headers.get('x-powered-by'), null);
  assert.strictEqual(res.headers.get('etag'), null);

  // The published answer must not be replaceable by a conditional request: the framework's send path
  // reads `If-None-Match: *` as a match and would answer `304` with the media type, the length and the
  // body stripped, which would let a caller tell this endpoint from the hand-written one, whose answers
  // are written without reading a request header.
  //
  // The `cache-control: max-age=0` header has to be on the request rather than left to the client,
  // which adds a `no-cache` directive of its own to a request that carries a conditional header: a
  // no-cache request is never fresh, so the validator is not evaluated at all — without `max-age=0`
  // the writer this case exists to reject would answer `200` here too, and the case could not fail.
  const conditional = await fetch(`${base}/evening`, {
    headers: { 'If-None-Match': '*', 'cache-control': 'max-age=0' },
  });
  assert.strictEqual(conditional.status, 200);
  assert.strictEqual(conditional.headers.get('content-type'), 'text/plain; charset=utf-8');
  assert.strictEqual(conditional.headers.get('content-length'), '12');
  assert.strictEqual(await conditional.text(), 'Good evening');
});

test('GET /evening/ returns 404 because the path is matched exactly', async () => {
  // Pins the exact-match boundary: route matching that ignored the trailing slash would answer 200.
  const res = await fetch(`${base}/evening/`);
  assert.strictEqual(res.status, 404);
  // The 404 is the project's own answer rather than the framework's HTML page, and a status alone cannot
  // tell the two apart, so the media type, the byte count and the body the boundary publishes are
  // asserted beside it.
  assert.strictEqual(res.headers.get('content-type'), 'text/plain; charset=utf-8');
  assert.strictEqual(res.headers.get('content-length'), '9');
  assert.strictEqual(await res.text(), 'Not Found');

  // The route claims exactly one path, not the subtree below it: a registration matched by prefix would
  // answer 200 here, where the boundary publishes the same answer as for any other unregistered URL.
  const below = await fetch(`${base}/evening/x`);
  assert.strictEqual(below.status, 404);
  assert.strictEqual(below.headers.get('content-type'), 'text/plain; charset=utf-8');
  assert.strictEqual(below.headers.get('content-length'), '9');
  assert.strictEqual(await below.text(), 'Not Found');

  // The one divergence, accepted deliberately: the framework matches the path component of the
  // URL while the project's own handler compares the whole URL string, so a query string is answered here
  // and stays a 404 on /hello. Pinned rather than normalised, because matching the URL literally inside
  // the framework would discard the routing the framework was added for.
  const queried = await fetch(`${base}/evening?x=1`);
  assert.strictEqual(queried.status, 200);
  assert.strictEqual(queried.headers.get('content-type'), 'text/plain; charset=utf-8');
  assert.strictEqual(queried.headers.get('content-length'), '12');
  assert.strictEqual(await queried.text(), 'Good evening');

  const queriedHello = await fetch(`${base}/hello?x=1`);
  assert.strictEqual(queriedHello.status, 404);
});

test('GET /EVENING returns 404 because routing is case-sensitive', async () => {
  // The other half of the same boundary: matching that ignored case would answer 200 here.
  const res = await fetch(`${base}/EVENING`);
  assert.strictEqual(res.status, 404);
  // As on the trailing-slash boundary, the 404 is the project's own plain-text answer rather than the
  // framework's HTML page, so the published media type, byte count and body are asserted with it.
  assert.strictEqual(res.headers.get('content-type'), 'text/plain; charset=utf-8');
  assert.strictEqual(res.headers.get('content-length'), '9');
  assert.strictEqual(await res.text(), 'Not Found');
});

test('POST /evening returns 405 with Allow: GET and the body Method Not Allowed', async () => {
  const res = await fetch(`${base}/evening`, { method: 'POST' });
  assert.strictEqual(res.status, 405);
  assert.strictEqual(res.headers.get('allow'), 'GET');
  assert.strictEqual(res.headers.get('content-type'), 'text/plain; charset=utf-8');
  assert.strictEqual(res.headers.get('content-length'), '18');
  assert.strictEqual(await res.text(), 'Method Not Allowed');
});

test('HEAD /evening returns 405 with Allow: GET and no body', async () => {
  // The method rule decides ahead of the route, so HEAD takes it too rather than being answered by
  // the GET route: the same status and headers come back with the body Node suppresses for HEAD.
  const res = await fetch(`${base}/evening`, { method: 'HEAD' });
  assert.strictEqual(res.status, 405);
  assert.strictEqual(res.headers.get('allow'), 'GET');
  assert.strictEqual(res.headers.get('content-type'), 'text/plain; charset=utf-8');
  assert.strictEqual(res.headers.get('content-length'), '18');
  assert.strictEqual(await res.text(), '');
});

test('GET /hello is served by the same listener', async () => {
  // Pins the composition itself: one process, one listener, and `/hello` answered by the hand-written
  // handler the framework falls back to for every request it does not claim.
  const res = await fetch(`${base}/hello`);
  assert.strictEqual(res.status, 200);
  assert.strictEqual(res.headers.get('content-type'), 'text/plain; charset=utf-8');
  assert.strictEqual(res.headers.get('content-length'), '11');
  assert.strictEqual(await res.text(), 'Hello world');
  // The framework sees this response too, on its way to the fallback, so the advertisement header it
  // would add there, `X-Powered-By`, is turned off as well: what this endpoint publishes is the header
  // surface its contract describes, which keeps the two endpoints indistinguishable to a caller.
  assert.strictEqual(res.headers.get('x-powered-by'), null);
  assert.strictEqual(res.headers.get('etag'), null);
});
