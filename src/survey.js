export const RECRUITERS = Object.freeze(['Ella', 'Hanna', 'Allen', 'Joy']);
export const RATINGS = Object.freeze(['1', '2', '3', '4', '5']);
export const MAX_FEEDBACK_LENGTH = 4000;
export const SUCCESS_MESSAGE = 'Thank you for your feedback. Your response has been saved.';
export const SUBMISSION_ERROR_MESSAGE = 'We could not save your response. Please try again in a moment.';

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const UNSAFE_TEXT = /[\u0000-\u0009\u000b-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069]/u;

export function normalizeFeedback(value) {
  return String(value ?? '').replace(/\r\n?/g, '\n').trim();
}

export function validFeedback(value) {
  return Boolean(value) && value.length <= MAX_FEEDBACK_LENGTH && !UNSAFE_TEXT.test(value);
}

export function buildPayload(fields, requestId) {
  if (!UUID_V4.test(requestId)) throw new Error('Invalid request ID');
  const payload = {
    requestId,
    recruiterName: fields.recruiterName ?? '',
    professionalismRating: fields.professionalismRating ?? '',
    roleClarityRating: fields.roleClarityRating ?? '',
    overallRating: fields.overallRating ?? '',
    recruiterFeedback: normalizeFeedback(fields.recruiterFeedback),
    processImprovements: normalizeFeedback(fields.processImprovements),
    website: fields.website ?? '',
  };
  if (!RECRUITERS.includes(payload.recruiterName)
    || !RATINGS.includes(payload.professionalismRating)
    || !RATINGS.includes(payload.roleClarityRating)
    || !RATINGS.includes(payload.overallRating)
    || !validFeedback(payload.recruiterFeedback)
    || !validFeedback(payload.processImprovements)
    || typeof payload.website !== 'string') throw new Error('Invalid survey response');
  return payload;
}

export function classifyResponse(status, body) {
  if (typeof body === 'string') {
    try { body = JSON.parse(body); } catch { return 'error'; }
  }
  return status >= 200 && status < 300 && body?.ok === true && body.status === 'saved'
    ? 'success'
    : 'error';
}
