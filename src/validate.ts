import { FEED_VERSION, type Prompt, type PromptFeed, type PromptItem } from "./feed";

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
			sport: record.sport,
			title: record.title,
			promptText: record.promptText,
			metricLabel: typeof record.metricLabel === "string" ? record.metricLabel : "yds",
			strikesAllowed: typeof record.strikesAllowed === "number" ? record.strikesAllowed : 3,
			acceptAliases: typeof record.acceptAliases === "boolean" ? record.acceptAliases : true,
			items,
		} as Prompt;
	});

	const feed: PromptFeed = {
		version: FEED_VERSION,
		updatedAt:
			typeof value.updatedAt === "string" && value.updatedAt.trim() !== ""
				? value.updatedAt
				: new Date().toISOString(),
		prompts,
	};

	return { ok: true, feed };
}

export function isUsableFeed(value: unknown): value is PromptFeed {
	return validateFeed(value).ok;
}
