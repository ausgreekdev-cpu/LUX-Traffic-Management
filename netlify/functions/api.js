import './dommatrix-polyfill.js';
import serverless from 'serverless-http';

let appHandler = null;

export const config = {
  path: '/api/*'
};

export async function handler(event, context) {
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
        body: JSON.stringify({ error: 'boot_failed', message: String((err && err.message) || err), stack: String((err && err.stack) || '') })
      };
    }
  }
  return appHandler(event, context);
}
