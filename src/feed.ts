export const FEED_KEY = "feed:v1";
export const FEED_VERSION = 1;

export interface PromptItem {
	rank: number;
	canonical: string;
	aliases: string[];
	metric: number;
}

export interface Prompt {
	id: string;
	format: string;
	sport: string;
	title: string;
	promptText: string;
	metricLabel: string;
	strikesAllowed: number;
	acceptAliases: boolean;
	items: PromptItem[];
}

export interface PromptFeed {
	version: number;
	updatedAt: string;
	prompts: Prompt[];
}

/**
 * Fallback served when KV `feed:v1` is missing or empty.
 * PFR-style career passing yards through the 2025 regular season.
 * Refresh from Notion / Pro-Football-Reference before treating as live truth.
 */
export const SEED_FEED: PromptFeed = {
	version: FEED_VERSION,
	updatedAt: "2026-09-19T00:00:00.000Z",
	prompts: [
		{
			id: "t10_nfl_003",
			format: "top_10_guess",
			sport: "nfl",
			title: "All-time NFL QBs by career passing yards",
			promptText: "Guess the top 10 career NFL passing yards leaders.",
			metricLabel: "yds",
			strikesAllowed: 3,
			acceptAliases: true,
			items: [
				{
					rank: 1,
					canonical: "Tom Brady",
					aliases: ["Brady", "Tom Brady"],
					metric: 89214,
				},
				{
					rank: 2,
					canonical: "Drew Brees",
					aliases: ["Brees", "Drew Brees"],
					metric: 80358,
				},
				{
					rank: 3,
					canonical: "Peyton Manning",
					aliases: ["Peyton", "Peyton Manning", "P Manning"],
					metric: 71940,
				},
				{
					rank: 4,
					canonical: "Brett Favre",
					aliases: ["Favre", "Brett Favre"],
					metric: 71838,
				},
				{
					rank: 5,
					canonical: "Aaron Rodgers",
					aliases: ["Rodgers", "Aaron Rodgers"],
					metric: 66274,
				},
				{
					rank: 6,
					canonical: "Matthew Stafford",
					aliases: ["Stafford", "Matt Stafford", "Matthew Stafford"],
					metric: 64516,
				},
				{
					rank: 7,
					canonical: "Ben Roethlisberger",
					aliases: ["Roethlisberger", "Big Ben", "Ben Roethlisberger"],
					metric: 64088,
				},
				{
					rank: 8,
					canonical: "Philip Rivers",
					aliases: ["Rivers", "Philip Rivers", "Phil Rivers"],
					metric: 63984,
				},
				{
					rank: 9,
					canonical: "Matt Ryan",
					aliases: ["Ryan", "Matt Ryan", "Matty Ice"],
					metric: 62792,
				},
				{
					rank: 10,
					canonical: "Dan Marino",
					aliases: ["Marino", "Dan Marino"],
					metric: 61361,
				},
			],
		},
	],
};

export function cloneSeedFeed(): PromptFeed {
	return structuredClone(SEED_FEED);
}

export async function readStoredFeed(env: Env): Promise<PromptFeed | null> {
	try {
		const stored = await env.FEED.get(FEED_KEY, "text");
		if (stored == null || stored.trim() === "") {
			return null;
		}
		return JSON.parse(stored) as unknown as PromptFeed;
	} catch (error) {
		console.error(
			JSON.stringify({
				message: "kv_read_failed",
				key: FEED_KEY,
				error: error instanceof Error ? error.message : String(error),
			}),
		);
		return null;
	}
}

export async function writeStoredFeed(env: Env, feed: PromptFeed): Promise<void> {
	await env.FEED.put(FEED_KEY, JSON.stringify(feed));
}
