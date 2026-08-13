export const schedule = '0 * * * *';

export async function handler(event, context) {
  const { restoreDbFromBlob } = await import('../../backend/src/persistence.js');
  await restoreDbFromBlob();
  await import('../../backend/src/app.js');
  const { runScheduledChecks } = await import('../../backend/src/scheduler.js');
  const result = await runScheduledChecks();
  return {
    statusCode: 200,
    body: JSON.stringify(result)
  };
}