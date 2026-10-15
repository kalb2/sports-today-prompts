import type { FeaturedMap, FeedBoards, Prompt, PromptFeed } from "./feed";
import { validateFeed } from "./validate";

/** One board day (7:00 AM MT → 7:00 AM MT next day). */
export interface DayEntry {
	featured: FeaturedMap;
	/** Top 10 / Keep 3 prompts this day needs that may not be in the top-level pool. */
	prompts?: Prompt[];
	boards?: FeedBoards;
}

export type DayMap = Record<string, DayEntry>;

export const ROLLOVER_HOUR_MT = 7;
const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
const MAX_DAYS = 14;

/** Board-day key: the America/Denver calendar date of (now − 7 h). */
export function boardDayKey(nowMs: number = Date.now()): string {
	const shifted = new Date(nowMs - ROLLOVER_HOUR_MT * 3_600_000);
	const parts = new Intl.DateTimeFormat("en-CA", {
		timeZone: "America/Denver", year: "numeric", month: "2-digit", day: "2-digit",
	}).formatToParts(shifted);
	const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "00";
	return `${get("year")}-${get("month")}-${get("day")}`;
}

function mergeById<T extends { id: string }>(first: T[] = [], second: T[] = []): T[] {
	const seen = new Set(first.map((x) => x.id));
	return [...first, ...second.filter((x) => !seen.has(x.id))];
}

function mergeBoards(day: FeedBoards | undefined, base: FeedBoards | undefined): FeedBoards | undefined {
	if (!day && !base) return undefined;
	const out: FeedBoards = {};
	for (const game of ["factOrCap", "higherLower", "whoIsWho", "blindTop5", "careerPath"] as const) {
		const merged = mergeById((day?.[game] ?? []) as { id: string }[], (base?.[game] ?? []) as { id: string }[]);
		if (merged.length) (out as Record<string, unknown>)[game] = merged;
	}
	return out;
}

/** The feed as one day sees it: day prompts/boards first, then the shared pool; featured from the day. */
export function feedForDay(base: PromptFeed, entry: DayEntry): PromptFeed {
	return {
		...base,
		prompts: mergeById(entry.prompts ?? [], base.prompts),
		boards: mergeBoards(entry.boards, base.boards),
		featured: entry.featured,
		featuredTop10Id: entry.featured.top10Guess,
		featuredKeep3Id: entry.featured.keep3Cut5,
	};
}

/** Validates each day against the base pool; returns cleaned entries or an error. */
export function validateDays(value: unknown, base: PromptFeed): { ok: true; days: DayMap } | { ok: false; error: string } {
	if (value === undefined) return { ok: true, days: {} };
	if (typeof value !== "object" || value === null || Array.isArray(value)) return { ok: false, error: "days must be an object" };
	const entries = Object.entries(value as Record<string, unknown>);
	if (entries.length > MAX_DAYS) return { ok: false, error: `days holds at most ${MAX_DAYS} entries` };
	const days: DayMap = {};
	for (const [key, raw] of entries) {
		if (!DAY_RE.test(key)) return { ok: false, error: `days key ${key} must be YYYY-MM-DD` };
		const r = raw as Record<string, unknown> | null;
		if (!r || typeof r !== "object" || typeof r.featured !== "object" || r.featured === null) {
			return { ok: false, error: `days.${key}.featured is required` };
		}
		const probe = validateFeed({
			version: base.version,
			prompts: mergeById((r.prompts as Prompt[] | undefined) ?? [], base.prompts),
			boards: mergeBoards(r.boards as FeedBoards | undefined, base.boards),
			featured: r.featured,
		});
		if (!probe.ok) return { ok: false, error: `days.${key}: ${probe.error}` };
		const featured = probe.feed.featured ?? {};
		if (Object.keys(featured).length === 0) return { ok: false, error: `days.${key}: no featured id matches a board` };
		const ownPrompts = ((r.prompts as Prompt[] | undefined) ?? []).map((p) => p.id);
		const entry: DayEntry = { featured };
		const prompts = probe.feed.prompts.filter((p) => ownPrompts.includes(p.id));
		if (prompts.length) entry.prompts = prompts;
		if (r.boards) {
			const vb = validateFeed({ version: base.version, prompts: [], boards: r.boards });
			if (!vb.ok) return { ok: false, error: `days.${key}: ${vb.error}` };
			if (vb.feed.boards) entry.boards = vb.feed.boards;
		}
		days[key] = entry;
	}
	return { ok: true, days };
}

/** Drops days older than yesterday (board-day keys sort as strings). */
export function pruneDays(days: DayMap | undefined, nowMs: number = Date.now()): DayMap | undefined {
	if (!days) return undefined;
	const cutoff = boardDayKey(nowMs - 86_400_000);
	const out: DayMap = {};
	for (const [k, v] of Object.entries(days)) if (k >= cutoff) out[k] = v;
	return Object.keys(out).length ? out : undefined;
}

/**
 * What GET /prompts serves: top-level fields switched to the current board day's entry when there is one
 * (so old builds flip at 7:00 AM MT with no routine), plus `today` and the remaining `days`.
 */
export function servedFeed(feed: PromptFeed, nowMs: number = Date.now()): PromptFeed {
	const today = boardDayKey(nowMs);
	const days = pruneDays(feed.days, nowMs);
	const entry = days?.[today];
	const top = entry ? feedForDay(feed, entry) : { ...feed };
	return { ...top, today, ...(days ? { days } : { days: undefined }) };
}
