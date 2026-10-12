import { describe, expect, it } from "vitest";
import { SEED_FEED } from "../src/feed";
import { boardDayKey, servedFeed } from "../src/days";
import { validateFeed } from "../src/validate";

const top10 = SEED_FEED.prompts.find((p) => p.format === "top_10_guess")!;
const blind = (id: string) => ({ id, sport: "nba", title: id, body: id, difficulty: 3,
	items: ["a", "b", "c", "d", "e"].map((x) => ({ id: `${id}-${x}`, label: x.toUpperCase() })) });

// 2026-10-13 06:59 MT = 12:59Z; 07:00 MT = 13:00Z (MDT, UTC-6)
const BEFORE = Date.parse("2026-10-13T12:59:00Z");
const AFTER = Date.parse("2026-10-13T13:00:00Z");

function feedWithDay() {
	const r = validateFeed({
		...SEED_FEED,
		featured: { top10Guess: top10.id },
		days: { "2026-10-13": { featured: { top10Guess: top10.id, blindTop5: "blind-x" }, boards: { blindTop5: [blind("blind-x")] } } },
	});
	if (!r.ok) throw new Error(r.error);
	return r.feed;
}

describe("dated days", () => {
	it("board day rolls at 7:00 AM MT", () => {
		expect(boardDayKey(BEFORE)).toBe("2026-10-12");
		expect(boardDayKey(AFTER)).toBe("2026-10-13");
	});
	it("validates and keeps a day entry", () => {
		const f = feedWithDay();
		expect(f.days?.["2026-10-13"].featured.blindTop5).toBe("blind-x");
	});
	it("serves yesterday's top level before 7 and the staged day at 7", () => {
		const f = feedWithDay();
		const before = servedFeed(f, BEFORE);
		expect(before.today).toBe("2026-10-12");
		expect(before.featured?.blindTop5).toBeUndefined();
		const after = servedFeed(f, AFTER);
		expect(after.today).toBe("2026-10-13");
		expect(after.featured?.blindTop5).toBe("blind-x");
		expect(after.featuredTop10Id).toBe(top10.id);
		expect(after.boards?.blindTop5?.[0].id).toBe("blind-x");
	});
	it("rejects a day whose featured id has no board", () => {
		const r = validateFeed({ ...SEED_FEED, days: { "2026-10-13": { featured: { blindTop5: "nope" } } } });
		expect(r.ok).toBe(false);
	});
	it("rejects a bad date key", () => {
		const r = validateFeed({ ...SEED_FEED, days: { "Oct 13": { featured: { top10Guess: top10.id } } } });
		expect(r.ok).toBe(false);
	});
	it("prunes days older than yesterday when serving", () => {
		const f = feedWithDay();
		const later = servedFeed(f, Date.parse("2026-10-16T14:00:00Z"));
		expect(later.days).toBeUndefined();
	});
});
