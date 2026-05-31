export function sendHandlerResult(res, result) {
  res.statusCode = result.statusCode || 200;
  if (result.headers) {
    for (const [key, value] of Object.entries(result.headers)) {
      res.setHeader(key, value);
    }
  }
  if (Buffer.isBuffer(result.body)) {
    res.end(result.body);
  } else if (typeof result.body === 'object') {
    res.end(JSON.stringify(result.body));
  } else {
    res.end(result.body ?? '');
  }
}
