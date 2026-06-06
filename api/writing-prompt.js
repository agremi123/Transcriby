import { createVercelHandler } from '../server/vercel-handler.js';
import { handleWritingPrompt } from '../server/handlers.js';

export default createVercelHandler(handleWritingPrompt);
