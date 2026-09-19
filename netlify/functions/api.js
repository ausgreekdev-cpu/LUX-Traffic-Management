import './dommatrix-polyfill.js';
import 'dotenv/config';
import serverless from 'serverless-http';

let appHandler = null;

export const config = {
  path: '/api/*',
  maxDuration: 30,
};

export async function handler(event, context) {
  // Warm-up response for health checks — must be JSON so api.health() parses.
  // /api/ping is also fast-pathed (no boot) so the frontend cold-start origin
  // probe resolves immediately instead of aborting after 4s on a cold instance.
  if (event.httpMethod === 'HEAD') {
    return { statusCode: 200, body: JSON.stringify({ status: 'ok' }) };
  }
  if (event.path === '/api/health') {
    return { statusCode: 200, body: JSON.stringify({ status: 'ok', serverless: true, uptime_seconds: Math.round(process.uptime()) }) };
  }
  if (event.path === '/api/ping') {
    return { statusCode: 200, body: JSON.stringify({ pong: true, at: new Date().toISOString() }) };
  }

  if (!appHandler) {
    try {
      try {
        const { restoreDbFromBlob } = await import('../../backend/src/persistence.js');
        await restoreDbFromBlob();
        // The restored DB may carry a different persisted jwt_secret than the
        // module-level cache from a previous warm instance — drop it so every
        // auth/sign call reads the current secret.
        const { resetJwtSecretCache } = await import('../../backend/src/secrets.js');
        resetJwtSecretCache();
      } catch (restoreErr) {
        console.warn('restoreDbFromBlob failed (non-fatal):', restoreErr?.message || restoreErr);
      }
      const { default: app } = await import('../../backend/src/app.js');
      appHandler = serverless(app);
    } catch (err) {
      console.error('api handler boot failed:', err);
      console.error(err?.stack || String(err));
      return {
        statusCode: 500,
        body: JSON.stringify({ error: 'boot_failed', message: String(err?.message || err), stack: String(err?.stack || '').slice(0, 2000) })
      };
    }
  }
  return appHandler(event, context);
}
