import { createSubmissionHandler } from '../server/submission.js';

// Vercel Node.js Function. Environment variables are read only in this runtime.
export default { fetch: createSubmissionHandler() };
