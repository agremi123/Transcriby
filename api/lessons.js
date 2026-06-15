import { createVercelHandler } from '../server/vercel-handler.js';
import { handleLessons } from '../server/handlers.js';

// Serves the pre-built A1–C2 grammar/conjugation/vocabulary corpus from the
// local stockpile. GET /api/lessons?type=grammar&level=B1 (POST also works).
export default createVercelHandler(handleLessons, { methods: ['GET', 'POST'] });
