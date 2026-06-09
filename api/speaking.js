import { createVercelHandler } from '../server/vercel-handler.js';
import { handleSpeakingPrompt, handleSpeakingReaction, handleWordChallenge } from '../server/handlers.js';

export default createVercelHandler((body, req) =>
  body?.type === 'word-challenge' ? handleWordChallenge(body, req) :
  body?.type === 'reaction' ? handleSpeakingReaction(body, req) :
  handleSpeakingPrompt(body, req)
);
