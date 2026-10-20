import { addDays, boardDayKey, legacyBoardDayKey } from "./days";

/**
 * Friends leaderboard for the Ball Knowledge app.
 *
 * No accounts. A player is an anonymous per-install id (16 hex) plus a per-install secret
 * that only the device knows; the first sync claims the id and stores a hash of the secret.
 * Friends link through the ids that ride on Messages bubbles. There is no global board.
 */

export const ID_RE = /^[0-9a-f]{16}$/;
const SECRET_RE = /^[0-9a-f]{32,64}$/;
const NAME_RE = /^[\p{L}\p{N}\p{M} _.'’-]{1,16}$/u;
export const SCORE_FORMATS = new Set([
	"top10Guess",
	"factOrCap",
	"higherLower",
	"blindTop5",
	"keep3Cut5",
	"whoIsWho",
	"careerPath",
]);
export const MAX_SYNC_BYTES = 4096;
export const MAX_FRIENDS_PER_SYNC = 64;
/** Cap on everyone shown on one board (you included). */
export const MAX_BOARD_PEOPLE = 80;
export const MAX_ELAPSED = 86_400;

export interface ScoreInput {
	day: string;
	format: string;
	points: number;
	elapsed: number;
}

export interface StandingInput {
	overall: number | null;
	games: number;
	rank: number;
}

export interface SyncInput {
	id: string;
	secret: string;
	name: string | null;
	friends: string[];
	score?: ScoreInput;
	standing?: StandingInput;
}

export interface TodayRow {
	id: string;
	name: string | null;
	points: number;
	elapsed: number;
	format: string;
	you: boolean;
}

export interface OverallRow {
	id: string;
	name: string | null;
	score: number | null;
	rank: number;
	games: number;
	/** Places gained since last week (negative = dropped). Null with no snapshot to compare. */
	move: number | null;
	you: boolean;
}

export interface BoardReply {
	ok: true;
	day: string;
	week: string;
	accepted: boolean | null;
	people: number;
	today: TodayRow[];
	overall: OverallRow[];
}

const isInt = (v: unknown, min: number, max: number): v is number =>
	typeof v === "number" && Number.isInteger(v) && v >= min && v <= max;

/** Display name, or null when it is missing or not a plain name. A bad name never fails a sync. */
export function cleanName(raw: unknown): string | null {
	if (typeof raw !== "string") return null;
	const name = raw.normalize("NFC").trim().replace(/\s+/g, " ");
	if (!NAME_RE.test(name)) return null;
	return name;
}

/**
 * Board day of the score: today's board or yesterday's (a queued offline finish), plus the day the
 * pre-fix formula gives, so builds from before the daylight-saving fix keep their scores in the one
 * hour a year it disagrees.
 */
export function acceptableScoreDay(day: unknown, now = Date.now()): day is string {
	if (typeof day !== "string") return false;
	const today = boardDayKey(now);
	return day === today || day === addDays(today, -1) || day === legacyBoardDayKey(now);
}

/** Sunday that starts the board week holding `day` (YYYY-MM-DD). */
export function weekKey(day: string): string {
	const [y, m, d] = day.split("-").map(Number);
	const date = new Date(Date.UTC(y, (m ?? 1) - 1, d ?? 1));
	date.setUTCDate(date.getUTCDate() - date.getUTCDay());
	return date.toISOString().slice(0, 10);
}

export function previousWeekKey(week: string): string {
	const [y, m, d] = week.split("-").map(Number);
	const date = new Date(Date.UTC(y, (m ?? 1) - 1, (d ?? 1) - 7));
	return date.toISOString().slice(0, 10);
}

export function validateSync(
	value: unknown,
	now = Date.now(),
): { ok: true; sync: SyncInput } | { ok: false; error: string } {
	if (typeof value !== "object" || value === null || Array.isArray(value)) return { ok: false, error: "body" };
	const r = value as Record<string, unknown>;
	if (typeof r.id !== "string" || !ID_RE.test(r.id)) return { ok: false, error: "id" };
	if (typeof r.secret !== "string" || !SECRET_RE.test(r.secret)) return { ok: false, error: "secret" };
	let friends: string[] = [];
	if (r.friends !== undefined) {
		if (!Array.isArray(r.friends) || r.friends.length > MAX_FRIENDS_PER_SYNC) return { ok: false, error: "friends" };
		if (r.friends.some((f) => typeof f !== "string" || !ID_RE.test(f))) return { ok: false, error: "friends" };
		friends = [...new Set(r.friends as string[])].filter((f) => f !== r.id);
	}
	const sync: SyncInput = { id: r.id, secret: r.secret, name: cleanName(r.name), friends };
	if (r.score !== undefined && r.score !== null) {
		const s = r.score as Record<string, unknown>;
		if (typeof s !== "object" || Array.isArray(s)) return { ok: false, error: "score" };
		if (!acceptableScoreDay(s.day, now)) return { ok: false, error: "score.day" };
		if (typeof s.format !== "string" || !SCORE_FORMATS.has(s.format)) return { ok: false, error: "score.format" };
		if (!isInt(s.points, 0, 10)) return { ok: false, error: "score.points" };
		if (!isInt(s.elapsed, 0, MAX_ELAPSED)) return { ok: false, error: "score.elapsed" };
		sync.score = { day: s.day, format: s.format, points: s.points, elapsed: s.elapsed };
	}
	if (r.standing !== undefined && r.standing !== null) {
		const s = r.standing as Record<string, unknown>;
		if (typeof s !== "object" || Array.isArray(s)) return { ok: false, error: "standing" };
		const overall = s.overall === null || s.overall === undefined ? null : s.overall;
		if (overall !== null && !isInt(overall, 0, 100)) return { ok: false, error: "standing.overall" };
		if (!isInt(s.games, 0, 1_000_000)) return { ok: false, error: "standing.games" };
		if (!isInt(s.rank, 0, 5)) return { ok: false, error: "standing.rank" };
		if (overall === null && s.games !== 0) return { ok: false, error: "standing.overall" };
		sync.standing = { overall: overall as number | null, games: s.games, rank: s.rank };
	}
	return { ok: true, sync };
}

async function sha256Hex(text: string): Promise<string> {
	const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
	return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export function secretHash(id: string, secret: string): Promise<string> {
	return sha256Hex(`bk-lb-v1:${id}:${secret}`);
}

function sameHash(a: string, b: string): boolean {
	if (a.length !== b.length) return false;
	let diff = 0;
	for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
	return diff === 0;
}

const SCHEMA = [
	`CREATE TABLE IF NOT EXISTS lb_players (id TEXT PRIMARY KEY, secret_hash TEXT NOT NULL, name TEXT, overall INTEGER, games INTEGER NOT NULL DEFAULT 0, rank INTEGER NOT NULL DEFAULT 0, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL)`,
	`CREATE TABLE IF NOT EXISTS lb_daily (day TEXT NOT NULL, player TEXT NOT NULL, format TEXT NOT NULL, points INTEGER NOT NULL, elapsed INTEGER NOT NULL, created_at INTEGER NOT NULL, PRIMARY KEY (day, player))`,
	`CREATE TABLE IF NOT EXISTS lb_weekly (week TEXT NOT NULL, player TEXT NOT NULL, overall INTEGER NOT NULL, rank INTEGER NOT NULL, updated_at INTEGER NOT NULL, PRIMARY KEY (week, player))`,
	`CREATE TABLE IF NOT EXISTS lb_links (player TEXT NOT NULL, friend TEXT NOT NULL, created_at INTEGER NOT NULL, PRIMARY KEY (player, friend))`,
	`CREATE INDEX IF NOT EXISTS lb_links_friend ON lb_links (friend)`,
];

const schemaReady = new WeakSet<D1Database>();

export async function ensureSchema(db: D1Database): Promise<void> {
	if (schemaReady.has(db)) return;
	await db.batch(SCHEMA.map((sql) => db.prepare(sql)));
	schemaReady.add(db);
}

export type SyncOutcome = { ok: true; board: BoardReply } | { ok: false; status: number; error: string };

/** Claims or verifies the id, stores the score / standing / friend links, and returns both boards. */
export async function runSync(db: D1Database, sync: SyncInput, now = Date.now()): Promise<SyncOutcome> {
	await ensureSchema(db);
	const hash = await secretHash(sync.id, sync.secret);
	const existing = await db
		.prepare("SELECT secret_hash FROM lb_players WHERE id = ?1")
		.bind(sync.id)
		.first<{ secret_hash: string }>();
	if (existing && !sameHash(existing.secret_hash, hash)) {
		return { ok: false, status: 403, error: "id_taken" };
	}

	const day = boardDayKey(now);
	const week = weekKey(day);
	const writes: D1PreparedStatement[] = [];
	if (!existing) {
		writes.push(
			db
				.prepare(
					"INSERT INTO lb_players (id, secret_hash, name, overall, games, rank, created_at, updated_at) VALUES (?1, ?2, ?3, NULL, 0, 0, ?4, ?4) ON CONFLICT (id) DO NOTHING",
				)
				.bind(sync.id, hash, sync.name, now),
		);
	} else if (sync.name !== null) {
		writes.push(db.prepare("UPDATE lb_players SET name = ?2, updated_at = ?3 WHERE id = ?1").bind(sync.id, sync.name, now));
	}
	if (sync.standing) {
		const s = sync.standing;
		writes.push(
			db
				.prepare("UPDATE lb_players SET overall = ?2, games = ?3, rank = ?4, updated_at = ?5 WHERE id = ?1")
				.bind(sync.id, s.overall, s.games, s.rank, now),
		);
		if (s.overall !== null) {
			writes.push(
				db
					.prepare(
						`INSERT INTO lb_weekly (week, player, overall, rank, updated_at) VALUES (?1, ?2, ?3, ?4, ?5)
						 ON CONFLICT (week, player) DO UPDATE SET overall = excluded.overall, rank = excluded.rank, updated_at = excluded.updated_at`,
					)
					.bind(week, sync.id, s.overall, s.rank, now),
			);
		}
	}
	for (const friend of sync.friends) {
		writes.push(
			db
				.prepare("INSERT INTO lb_links (player, friend, created_at) VALUES (?1, ?2, ?3) ON CONFLICT DO NOTHING")
				.bind(sync.id, friend, now),
		);
	}
	let accepted: boolean | null = null;
	const scoreIndex = writes.length;
	if (sync.score) {
		const s = sync.score;
		// One score per player per board day. A replay or a second device write is ignored.
		writes.push(
			db
				.prepare(
					"INSERT INTO lb_daily (day, player, format, points, elapsed, created_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6) ON CONFLICT (day, player) DO NOTHING",
				)
				.bind(s.day, sync.id, s.format, s.points, s.elapsed, now),
		);
	}
	if (writes.length) {
		const results = await db.batch(writes);
		if (sync.score) accepted = (results[scoreIndex]?.meta?.changes ?? 0) > 0;
	}

	const board = await readBoard(db, sync.id, day, week);
	return { ok: true, board: { ...board, accepted } };
}

async function circle(db: D1Database, id: string): Promise<string[]> {
	const rows = await db
		.prepare(
			`SELECT friend AS id, created_at FROM lb_links WHERE player = ?1
			 UNION SELECT player AS id, created_at FROM lb_links WHERE friend = ?1
			 ORDER BY created_at DESC LIMIT ?2`,
		)
		.bind(id, MAX_BOARD_PEOPLE * 2)
		.all<{ id: string }>();
	const ids = [id];
	for (const row of rows.results ?? []) {
		if (!ids.includes(row.id)) ids.push(row.id);
		if (ids.length >= MAX_BOARD_PEOPLE) break;
	}
	return ids;
}

interface PlayerRow {
	id: string;
	name: string | null;
	overall: number | null;
	games: number;
	rank: number;
}

export async function readBoard(db: D1Database, id: string, day: string, week: string): Promise<Omit<BoardReply, "accepted">> {
	const ids = await circle(db, id);
	const list = JSON.stringify(ids);
	const [players, daily, last] = await db.batch([
		db.prepare("SELECT id, name, overall, games, rank FROM lb_players WHERE id IN (SELECT value FROM json_each(?1))").bind(list),
		db
			.prepare("SELECT player, format, points, elapsed FROM lb_daily WHERE day = ?2 AND player IN (SELECT value FROM json_each(?1))")
			.bind(list, day),
		db
			.prepare("SELECT player, overall FROM lb_weekly WHERE week = ?2 AND player IN (SELECT value FROM json_each(?1))")
			.bind(list, previousWeekKey(week)),
	]);
	const people = new Map<string, PlayerRow>();
	for (const row of (players.results ?? []) as PlayerRow[]) people.set(row.id, row);
	const known = ids.filter((pid) => people.has(pid));

	const today: TodayRow[] = ((daily.results ?? []) as { player: string; format: string; points: number; elapsed: number }[])
		.map((row) => ({
			id: row.player,
			name: people.get(row.player)?.name ?? null,
			points: row.points,
			elapsed: row.elapsed,
			format: row.format,
			you: row.player === id,
		}))
		.sort(compareToday);

	const lastWeek = new Map<string, number>();
	for (const row of (last.results ?? []) as { player: string; overall: number }[]) lastWeek.set(row.player, row.overall);

	const overall = rankOverall(
		known.map((pid) => people.get(pid)!).filter((p) => p.overall !== null || p.id === id),
		lastWeek,
		id,
	);
	return { ok: true, day, week, people: known.length, today, overall };
}

/** More points first; ties go to the faster finish; then the id so the order is stable. */
export function compareToday(a: { points: number; elapsed: number; id: string }, b: { points: number; elapsed: number; id: string }): number {
	if (a.points !== b.points) return b.points - a.points;
	if (a.elapsed !== b.elapsed) return a.elapsed - b.elapsed;
	return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

function compareOverall(a: { score: number | null; games: number; id: string }, b: { score: number | null; games: number; id: string }): number {
	const sa = a.score ?? -1;
	const sb = b.score ?? -1;
	if (sa !== sb) return sb - sa;
	if (a.games !== b.games) return b.games - a.games;
	return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

/** Current order by overall score, with the change in place against last week's snapshot of the same people. */
export function rankOverall(people: PlayerRow[], lastWeek: Map<string, number>, you: string): OverallRow[] {
	const rows = people
		.map((p) => ({ id: p.id, name: p.name, score: p.overall, rank: p.rank, games: p.games, you: p.id === you }))
		.sort(compareOverall);
	const before = rows
		.filter((r) => lastWeek.has(r.id))
		.map((r) => ({ id: r.id, score: lastWeek.get(r.id) ?? null, games: r.games }))
		.sort(compareOverall);
	const nowRanked = rows.filter((r) => lastWeek.has(r.id));
	return rows.map((r) => {
		if (r.score === null || !lastWeek.has(r.id) || before.length < 2) return { ...r, move: null };
		const was = before.findIndex((b) => b.id === r.id);
		const is = nowRanked.findIndex((n) => n.id === r.id);
		return { ...r, move: was - is };
	});
}
