import test from 'node:test';
import assert from 'node:assert/strict';
import { buildPayload, classifyResponse, normalizeFeedback, SUCCESS_MESSAGE } from '../src/survey.js';
import { prepareResponse, validateSurveyRequest } from '../automation/workflow-logic.js';

const id = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
const fields = {
  recruiterName: 'Ella', professionalismRating: '5', roleClarityRating: '4', overallRating: '5',
  recruiterFeedback: 'The recruiter explained the timeline clearly.',
  processImprovements: 'A clearer next-step email would help.', website: '',
};

test('browser payload contains exactly the survey answers, honeypot, and retry ID', () => {
  assert.deepEqual(buildPayload(fields, id), { requestId: id, ...fields });
  assert.equal(Object.hasOwn(buildPayload(fields, id), 'responseId'), false);
  assert.equal(normalizeFeedback('  First line\r\nSecond line  '), 'First line\nSecond line');
  assert.equal(SUCCESS_MESSAGE, 'Thank you for your feedback. Your response has been saved.');
});

test('browser and workflow reject invalid choices and written answers', () => {
  const valid = { responseId: id, ...fields };
  for (const change of [
    { recruiterName: 'Other' }, { professionalismRating: '0' }, { roleClarityRating: '6' },
    { overallRating: 5 }, { recruiterFeedback: '   ' }, { processImprovements: '' },
    { recruiterFeedback: 'a'.repeat(4001) }, { processImprovements: 'bad\u0000text' },
    { website: 'spam' }, { responseId: 'invalid' }, { unexpected: 'field' },
  ]) assert.equal(validateSurveyRequest({ ...valid, ...change }).valid, false, JSON.stringify(change));
  assert.equal(validateSurveyRequest('not-json').valid, false);
  assert.throws(() => buildPayload({ ...fields, recruiterName: 'Other' }, id));
  assert.throws(() => buildPayload({ ...fields, recruiterFeedback: '   ' }, id));
  assert.throws(() => buildPayload(fields, 'invalid'));
});

test('workflow normalizes multiline feedback and escapes formula-like written answers', () => {
  const request = validateSurveyRequest({
    responseId: id, ...fields,
    recruiterFeedback: '  =HYPERLINK("https://example.test")\r\nline 2  ',
    processImprovements: '  @SUM(1,2)  ',
  });
  assert.equal(request.valid, true);
  const row = prepareResponse(request, new Date('2026-10-20T00:00:00.000Z'));
  assert.deepEqual(Object.keys(row), [
    'response_id', 'recruiter_name', 'professionalism_rating', 'role_clarity_rating',
    'overall_rating', 'recruiter_feedback', 'process_improvements', 'submitted_at',
  ]);
  assert.equal(row.recruiter_feedback, "'=HYPERLINK(\"https://example.test\")\nline 2");
  assert.equal(row.process_improvements, "'@SUM(1,2)");
  assert.equal(row.submitted_at, '2026-10-20T00:00:00.000Z');
});

test('only an explicit saved response counts as success', () => {
  assert.equal(classifyResponse(200, { ok: true, status: 'saved' }), 'success');
  assert.equal(classifyResponse(200, JSON.stringify({ ok: true, status: 'saved' })), 'success');
  assert.equal(classifyResponse(200, { ok: true }), 'error');
  assert.equal(classifyResponse(202, { ok: true, status: 'queued' }), 'error');
  assert.equal(classifyResponse(500, { ok: true, status: 'saved' }), 'error');
  assert.equal(classifyResponse(200, 'not-json'), 'error');
});
