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
  // The framework's defaults would add both headers, and to every response it handles — the
  // hand-written endpoint's included — so their absence is the header surface the contract publishes.
  assert.strictEqual(res.headers.get('x-powered-by'), null);
  assert.strictEqual(res.headers.get('etag'), null);
});

test('GET /evening/ returns 404 because the path is matched exactly', async () => {
  // Pins the exact-match boundary: route matching that ignored the trailing slash would answer 200.
  const res = await fetch(`${base}/evening/`);
  assert.strictEqual(res.status, 404);
});

test('GET /EVENING returns 404 because routing is case-sensitive', async () => {
  // The other half of the same boundary: matching that ignored case would answer 200 here.
  const res = await fetch(`${base}/EVENING`);
  assert.strictEqual(res.status, 404);
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
  assert.strictEqual(res.headers.get('content-length'), '18');
  assert.strictEqual(await res.text(), '');
});

test('GET /hello is served by the same listener', async () => {
  // Pins the composition itself: one process, one listener, and the endpoint the framework does not
  // serve still answering from the handler that answered it before.
  const res = await fetch(`${base}/hello`);
  assert.strictEqual(res.status, 200);
  assert.strictEqual(res.headers.get('content-type'), 'text/plain; charset=utf-8');
  assert.strictEqual(res.headers.get('content-length'), '11');
  assert.strictEqual(await res.text(), 'Hello world');
});
