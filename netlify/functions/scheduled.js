export const schedule = '0 * * * *';

export async function handler(event, context) {
  const { runScheduledChecks } = await import('../../backend/src/scheduler.js');
  const result = runScheduledChecks();
  return {
    statusCode: 200,
    body: JSON.stringify(result)
  };
}
