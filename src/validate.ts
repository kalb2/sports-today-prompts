import { validateDays } from "./days";
import {
	FEED_VERSION,
	type BlindBoard,
	type FactOrCapBoard,
	type FeaturedMap,
	type FeedBoards,
	type HigherLowerBoard,
	type Prompt,
	type PromptFeed,
	type PromptItem,
	type WhoIsWhoBoard,
} from "./feed";

export const MAX_PUBLISH_BYTES = 512_000;

export type ValidationResult =
	| { ok: true; feed: PromptFeed }
	| { ok: false; error: string };

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isFiniteNumber(value: unknown): value is number {
	return typeof value === "number" && Number.isFinite(value);
}

function isDifficulty(value: unknown): value is number {
	return typeof value === "number" && Number.isInteger(value) && value >= 1 && value <= 5;
}

function nonEmpty(value: unknown): value is string {
	return typeof value === "string" && value.trim() !== "";
}

type BoardCheck = (board: Record<string, unknown>) => string | null;

function itemPair(value: unknown): value is { id: string; label: string } {
	return isRecord(value) && nonEmpty(value.id) && nonEmpty(value.label);
}

const BOARD_CHECKS: Record<keyof FeedBoards, BoardCheck> = {
	factOrCap: (b) => {
		if (!nonEmpty(b.claim)) return "claim must be a non-empty string";
		if (!nonEmpty(b.explanation)) return "explanation must be a non-empty string";
		if (typeof b.correctIsFact !== "boolean") return "correctIsFact must be a boolean";
		return null;
	},
	higherLower: (b) => {
		for (const key of ["subject", "metricUnit", "anchorLabel", "anchorMetric", "challengeLabel", "challengeMetric", "explanation"]) {
			if (!nonEmpty(b[key])) return `${key} must be a non-empty string`;
		}
		if (typeof b.correctIsHigher !== "boolean") return "correctIsHigher must be a boolean";
		return null;
	},
	whoIsWho: (b) => {
		if (!nonEmpty(b.subject)) return "subject must be a non-empty string";
		if (!nonEmpty(b.why)) return "why must be a non-empty string";
		if (!itemPair(b.boxScore) || !itemPair(b.consensus)) return "boxScore and consensus must be {id, label}";
		if ((b.boxScore as { id: string }).id === (b.consensus as { id: string }).id) return "boxScore and consensus ids must differ";
		if (!Array.isArray(b.lines) || b.lines.length < 3 || b.lines.length > 8) return "lines must have 3-8 rows";
		for (const [i, line] of b.lines.entries()) {
			if (!isRecord(line) || !nonEmpty(line.label) || !nonEmpty(line.boxScore) || !nonEmpty(line.consensus)) {
				return `lines[${i}] needs label, boxScore, consensus`;
			}
			if (line.leader !== "boxScore" && line.leader !== "consensus") return `lines[${i}].leader must be boxScore or consensus`;
		}
		return null;
	},
	blindTop5: (b) => {
		if (!nonEmpty(b.body)) return "body must be a non-empty string";
		if (!Array.isArray(b.items) || b.items.length !== 5 || !b.items.every(itemPair)) return "items must be 5 {id, label}";
		if (new Set((b.items as { id: string }[]).map((i) => i.id)).size !== 5) return "items ids must be unique";
		return null;
	},
	careerPath: (b) => {
		const players = Array.isArray(b.players) ? (b.players as Record<string, unknown>[]) : null;
		if (players) {
			if (players.length < 1) return "players must not be empty";
			for (let i = 0; i < players.length; i++) {
				const p = players[i];
				if (!nonEmpty(p.id)) return `players[${i}].id must be a non-empty string`;
				if (!nonEmpty(p.name)) return `players[${i}].name must be a non-empty string`;
				if (!Array.isArray(p.stops) || (p.stops as unknown[]).length < 1) return `players[${i}].stops must be a non-empty array`;
			}
			return null;
		}
		if (!nonEmpty(b.name) && !nonEmpty(b.title)) return "name or title required for a single-player board";
		if (!Array.isArray(b.stops) || (b.stops as unknown[]).length < 1) return "stops must be a non-empty array";
		return null;
	},
};

/** Every board shape is checked; one bad board rejects the publish so nothing half-valid goes live. */
function validateBoards(raw: unknown): { ok: true; boards: FeedBoards } | { ok: false; error: string } {
	if (raw === undefined) return { ok: true, boards: {} };
	if (!isRecord(raw)) return { ok: false, error: "boards must be an object" };
	const boards: FeedBoards = {};
	for (const [game, check] of Object.entries(BOARD_CHECKS) as [keyof FeedBoards, BoardCheck][]) {
		const list = raw[game];
		if (list === undefined) continue;
		if (!Array.isArray(list)) return { ok: false, error: `boards.${game} must be an array` };
		const ids = new Set<string>();
		for (const [i, board] of list.entries()) {
			const where = `boards.${game}[${i}]`;
			if (!isRecord(board)) return { ok: false, error: `${where} must be an object` };
			if (!nonEmpty(board.id) || board.id.length > 128) return { ok: false, error: `${where}.id must be a non-empty string` };
			if (ids.has(board.id)) return { ok: false, error: `${where}.id duplicate ${board.id}` };
			ids.add(board.id);
			if (!nonEmpty(board.sport)) return { ok: false, error: `${where}.sport must be a non-empty string` };
			if (!nonEmpty(board.title)) return { ok: false, error: `${where}.title must be a non-empty string` };
			if (board.difficulty !== undefined && !isDifficulty(board.difficulty)) {
				return { ok: false, error: `${where}.difficulty must be an integer 1-5` };
			}
			const problem = check(board);
			if (problem) return { ok: false, error: `${where}.${problem}` };
		}
		const normalized = list.map((board) => ({
			...(board as Record<string, unknown>),
			sport: String((board as Record<string, unknown>).sport).trim().toLowerCase(),
		}));
		(boards as Record<string, unknown>)[game] = normalized as unknown as
			| FactOrCapBoard[]
			| HigherLowerBoard[]
			| WhoIsWhoBoard[]
			| BlindBoard[];
	}
	return { ok: true, boards };
}

function validateItem(item: unknown, index: number): string | null {
	if (!isRecord(item)) {
		return `items[${index}] must be an object`;
	}
	if (!isFiniteNumber(item.rank)) {
		return `items[${index}].rank must be a number`;
	}
	if (typeof item.canonical !== "string" || item.canonical.trim() === "") {
		return `items[${index}].canonical must be a non-empty string`;
	}
	if (!isFiniteNumber(item.metric)) {
		return `items[${index}].metric must be a number`;
	}
	if (item.aliases !== undefined) {
		if (!Array.isArray(item.aliases) || item.aliases.some((alias) => typeof alias !== "string")) {
			return `items[${index}].aliases must be an array of strings`;
		}
	}
	return null;
}

function validatePrompt(prompt: unknown, index: number): string | null {
	if (!isRecord(prompt)) {
		return `prompts[${index}] must be an object`;
	}
	if (typeof prompt.id !== "string" || prompt.id.trim() === "") {
		return `prompts[${index}].id must be a non-empty string`;
	}
	if (typeof prompt.format !== "string" || prompt.format.trim() === "") {
		return `prompts[${index}].format must be a non-empty string`;
	}
	if (typeof prompt.sport !== "string" || prompt.sport.trim() === "") {
		return `prompts[${index}].sport must be a non-empty string`;
	}
	if (typeof prompt.title !== "string" || prompt.title.trim() === "") {
		return `prompts[${index}].title must be a non-empty string`;
	}
	if (typeof prompt.promptText !== "string" || prompt.promptText.trim() === "") {
		return `prompts[${index}].promptText must be a non-empty string`;
	}
	if (prompt.metricLabel !== undefined && typeof prompt.metricLabel !== "string") {
		return `prompts[${index}].metricLabel must be a string`;
	}
	if (prompt.strikesAllowed !== undefined && !isFiniteNumber(prompt.strikesAllowed)) {
		return `prompts[${index}].strikesAllowed must be a number`;
	}
	if (prompt.acceptAliases !== undefined && typeof prompt.acceptAliases !== "boolean") {
		return `prompts[${index}].acceptAliases must be a boolean`;
	}
	if (prompt.difficulty !== undefined && !isDifficulty(prompt.difficulty)) {
		return `prompts[${index}].difficulty must be an integer 1-5`;
	}
	if (!Array.isArray(prompt.items) || prompt.items.length === 0) {
		return `prompts[${index}].items must be a non-empty array`;
	}
	for (const [itemIndex, item] of prompt.items.entries()) {
		const itemError = validateItem(item, itemIndex);
		if (itemError) {
			return `prompts[${index}].${itemError}`;
		}
	}
	return null;
}

/** Sports the app can rate. Matches BKSport in the app. */
export const SPORTS = new Set(["nfl", "nba", "mlb", "cfb", "cbb", "nhl", "soccer"]);

/** New publishes must use a known sport. Stored feeds are still served if an old row has another value. */
export function unknownSportError(feed: PromptFeed): string | null {
	for (const [index, prompt] of feed.prompts.entries()) {
		if (!SPORTS.has(String(prompt.sport))) {
			return `prompts[${index}].sport must be one of ${[...SPORTS].join(", ")}`;
		}
	}
	for (const [game, list] of Object.entries(feed.boards ?? {})) {
		for (const [index, board] of ((list ?? []) as { sport: string }[]).entries()) {
			if (!SPORTS.has(String(board.sport))) {
				return `boards.${game}[${index}].sport must be one of ${[...SPORTS].join(", ")}`;
			}
		}
	}
	return null;
}

const TOP10_FORMATS = new Set(["top_10_guess", "top_10_countdown", "top10Guess"]);
const KEEP3_FORMATS = new Set(["keep_3_cut_5", "keep3Cut5"]);

function featuredId(raw: unknown): string | null {
	if (typeof raw !== "string") return null;
	const id = raw.trim();
	return id === "" || id.length > 128 ? null : id;
}

export function validateFeed(value: unknown): ValidationResult {
	if (!isRecord(value)) {
		return { ok: false, error: "body must be a JSON object" };
	}

	if (value.version !== undefined && value.version !== FEED_VERSION) {
		return { ok: false, error: `version must be ${FEED_VERSION}` };
	}

	if (value.updatedAt !== undefined && typeof value.updatedAt !== "string") {
		return { ok: false, error: "updatedAt must be an ISO-8601 string" };
	}

	if (!Array.isArray(value.prompts)) {
		return { ok: false, error: "prompts must be an array" };
	}

	for (const [index, prompt] of value.prompts.entries()) {
		const promptError = validatePrompt(prompt, index);
		if (promptError) {
			return { ok: false, error: promptError };
		}
	}

	const prompts = value.prompts.map((prompt) => {
		const record = prompt as Record<string, unknown>;
		const items = (record.items as Record<string, unknown>[]).map((item) => {
			const aliases = Array.isArray(item.aliases)
				? (item.aliases as string[])
				: [String(item.canonical)];
			return {
				rank: item.rank,
				canonical: item.canonical,
				aliases,
				metric: item.metric,
			} as PromptItem;
		});

		return {
			id: record.id,
			format: record.format,
			sport: String(record.sport).trim().toLowerCase(),
			title: record.title,
			promptText: record.promptText,
			metricLabel: typeof record.metricLabel === "string" ? record.metricLabel : "yds",
			strikesAllowed: typeof record.strikesAllowed === "number" ? record.strikesAllowed : 3,
			acceptAliases: typeof record.acceptAliases === "boolean" ? record.acceptAliases : true,
			items,
			...(isDifficulty(record.difficulty) ? { difficulty: record.difficulty } : {}),
		} as Prompt;
	});

	const boardsResult = validateBoards(value.boards);
	if (!boardsResult.ok) {
		return { ok: false, error: boardsResult.error };
	}
	const boards = boardsResult.boards;

	const feed: PromptFeed = {
		version: FEED_VERSION,
		updatedAt:
			typeof value.updatedAt === "string" && value.updatedAt.trim() !== ""
				? value.updatedAt
				: new Date().toISOString(),
		prompts,
	};

	// Featured ids are optional. One that doesn't match a prompt of the right
	// format is dropped, not rejected, so phones fall back to their date pick.
	const top10Id = featuredId(value.featuredTop10Id);
	if (top10Id && prompts.some((p) => p.id === top10Id && TOP10_FORMATS.has(String(p.format)))) {
		feed.featuredTop10Id = top10Id;
	}
	const keep3Id = featuredId(value.featuredKeep3Id);
	if (
		keep3Id &&
		prompts.some((p) => p.id === keep3Id && KEEP3_FORMATS.has(String(p.format)) && p.items.length === 8)
	) {
		feed.featuredKeep3Id = keep3Id;
	}

	if (Object.keys(boards).length > 0) {
		feed.boards = boards;
	}

	// featured: per-game ids. Same rule as the legacy fields: a stale id is dropped, not fatal.
	if (isRecord(value.featured)) {
		const featured: FeaturedMap = {};
		const hasPrompt = (id: string, formats: Set<string>, count?: number) =>
			prompts.some((p) => p.id === id && formats.has(String(p.format)) && (count === undefined || p.items.length === count));
		const hasBoard = (game: keyof FeedBoards, id: string) =>
			(boards[game] as { id: string }[] | undefined)?.some((b) => b.id === id) ?? false;
		for (const [game, rawId] of Object.entries(value.featured)) {
			const id = featuredId(rawId);
			if (!id) continue;
			const ok =
				game === "top10Guess" ? hasPrompt(id, TOP10_FORMATS) :
				game === "keep3Cut5" ? hasPrompt(id, KEEP3_FORMATS, 8) :
				game in BOARD_CHECKS ? hasBoard(game as keyof FeedBoards, id) : false;
			if (ok) featured[game as keyof FeaturedMap] = id;
		}
		// Keep the legacy fields in step so current app builds see the same boards.
		if (featured.top10Guess && !feed.featuredTop10Id) feed.featuredTop10Id = featured.top10Guess;
		if (featured.keep3Cut5 && !feed.featuredKeep3Id) feed.featuredKeep3Id = featured.keep3Cut5;
		if (Object.keys(featured).length > 0) feed.featured = featured;
	}

	if (value.days !== undefined) {
		const daysResult = validateDays(value.days, feed);
		if (!daysResult.ok) return { ok: false, error: daysResult.error };
		if (Object.keys(daysResult.days).length > 0) feed.days = daysResult.days;
	}

	return { ok: true, feed };
}

export function isUsableFeed(value: unknown): value is PromptFeed {
	return validateFeed(value).ok;
}
