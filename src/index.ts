import { isAuthorized } from "./auth";
import { cloneSeedFeed, readStoredFeed, writeStoredFeed, type PromptFeed } from "./feed";
import { MAX_PUBLISH_BYTES, validateFeed } from "./validate";

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

async function resolveFeed(env: Env): Promise<PromptFeed> {
	const stored = await readStoredFeed(env);
	if (stored) {
		const result = validateFeed(stored);
		if (result.ok) {
			return result.feed;
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

	const updatedAt = new Date().toISOString();
	const feed: PromptFeed = {
		...result.feed,
		updatedAt,
	};

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
		return publicJson(feed);
	}

	if (path === "/health") {
		if (request.method !== "GET") {
			return json({ error: "method_not_allowed" }, 405);
		}
		const feed = await resolveFeed(env);
		return json({ ok: true, updatedAt: feed.updatedAt });
	}

	if (path === "/publish") {
		if (request.method !== "POST") {
			return json({ error: "method_not_allowed" }, 405);
		}
		return handlePublish(request, env);
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
