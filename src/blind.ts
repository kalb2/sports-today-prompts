import { BLIND_TOPICS } from "./blind-topics";

/** Community ranking appears only once a topic has this many votes for the day. */
export const MIN_CONSENSUS_VOTES = 10;
/** Reserved date for synthetic test votes. Never a real daily board. */
export const TEST_DAY = "2000-01-01";

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface BlindVote {
	day: string;
	topicId: string;
	order: string[];
	deviceId: string;
}

export interface Consensus {
	count: number;
	minCount: number;
	order?: string[];
	avg?: Record<string, number>;
}

function denverDay(offsetDays: number, now = Date.now()): string {
	return new Intl.DateTimeFormat("en-CA", {
		timeZone: "America/Denver",
		year: "numeric",
		month: "2-digit",
		day: "2-digit",
	}).format(new Date(now + offsetDays * 86_400_000));
}

/** Yesterday, today, or tomorrow in Mountain Time (covers device clocks near midnight), or the test day. */
export function acceptableDay(day: unknown, now = Date.now()): day is string {
	if (typeof day !== "string" || !DAY_RE.test(day)) return false;
	if (day === TEST_DAY) return true;
	return [-1, 0, 1].some((offset) => denverDay(offset, now) === day);
}

export function validateVote(value: unknown, now = Date.now()): { ok: true; vote: BlindVote } | { ok: false; error: string } {
	if (typeof value !== "object" || value === null || Array.isArray(value)) {
		return { ok: false, error: "body must be a JSON object" };
	}
	const record = value as Record<string, unknown>;
	const day = record.date;
	if (!acceptableDay(day, now)) return { ok: false, error: "date" };
	const topicId = record.topicId;
	if (typeof topicId !== "string" || !Object.hasOwn(BLIND_TOPICS, topicId)) {
		return { ok: false, error: "topicId" };
	}
	const deviceId = record.deviceId;
	if (typeof deviceId !== "string" || !UUID_RE.test(deviceId)) return { ok: false, error: "deviceId" };
	const order = record.order;
	const allowed = new Set(BLIND_TOPICS[topicId]);
	if (
		!Array.isArray(order) ||
		order.length !== allowed.size ||
		order.some((id) => typeof id !== "string" || !allowed.has(id)) ||
		new Set(order).size !== order.length
	) {
		return { ok: false, error: "order" };
	}
	return { ok: true, vote: { day, topicId, order: order as string[], deviceId: deviceId.toLowerCase() } };
}

/** One-way voter key. The raw install id is never stored. */
export async function voterKey(deviceId: string): Promise<string> {
	const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`bk-blind-v1:${deviceId}`));
	return [...new Uint8Array(digest)].slice(0, 16).map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function recordVote(db: D1Database, vote: BlindVote): Promise<void> {
	const voter = await voterKey(vote.deviceId);
	await db
		.prepare(
			`INSERT INTO blind_votes (day, topic, voter, ord, updated_at) VALUES (?1, ?2, ?3, ?4, ?5)
			 ON CONFLICT (day, topic, voter) DO UPDATE SET ord = excluded.ord, updated_at = excluded.updated_at`,
		)
		.bind(vote.day, vote.topicId, voter, JSON.stringify(vote.order), Date.now())
		.run();
}

/** Average 1-based position per item. Ties go to the topic's bundled item order. */
export function computeConsensus(topicId: string, orders: string[][]): Consensus {
	const items = BLIND_TOPICS[topicId] ?? [];
	const count = orders.length;
	if (count < MIN_CONSENSUS_VOTES) return { count, minCount: MIN_CONSENSUS_VOTES };
	const sums = new Map(items.map((id) => [id, 0]));
	for (const order of orders) {
		order.forEach((id, index) => {
			if (sums.has(id)) sums.set(id, (sums.get(id) ?? 0) + index + 1);
		});
	}
	const avg: Record<string, number> = {};
	for (const id of items) avg[id] = Math.round(((sums.get(id) ?? 0) / count) * 100) / 100;
	const order = [...items].sort((a, b) => {
		const diff = (sums.get(a) ?? 0) - (sums.get(b) ?? 0);
		return diff !== 0 ? diff : items.indexOf(a) - items.indexOf(b);
	});
	return { count, minCount: MIN_CONSENSUS_VOTES, order, avg };
}

export async function readConsensus(db: D1Database, day: string, topicId: string): Promise<Consensus> {
	const rows = await db
		.prepare("SELECT ord FROM blind_votes WHERE day = ?1 AND topic = ?2")
		.bind(day, topicId)
		.all<{ ord: string }>();
	const orders: string[][] = [];
	for (const row of rows.results ?? []) {
		try {
			const parsed = JSON.parse(row.ord);
			if (Array.isArray(parsed)) orders.push(parsed.map(String));
		} catch {
			// Skip a malformed row rather than failing the whole read.
		}
	}
	return computeConsensus(topicId, orders);
}

export function isKnownTopic(topicId: unknown): topicId is string {
	return typeof topicId === "string" && Object.hasOwn(BLIND_TOPICS, topicId);
}
