import { buildSlackMenuMessage, fetchDailySnuMenus, isKoreanBusinessDay } from './menu.js';
import { postToSlackWebhook } from './slack.js';

function parseArgs(argv) {
  let meal = 'lunch';
  let force = false;
  let dryRun = false;

  for (const arg of argv) {
    if (arg === '--force') {
      force = true;
    } else if (arg === '--dry-run') {
      dryRun = true;
    } else if (arg === '--meal=dinner') {
      meal = 'dinner';
    } else if (arg === '--meal=lunch') {
      meal = 'lunch';
    }
  }

  return { meal, force, dryRun };
}

async function run() {
  const { meal, force, dryRun } = parseArgs(process.argv.slice(2));

  if (!force && !(await isKoreanBusinessDay())) {
    console.log(JSON.stringify({ ok: true, skipped: true, reason: 'Not a Korean business day.', meal }, null, 2));
    return;
  }

  const menus = await fetchDailySnuMenus();
  const message = buildSlackMenuMessage(meal, menus);

  if (!dryRun) {
    await postToSlackWebhook(message);
  }

  console.log(message);
}

run().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
