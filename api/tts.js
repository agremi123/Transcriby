import { createVercelHandler } from '../server/vercel-handler.js';
import { handleTts } from '../server/handlers.js';

export default createVercelHandler(handleTts);
