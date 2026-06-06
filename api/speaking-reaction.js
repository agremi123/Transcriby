import { createVercelHandler } from '../server/vercel-handler.js';
import { handleSpeakingReaction } from '../server/handlers.js';

export default createVercelHandler(handleSpeakingReaction);
