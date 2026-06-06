import { createVercelHandler } from '../server/vercel-handler.js';
import { handleSpeakingPrompt } from '../server/handlers.js';

export default createVercelHandler(handleSpeakingPrompt);
