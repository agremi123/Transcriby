import { readJsonBody } from './read-body.js';

export function createVercelHandler(handler, { methods = ['POST'] } = {}) {
  return async (req, res) => {
    if (!methods.includes(req.method)) {
      res.status(405).json({ error: 'Method not allowed' });
      return;
    }

    try {
      const body = req.method === 'GET' ? null : await readJsonBody(req);
      const result = await handler(body, req);
      res.status(result.statusCode || 200);
      if (result.headers) {
        for (const [key, value] of Object.entries(result.headers)) {
          res.setHeader(key, value);
        }
      }
      if (Buffer.isBuffer(result.body)) {
        res.end(result.body);
      } else if (typeof result.body === 'string') {
        res.end(result.body);
      } else {
        res.json(result.body ?? {});
      }
    } catch (err) {
      res.status(500).json({ error: err.message || 'Internal server error' });
    }
  };
}
