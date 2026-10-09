import { describe, expect, it } from "vitest";
import { computeConsensus, MIN_CONSENSUS_VOTES, TEST_DAY, validateVote, voterKey } from "../src/blind";
import { BLIND_TOPICS } from "../src/blind-topics";

const topicId = "blind-cfb-heisman-2000s";
const items = [...BLIND_TOPICS[topicId]];
const deviceId = "1b4e28ba-2fa1-11d2-883f-0016d3cca427";

describe("validateVote", () => {
	it("accepts five unique items from the topic", () => {
		const result = validateVote({ date: TEST_DAY, topicId, order: items, deviceId });
		expect(result.ok).toBe(true);
	});
	it("rejects duplicates, foreign items, bad topics, and bad dates", () => {
		expect(validateVote({ date: TEST_DAY, topicId, order: [items[0], ...items.slice(0, 4)], deviceId }).ok).toBe(false);
		expect(validateVote({ date: TEST_DAY, topicId, order: [...items.slice(0, 4), "nobody"], deviceId }).ok).toBe(false);
		expect(validateVote({ date: TEST_DAY, topicId: "running-backs", order: items, deviceId }).ok).toBe(false);
		expect(validateVote({ date: "1990-01-01", topicId, order: items, deviceId }).ok).toBe(false);
		expect(validateVote({ date: TEST_DAY, topicId, order: items, deviceId: "kaleb" }).ok).toBe(false);
	});
});

describe("computeConsensus", () => {
	it("hides the order below the threshold", () => {
		const result = computeConsensus(topicId, Array(MIN_CONSENSUS_VOTES - 1).fill(items));
		expect(result.order).toBeUndefined();
		expect(result.count).toBe(MIN_CONSENSUS_VOTES - 1);
	});
	it("orders by average position and breaks ties by bundled order", () => {
		const reversed = [...items].reverse();
		const result = computeConsensus(topicId, [...Array(5).fill(items), ...Array(5).fill(reversed)]);
		expect(result.order).toEqual(items);
		expect(result.avg?.[items[0]]).toBe(3);
		const skewed = computeConsensus(topicId, [...Array(4).fill(items), ...Array(6).fill(reversed)]);
		expect(skewed.order).toEqual(reversed);
	});
});

describe("voterKey", () => {
	it("is stable and does not contain the raw id", async () => {
		const key = await voterKey(deviceId);
		expect(key).toHaveLength(32);
		expect(key).toBe(await voterKey(deviceId));
		expect(key.includes("2fa1")).toBe(false);
	});
});
