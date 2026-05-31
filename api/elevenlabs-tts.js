import { createVercelHandler } from '../server/vercel-handler.js';
import { handleElevenLabsTts } from '../server/handlers.js';

export default createVercelHandler(handleElevenLabsTts);
