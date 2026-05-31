import { readJsonBody } from '../server/read-body.js';
import { handleInterviewFeedbackGet, handleInterviewFeedbackPost } from '../server/handlers.js';

export default async function handler(req, res) {
  try {
    if (req.method === 'GET') {
      const result = handleInterviewFeedbackGet();
      return res.status(result.statusCode).json(result.body);
    }
    if (req.method === 'POST') {
      const body = await readJsonBody(req);
      const result = handleInterviewFeedbackPost(body);
      return res.status(result.statusCode).json(result.body);
    }
    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    return res.status(500).json({ error: err.message || 'Internal server error' });
  }
}
