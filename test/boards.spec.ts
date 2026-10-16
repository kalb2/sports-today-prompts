import { describe, expect, it } from "vitest";
import { SEED_FEED } from "../src/feed";
import { validateVote, TEST_DAY } from "../src/blind";
import { feedWhoIsWhoRuleError, unknownSportError, validateFeed, whoIsWhoRuleError } from "../src/validate";

const keep3 = {
	id: "k3-test",
	format: "keep_3_cut_5",
	sport: "nba",
	title: "Test",
	promptText: "Keep 3",
	difficulty: 3,
	items: Array.from({ length: 8 }, (_, i) => ({ rank: i + 1, canonical: `P${i}`, aliases: [`P${i}`], metric: 0 })),
};

const boards = {
	factOrCap: [{ id: "foc-1", sport: "NFL", title: "Brady", difficulty: 2, claim: "Brady has 7 rings.", explanation: "Fact — seven.", correctIsFact: true }],
	higherLower: [{
		id: "hl-1", sport: "nba", title: "Assists", difficulty: 3, subject: "Career assists", metricUnit: "ast",
		anchorLabel: "Magic Johnson", anchorMetric: "10,141", challengeLabel: "John Stockton", challengeMetric: "15,806",
		correctIsHigher: true, explanation: "More — Stockton.",
	}],
	whoIsWho: [{
		id: "who-1", sport: "nfl", title: "Marino or Montana", difficulty: 3, subject: "Career quarterbacks", why: "Rings.",
		boxScore: { id: "marino", label: "Dan Marino" }, consensus: { id: "montana", label: "Joe Montana" },
		lines: [
			{ label: "PASS YDS", boxScore: "61,361", consensus: "40,551", leader: "boxScore" },
			{ label: "PASS TD", boxScore: "420", consensus: "273", leader: "boxScore" },
			{ label: "COMPLETIONS", boxScore: "4,967", consensus: "3,409", leader: "boxScore" },
			{ label: "PRO BOWLS", boxScore: "9", consensus: "8", leader: "boxScore" },
			{ label: "SB WINS", boxScore: "0", consensus: "4", leader: "consensus" },
		],
	}],
	blindTop5: [{
		id: "blind-new-topic", sport: "nba", title: "Point guards", difficulty: 2, body: "Rank these point guards",
		items: ["a", "b", "c", "d", "e"].map((id) => ({ id, label: id.toUpperCase() })),
	}],
};

const full = {
	...SEED_FEED,
	prompts: [{ ...SEED_FEED.prompts[0], difficulty: 2 }, keep3],
	boards,
	featured: {
		top10Guess: SEED_FEED.prompts[0].id, keep3Cut5: "k3-test", factOrCap: "foc-1",
		higherLower: "hl-1", whoIsWho: "who-1", blindTop5: "blind-new-topic",
	},
};

describe("six-game feed", () => {
	it("keeps boards, difficulty and all six featured ids, and mirrors legacy fields", () => {
		const result = validateFeed(full);
		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect(Object.keys(result.feed.featured ?? {}).sort()).toEqual(
			["blindTop5", "factOrCap", "higherLower", "keep3Cut5", "top10Guess", "whoIsWho"],
		);
		expect(result.feed.featuredTop10Id).toBe(SEED_FEED.prompts[0].id);
		expect(result.feed.featuredKeep3Id).toBe("k3-test");
		expect(result.feed.prompts[0].difficulty).toBe(2);
		expect(result.feed.boards?.factOrCap?.[0].sport).toBe("nfl");
		expect(unknownSportError(result.feed)).toBeNull();
	});

	it("drops a featured id that points at the wrong game", () => {
		const result = validateFeed({ ...full, featured: { factOrCap: "hl-1", whoIsWho: "who-1" } });
		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect(result.feed.featured).toEqual({ whoIsWho: "who-1" });
	});

	it("rejects malformed boards", () => {
		const badBlind = { ...boards, blindTop5: [{ ...boards.blindTop5[0], items: boards.blindTop5[0].items.slice(0, 4) }] };
		expect(validateFeed({ ...full, boards: badBlind }).ok).toBe(false);
		const badWho = { ...boards, whoIsWho: [{ ...boards.whoIsWho[0], lines: [{ label: "X", boxScore: "1", consensus: "2", leader: "nobody" }] }] };
		expect(validateFeed({ ...full, boards: badWho }).ok).toBe(false);
		const badFoc = { ...boards, factOrCap: [{ ...boards.factOrCap[0], correctIsFact: "yes" }] };
		expect(validateFeed({ ...full, boards: badFoc }).ok).toBe(false);
		const badDiff = { ...boards, higherLower: [{ ...boards.higherLower[0], difficulty: 9 }] };
		expect(validateFeed({ ...full, boards: badDiff }).ok).toBe(false);
	});

	it("still accepts an old feed with no boards", () => {
		const result = validateFeed(SEED_FEED);
		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect(result.feed.boards).toBeUndefined();
		expect(result.feed.featured).toBeUndefined();
	});

	it("flags an unknown sport on a board", () => {
		const result = validateFeed({ ...full, boards: { ...boards, factOrCap: [{ ...boards.factOrCap[0], sport: "curling" }] } });
		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect(unknownSportError(result.feed)).toMatch(/boards.factOrCap/);
	});
});

describe("blind votes for feed topics", () => {
	const deviceId = "1b4e28ba-2fa1-11d2-883f-0016d3cca427";
	it("accepts a feed-only topic when its items are supplied", () => {
		const extra = { "blind-new-topic": ["a", "b", "c", "d", "e"] };
		expect(validateVote({ date: TEST_DAY, topicId: "blind-new-topic", order: ["e", "d", "c", "b", "a"], deviceId }).ok).toBe(false);
		expect(validateVote({ date: TEST_DAY, topicId: "blind-new-topic", order: ["e", "d", "c", "b", "a"], deviceId }, Date.now(), extra).ok).toBe(true);
	});
});

describe("Guess the Players board rule", () => {
	const who = boards.whoIsWho[0];
	it("accepts 5 rows ending in a punchline", () => {
		expect(whoIsWhoRuleError({ whoIsWho: [who] } as never)).toBeNull();
	});
	it("rejects 4 rows", () => {
		expect(whoIsWhoRuleError({ whoIsWho: [{ ...who, lines: who.lines.slice(1) }] } as never)).toMatch(/exactly 5 lines/);
	});
	it("rejects a last row that is not TITLES or SB WINS", () => {
		const lines = [...who.lines.slice(0, 3), who.lines[4], who.lines[3]];
		expect(whoIsWhoRuleError({ whoIsWho: [{ ...who, lines }] } as never)).toMatch(/last line/);
	});
	it("rejects a punchline in the first two rows", () => {
		const lines = [who.lines[4], ...who.lines.slice(1)];
		expect(whoIsWhoRuleError({ whoIsWho: [{ ...who, lines }] } as never)).toMatch(/lines 1-2/);
	});
	it("checks staged days too", () => {
		const feed = { ...SEED_FEED, days: { "2026-10-17": { featured: {}, boards: { whoIsWho: [{ ...who, lines: who.lines.slice(0, 4) }] } } } };
		expect(feedWhoIsWhoRuleError(feed as never)).toMatch(/days\.2026-10-17/);
	});
});
