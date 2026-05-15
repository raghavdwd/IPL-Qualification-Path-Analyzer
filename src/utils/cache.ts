/*
  Local file-based cache for match results.
  The free cricket API only returns ±7 days of data.
  By saving every result we see, the cache grows over time
  and eventually covers the full season.

  Each time get_cric_score is called, its results are merged
  into this cache. Duplicate match IDs are overwritten with
  the latest data (in case a live match updates).

  The cache file lives at data/matches.json relative to project root.
*/

import { existsSync, readFileSync, writeFileSync, mkdirSync } from "fs";
import { join } from "path";

const CACHE_DIR = join(import.meta.dir, "..", "..", "data");
const CACHE_FILE = join(CACHE_DIR, "matches.json");

interface CachedMatch {
  id: string;
  [key: string]: unknown;
}

interface CacheStore {
  matches: CachedMatch[];
  lastUpdated: string;
}

/*
  Load all cached matches from disk.
  If the cache file doesn't exist yet, return an empty store.
*/
function loadCache(): CacheStore {
  try {
    if (existsSync(CACHE_FILE)) {
      const raw = readFileSync(CACHE_FILE, "utf-8");
      return JSON.parse(raw) as CacheStore;
    }
  } catch {
    /* If the file is corrupted, start fresh */
  }
  return { matches: [], lastUpdated: "" };
}

/*
  Persist the cache to disk.
  Creates the data/ directory if it doesn't exist.
*/
function saveCache(store: CacheStore): void {
  try {
    if (!existsSync(CACHE_DIR)) {
      mkdirSync(CACHE_DIR, { recursive: true });
    }
    writeFileSync(CACHE_FILE, JSON.stringify(store, null, 2), "utf-8");
  } catch {
    /* Silently fail — cache is non-critical */
  }
}

/*
  Merge an array of matches from the API into the cache.
  New matches are appended, existing ones (same id) are updated.
  Only stores completed results (ms === "result") plus fixtures
  so the LLM can see upcoming matches too.
*/
export function mergeIntoCache(newMatches: CachedMatch[]): void {
  const store = loadCache();

  /*
    Build a map of id -> match for O(1) lookups instead of scanning with findIndex.
  */
  const existing = new Map(store.matches.map((m) => [m.id, m]));

  for (const match of newMatches) {
    existing.set(match.id, match);
  }

  store.matches = Array.from(existing.values());
  store.lastUpdated = new Date().toISOString();
  saveCache(store);
}

/*
  Return all cached matches.
  Optionally filter by series name (e.g. "Indian Premier League 2026").
*/
export function getCachedMatches(seriesFilter?: string): CachedMatch[] {
  const store = loadCache();
  if (!seriesFilter) return store.matches;
  return store.matches.filter((m) => {
    const series = (m.series as string) || "";
    return series.toLowerCase().includes(seriesFilter.toLowerCase());
  });
}

/*
  Summary stats about the cache for the LLM to understand its coverage.
*/
export function getCacheSummary(): string {
  const store = loadCache();
  const total = store.matches.length;
  const results = store.matches.filter((m) => m.ms === "result").length;
  const fixtures = store.matches.filter((m) => m.ms === "fixture").length;
  const live = store.matches.filter((m) => m.ms === "live").length;

  return JSON.stringify({
    totalMatches: total,
    completedResults: results,
    upcomingFixtures: fixtures,
    liveMatches: live,
    lastUpdated: store.lastUpdated || "never",
    note:
      "This cache accumulates match data over time. " +
      "Each time the bot fetches live scores, new matches are added. " +
      "Run get_cric_score to refresh with the latest data.",
  });
}
