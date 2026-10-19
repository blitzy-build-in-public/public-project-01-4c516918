import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { start } from '../server.js';

// Resolves with the event's arguments the first time it fires.
const once = (emitter, event) =>
  new Promise((resolve) => emitter.once(event, (...args) => resolve(args)));

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

test('GET /hello returns 200 with the exact body Hello world', async () => {
  const res = await fetch(`${base}/hello`);
  assert.strictEqual(res.status, 200);
  assert.strictEqual(res.headers.get('content-type'), 'text/plain; charset=utf-8');
  assert.strictEqual(res.headers.get('content-length'), '11');
  assert.strictEqual(await res.text(), 'Hello world');
});

test('GET /nope returns 404 with the body Not Found', async () => {
  const res = await fetch(`${base}/nope`);
  assert.strictEqual(res.status, 404);
  assert.strictEqual(await res.text(), 'Not Found');
});

test('GET /hello/ returns 404 because the path is matched exactly', async () => {
  // Pins the exact-match boundary: a route that matched by prefix would answer 200 here.
  const res = await fetch(`${base}/hello/`);
  assert.strictEqual(res.status, 404);
});

test('POST /hello returns 405 with Allow: GET and the body Method Not Allowed', async () => {
  const res = await fetch(`${base}/hello`, { method: 'POST' });
  assert.strictEqual(res.status, 405);
  assert.strictEqual(res.headers.get('allow'), 'GET');
  assert.strictEqual(await res.text(), 'Method Not Allowed');
});

test('the entry point, run as a child process, serves GET /hello', async () => {
  // HOST is set alongside PORT so the startup line names loopback whatever the reviewer's shell
  // exports, and PORT=0 keeps the tutorial's port free.
  const child = spawn(process.execPath, ['server.js'], {
    env: { ...process.env, HOST: '127.0.0.1', PORT: '0' },
  });
  child.stdout.setEncoding('utf8');
  child.stderr.setEncoding('utf8');

  let stderr = '';
  child.stderr.on('data', (chunk) => {
    stderr += chunk;
  });

  // The startup line is raced against the child's exit, so a child that never prints one — below
  // Node 22.18.0 `import.meta.main` is undefined, so the entry-point guard is falsy — fails this
  // case within seconds instead of hanging the suite.
  let buffered = '';
  let lineArrived;
  const started = new Promise((resolve) => {
    lineArrived = resolve;
  });
  child.stdout.on('data', (chunk) => {
    buffered += chunk;
    const end = buffered.indexOf('\n');
    if (end !== -1) lineArrived(buffered.slice(0, end).trim());
  });

  try {
    const settled = await Promise.race([
      started.then((line) => ({ line })),
      once(child, 'exit').then(([code, signal]) => ({ code, signal })),
    ]);
    assert.ok(
      'line' in settled,
      `the entry point exited (code ${settled.code}, signal ${settled.signal}) without printing its startup line; ` +
        `it requires Node.js 22.18.0 or later, and it wrote to stderr: ${stderr.trim() || '(nothing)'}`,
    );

    assert.match(settled.line, /^Server listening on http:\/\/127\.0\.0\.1:\d+$/);
    const port = Number(settled.line.slice(settled.line.lastIndexOf(':') + 1));

    const res = await fetch(`http://127.0.0.1:${port}/hello`);
    assert.strictEqual(res.status, 200);
    assert.strictEqual(await res.text(), 'Hello world');
  } finally {
    // No child outlives the suite. The listener is registered before the kill so that a child which
    // is still running is waited for, while one that has already exited is not waited on at all.
    if (child.exitCode === null && child.signalCode === null) {
      const exited = once(child, 'exit');
      child.kill();
      await exited;
    }
  }
});
