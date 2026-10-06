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
		expect(body.prompts[0]?.items[4]).toMatchObject({
			rank: 5,
			canonical: "Aaron Rodgers",
			metric: 67273,
		});
		expect(body.prompts[0]?.items[5]).toMatchObject({
			rank: 6,
			canonical: "Matthew Stafford",
			metric: 65705,
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

	it("raises stale Rodgers and Stafford totals without reordering the board", async () => {
		const stale = structuredClone(SEED_FEED);
		stale.updatedAt = "2026-10-06T11:56:42.000Z";
		stale.prompts[0]!.items[4]!.metric = 66274;
		stale.prompts[0]!.items[5]!.metric = 64516;
		stale.prompts.push({
			id: "t10_nba_006",
			format: "top_10_guess",
			sport: "nba",
			title: "All-time NBA career assists leaders",
			promptText: "Name the 10 players with the most NBA regular-season career assists.",
			metricLabel: "ast",
			strikesAllowed: 3,
			acceptAliases: true,
			items: [
				{
					rank: 1,
					canonical: "John Stockton",
					aliases: ["Stockton", "John Stockton"],
					metric: 15806,
				},
			],
		});

		const publish = await fetchWorker("/publish", {
			method: "POST",
			headers: {
				Authorization: `Bearer ${TOKEN}`,
				"Content-Type": "application/json",
			},
			body: JSON.stringify(stale),
		});
		expect(publish.status).toBe(200);
		const publishBody = (await publish.json()) as { updatedAt: string };
		const expectedUpdatedAt =
			Date.parse(publishBody.updatedAt) >= Date.parse(SEED_FEED.updatedAt)
				? publishBody.updatedAt
				: SEED_FEED.updatedAt;

		const feed = await fetchWorker("/prompts");
		const body = (await feed.json()) as typeof SEED_FEED;
		const passing = body.prompts[0];
		expect(passing?.id).toBe("t10_nfl_003");
		expect(passing?.items.map((item) => item.canonical)).toEqual(
			SEED_FEED.prompts[0]?.items.map((item) => item.canonical),
		);
		expect(passing?.items.map((item) => item.rank)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
		expect(passing?.items[4]).toMatchObject({
			canonical: "Aaron Rodgers",
			aliases: ["Rodgers", "Aaron Rodgers"],
			metric: 67273,
		});
		expect(passing?.items[5]).toMatchObject({
			canonical: "Matthew Stafford",
			aliases: ["Stafford", "Matt Stafford", "Matthew Stafford"],
			metric: 65705,
		});
		expect(passing?.items[6]?.metric).toBe(64088);
		expect(body.prompts[1]).toMatchObject({
			id: "t10_nba_006",
			items: [{ canonical: "John Stockton", metric: 15806 }],
		});
		expect(body.updatedAt).toBe(expectedUpdatedAt);
	});

	it("keeps a published career total that is already higher than the seed", async () => {
		const newer = structuredClone(SEED_FEED);
		newer.updatedAt = "2026-10-07T15:00:00.000Z";
		newer.prompts[0]!.items[5]!.metric = 70000;

		const publish = await fetchWorker("/publish", {
			method: "POST",
			headers: {
				Authorization: `Bearer ${TOKEN}`,
				"Content-Type": "application/json",
			},
			body: JSON.stringify(newer),
		});
		expect(publish.status).toBe(200);
		const publishBody = (await publish.json()) as { updatedAt: string };

		const feed = await fetchWorker("/prompts");
		const body = (await feed.json()) as typeof SEED_FEED;
		expect(body.prompts[0]?.items[4]?.metric).toBe(67273);
		expect(body.prompts[0]?.items[5]?.metric).toBe(70000);
		expect(body.updatedAt).toBe(publishBody.updatedAt);
	});
});

describe("public pages", () => {
	it("returns privacy and support HTML", async () => {
		for (const path of ["/privacy", "/support"]) {
			const response = await fetchWorker(path);
			expect(response.status).toBe(200);
			expect(response.headers.get("Content-Type")).toContain("text/html");
			expect(response.headers.get("Cache-Control")).toBe("public, max-age=3600");
			expect(response.headers.get("X-Content-Type-Options")).toBe("nosniff");
			expect(response.headers.get("Referrer-Policy")).toBe("no-referrer");
			const body = await response.text();
			expect(body).toContain("Ball Knowledge Games");
			expect(body).toContain("k24corp@gmail.com");
		}
	});

	it("returns an empty body for HEAD", async () => {
		for (const path of ["/privacy", "/support"]) {
			const response = await fetchWorker(path, { method: "HEAD" });
			expect(response.status).toBe(200);
			expect(response.headers.get("Content-Type")).toContain("text/html");
			expect(await response.text()).toBe("");
		}
	});

	it("rejects POST /privacy", async () => {
		const response = await fetchWorker("/privacy", { method: "POST" });
		expect(response.status).toBe(405);
	});

	it("redirects / to /support", async () => {
		const response = await fetchWorker("/");
		expect(response.status).toBe(302);
		expect(response.headers.get("Location")).toBe("/support");
	});

	it("still returns the prompts feed JSON", async () => {
		const response = await fetchWorker("/prompts");
		expect(response.status).toBe(200);
		expect(response.headers.get("Content-Type")).toContain("application/json");
		const body = (await response.json()) as typeof SEED_FEED;
		expect(body.version).toBe(1);
		expect(body.prompts.length).toBeGreaterThan(0);
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
