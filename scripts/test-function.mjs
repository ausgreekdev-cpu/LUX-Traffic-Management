process.env.NETLIFY = 'true';
process.env.JWT_SECRET = 'test-secret';

const { handler } = await import('../netlify/functions/api.js');

function mockEvent(path, method, body, headers = {}) {
  return {
    httpMethod: method,
    path,
    headers: { 'content-type': 'application/json', ...headers },
    body: body ? JSON.stringify(body) : null,
    multiValueHeaders: {},
    multiValueQueryStringParameters: null,
    queryStringParameters: null,
    isBase64Encoded: false,
    rawUrl: 'https://lux-tmp.netlify.app' + path
  };
}

async function call(path, method, body) {
  const res = await handler(mockEvent(path, method, body), {});
  const parsed = JSON.parse(res.body || '{}');
  console.log(method, path, '->', res.statusCode, JSON.stringify(parsed).slice(0, 200));
  return res;
}

await call('/api/health', 'GET');
const login = await call('/api/auth/login', 'POST', { email: 'admin@tmpcms.com', password: 'admin123' });
const token = JSON.parse(login.body).token;
await call('/api/dashboard/stats', 'GET');
await call('/api/tmps', 'GET', null);
await call('/api/auth/login', 'POST', { email: 'admin@tmpcms.com', password: 'wrong' });
await call('/api/unknown/route', 'GET');
