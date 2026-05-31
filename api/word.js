import { createVercelHandler } from '../server/vercel-handler.js';
import { handleWord } from '../server/handlers.js';

export default createVercelHandler(handleWord);
