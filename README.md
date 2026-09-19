# sports-today-prompts

Public HTTPS JSON prompt feed for the **Sports Today** iMessage app.

Phones `GET` this Worker with no Notion token. Editors (or a Notion publish script) `POST` Ready prompts into Cloudflare KV. The Worker only serves and publishes JSON — it has no Notion client.

Live URL (after deploy):

`https://sports-today-prompts.k24corp.workers.dev/prompts`

The iMessage app (build 65) is already wired to this contract and falls back to a stub while this endpoint 404s.

## Contract

| Method | Path | Auth | Behavior |
| --- | --- | --- | --- |
| `GET` | `/prompts` | Public, CORS `*` | Feed JSON from KV key `feed:v1`. If missing/empty/invalid, return the seeded Career Passing Yards prompt (`t10_nfl_003`). |
| `GET` | `/health` | Public | `{ "ok": true, "updatedAt": "<ISO-8601>" }` from the same resolved feed. |
| `POST` | `/publish` | `Authorization: Bearer ${PUBLISH_TOKEN}` | Body = full feed JSON. Light validation, write to KV, return `{ "ok": true, "updatedAt" }`. |

Unknown paths return `{ "error": "not_found" }` with status 404.

### Feed schema

The iMessage app already expects this exact shape:

```json
{
  "version": 1,
  "updatedAt": "ISO-8601",
  "prompts": [
    {
      "id": "t10_nfl_003",
      "format": "top_10_guess",
      "sport": "nfl",
      "title": "All-time NFL QBs by career passing yards",
      "promptText": "Guess the top 10 career NFL passing yards leaders.",
      "metricLabel": "yds",
      "strikesAllowed": 3,
      "acceptAliases": true,
      "items": [
        {
          "rank": 1,
          "canonical": "Tom Brady",
          "aliases": ["Brady", "Tom Brady"],
          "metric": 89214
        }
      ]
    }
  ]
}
```

`POST /publish` overwrites `updatedAt` with the Worker clock so `/health` tracks the last successful publish.

## Seed (KV-empty fallback)

Until something is published, `GET /prompts` returns **Career Passing Yards** (`t10_nfl_003`): a coherent PFR-style top 10, ranks 1–10.

Snapshot is **through the 2025 regular season** (approximate, from Pro-Football-Reference-style leaders):

| Rank | Player | Yards |
| --- | --- | --- |
| 1 | Tom Brady | 89,214 |
| 2 | Drew Brees | 80,358 |
| 3 | Peyton Manning | 71,940 |
| 4 | Brett Favre | 71,838 |
| 5 | Aaron Rodgers | 66,274 |
| 6 | Matthew Stafford | 64,516 |
| 7 | Ben Roethlisberger | 64,088 |
| 8 | Philip Rivers | 63,984 |
| 9 | Matt Ryan | 62,792 |
| 10 | Dan Marino | 61,361 |

Refresh these metrics from Notion / [PFR career passing yards](https://www.pro-football-reference.com/leaders/pass_yds_career.htm) before treating the seed as production truth. Active QBs (Rodgers, Stafford) move; Eli Manning is 11th on current lists.

Canonical copy lives in `src/feed.ts`. A curl-friendly JSON file is at `src/seed-feed.json`.

## Local development

```bash
npm install
cp .dev.vars.example .dev.vars
# edit PUBLISH_TOKEN in .dev.vars
npm run dev
```

Then:

```bash
curl -sS http://127.0.0.1:8787/prompts | jq .
curl -sS http://127.0.0.1:8787/health | jq .
```

### Publish (curl)

```bash
export PUBLISH_TOKEN='your-token'
export FEED_URL='https://sports-today-prompts.k24corp.workers.dev/publish'

curl -sS -X POST "$FEED_URL" \
  -H "Authorization: Bearer ${PUBLISH_TOKEN}" \
  -H "Content-Type: application/json" \
  --data @src/seed-feed.json
```

Local publish:

```bash
export PUBLISH_TOKEN='dev-publish-token'
export FEED_URL='http://127.0.0.1:8787/publish'
npm run seed
```

## Go-live

KV is already created: **`sports-today-prompts-feed`** (`d3d54619d3df4701ba64ddb7bd98bc4f`), bound as `FEED` in `wrangler.jsonc`. Local `wrangler dev` / Vitest use Miniflare (isolated local KV); there is no `preview_id`.

### 1. GitHub Actions secret

Repo → Settings → Secrets and variables → Actions:

| Name | Required | Purpose |
| --- | --- | --- |
| `CLOUDFLARE_API_TOKEN` | **Yes** | Token with Workers Scripts Edit and Workers KV Storage Edit. |
| `PUBLISH_TOKEN` | Optional | If set, the workflow pipes it into the Worker secret after deploy (value is never echoed). |
| `CLOUDFLARE_ACCOUNT_ID` | Optional | Secret **or** Actions variable. Only needed if the API token can see more than one account. Otherwise the workflow discovers the single account via `wrangler whoami` / the accounts API. |

The workflow (`.github/workflows/deploy.yml`) runs `wrangler deploy` on **push to `main`** and **workflow_dispatch**.

### 2. Deploy

Merge this PR to `main` (or run the Deploy workflow after merge).

```bash
npx wrangler deploy
```

If `PUBLISH_TOKEN` was not stored as a GitHub secret, set the Worker secret once after deploy:

```bash
npx wrangler secret put PUBLISH_TOKEN
```

Use a long random token. Editors send it as `Authorization: Bearer …`. It is never shipped to the iMessage app.

### 3. Confirm

```bash
curl -sS https://sports-today-prompts.k24corp.workers.dev/health
curl -sS https://sports-today-prompts.k24corp.workers.dev/prompts
```

Empty KV is fine: phones receive the seed immediately. Optionally `POST /publish` the seed (or the latest Notion Ready set) so KV holds an explicit snapshot.

### 4. iMessage app

Build 65 already points at `/prompts`. Once the Worker is live, the stub fallback should stop.

## Project layout

```
src/index.ts              Worker router
src/feed.ts               Schema types, seed, KV helpers
src/validate.ts           Light publish validation
src/auth.ts               Timing-safe bearer check
src/seed-feed.json        Seed payload for curl
scripts/seed.ts           Optional publish helper
wrangler.jsonc            Worker name, KV binding FEED
.github/workflows/deploy.yml
```

## Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | Local Worker (`wrangler dev`) |
| `npm test` | Vitest (Workers pool) against the feed contract |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run deploy` | `wrangler deploy` |
| `npm run seed` | `POST` the seed to `$FEED_URL` |
| `npm run cf-typegen` | Regenerate `worker-configuration.d.ts` |

## Notes

- **No Notion SDK / token in this Worker.** Notion stays on the editor/publish side.
- KV binding name is `FEED` → namespace `sports-today-prompts-feed` (`d3d54619d3df4701ba64ddb7bd98bc4f`). Key is `feed:v1`.
- Worker name is `sports-today-prompts`.
- `PUBLISH_TOKEN` is a Wrangler secret (optionally mirrored as a GitHub Actions secret so deploy can set it), not a `vars` value.
