export default function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  const key = process.env.SPEECHMATICS_API_KEY;
  if (!key) return res.status(500).json({ error: 'SPEECHMATICS_API_KEY not configured' });
  res.status(200).json({ key });
}
