import { createVercelHandler } from '../server/vercel-handler.js';
import { handlePractice } from '../server/handlers.js';

export default createVercelHandler(handlePractice);
