export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const apiKey = process.env.SPEECHMATICS_API_KEY;
  if (!apiKey) return res.status(500).json({ error: 'SPEECHMATICS_API_KEY not configured' });

  try {
    const smRes = await fetch('https://mp.speechmatics.com/v1/api_keys?type=rt', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ ttl: 60 }),
    });

    if (!smRes.ok) {
      const err = await smRes.json().catch(() => ({}));
      return res.status(smRes.status).json({ error: err.detail || err.error || 'Failed to get Speechmatics JWT' });
    }

    const data = await smRes.json();
    return res.status(200).json({ key: data.key_value });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to get Speechmatics JWT' });
  }
}
