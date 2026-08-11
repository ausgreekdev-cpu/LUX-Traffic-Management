import './dommatrix-polyfill.js';
import serverless from 'serverless-http';

let appHandler = null;

export const config = {
  path: '/api/*'
};

export async function handler(event, context) {
  if (!appHandler) {
    const { default: app } = await import('../../backend/src/app.js');
    appHandler = serverless(app);
  }
  return appHandler(event, context);
}
