import { SEED_FEED } from "../src/feed";

const target = process.env.FEED_URL ?? "http://127.0.0.1:8787/publish";
const token = process.env.PUBLISH_TOKEN;

if (!token) {
	console.error("PUBLISH_TOKEN is required (env or .dev.vars).");
	process.exit(1);
}

const body = {
	...SEED_FEED,
	updatedAt: new Date().toISOString(),
};

const response = await fetch(target, {
	method: "POST",
	headers: {
		Authorization: `Bearer ${token}`,
		"Content-Type": "application/json",
	},
	body: JSON.stringify(body),
});

const text = await response.text();
console.log(`${response.status} ${response.statusText}`);
console.log(text);

if (!response.ok) {
	process.exit(1);
}
