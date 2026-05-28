export async function fetchSpeechmaticsJwt() {
  const response = await fetch('/api/speechmatics/jwt');

  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body.error || 'Unable to authenticate with Speechmatics');
  }

  const { jwt } = await response.json();
  return jwt;
}
