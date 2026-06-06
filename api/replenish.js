import { createVercelHandler } from '../server/vercel-handler.js';
import { handleReplenish } from '../server/handlers.js';

export default createVercelHandler(handleReplenish);
