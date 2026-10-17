import { env, createExecutionContext, waitOnExecutionContext } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { boardDayKey } from "../src/days";
import worker from "../src/index";
import { cleanName, rankOverall, validateSync, weekKey, previousWeekKey, acceptableScoreDay } from "../src/scores";

let ipCounter = 0;
async function sync(body: unknown): Promise<Response> {
	ipCounter += 1;
	const request = new Request("https://sports-today-prompts.example/lb/sync", {
		method: "POST",
		headers: { "Content-Type": "application/json", "CF-Connecting-IP": `203.0.113.${ipCounter % 250}` },
		body: typeof body === "string" ? body : JSON.stringify(body),
	});
	const ctx = createExecutionContext();
	const response = await worker.fetch(request, env, ctx);
	await waitOnExecutionContext(ctx);
	return response;
}

const hex = (n: number, seed: string) => (seed.repeat(64)).slice(0, n);
const today = () => boardDayKey();

interface Board {
	ok: boolean;
	accepted: boolean | null;
	people: number;
	today: { id: string; name: string | null; points: number; elapsed: number; you: boolean }[];
	overall: { id: string; name: string | null; score: number | null; move: number | null; you: boolean }[];
}

describe("validateSync", () => {
	const base = { id: hex(16, "a1"), secret: hex(32, "f0") };
	it("accepts a minimal body and a full one", () => {
		expect(validateSync(base).ok).toBe(true);
		const full = validateSync({
			...base,
			name: "  kj_knowsball ",
			friends: [hex(16, "b2"), hex(16, "b2"), base.id],
			score: { day: today(), format: "careerPath", points: 10, elapsed: 80 },
			standing: { overall: 82, games: 30, rank: 4 },
		});
		expect(full.ok).toBe(true);
		if (full.ok) {
			expect(full.sync.name).toBe("kj_knowsball");
			expect(full.sync.friends).toEqual([hex(16, "b2")]);
		}
	});
	it("rejects out-of-range scores, bad days, formats, and ids", () => {
		const score = (s: object) => validateSync({ ...base, score: { day: today(), format: "factOrCap", points: 10, elapsed: 5, ...s } });
		expect(score({ points: 11 }).ok).toBe(false);
		expect(score({ points: -1 }).ok).toBe(false);
		expect(score({ points: 7.5 }).ok).toBe(false);
		expect(score({ elapsed: 86_401 }).ok).toBe(false);
		expect(score({ day: "2020-01-01" }).ok).toBe(false);
		expect(score({ format: "poker" }).ok).toBe(false);
		expect(validateSync({ ...base, id: "ABC" }).ok).toBe(false);
		expect(validateSync({ ...base, secret: "short" }).ok).toBe(false);
		expect(validateSync({ ...base, friends: ["nope"] }).ok).toBe(false);
		expect(validateSync({ ...base, standing: { overall: 101, games: 1, rank: 1 } }).ok).toBe(false);
	});
	it("keeps plain names and drops markup", () => {
		expect(cleanName("hoopdreamer22")).toBe("hoopdreamer22");
		expect(cleanName("<script>")).toBeNull();
		expect(cleanName("")).toBeNull();
		expect(cleanName("x".repeat(17))).toBeNull();
	});
	it("takes today's and yesterday's board day only", () => {
		const now = Date.now();
		expect(acceptableScoreDay(boardDayKey(now), now)).toBe(true);
		expect(acceptableScoreDay(boardDayKey(now - 86_400_000), now)).toBe(true);
		expect(acceptableScoreDay(boardDayKey(now + 86_400_000), now)).toBe(false);
	});
	it("weeks start on Sunday", () => {
		expect(weekKey("2026-10-17")).toBe("2026-10-11");
		expect(weekKey("2026-10-11")).toBe("2026-10-11");
		expect(previousWeekKey("2026-10-11")).toBe("2026-10-04");
	});
});

describe("rankOverall", () => {
	it("reports places gained against last week's snapshot", () => {
		const people = [
			{ id: "a", name: "A", overall: 91, games: 40, rank: 5 },
			{ id: "b", name: "B", overall: 88, games: 40, rank: 5 },
			{ id: "c", name: "C", overall: 82, games: 30, rank: 4 },
		];
		const last = new Map([["a", 80], ["b", 88], ["c", 90]]);
		const rows = rankOverall(people, last, "c");
		expect(rows.map((r) => [r.id, r.move])).toEqual([["a", 2], ["b", 0], ["c", -2]]);
		expect(rankOverall(people, new Map(), "c").every((r) => r.move === null)).toBe(true);
	});
});

describe("POST /lb/sync", () => {
	it("claims an id, takes one score per day, and links friends both ways", async () => {
		const me = { id: hex(16, "1a"), secret: hex(32, "9e") };
		const pal = { id: hex(16, "2b"), secret: hex(32, "8d") };
		const day = today();

		let res = await sync({ ...me, name: "kj_knowsball", score: { day, format: "careerPath", points: 10, elapsed: 80 }, standing: { overall: 82, games: 30, rank: 4 } });
		expect(res.status).toBe(200);
		let board = (await res.json()) as Board;
		expect(board.accepted).toBe(true);
		expect(board.today).toHaveLength(1);
		expect(board.today[0]).toMatchObject({ id: me.id, name: "kj_knowsball", points: 10, elapsed: 80, you: true });

		// A second score the same day is ignored, not an error.
		res = await sync({ ...me, score: { day, format: "careerPath", points: 0, elapsed: 5 } });
		board = (await res.json()) as Board;
		expect(board.accepted).toBe(false);
		expect(board.today[0].points).toBe(10);

		// Wrong secret for a claimed id.
		res = await sync({ id: me.id, secret: hex(32, "00") });
		expect(res.status).toBe(403);

		// The friend links to me from their bubble; they see me and I see them.
		res = await sync({ ...pal, name: "hoopdreamer22", friends: [me.id], score: { day, format: "careerPath", points: 10, elapsed: 41 }, standing: { overall: 88, games: 50, rank: 5 } });
		board = (await res.json()) as Board;
		expect(board.people).toBe(2);
		expect(board.today.map((r) => r.id)).toEqual([pal.id, me.id]);

		res = await sync(me);
		board = (await res.json()) as Board;
		expect(board.today.map((r) => r.name)).toEqual(["hoopdreamer22", "kj_knowsball"]);
		expect(board.overall.map((r) => r.score)).toEqual([88, 82]);
		expect(board.overall.find((r) => r.you)?.id).toBe(me.id);
	});

	it("rejects bad bodies", async () => {
		expect((await sync("{")).status).toBe(400);
		expect((await sync({ id: "x" })).status).toBe(400);
		expect((await sync("x".repeat(5000))).status).toBe(413);
		const res = await sync({ id: hex(16, "3c"), secret: hex(32, "7c"), score: { day: today(), format: "factOrCap", points: 12, elapsed: 1 } });
		expect(res.status).toBe(400);
	});

	it("only answers POST", async () => {
		const ctx = createExecutionContext();
		const res = await worker.fetch(new Request("https://sports-today-prompts.example/lb/sync"), env, ctx);
		await waitOnExecutionContext(ctx);
		expect(res.status).toBe(405);
	});
});
