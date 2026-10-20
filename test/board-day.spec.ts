import { describe, expect, it } from "vitest";
import table from "./fixtures/board-day-cases.json";
import { SEED_FEED } from "../src/feed";
import { boardDayKey, pruneDays, servedFeed } from "../src/days";
import { acceptableScoreDay } from "../src/scores";
import { validateFeed } from "../src/validate";

// Shared with kalb2/ball-knowledge (BallKnowledgeTests/board-day-cases.json). Keep both copies identical.
interface Case { instant: string; denver: string; key: string; legacyKey: string; boardStart: string; nextBoard: string }
const cases = (table as { cases: Case[] }).cases;

/** YYYY-MM-DD plus n calendar days (test-local helper, independent of src). */
function shift(key: string, n: number): string {
	const [y, m, d] = key.split("-").map(Number);
	return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}

describe("board day across daylight saving (America/Denver, 7:00 AM local)", () => {
	for (const c of cases) {
		it(`${c.denver} is board day ${c.key}`, () => {
			expect(boardDayKey(Date.parse(c.instant))).toBe(c.key);
		});
	}

	for (const c of cases) {
		it(`${c.denver}: scores for today, yesterday and the pre-fix key are accepted`, () => {
			const now = Date.parse(c.instant);
			expect(acceptableScoreDay(c.key, now)).toBe(true);
			expect(acceptableScoreDay(shift(c.key, -1), now)).toBe(true);
			expect(acceptableScoreDay(c.legacyKey, now)).toBe(true);
			expect(acceptableScoreDay(shift(c.key, 1), now)).toBe(c.legacyKey === shift(c.key, 1));
			expect(acceptableScoreDay(shift(c.key, -2), now)).toBe(c.legacyKey === shift(c.key, -2));
		});
	}

	it("old builds keep their score on Nov 1 2026 6:00-7:00 AM MST and Mar 14 2027 7:00-8:00 AM MDT", () => {
		// Old formula says Nov 1 while the board day is still Oct 31.
		expect(acceptableScoreDay("2026-11-01", Date.parse("2026-11-01T13:30:00Z"))).toBe(true);
		// Old formula says Mar 13 while the board day is already Mar 14 (yesterday, accepted either way).
		expect(acceptableScoreDay("2027-03-13", Date.parse("2027-03-14T13:30:00Z"))).toBe(true);
		// Outside those windows the next day is still rejected.
		expect(acceptableScoreDay("2026-11-02", Date.parse("2026-11-01T19:00:00Z"))).toBe(false);
	});

	for (const c of cases) {
		it(`${c.denver}: prune keeps yesterday and later only`, () => {
			const now = Date.parse(c.instant);
			const entry = { featured: { top10Guess: "x" } };
			const days = { [shift(c.key, -2)]: entry, [shift(c.key, -1)]: entry, [c.key]: entry, [shift(c.key, 1)]: entry };
			expect(Object.keys(pruneDays(days, now) ?? {}).sort()).toEqual([shift(c.key, -1), c.key, shift(c.key, 1)]);
		});
	}

	it("serves Oct 31's staged board until 7:00 AM MST on Nov 1 2026, then Nov 1's", () => {
		const top10 = SEED_FEED.prompts.filter((p) => p.format === "top_10_guess");
		const [a, b] = [top10[0].id, (top10[1] ?? top10[0]).id];
		const r = validateFeed({
			...SEED_FEED,
			featured: { top10Guess: a },
			days: { "2026-10-31": { featured: { top10Guess: a } }, "2026-11-01": { featured: { top10Guess: b } } },
		});
		if (!r.ok) throw new Error(r.error);
		expect(servedFeed(r.feed, Date.parse("2026-11-01T13:30:00Z")).today).toBe("2026-10-31");
		expect(servedFeed(r.feed, Date.parse("2026-11-01T13:30:00Z")).featuredTop10Id).toBe(a);
		expect(servedFeed(r.feed, Date.parse("2026-11-01T14:00:00Z")).today).toBe("2026-11-01");
		expect(servedFeed(r.feed, Date.parse("2026-11-01T14:00:00Z")).featuredTop10Id).toBe(b);
		expect(servedFeed(r.feed, Date.parse("2027-03-14T13:30:00Z")).today).toBe("2027-03-14");
	});
});
