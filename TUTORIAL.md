# A minimal Node.js HTTP server: one endpoint, `Hello world`

This is a small Node.js tutorial project. It runs one HTTP server on the runtime's own `node:http`
module, and it features exactly one endpoint: a `GET` to the path `/hello` returns the literal text
`Hello world` to the calling HTTP client. There is no framework, no database, no build step and no
dependency of any kind, so a clean checkout runs in seconds and the whole server is one file you can
read in a sitting. `test/hello.test.js` checks the endpoint over a real socket with the runtime's own
test runner, and this document is the path through the project: check the runtime, start the server,
make the request, see which file teaches what, run the test, and know where the exercise ends.

## Prerequisites

Node.js 22.18.0 or later, on the latest patch release of whichever supported line you run. Check
the version before anything else:

```
node --version     # expect v22.18.0 or later
```

- 22.18.0 is a **feature** floor rather than a security floor: it is the oldest runtime with the
  entry-point guard `server.js` uses, `import.meta.main`, and the floor is recorded in `package.json`
  as `engines.node: ">=22.18.0"`. Node 24.x (Active LTS) and current 22.x patch releases satisfy it.
- **Run the latest patch of your line.** Node ships its fixes for the platform itself — `node:http`,
  the module this server is built on, included — in new releases of every supported line, so 22.18.0
  and the other early 22.x patches predate the fixes published since. `engines.node` is a semver
  range and cannot express a patch floor, so this check is what keeps you patched: `node --version`
  should show the newest patch of the line you are on — 22.x is Maintenance LTS to 2027-04-30, 24.x
  is Active LTS — and not merely 22.18.0.
- npm ships with Node.js and is the only package-manager assumption here. It is used for the two
  scripts `npm start` and `npm test`, and for nothing else.
- **No install step is required at all.** The project declares no dependency — no `dependencies`, no
  `devDependencies`, no lock file — so there is nothing to download. Do not wait for one.

### If no startup line appears

On a runtime older than 22.18.0 — 20.x, 18.x — `npm start` runs the script and the server prints no
startup line: the process exits with status 0. npm's banner still appears — the two `>` lines
**Run it** describes — so what is missing is the `Server listening on` line, not all of the output.
Nothing is being swallowed: `import.meta.main` is `undefined` there, so the guard that begins
listening is falsy exactly as it is when the file is imported, and the process simply ends. It is a
silent no-op, not an error. `node --version` is the diagnosis, and running on 22.18.0 or later — on
the latest patch of the line you choose — is the fix.

The test suite catches the same mistake: its final case starts the entry point in a child process
and fails when no startup line arrives, so on an old runtime `npm test` fails loudly instead of
passing silently.

## Run it

From the repository root:

```
node server.js        # start the server
npm start             # the same thing, via the manifest's start script
```

The server prints one line and stays in the foreground until you stop it:

```
Server listening on http://127.0.0.1:3000
```

Through `npm start` you also see npm's own script banner (`> nodejs-hello-world-tutorial@1.0.0 start`
and the command it runs) printed above that line; `node server.js` prints the line alone. Either way
the process stays in the foreground until you stop it with `Ctrl+C`, and the endpoint is then at
`http://127.0.0.1:3000/hello`.

### Change the host and the port

Both defaults are overridable from the environment, without editing code:

| Setting | Default | Override |
|---|---|---|
| Host | `127.0.0.1` (loopback only) | `HOST` |
| Port | `3000` | `PORT` |

| Shell | Start on port 4000 |
|---|---|
| bash / zsh | `PORT=4000 npm start` |
| PowerShell | `$env:PORT = 4000; npm start` |
| Windows cmd | `set PORT=4000 && npm start` |

The startup line follows the port, and so does the URL: `Server listening on http://127.0.0.1:4000`,
then `http://127.0.0.1:4000/hello`.

`HOST` takes the same three forms:

| Shell | Listen on every interface |
|---|---|
| bash / zsh | `HOST=0.0.0.0 npm start` |
| PowerShell | `$env:HOST = "0.0.0.0"; npm start` |
| Windows cmd | `set HOST=0.0.0.0 && npm start` |

The startup line names the address the server actually bound, so this change does show up in it:
`HOST=0.0.0.0 npm start` prints `Server listening on http://0.0.0.0:3000`. That address is a bind
address rather than one to call — `0.0.0.0` means every interface on this machine — and the
client URL does not change with `HOST`: from this machine the endpoint is still
`http://127.0.0.1:3000/hello`, or `http://127.0.0.1:<port>/hello` when you have set `PORT` too.
Another machine on the network reaches it at `http://<machine-ip>:3000/hello`.

**`HOST=0.0.0.0` exposes the listener to your local network** — anyone who can reach the machine can
call the endpoint. That is exactly why the default is `127.0.0.1`, which accepts connections from
this machine only. Keep the default unless you want that exposure.

### If the port is already in use

The process reports it in one line and exits with a non-zero status. It does not retry:

```
Could not start the server: listen EADDRINUSE: address already in use 127.0.0.1:3000
```

Start it on another port — `PORT=4000 npm start` — rather than waiting for the port to free up.

## Make the request

`curl -i` prints the status line and the headers along with the body:

```
$ curl -i http://127.0.0.1:3000/hello
HTTP/1.1 200 OK
Content-Type: text/plain; charset=utf-8
Content-Length: 11
Date: <varies with each request>
Connection: keep-alive
Keep-Alive: timeout=5

Hello world
```

Four of those lines are the contract:

| Line | Value |
|---|---|
| Status line | `HTTP/1.1 200 OK` |
| `Content-Type` | `text/plain; charset=utf-8` |
| `Content-Length` | `11` |
| Body | `Hello world` — 11 bytes: no period, no trailing newline, no JSON quoting |

`Date`, `Connection: keep-alive` and `Keep-Alive: timeout=5` are added by Node, their values vary
from request to request, and they are not part of the contract.

`Content-Length` counts **bytes**, not characters, which is why the code measures the body with
`Buffer.byteLength(body)` instead of using `body.length`. For `Hello world` the two agree, because
the text is pure ASCII; for a body containing any multi-byte character they would not.

## Everything else: the boundary

A server that answers one path still has to answer every other request, or the one path cannot be
verified. These are the requests to try next:

| Request | Status | Headers to check | Body |
|---|---|---|---|
| `curl -i http://127.0.0.1:3000/nope` | `404 Not Found` | `Content-Type: text/plain; charset=utf-8`, `Content-Length: 9` | `Not Found` |
| `curl -i -X POST http://127.0.0.1:3000/hello` | `405 Method Not Allowed` | `Allow: GET`, `Content-Type: text/plain; charset=utf-8`, `Content-Length: 18` | `Method Not Allowed` |
| `curl -I http://127.0.0.1:3000/hello` | `405 Method Not Allowed` | as the row above | none |

The 404 exchange in full:

```
$ curl -i http://127.0.0.1:3000/nope
HTTP/1.1 404 Not Found
Content-Type: text/plain; charset=utf-8
Content-Length: 9
Date: <varies with each request>
Connection: keep-alive
Keep-Alive: timeout=5

Not Found
```

and the 405:

```
$ curl -i -X POST http://127.0.0.1:3000/hello
HTTP/1.1 405 Method Not Allowed
Content-Type: text/plain; charset=utf-8
Content-Length: 18
Allow: GET
Date: <varies with each request>
Connection: keep-alive
Keep-Alive: timeout=5

Method Not Allowed
```

`HEAD /hello` follows the 405 row: the status line and the headers arrive with **zero body bytes**,
because Node suppresses response content for a `HEAD` request even though `Content-Length` is
declared. Send it with `curl -I`; `curl -X HEAD` waits for a body that never arrives.

Four consequences of this boundary are deliberate rather than defects:

- `/hello/` and `/hello?x=1` are `404`. The path is compared as a literal string and no URL parsing
  is done, so a trailing slash or a query string makes the URL something other than `/hello`.
- `/HELLO` is `404`, because the comparison is case-sensitive.
- Nothing outside the exact pair `GET` + `/hello` ever returns `200`.
- `Allow` on the 405 is always exactly `GET`, the only method the resource supports.

### Without curl

Open `http://127.0.0.1:3000/hello` in a browser and it shows the same `Hello world`, rendered as
plain text. A browser cannot show you the raw headers, so use it for the body and `curl -i` for the
response metadata.

## Files, and what each one teaches

### `server.js` — the whole server

- The **`node:http` import**, and with it how the runtime's own HTTP server is created with no
  framework in between.
- The **defaults and their overrides** — `HOST` and `PORT` are read from the environment once, at
  startup, and fall back to `127.0.0.1` and `3000`.
- The **handler's match order** — `handleRequest(req, res)` compares `req.url` first and
  `req.method` second. That order is what makes the boundary deterministic: an unknown path is a
  `404` whatever its method, and only the exact URL `/hello` under a method other than `GET`
  becomes a `405`.
- The **response helper** — `respond(res, status, body, extraHeaders)` writes status, headers and
  body in one place, so no branch can drift from the contract. It sets two headers by hand: the
  media type in full, because Node appends no charset, and the length measured in bytes, because
  Node computes no `Content-Length` for the caller and would otherwise fall back to chunked
  encoding.
- The **`start({ host, port })` factory** — it returns a `Promise` that resolves with the listening
  server, so a caller can await the bind and read the port actually assigned from
  `server.address().port`. That is how the test binds a free, OS-assigned port. It **rejects** when
  the port cannot be bound: the failure is reported in one line with a non-zero exit status, so a
  caller is never left waiting for a bind that will not happen.
- The **`'error'` listener** — one line to stderr and a non-zero exit status, no retry loop and no
  unhandled stack trace as your first impression of the project.
- The **entry-point guard** — `if (import.meta.main) await start().catch(() => {});` begins listening
  only when the file is run directly; the rejection is caught there because a failed bind has already
  been reported in one line. Import it from a test or a script and no port is bound, which is what
  lets the test import the module without taking port 3000.

### `package.json` — the manifest

- **`"type": "module"`** makes every `.js` file in the package an ES module, so `server.js` and the
  test use `import`/`export` and relative specifiers carry their extension
  (`import { start } from '../server.js'`).
- **`engines.node: ">=22.18.0"`** records the runtime floor. npm treats that field as advisory, and a
  semver range cannot express a patch floor, which is why this document repeats the check — and the
  patch-level expectation — in Prerequisites.
- **The two scripts** are the commands to type: `start` runs `node server.js`, and `test` runs
  `node --test test/hello.test.js`.

### `test/hello.test.js` — the automated check

An endpoint can be checked over real HTTP with nothing but the runtime:

- `start({ port: 0 })` binds an OS-assigned port and `server.address().port` reads it back, so the
  suite never needs port 3000 and never collides with a server you already have running.
- The global `fetch` is the client, so no HTTP client package is needed.
- Between them the cases pin the contract character for character: the status of every request,
  the `Content-Type` and `Content-Length` of the 200, the `Allow: GET` of the 405, and every body
  text the suite reads.
- The last case spawns the entry point itself in a child process, asserts the startup line it
  prints and issues a request through it. That is the case that catches a runtime older than the
  floor, where the guard never fires and no startup line ever arrives.

### `TUTORIAL.md` — this file

The reader's path: the prerequisite check, the commands, the expected exchanges, and where the
exercise ends. `README.md` is left as it is, so this is the place to look for all of it.

## Run the test

```
npm test        # runs: node --test test/hello.test.js
```

No install step first, and no server needs to be running already: the suite binds its own
OS-assigned port. It issues real HTTP requests, and it passes only when all five cases hold:

| Case | Assertions |
|---|---|
| `GET /hello` | `200`; `Content-Type` exactly `text/plain; charset=utf-8`; `Content-Length` exactly `11`; body exactly `Hello world` |
| `GET /nope` | `404`; body `Not Found` |
| `GET /hello/` | `404` — pins the exact-match boundary, so a later change cannot silently widen the route |
| `POST /hello` | `405`; `Allow` exactly `GET`; body `Method Not Allowed` |
| the entry point, run as a child process | the startup line `Server listening on http://127.0.0.1:<port>`, then `GET /hello` through it returns `200` with the body `Hello world` |

Because the body assertion is a strict equality against the text of a real response, the suite
proves the requirement itself rather than a paraphrase of it. The runner exits non-zero on any
failure.

## Where the tutorial ends

The finish line is one sentence: from a clean checkout, `npm start` serves `GET /hello`, and the
calling HTTP client — `curl`, a browser or the test's `fetch` — receives `Hello world`. The test and
the transcripts above are how you prove it.

That is the whole project: four files, one endpoint, no dependency. The natural next exercises, in
rough order of difficulty — the first four live in `server.js`, the fifth also adds a dependency to
`package.json`, and the last one adds files of its own:

- Parse the URL so that `/hello?x=1` and `/hello/` still match.
- Add a second route, and see at what point a router starts to earn its keep.
- Return JSON instead of text, and set `application/json`.
- Add a request log line describing each request the server answers.
- Replace `node:http` with a framework and compare the two side by side: what you gain, and what
  the endpoint's routing, status and header decisions become.
- Containerise it, then add a CI workflow that runs `npm test`.

Each of those is an exercise for you, not something this project leaves half-finished.
