import { createVercelHandler } from '../server/vercel-handler.js';
import { handleCorrect } from '../server/handlers.js';

export default createVercelHandler(handleCorrect);
