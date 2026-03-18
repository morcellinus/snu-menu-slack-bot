# SNU Menu Slack Bot

Small standalone bot that scrapes the SNU Co-op food menu page and posts lunch or dinner menus to Slack.

## Behavior

- Source: <https://snuco.snu.ac.kr/foodmenu/>
- 301 lunch only:
  - `<식사>`
  - `<301동1층 교직원전용식당>`
- 302 lunch and dinner:
  - first `<뷔페>` for lunch
  - second `<뷔페>` for dinner
- Message text is fixed:
  - `lunch 1120?`
  - `dinner 1720?`
- Runs only on Korean business days:
  - Monday to Friday in `Asia/Seoul`
  - skips Korean public holidays via Nager.Date

## Local run

Set `.env`:

```bash
SLACK_WEBHOOK_URL=https://hooks.slack.com/services/...
```

Then run:

```bash
npm run menu:dry-run:lunch
npm run menu:dry-run:dinner
npm run menu:post:lunch
npm run menu:post:dinner
```

`dry-run` prints only. `post` sends to Slack.

## GitHub Actions schedule

- Lunch: `11:00 KST` on weekdays
- Dinner: `17:00 KST` on weekdays

Add this GitHub Actions secret:

```bash
SLACK_WEBHOOK_URL
```
