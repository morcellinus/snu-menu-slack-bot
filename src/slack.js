function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function postToSlackWebhook(text) {
  const webhookUrl = process.env.SLACK_WEBHOOK_URL;
  if (!webhookUrl) {
    throw new Error('SLACK_WEBHOOK_URL is not configured.');
  }

  let response;
  let lastError;

  for (let attempt = 0; attempt <= 2; attempt += 1) {
    try {
      response = await fetch(webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text })
      });
      break;
    } catch (error) {
      lastError = error;

      if (attempt === 2) {
        const message = error instanceof Error ? error.message : String(error);
        const cause = error && typeof error === 'object' ? error.cause : undefined;
        const causeCode = cause && typeof cause === 'object' && 'code' in cause ? cause.code : undefined;
        const causeHost = cause && typeof cause === 'object' && 'hostname' in cause ? cause.hostname : undefined;
        throw new Error(
          `Slack webhook network request failed${causeCode ? ` (${causeCode}${causeHost ? ` @ ${causeHost}` : ''})` : ''}: ${message}`
        );
      }

      await sleep(500 * (attempt + 1));
    }
  }

  if (!response) {
    throw lastError instanceof Error ? lastError : new Error(String(lastError));
  }

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Slack webhook request failed: ${response.status} ${errorText}`);
  }
}
