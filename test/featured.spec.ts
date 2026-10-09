import { describe, expect, it } from "vitest";
import { SEED_FEED } from "../src/feed";
import { validateFeed } from "../src/validate";

const keep3 = {
	id: "k3-test",
	format: "keep_3_cut_5",
	sport: "nba",
	title: "Test",
	promptText: "Keep 3",
	items: Array.from({ length: 8 }, (_, i) => ({ rank: i + 1, canonical: `P${i}`, aliases: [`P${i}`], metric: 0 })),
};

describe("featured ids", () => {
	it("keeps ids that match a prompt of the right format", () => {
		const top10 = SEED_FEED.prompts[0];
		const result = validateFeed({
			...SEED_FEED,
			prompts: [top10, keep3],
			featuredTop10Id: top10.id,
			featuredKeep3Id: "k3-test",
		});
		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect(result.feed.featuredTop10Id).toBe(top10.id);
		expect(result.feed.featuredKeep3Id).toBe("k3-test");
	});

	it("drops ids that are missing or point at the wrong format", () => {
		const top10 = SEED_FEED.prompts[0];
		const result = validateFeed({
			...SEED_FEED,
			prompts: [top10, keep3],
			featuredTop10Id: "k3-test",
			featuredKeep3Id: "nope",
		});
		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect(result.feed.featuredTop10Id).toBeUndefined();
		expect(result.feed.featuredKeep3Id).toBeUndefined();
	});

	it("leaves a feed without ids unchanged", () => {
		const result = validateFeed(SEED_FEED);
		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect("featuredTop10Id" in result.feed).toBe(false);
	});
});

describe("sport field", () => {
	it("normalizes case and spacing on read", async () => {
		const { validateFeed } = await import("../src/validate");
		const prompt = { ...SEED_FEED.prompts[0], sport: " NFL " };
		const result = validateFeed({ ...SEED_FEED, prompts: [prompt] });
		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect(result.feed.prompts[0].sport).toBe("nfl");
	});

	it("flags unknown sports for publish", async () => {
		const { validateFeed, unknownSportError } = await import("../src/validate");
		const ok = validateFeed(SEED_FEED);
		expect(ok.ok && unknownSportError(ok.feed)).toBe(null);
		const bad = validateFeed({ ...SEED_FEED, prompts: [{ ...SEED_FEED.prompts[0], sport: "golf" }] });
		expect(bad.ok).toBe(true);
		if (!bad.ok) return;
		expect(unknownSportError(bad.feed)).toContain("sport must be one of");
	});
});
