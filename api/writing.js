import { createVercelHandler } from '../server/vercel-handler.js';
import { handleWritingPrompt, handleWritingReview } from '../server/handlers.js';

// Both writing routes share one serverless function (Vercel Hobby caps at 12).
// vercel.json rewrites /api/writing-prompt and /api/writing-review here with
// ?route=… — the public URLs never change. body.step is the safety net:
// review calls always carry it, prompt calls never do.
export default createVercelHandler((body, req) => {
  const route = req.query?.route || new URL(req.url, 'http://x').searchParams.get('route');
  if (route === 'review' || body?.step) return handleWritingReview(body, req);
  return handleWritingPrompt(body, req);
});
