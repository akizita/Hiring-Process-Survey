// These self-contained functions are embedded in n8n Code nodes by build-workflows.mjs.
export function validateSurveyRequest(rawBody) {
  const invalid = { valid: false };
  let body = rawBody;
  if (typeof body === 'string') {
    try { body = JSON.parse(body); } catch { return invalid; }
  }
  if (!body || typeof body !== 'object' || Array.isArray(body)) return invalid;
  const keys = ['responseId', 'recruiterName', 'professionalismRating', 'roleClarityRating', 'overallRating', 'recruiterFeedback', 'processImprovements', 'website'];
  if (Object.keys(body).length !== keys.length) return invalid;
  if (keys.some((key) => !Object.hasOwn(body, key) || typeof body[key] !== 'string')) return invalid;

  const responseId = body.responseId.trim();
  const recruiters = ['Ella', 'Hanna', 'Allen', 'Joy'];
  const ratings = ['1', '2', '3', '4', '5'];
  const feedback = (value) => {
    const text = value.replace(/\r\n?/g, '\n').trim();
    return text && text.length <= 4000 && !/[\u0000-\u0009\u000b-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069]/u.test(text) ? text : null;
  };
  const recruiterFeedback = feedback(body.recruiterFeedback);
  const processImprovements = feedback(body.processImprovements);
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(responseId)
    || !recruiters.includes(body.recruiterName)
    || !ratings.includes(body.professionalismRating)
    || !ratings.includes(body.roleClarityRating)
    || !ratings.includes(body.overallRating)
    || !recruiterFeedback || !processImprovements || body.website.trim()) return invalid;
  return {
    valid: true, responseId, recruiterName: body.recruiterName,
    professionalismRating: body.professionalismRating,
    roleClarityRating: body.roleClarityRating,
    overallRating: body.overallRating,
    recruiterFeedback, processImprovements,
  };
}

export function prepareResponse(request, now = new Date()) {
  if (!request?.valid) throw new Error('Survey request was not validated');
  // Leading formula characters must remain plain text in Google Sheets.
  const asText = (value) => /^[=+\-@]/u.test(value) ? `'${value}` : value;
  return {
    response_id: request.responseId,
    recruiter_name: asText(request.recruiterName),
    professionalism_rating: request.professionalismRating,
    role_clarity_rating: request.roleClarityRating,
    overall_rating: request.overallRating,
    recruiter_feedback: asText(request.recruiterFeedback),
    process_improvements: asText(request.processImprovements),
    submitted_at: now.toISOString(),
  };
}
