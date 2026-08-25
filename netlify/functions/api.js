import './dommatrix-polyfill.js';
import 'dotenv/config';
import serverless from 'serverless-http';

let appHandler = null;

export const config = {
  path: '/api/*',
  maxDuration: 30,
};

export async function handler(event, context) {
  // Warm-up response for health checks
  if (event.httpMethod === 'HEAD' || event.path === '/api/health') {
    return { statusCode: 200, body: 'OK' };
  }

  if (!appHandler) {
    try {
      const { restoreDbFromBlob } = await import('../../backend/src/persistence.js');
      await restoreDbFromBlob();
      const { default: app } = await import('../../backend/src/app.js');
      appHandler = serverless(app);
    } catch (err) {
      console.error('api handler boot failed:', err);
      return {
        statusCode: 500,
        body: JSON.stringify({ error: 'boot_failed', message: String(err?.message || err) })
      };
    }
  }
  return appHandler(event, context);
}
