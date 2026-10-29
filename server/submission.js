import { createHash } from 'node:crypto';
import { RECRUITERS, RATINGS, MAX_FEEDBACK_LENGTH, classifyResponse } from '../src/survey.js';

export const MAX_BODY_BYTES = 40 * 1024;
const REQUEST_KEYS = ['requestId', 'recruiterName', 'professionalismRating', 'roleClarityRating', 'overallRating', 'recruiterFeedback', 'processImprovements', 'website'];
const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const UNSAFE_TEXT = /[\u0000-\u0009\u000b-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069]/u;

function result(status, body, extraHeaders = {}) {
  return Response.json(body, {
    status,
    headers: { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', ...extraHeaders },
  });
}

function event(logger, outcome) {
  // Fixed categories only. Never log answers, IPs, request bodies, or secrets.
  logger?.info?.(JSON.stringify({ event: 'survey_submission', outcome }));
}

function normalizedFeedback(value) {
  const text = value.replace(/\r\n?/g, '\n').trim();
  return text && text.length <= MAX_FEEDBACK_LENGTH && !UNSAFE_TEXT.test(text) ? text : null;
}

export function validateSubmission(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return null;
  if (Object.keys(body).length !== REQUEST_KEYS.length) return null;
  if (REQUEST_KEYS.some((key) => !Object.hasOwn(body, key) || typeof body[key] !== 'string')) return null;
  const requestId = body.requestId.trim();
  const recruiterFeedback = normalizedFeedback(body.recruiterFeedback);
  const processImprovements = normalizedFeedback(body.processImprovements);
  if (!UUID_V4.test(requestId) || !RECRUITERS.includes(body.recruiterName)
    || !RATINGS.includes(body.professionalismRating)
    || !RATINGS.includes(body.roleClarityRating)
    || !RATINGS.includes(body.overallRating)
    || !recruiterFeedback || !processImprovements || body.website.trim()) return null;
  return {
    requestId, recruiterName: body.recruiterName,
    professionalismRating: body.professionalismRating,
    roleClarityRating: body.roleClarityRating,
    overallRating: body.overallRating,
    recruiterFeedback, processImprovements,
  };
}

export function responseIdFor(submission) {
  // Identical retries share a Sheets key; changed answers cannot overwrite that row.
  const hash = createHash('sha256').update(JSON.stringify([
    submission.requestId, submission.recruiterName,
    submission.professionalismRating, submission.roleClarityRating,
    submission.overallRating, submission.recruiterFeedback,
    submission.processImprovements,
  ])).digest('hex');
  return `${hash.slice(0, 8)}-${hash.slice(8, 12)}-4${hash.slice(13, 16)}-a${hash.slice(17, 20)}-${hash.slice(20, 32)}`;
}

async function readSmallJson(request) {
  const length = request.headers.get('content-length');
  if (length !== null && (!/^\d+$/.test(length) || Number(length) > MAX_BODY_BYTES)) return { error: 413 };
  if (!request.body) return { error: 400 };
  const reader = request.body.getReader();
  const chunks = [];
  let bytes = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > MAX_BODY_BYTES) {
        await reader.cancel();
        return { error: 413 };
      }
      chunks.push(value);
    }
    const decoded = new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(chunks, bytes));
    return { body: JSON.parse(decoded) };
  } catch {
    return { error: 400 };
  }
}

function webhookConfig(env, { allowLocalHttp, allowTestWebhook }) {
  const secret = env.N8N_WEBHOOK_SECRET;
  if (typeof secret !== 'string' || secret.length < 32) return null;
  try {
    const url = new URL(env.N8N_WEBHOOK_URL);
    const localHttp = allowLocalHttp && url.protocol === 'http:' && ['127.0.0.1', 'localhost'].includes(url.hostname);
    if (url.protocol !== 'https:' && !localHttp) return null;
    const productionPath = url.pathname.startsWith('/webhook/');
    const testPath = allowTestWebhook && url.pathname.startsWith('/webhook-test/');
    if ((!productionPath && !testPath) || url.username || url.password || url.search || url.hash) return null;
    return { url: url.href, secret };
  } catch {
    return null;
  }
}

export function createSubmissionHandler({ env = process.env, fetchImpl = fetch, logger = console, allowLocalHttp = false, allowTestWebhook = false } = {}) {
  return async function submit(request) {
    const url = new URL(request.url);
    if (url.pathname !== '/api/submit' || url.search) return result(404, { ok: false });
    if (request.method !== 'POST') return result(405, { ok: false }, { Allow: 'POST' });

    // Origin and Fetch Metadata are browser-abuse checks, not user authentication.
    const origin = request.headers.get('origin');
    const site = request.headers.get('sec-fetch-site');
    if (origin !== url.origin || (site && site !== 'same-origin' && site !== 'none')) {
      event(logger, 'cross_origin');
      return result(403, { ok: false });
    }
    const type = request.headers.get('content-type')?.toLowerCase().replace(/\s+/g, '');
    if (type !== 'application/json' && type !== 'application/json;charset=utf-8') {
      event(logger, 'wrong_content_type');
      return result(415, { ok: false });
    }
    const parsed = await readSmallJson(request);
    if (parsed.error) {
      event(logger, parsed.error === 413 ? 'oversize' : 'invalid_json');
      return result(parsed.error, { ok: false });
    }
    if (typeof parsed.body?.website === 'string' && parsed.body.website.trim()) {
      event(logger, 'honeypot');
      return result(400, { ok: false });
    }
    const validated = validateSubmission(parsed.body);
    if (!validated) {
      event(logger, 'invalid_input');
      return result(400, { ok: false });
    }

    const localRequest = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
    const config = webhookConfig(env, { allowLocalHttp, allowTestWebhook: allowTestWebhook && localRequest });
    if (!config) {
      event(logger, 'server_unconfigured');
      return result(503, { ok: false });
    }
    const { requestId, ...answers } = validated;
    const payload = { responseId: responseIdFor(validated), ...answers, website: '' };
    try {
      const upstream = await fetchImpl(config.url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-OPG-Survey-Key': config.secret },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(10000),
        redirect: 'error',
        cache: 'no-store',
      });
      const upstreamBody = await upstream.json().catch(() => null);
      if (classifyResponse(upstream.status, upstreamBody) !== 'success') {
        event(logger, 'upstream_failure');
        return result(502, { ok: false });
      }
      event(logger, 'saved');
      return result(200, { ok: true, status: 'saved' });
    } catch {
      event(logger, 'upstream_failure');
      return result(502, { ok: false });
    }
  };
}
