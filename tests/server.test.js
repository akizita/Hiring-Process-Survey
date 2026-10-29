import test from 'node:test';
import assert from 'node:assert/strict';
import { createSubmissionHandler, MAX_BODY_BYTES, responseIdFor, validateSubmission } from '../server/submission.js';
import { prepareResponse, validateSurveyRequest } from '../automation/workflow-logic.js';

const origin = 'https://survey.example';
const secret = 'test-secret-at-least-thirty-two-characters';
const env = { N8N_WEBHOOK_URL: 'https://n8n.example/webhook/opg-recruitment-feedback-secure-v1', N8N_WEBHOOK_SECRET: secret };
const valid = {
  requestId: 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee',
  recruiterName: 'Ella', professionalismRating: '5', roleClarityRating: '4', overallRating: '5',
  recruiterFeedback: 'The recruiter explained the timeline clearly.',
  processImprovements: 'A clearer next-step email would help.', website: '',
};

function request(body = valid, { method = 'POST', type = 'application/json', requestOrigin = origin, site = 'same-origin', url = `${origin}/api/submit` } = {}) {
  return new Request(url, {
    method,
    headers: { Origin: requestOrigin, 'Content-Type': type, 'Sec-Fetch-Site': site },
    body: method === 'POST' ? JSON.stringify(body) : undefined,
  });
}

function harness(upstream = () => Response.json({ ok: true, status: 'saved' })) {
  const calls = [];
  const logs = [];
  const handler = createSubmissionHandler({
    env,
    fetchImpl: async (url, options) => {
      calls.push({ url, options, body: JSON.parse(options.body) });
      return upstream(url, options);
    },
    logger: { info: (entry) => logs.push(entry) },
  });
  return { handler, calls, logs };
}

test('valid POST forwards only validated answers with server-only authentication', async () => {
  const { handler, calls } = harness();
  const response = await handler(request());
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { ok: true, status: 'saved' });
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, env.N8N_WEBHOOK_URL);
  assert.equal(calls[0].options.headers['X-OPG-Hiring-Survey-Key'], secret);
  assert.equal(calls[0].options.redirect, 'error');
  assert.equal(Object.hasOwn(calls[0].body, 'requestId'), false);
  assert.equal(calls[0].body.website, '');
  assert.equal(validateSurveyRequest(calls[0].body).valid, true);
});

test('missing, unexpected, unsupported, and unsafe input fails before n8n', async () => {
  const { handler, calls } = harness();
  for (const body of [
    {}, null, [], { ...valid, recruiterName: '' }, { ...valid, recruiterName: 'Unknown' },
    { ...valid, professionalismRating: '0' }, { ...valid, roleClarityRating: '6' },
    { ...valid, overallRating: 5 }, { ...valid, recruiterFeedback: ' ' },
    { ...valid, recruiterFeedback: 'a'.repeat(4001) }, { ...valid, processImprovements: 'bad\u0001text' },
    { ...valid, requestId: 'invalid' }, { ...valid, website: 'filled by bot' },
    { ...valid, extra: 'unexpected' },
  ]) {
    const response = await handler(request(body));
    assert.equal(response.status, 400, JSON.stringify(body).slice(0, 100));
    assert.deepEqual(await response.json(), { ok: false });
  }
  assert.equal(calls.length, 0);
});

test('method, exact path, content type, same origin, and body size are enforced', async () => {
  const { handler, calls } = harness();
  assert.equal((await handler(request(valid, { method: 'GET' }))).status, 405);
  assert.equal((await handler(request(valid, { url: `${origin}/api/submit?x=1` }))).status, 404);
  assert.equal((await handler(request(valid, { type: 'text/plain' }))).status, 415);
  assert.equal((await handler(request(valid, { requestOrigin: 'https://elsewhere.example' }))).status, 403);
  assert.equal((await handler(request(valid, { site: 'cross-site' }))).status, 403);
  assert.equal((await handler(request({ ...valid, recruiterFeedback: 'é'.repeat(MAX_BODY_BYTES) }))).status, 413);
  assert.equal(calls.length, 0);
});

test('UTF-8 multiline feedback near the character limit is accepted and normalized', async () => {
  const { handler, calls } = harness();
  const answer = `é${'界'.repeat(3997)}\r\nX`;
  assert.equal((await handler(request({ ...valid, recruiterFeedback: answer }))).status, 200);
  assert.equal(calls[0].body.recruiterFeedback.length, 4000);
  assert.equal(calls[0].body.recruiterFeedback.includes('\r'), false);
});

test('identical retries reuse a Sheets key and changed answers get a new key', async () => {
  const { handler, calls } = harness();
  assert.equal((await handler(request())).status, 200);
  assert.equal((await handler(request())).status, 200);
  assert.equal((await handler(request({ ...valid, overallRating: '1' }))).status, 200);
  assert.equal(calls[0].body.responseId, calls[1].body.responseId);
  assert.notEqual(calls[0].body.responseId, calls[2].body.responseId);
  assert.equal(responseIdFor(validateSubmission(valid)), calls[0].body.responseId);
});

test('formula-like feedback reaches Sheets only as text', async () => {
  const { handler, calls } = harness();
  assert.equal((await handler(request({ ...valid, processImprovements: '  +SUM(1,2)  ' }))).status, 200);
  const validated = validateSurveyRequest(calls[0].body);
  assert.equal(prepareResponse(validated).process_improvements, "'+SUM(1,2)");
});

test('upstream failures and bad configuration stay generic and keep logs private', async () => {
  const { handler, logs } = harness(() => Response.json({ ok: false, detail: 'private upstream error' }, { status: 500 }));
  assert.equal((await handler(request())).status, 502);
  const wrongContract = harness(() => Response.json({ ok: true }));
  assert.equal((await wrongContract.handler(request())).status, 502);
  const unconfigured = createSubmissionHandler({ env: { ...env, N8N_WEBHOOK_URL: 'https://n8n.example/webhook-test/old' }, logger: { info: (entry) => logs.push(entry) } });
  assert.equal((await unconfigured(request())).status, 503);
  assert.equal(logs.some((entry) => /Ella|timeline|test-secret|private upstream error/.test(entry)), false);
});

test('only loopback development allows an n8n test webhook', async () => {
  const testEnv = { ...env, N8N_WEBHOOK_URL: 'https://n8n.example/webhook-test/hiring' };
  const calls = [];
  const options = { env: testEnv, fetchImpl: async (url) => { calls.push(url); return Response.json({ ok: true, status: 'saved' }); }, logger: { info() {} } };
  const localRequest = () => request(valid, { requestOrigin: 'http://localhost:5173', url: 'http://localhost:5173/api/submit' });
  assert.equal((await createSubmissionHandler({ ...options, allowTestWebhook: true })(localRequest())).status, 200);
  assert.equal((await createSubmissionHandler({ ...options, allowTestWebhook: true })(request())).status, 503);
  assert.equal((await createSubmissionHandler(options)(localRequest())).status, 503);
  assert.deepEqual(calls, [testEnv.N8N_WEBHOOK_URL]);
});
