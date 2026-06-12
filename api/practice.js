import { createVercelHandler } from '../server/vercel-handler.js';
import { handlePractice, handleReplenish } from '../server/handlers.js';

// Replenish is folded in here ({"replenish":true}) to stay under Vercel's
// 12-serverless-function limit on the Hobby plan — a 13th api/ file makes
// EVERY production deploy fail.
export default createVercelHandler((body, req) =>
  body?.replenish ? handleReplenish(body, req) : handlePractice(body, req)
);
