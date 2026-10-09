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
	/** Today's shared Top 10 board. Only kept when it names a Top 10 prompt in this feed. */
	featuredTop10Id?: string;
	/** Today's shared Keep 3 board. Only kept when it names an 8-item Keep 3 prompt in this feed. */
	featuredKeep3Id?: string;
}

/**
 * Fallback served when KV `feed:v1` is missing or empty.
 * Pro-Football-Reference career passing yards as of 2026-10-06:
 * https://www.pro-football-reference.com/leaders/pass_yds_career.htm
 * Aaron Rodgers 67,273 and Matthew Stafford 65,705. Retired leaders are unchanged.
 * A stored feed keeps its own players and order. For the same prompt and player,
 * a higher seed total replaces a lower stored total.
 */
export const SEED_FEED: PromptFeed = {
	version: FEED_VERSION,
	updatedAt: "2026-10-06T19:00:00.000Z",
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
					metric: 67273,
				},
				{
					rank: 6,
					canonical: "Matthew Stafford",
					aliases: ["Stafford", "Matt Stafford", "Matthew Stafford"],
					metric: 65705,
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

function laterTimestamp(left: string, right: string): string {
	const leftMs = Date.parse(left);
	const rightMs = Date.parse(right);
	if (Number.isNaN(leftMs) || Number.isNaN(rightMs)) {
		return left >= right ? left : right;
	}
	return leftMs >= rightMs ? left : right;
}

/**
 * KV can lag the seed. For a prompt id that exists in both, a higher seed
 * career total for the same player replaces a lower stored total. Players,
 * ranks, and aliases on the stored board are left as published.
 */
export function applyFresherSeedMetrics(feed: PromptFeed): PromptFeed {
	const seedById = new Map(SEED_FEED.prompts.map((prompt) => [prompt.id, prompt]));
	let changed = false;
	const prompts = feed.prompts.map((prompt) => {
		const seed = seedById.get(prompt.id);
		if (!seed) {
			return prompt;
		}
		const seedMetrics = new Map(
			seed.items.map((item) => [item.canonical.toLowerCase(), item.metric]),
		);
		let promptChanged = false;
		const items = prompt.items.map((item) => {
			const fresh = seedMetrics.get(item.canonical.toLowerCase());
			if (fresh === undefined || item.metric >= fresh) {
				return item;
			}
			promptChanged = true;
			changed = true;
			return { ...item, metric: fresh };
		});
		if (!promptChanged) {
			return prompt;
		}
		return { ...prompt, items };
	});
	if (!changed) {
		return feed;
	}
	return {
		...feed,
		prompts,
		updatedAt: laterTimestamp(feed.updatedAt, SEED_FEED.updatedAt),
	};
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
