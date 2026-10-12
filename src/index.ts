import { isAuthorized } from "./auth";
import {
	applyFresherSeedMetrics,
	cloneSeedFeed,
	readStoredFeed,
	writeStoredFeed,
	type PromptFeed,
} from "./feed";
import { PRIVACY_HTML, SUPPORT_HTML } from "./pages";
import { MAX_PUBLISH_BYTES, unknownSportError, validateFeed } from "./validate";
import { acceptableDay, isKnownTopic, readConsensus, recordVote, validateVote, type TopicMap } from "./blind";
import { BLIND_TOPICS } from "./blind-topics";
import { boardDayKey, pruneDays, servedFeed, validateDays } from "./days";

/** Blind Ranking boards from the feed, so a Notion-only topic still takes votes. */
async function feedTopics(env: Env, topicId: unknown): Promise<TopicMap> {
	if (typeof topicId !== "string" || Object.hasOwn(BLIND_TOPICS, topicId)) return {};
	const feed = await resolveFeed(env);
	const out: Record<string, string[]> = {};
	const lists = [feed.boards?.blindTop5 ?? [], ...Object.values(feed.days ?? {}).map((d) => d.boards?.blindTop5 ?? [])];
	for (const list of lists) {
		for (const board of list) out[board.id] = board.items.map((item) => item.id);
	}
	return out;
}

const VOTE_MAX_BYTES = 2048;

/** Light per-connection limit. The address is only used as an in-memory limiter key, never stored. */
async function voteAllowed(request: Request, env: Env): Promise<boolean> {
	const limiter = env.VOTE_LIMITER;
	if (!limiter) return true;
	const key = request.headers.get("CF-Connecting-IP") ?? "unknown";
	try {
		const { success } = await limiter.limit({ key });
		return success;
	} catch {
		return true;
	}
}

async function handleBlindVote(request: Request, env: Env): Promise<Response> {
	if (!(await voteAllowed(request, env))) {
		return json({ error: "rate_limited" }, 429);
	}
	const raw = await request.text();
	if (raw.length > VOTE_MAX_BYTES) {
		return json({ error: "payload_too_large" }, 413);
	}
	let parsed: unknown;
	try {
		parsed = JSON.parse(raw);
	} catch {
		return json({ error: "invalid_json" }, 400);
	}
	const topicId = (parsed as { topicId?: unknown } | null)?.topicId;
	const extra = await feedTopics(env, topicId);
	const result = validateVote(parsed, Date.now(), extra);
	if (!result.ok) {
		return json({ error: "invalid_vote", detail: result.error }, 400);
	}
	await recordVote(env.VOTES, result.vote);
	const consensus = await readConsensus(env.VOTES, result.vote.day, result.vote.topicId, extra);
	return json({ ok: true, ...consensus });
}

async function handleBlindConsensus(url: URL, env: Env): Promise<Response> {
	const day = url.searchParams.get("date");
	const topicId = url.searchParams.get("topicId");
	const extra = await feedTopics(env, topicId);
	if (!acceptableDay(day) || !isKnownTopic(topicId, extra)) {
		return json({ error: "invalid_query" }, 400);
	}
	return json(await readConsensus(env.VOTES, day, topicId, extra));
}

const PUBLIC_CORS = {
	"Access-Control-Allow-Origin": "*",
	"Access-Control-Allow-Methods": "GET, OPTIONS",
	"Access-Control-Allow-Headers": "Content-Type",
	"Access-Control-Max-Age": "86400",
} as const;

function json(
	body: unknown,
	status = 200,
	extraHeaders?: HeadersInit,
	cacheControl = "no-store",
): Response {
	return new Response(JSON.stringify(body), {
		status,
		headers: {
			"Content-Type": "application/json; charset=utf-8",
			"Cache-Control": cacheControl,
			...extraHeaders,
		},
	});
}

function publicJson(body: unknown, status = 200): Response {
	return json(body, status, PUBLIC_CORS);
}

const HTML_HEADERS = {
	"Content-Type": "text/html; charset=utf-8",
	"Cache-Control": "public, max-age=3600",
	"X-Content-Type-Options": "nosniff",
	"Content-Security-Policy":
		"default-src 'none'; style-src 'unsafe-inline'; img-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
	"Referrer-Policy": "no-referrer",
} as const;

function htmlPage(body: string | null): Response {
	return new Response(body, { status: 200, headers: HTML_HEADERS });
}

async function resolveFeed(env: Env): Promise<PromptFeed> {
	const stored = await readStoredFeed(env);
	if (stored) {
		const result = validateFeed(stored);
		if (result.ok) {
			return applyFresherSeedMetrics(result.feed);
		}
		// A bad staged day must never take down today's boards: drop `days` and try again.
		if ((stored as { days?: unknown }).days !== undefined) {
			const { days: _bad, ...rest } = stored as PromptFeed;
			const retry = validateFeed(rest);
			if (retry.ok) {
				console.error(JSON.stringify({ message: "stored_days_invalid", error: result.error }));
				return applyFresherSeedMetrics(retry.feed);
			}
		}
	}
	return cloneSeedFeed();
}

async function handlePublish(request: Request, env: Env): Promise<Response> {
	if (!isAuthorized(request, env)) {
		return json({ error: "unauthorized" }, 401);
	}

	const contentLength = Number(request.headers.get("content-length") ?? 0);
	if (contentLength > MAX_PUBLISH_BYTES) {
		return json({ error: "payload_too_large" }, 413);
	}

	let raw: string;
	try {
		raw = await request.text();
	} catch (error) {
		console.error(
			JSON.stringify({
				message: "publish_body_read_failed",
				error: error instanceof Error ? error.message : String(error),
			}),
		);
		return json({ error: "invalid_json" }, 400);
	}

	if (raw.length > MAX_PUBLISH_BYTES) {
		return json({ error: "payload_too_large" }, 413);
	}

	let parsed: unknown;
	try {
		parsed = JSON.parse(raw);
	} catch {
		return json({ error: "invalid_json" }, 400);
	}

	const result = validateFeed(parsed);
	if (!result.ok) {
		return json({ error: "invalid_feed", detail: result.error }, 400);
	}
	const sportError = unknownSportError(result.feed);
	if (sportError) {
		return json({ error: "invalid_feed", detail: sportError }, 400);
	}

	const updatedAt = new Date().toISOString();
	const feed: PromptFeed = {
		...result.feed,
		updatedAt,
	};
	// A publish without `days` keeps the days already staged (re-validated against the new pool).
	if ((parsed as { days?: unknown }).days === undefined) {
		const previous = await readStoredFeed(env);
		const kept = validateDays(pruneDays((previous as PromptFeed | null)?.days), feed);
		if (kept.ok && Object.keys(kept.days).length > 0) feed.days = kept.days;
	}

	try {
		await writeStoredFeed(env, feed);
	} catch (error) {
		console.error(
			JSON.stringify({
				message: "kv_write_failed",
				error: error instanceof Error ? error.message : String(error),
			}),
		);
		return json({ error: "persist_failed" }, 500);
	}

	console.log(
		JSON.stringify({
			message: "feed_published",
			updatedAt,
			promptCount: feed.prompts.length,
		}),
	);

	return json({ ok: true, updatedAt });
}

/** POST /stage-day {date, entry}: stores one dated day without touching today's top-level boards.
 *  DELETE /stage-day?date=YYYY-MM-DD removes it (hold). */
async function handleStageDay(request: Request, url: URL, env: Env): Promise<Response> {
	if (!isAuthorized(request, env)) return json({ error: "unauthorized" }, 401);
	const stored = await resolveFeed(env);
	const base: PromptFeed = { ...stored, days: pruneDays(stored.days) };
	let date: string | null;
	let days = { ...(base.days ?? {}) };
	if (request.method === "DELETE") {
		date = url.searchParams.get("date");
		if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return json({ error: "invalid_date" }, 400);
		delete days[date];
	} else {
		const raw = await request.text();
		if (raw.length > MAX_PUBLISH_BYTES) return json({ error: "payload_too_large" }, 413);
		let body: { date?: unknown; entry?: unknown };
		try { body = JSON.parse(raw); } catch { return json({ error: "invalid_json" }, 400); }
		date = typeof body.date === "string" ? body.date : null;
		if (!date) return json({ error: "invalid_date" }, 400);
		const one = validateDays({ [date]: body.entry }, base);
		if (!one.ok) return json({ error: "invalid_day", detail: one.error }, 400);
		const sportError = unknownSportError({ ...base, prompts: one.days[date].prompts ?? [], boards: one.days[date].boards });
		if (sportError) return json({ error: "invalid_day", detail: sportError }, 400);
		days[date] = one.days[date];
	}
	const next: PromptFeed = { ...base, days: Object.keys(days).length ? days : undefined };
	if (!next.days) delete next.days;
	delete next.today;
	try {
		await writeStoredFeed(env, next);
	} catch {
		return json({ error: "persist_failed" }, 500);
	}
	console.log(JSON.stringify({ message: "day_staged", date, method: request.method, days: Object.keys(days) }));
	return json({ ok: true, date, today: boardDayKey(), days: Object.keys(days).sort() });
}

async function handleRequest(request: Request, env: Env): Promise<Response> {
	const url = new URL(request.url);
	const path = url.pathname.replace(/\/+$/, "") || "/";

	if (path === "/prompts" && request.method === "OPTIONS") {
		return new Response(null, { status: 204, headers: PUBLIC_CORS });
	}

	if (path === "/prompts") {
		if (request.method !== "GET" && request.method !== "HEAD") {
			return publicJson({ error: "method_not_allowed" }, 405);
		}
		const feed = await resolveFeed(env);
		if (request.method === "HEAD") {
			return new Response(null, {
				status: 200,
				headers: {
					"Content-Type": "application/json; charset=utf-8",
					"Cache-Control": "no-store",
					...PUBLIC_CORS,
				},
			});
		}
		return publicJson(servedFeed(feed));
	}

	if (path === "/health") {
		if (request.method !== "GET") {
			return json({ error: "method_not_allowed" }, 405);
		}
		const feed = await resolveFeed(env);
		const served = servedFeed(feed);
		return json({ ok: true, updatedAt: feed.updatedAt, today: served.today, days: Object.keys(served.days ?? {}).sort(), featured: served.featured ?? null });
	}

	if (path === "/blind/vote") {
		if (request.method !== "POST") {
			return json({ error: "method_not_allowed" }, 405);
		}
		return handleBlindVote(request, env);
	}

	if (path === "/blind/consensus") {
		if (request.method !== "GET") {
			return json({ error: "method_not_allowed" }, 405);
		}
		return handleBlindConsensus(url, env);
	}

	if (path === "/stage-day") {
		if (request.method !== "POST" && request.method !== "DELETE") {
			return json({ error: "method_not_allowed" }, 405);
		}
		return handleStageDay(request, url, env);
	}

	if (path === "/publish") {
		if (request.method !== "POST") {
			return json({ error: "method_not_allowed" }, 405);
		}
		return handlePublish(request, env);
	}

	if (path === "/privacy" || path === "/support" || path === "/") {
		if (request.method !== "GET" && request.method !== "HEAD") {
			return json({ error: "method_not_allowed" }, 405);
		}
		if (path === "/") {
			return new Response(null, {
				status: 302,
				headers: { Location: "/support" },
			});
		}
		const page = path === "/privacy" ? PRIVACY_HTML : SUPPORT_HTML;
		return htmlPage(request.method === "HEAD" ? null : page);
	}

	return json({ error: "not_found" }, 404);
}

export default {
	async fetch(request: Request, env: Env): Promise<Response> {
		try {
			return await handleRequest(request, env);
		} catch (error) {
			console.error(
				JSON.stringify({
					message: "unhandled_error",
					error: error instanceof Error ? error.message : String(error),
				}),
			);
			return json({ error: "internal_error" }, 500);
		}
	},
} satisfies ExportedHandler<Env>;
