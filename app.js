import express from 'express';

const EVENING_BODY = 'Good evening';
const METHOD_NOT_ALLOWED_BODY = 'Method Not Allowed';

/**
 * Build the Express application that serves `GET /evening` beside the project's hand-written handler.
 *
 * The framework owns one route and the method rule that guards it. Every request it does not claim is
 * passed to `fallback`, the project's own handler, which is mounted last — so `GET /hello` and the
 * boundary answers around it keep being produced by the code that produced them before, and no list of
 * paths lives in two places for the two to disagree about.
 *
 * Four of the framework's defaults are overridden below, once, because each one would otherwise be
 * visible to a client: the framework advertises itself on every response it handles, the responses
 * written by a handler mounted in its chain included, generates an entity tag on the responses it
 * writes itself, and matches a route against the trailing-slash and differently-cased forms of its
 * path. Overridden, the endpoint here and the endpoint the framework does not serve are
 * indistinguishable in status, media type, headers and body.
 *
 * @param {{ fallback: (req: import('node:http').IncomingMessage, res: import('node:http').ServerResponse) => void }} options
 *   `fallback` answers every request no route here claims and is expected to end the response itself.
 * @returns {import('express').Express} The application, usable directly as a request listener.
 */
export function createApp({ fallback }) {
  const app = express();

  // Both headers describe the framework rather than the answer, and the advertisement is added to every
  // response the application handles, `fallback`'s included: either would change what the existing
  // endpoint returns, so both are turned off rather than explained in the published contract.
  app.disable('x-powered-by');
  app.set('etag', false);

  // A route path is not matched as a literal string: without these the trailing-slash and
  // differently-cased forms of the path would answer `200` where every other unrecognised URL answers
  // `404`, which would publish a second matching rule for one endpoint.
  app.set('strict routing', true);
  app.set('case sensitive routing', true);

  /**
   * The method rule for this path, registered ahead of the route so it decides first: any method other
   * than `GET` is answered `405 Method Not Allowed` with `Allow: GET`, the same status, header and body
   * the project's own handler answers a non-`GET` on the path it owns, so a caller cannot tell which
   * endpoint the framework serves. `HEAD` takes this branch too, which is why the rule is a gate rather
   * than the route's method list — the framework would otherwise answer `HEAD` through the `GET` route.
   *
   * @param {import('express').Request} req The request, whose method has already been matched.
   * @param {import('express').Response} res The response to write.
   * @param {import('express').NextFunction} next Continues to the `GET` route when the method is `GET`.
   * @returns {void}
   */
  app.all('/evening', (req, res, next) => {
    if (req.method === 'GET') return next();
    res.status(405).type('text/plain').set('Allow', 'GET').send(METHOD_NOT_ALLOWED_BODY);
  });

  /**
   * `GET /evening` — `200 OK`, `text/plain; charset=utf-8`, the body `Good evening`.
   *
   * The media type is set explicitly because the contract publishes `text/plain; charset=utf-8`, where
   * the framework's default for a string body is `text/html`.
   *
   * The response is written with the response object rather than through `res.send`, because `res.send`
   * reads the request as a conditional one: a request carrying `If-None-Match: *` makes it replace this
   * `200` with a `304` and drop the media type, the length and the body, which would let a caller tell
   * this endpoint from the one the project's own handler answers. So the status and the media type are
   * set, the length is measured in bytes, and the body is ended directly: the three values the
   * project's own writer writes for its own outcomes.
   *
   * The framework matches the path component of the URL while the project's own handler compares the
   * whole URL string, so `GET /evening?x=1` answers `200` where `GET /hello?x=1` answers `404`. That
   * divergence is known, confined to this path, and accepted: matching the URL literally inside the
   * framework would discard the routing the framework was brought in for.
   *
   * @param {import('express').Request} req The incoming request.
   * @param {import('express').Response} res The response to write.
   * @returns {void}
   */
  app.get('/evening', (req, res) => {
    res.status(200).type('text/plain');
    res.set('Content-Length', Buffer.byteLength(EVENING_BODY));
    res.end(EVENING_BODY);
  });

  // Mounted last, so it sees exactly the requests nothing above claimed — which is what makes an
  // unregistered URL a `404 Not Found` from the project's own handler rather than the framework's
  // default answer.
  app.use(fallback);

  return app;
}
