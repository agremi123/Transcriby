import { createVercelHandler } from '../server/vercel-handler.js';
import { handleListening } from '../server/handlers.js';

export default createVercelHandler(handleListening);
