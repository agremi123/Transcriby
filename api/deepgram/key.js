import { createVercelHandler } from '../server/vercel-handler.js';
import { handleDeepgramKey } from '../server/handlers.js';

export default createVercelHandler(() => handleDeepgramKey(), { methods: ['GET'] });
