import { createVercelHandler } from '../server/vercel-handler.js';
import { handleReading } from '../server/handlers.js';

export default createVercelHandler(handleReading);
