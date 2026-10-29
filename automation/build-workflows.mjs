import { createHash } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { prepareResponse, validateSurveyRequest } from './workflow-logic.js';

const directory = dirname(fileURLToPath(import.meta.url));
const sheetId = 'REPLACE_WITH_SPREADSHEET_ID';

function id(name) {
  const value = createHash('sha256').update(name).digest('hex').slice(0, 32);
  return `${value.slice(0, 8)}-${value.slice(8, 12)}-4${value.slice(13, 16)}-a${value.slice(17, 20)}-${value.slice(20)}`;
}

function node(name, type, typeVersion, x, y, parameters = {}, extra = {}) {
  return { id: id(name), name, type: `n8n-nodes-base.${type}`, typeVersion, position: [x, y], parameters, ...extra };
}

function code(name, x, y, source) {
  return node(name, 'code', 2, x, y, { jsCode: source });
}

function respond(name, x, y, status, body) {
  return node(name, 'respondToWebhook', 1.5, x, y, {
    // n8n serializes JSON response bodies itself. Stringifying here would send
    // a JSON string instead of the object expected by the browser.
    respondWith: 'json', responseBody: body, options: { responseCode: status },
  });
}

const columns = ['response_id', 'recruiter_name', 'professionalism_rating', 'role_clarity_rating', 'overall_rating', 'recruiter_feedback', 'process_improvements', 'submitted_at'];
const schema = columns.map((column) => ({
  id: column, displayName: column, required: false, defaultMatch: false,
  display: true, type: 'string', canBeUsedToMatch: true,
}));

const nodes = [
  node('Survey Webhook', 'webhook', 2.1, 0, 0, {
    httpMethod: 'POST', path: 'opg-recruitment-feedback-secure-v1',
    authentication: 'headerAuth', responseMode: 'responseNode', options: {},
  }, { webhookId: id('Recruitment Feedback Webhook path') }),
  code('Validate Survey', 220, 0,
    `const validate = ${validateSurveyRequest.toString()};\nreturn [{ json: validate($input.first().json.body) }];`),
  node('Request Valid?', 'if', 1, 440, 0, {
    conditions: { boolean: [{ value1: '={{ $json.valid }}', value2: true }] },
  }),
  respond('Bad Request', 660, 160, 400, { ok: false, message: 'Invalid survey response.' }),
  code('Prepare Response', 660, -100,
    `const prepare = ${prepareResponse.toString()};\nreturn [{ json: prepare($input.first().json) }];`),
  node('Save Response', 'googleSheets', 4.7, 880, -100, {
    operation: 'appendOrUpdate',
    documentId: { __rl: true, value: sheetId, mode: 'id' },
    sheetName: { __rl: true, value: 'Responses', mode: 'name' },
    columns: {
      mappingMode: 'defineBelow',
      value: Object.fromEntries(columns.map((key) => [key, `={{ $('Prepare Response').first().json.${key} }}`])),
      matchingColumns: ['response_id'],
      schema,
    },
    options: {},
  }),
  respond('Survey Saved', 1100, -100, 200, { ok: true, status: 'saved' }),
];

const routes = [
  ['Survey Webhook', 'Validate Survey'],
  ['Validate Survey', 'Request Valid?'],
  ['Request Valid?', 'Prepare Response', 0],
  ['Request Valid?', 'Bad Request', 1],
  ['Prepare Response', 'Save Response'],
  ['Save Response', 'Survey Saved'],
];
const connections = {};
for (const [from, to, output = 0] of routes) {
  connections[from] ??= { main: [] };
  connections[from].main[output] ??= [];
  connections[from].main[output].push({ node: to, type: 'main', index: 0 });
}

const workflow = {
  name: 'OPG — Recruitment Process Feedback', nodes, connections,
  settings: { executionOrder: 'v1', saveDataSuccessExecution: 'none', saveDataErrorExecution: 'none', saveManualExecutions: false, saveExecutionProgress: false },
  staticData: null, pinData: {}, active: false,
};

writeFileSync(join(directory, 'survey-responses.workflow.json'), `${JSON.stringify(workflow, null, 2)}\n`);
console.log('Generated survey-responses.workflow.json');
