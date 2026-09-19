import { env, createExecutionContext, waitOnExecutionContext } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { SEED_FEED } from "../src/feed";
import worker from "../src/index";

const TOKEN = "test-publish-token";

async function fetchWorker(path: string, init?: RequestInit): Promise<Response> {
	const request = new Request(`https://sports-today-prompts.example${path}`, init);
	const ctx = createExecutionContext();
	const response = await worker.fetch(request, env, ctx);
	await waitOnExecutionContext(ctx);
	return response;
}

describe("GET /prompts", () => {
	it("returns the Career Passing Yards seed when KV is empty", async () => {
		const response = await fetchWorker("/prompts");
		expect(response.status).toBe(200);
		expect(response.headers.get("Access-Control-Allow-Origin")).toBe("*");
		expect(response.headers.get("Content-Type")).toContain("application/json");

		const body = (await response.json()) as typeof SEED_FEED;
		expect(body.version).toBe(1);
		expect(body.updatedAt).toBe(SEED_FEED.updatedAt);
		expect(body.prompts).toHaveLength(1);
		expect(body.prompts[0]?.id).toBe("t10_nfl_003");
		expect(body.prompts[0]?.format).toBe("top_10_guess");
		expect(body.prompts[0]?.items).toHaveLength(10);
		expect(body.prompts[0]?.items[0]).toMatchObject({
			rank: 1,
			canonical: "Tom Brady",
			metric: 89214,
		});
		expect(body.prompts[0]?.items.map((item) => item.rank)).toEqual([
			1, 2, 3, 4, 5, 6, 7, 8, 9, 10,
		]);
	});

	it("handles CORS preflight", async () => {
		const response = await fetchWorker("/prompts", { method: "OPTIONS" });
		expect(response.status).toBe(204);
		expect(response.headers.get("Access-Control-Allow-Origin")).toBe("*");
	});
});

describe("GET /health", () => {
	it("reports ok and the seed updatedAt when KV is empty", async () => {
		const response = await fetchWorker("/health");
		expect(response.status).toBe(200);
		const body = (await response.json()) as { ok: boolean; updatedAt: string };
		expect(body).toEqual({ ok: true, updatedAt: SEED_FEED.updatedAt });
	});
});

describe("POST /publish", () => {
	it("rejects missing or wrong bearer tokens", async () => {
		const missing = await fetchWorker("/publish", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify(SEED_FEED),
		});
		expect(missing.status).toBe(401);

		const wrong = await fetchWorker("/publish", {
			method: "POST",
			headers: {
				Authorization: "Bearer wrong-token",
				"Content-Type": "application/json",
			},
			body: JSON.stringify(SEED_FEED),
		});
		expect(wrong.status).toBe(401);
	});

	it("rejects an invalid feed", async () => {
		const response = await fetchWorker("/publish", {
			method: "POST",
			headers: {
				Authorization: `Bearer ${TOKEN}`,
				"Content-Type": "application/json",
			},
			body: JSON.stringify({ version: 1, prompts: [{ id: "bad" }] }),
		});
		expect(response.status).toBe(400);
		const body = (await response.json()) as { error: string };
		expect(body.error).toBe("invalid_feed");
	});

	it("writes a valid feed to KV and serves it from GET /prompts", async () => {
		const published = {
			...SEED_FEED,
			prompts: [
				{
					...SEED_FEED.prompts[0],
					title: "Published career passing yards",
				},
			],
		};

		const publish = await fetchWorker("/publish", {
			method: "POST",
			headers: {
				Authorization: `Bearer ${TOKEN}`,
				"Content-Type": "application/json",
			},
			body: JSON.stringify(published),
		});
		expect(publish.status).toBe(200);
		const publishBody = (await publish.json()) as { ok: boolean; updatedAt: string };
		expect(publishBody.ok).toBe(true);
		expect(publishBody.updatedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);

		const feed = await fetchWorker("/prompts");
		const body = (await feed.json()) as typeof SEED_FEED;
		expect(body.prompts[0]?.title).toBe("Published career passing yards");
		expect(body.updatedAt).toBe(publishBody.updatedAt);

		const health = await fetchWorker("/health");
		const healthBody = (await health.json()) as { ok: boolean; updatedAt: string };
		expect(healthBody.updatedAt).toBe(publishBody.updatedAt);
	});
});

describe("unknown routes", () => {
	it("returns 404 JSON", async () => {
		const response = await fetchWorker("/nope");
		expect(response.status).toBe(404);
		const body = (await response.json()) as { error: string };
		expect(body.error).toBe("not_found");
	});
});
