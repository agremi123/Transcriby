import { createVercelHandler } from '../server/vercel-handler.js';
import { handleWritingReview } from '../server/handlers.js';

export default createVercelHandler((body, req) => handleWritingReview(body, req));
