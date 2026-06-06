import { createVercelHandler } from '../server/vercel-handler.js';
import { handleSpeakingPrompt, handleSpeakingReaction } from '../server/handlers.js';

export default createVercelHandler((body, req) =>
  body?.type === 'reaction' ? handleSpeakingReaction(body, req) : handleSpeakingPrompt(body, req)
);
