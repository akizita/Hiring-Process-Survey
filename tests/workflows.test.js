import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const columns = [
  'response_id', 'recruiter_name', 'professionalism_rating', 'role_clarity_rating',
  'overall_rating', 'recruiter_feedback', 'process_improvements', 'submitted_at',
];
const workflow = () => JSON.parse(readFileSync(join('automation', 'survey-responses.workflow.json'), 'utf8'));

test('hiring workflow validates before a single Google Sheets write and responds afterward', () => {
  const built = workflow();
  const names = new Set(built.nodes.map((node) => node.name));
  assert.equal(names.size, built.nodes.length);
  for (const [from, outputs] of Object.entries(built.connections)) {
    assert.equal(names.has(from), true);
    for (const links of outputs.main) for (const link of links ?? []) assert.equal(names.has(link.node), true);
  }
  const sheets = built.nodes.filter((node) => node.type === 'n8n-nodes-base.googleSheets');
  const webhook = built.nodes.find((node) => node.name === 'Survey Webhook');
  assert.equal(webhook.parameters.authentication, 'headerAuth');
  assert.equal(webhook.parameters.httpMethod, 'POST');
  assert.equal(webhook.parameters.path, 'opg-recruitment-feedback-secure-v1');
  assert.equal(webhook.parameters.responseMode, 'responseNode');
  assert.equal(built.settings.saveDataSuccessExecution, 'none');
  assert.equal(built.settings.saveDataErrorExecution, 'none');
  assert.equal(built.settings.saveManualExecutions, false);
  assert.equal(sheets.length, 1);
  assert.equal(sheets[0].parameters.operation, 'appendOrUpdate');
  assert.equal(sheets[0].parameters.sheetName.value, 'Responses');
  assert.equal(sheets[0].parameters.documentId.value, 'REPLACE_WITH_SPREADSHEET_ID');
  assert.deepEqual(sheets[0].parameters.columns.matchingColumns, ['response_id']);
  assert.deepEqual(Object.keys(sheets[0].parameters.columns.value), columns);
  assert.deepEqual(built.connections['Save Response'].main[0].map((link) => link.node), ['Survey Saved']);
  assert.deepEqual(built.nodes.find((node) => node.name === 'Survey Saved').parameters.responseBody, { ok: true, status: 'saved' });
  assert.equal(built.active, false);
  assert.equal(JSON.stringify(built).includes('credentials'), false);
});

test('generated n8n Code nodes are executable and reject extra fields', () => {
  const built = workflow();
  const code = (name) => built.nodes.find((node) => node.name === name).parameters.jsCode;
  const body = {
    responseId: 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee', recruiterName: 'Ella',
    professionalismRating: '5', roleClarityRating: '4', overallRating: '3',
    recruiterFeedback: '=HYPERLINK("https://example.test")', processImprovements: 'More updates', website: '',
  };
  const validate = new Function('$input', code('Validate Survey'));
  const validated = validate({ first: () => ({ json: { body: JSON.stringify(body) } }) })[0].json;
  assert.equal(validated.valid, true);
  assert.equal(validate({ first: () => ({ json: { body: { ...body, extra: 'x' } } }) })[0].json.valid, false);
  const prepared = new Function('$input', code('Prepare Response'))({ first: () => ({ json: validated }) })[0].json;
  assert.deepEqual(Object.keys(prepared), columns);
  assert.equal(prepared.recruiter_feedback, "'=HYPERLINK(\"https://example.test\")");
  assert.equal(Number.isNaN(Date.parse(prepared.submitted_at)), false);
});
