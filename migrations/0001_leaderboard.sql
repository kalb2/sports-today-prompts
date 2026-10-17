-- Friends leaderboard (ball-knowledge-scores D1, binding SCORES).
-- The Worker also runs these statements on first use, so a fresh database works without a manual step.
CREATE TABLE IF NOT EXISTS lb_players (
	id TEXT PRIMARY KEY,
	secret_hash TEXT NOT NULL,
	name TEXT,
	overall INTEGER,
	games INTEGER NOT NULL DEFAULT 0,
	rank INTEGER NOT NULL DEFAULT 0,
	created_at INTEGER NOT NULL,
	updated_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS lb_daily (
	day TEXT NOT NULL,
	player TEXT NOT NULL,
	format TEXT NOT NULL,
	points INTEGER NOT NULL,
	elapsed INTEGER NOT NULL,
	created_at INTEGER NOT NULL,
	PRIMARY KEY (day, player)
);
CREATE TABLE IF NOT EXISTS lb_weekly (
	week TEXT NOT NULL,
	player TEXT NOT NULL,
	overall INTEGER NOT NULL,
	rank INTEGER NOT NULL,
	updated_at INTEGER NOT NULL,
	PRIMARY KEY (week, player)
);
CREATE TABLE IF NOT EXISTS lb_links (
	player TEXT NOT NULL,
	friend TEXT NOT NULL,
	created_at INTEGER NOT NULL,
	PRIMARY KEY (player, friend)
);
CREATE INDEX IF NOT EXISTS lb_links_friend ON lb_links (friend);
