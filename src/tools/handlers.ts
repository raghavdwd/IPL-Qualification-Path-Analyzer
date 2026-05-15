/*
  Tool handler functions.
  Each function corresponds to one tool definition from definitions.ts.
  These are the actual implementations that call the cricket API and return results.

  Every handler receives parsed arguments (already JSON.parsed by the dispatcher)
  and must return a JSON string that gets sent back to the LLM as the tool result.
  The LLM reads this string to decide what to say to the user.
*/

import { config } from "../config";
import { fetchFromCricketApi, getHitsSummary } from "../utils/cricketApi";
import { mergeIntoCache, getCachedMatches, getCacheSummary } from "../utils/cache";

/*
  Wrapper: fetch compact scores from the cricScore endpoint.
  This returns all matches (live, results from last ~7 days, and upcoming for next ~7 days).
  Each record has: id, t1, t2, t1s, t2s, status, matchType, series, ms (fixture/result/live).
  Results are automatically saved to the local cache so they accumulate over time.
  No parameters needed since it always returns the same window of data.
*/
export async function handleCricScore(): Promise<string> {
  const result = await fetchFromCricketApi("cricScore");

  if (result.status === "error" || !result.data) {
    return JSON.stringify({
      error: true,
      message: result.reason || "Failed to fetch cricket scores",
    });
  }

  const matches = result.data as Array<Record<string, unknown>>;

  /*
    Save every match we see into the local cache.
    Over time, as the bot is used on different days, this accumulates
    matches from across the full season — not just the last 7 days.
  */
  mergeIntoCache(matches as Array<{ id: string; [key: string]: unknown }>);

  const hitsInfo = getHitsSummary(result.info);
  const cacheInfo = getCacheSummary();

  return JSON.stringify({
    data: matches,
    note:
      "These are matches from approximately the last 7 days and next 7 days. " +
      "All results have been saved to the local cache. " +
      "Use get_cached_results to see the full accumulated dataset.",
    apiUsage: hitsInfo,
    cacheStats: cacheInfo,
  });
}

/*
  Return all accumulated match results from the local cache.
  Unlike get_cric_score (which only sees ±7 days), this shows
  every match the bot has seen since it started running.
  Optionally filter by series name (e.g. "Indian Premier League 2026").
*/
export async function handleCachedResults(args: Record<string, unknown>): Promise<string> {
  const seriesFilter = (args.series as string) || undefined;
  const matches = getCachedMatches(seriesFilter);
  const cacheInfo = getCacheSummary();

  if (matches.length === 0) {
    return JSON.stringify({
      data: [],
      note:
        "The cache is empty. Run get_cric_score first to populate it " +
        "with match data from the API. Over time matches accumulate here.",
      cacheStats: cacheInfo,
    });
  }

  return JSON.stringify({
    data: matches,
    note:
      "These are all matches accumulated in the local cache. " +
      "The cache grows each time get_cric_score is called. " +
      "Results may include matches older than 7 days if the bot was running then.",
    cacheStats: cacheInfo,
  });
}

/*
  Wrapper: fetch detailed match info from currentMatches endpoint.
  The endpoint returns matches with score: [{r, w, o, inning}], teamInfo, venue, date, etc.
  We filter the results to find the specific match by ID.
  If no match is found with that ID, we return a helpful message.
*/
export async function handleMatchDetail(args: Record<string, unknown>): Promise<string> {
  const matchId = args.match_id as string;

  if (!matchId) {
    return JSON.stringify({
      error: true,
      message: "match_id parameter is required",
    });
  }

  const result = await fetchFromCricketApi("currentMatches", { offset: "0" });

  if (result.status === "error" || !Array.isArray(result.data)) {
    return JSON.stringify({
      error: true,
      message: result.reason || "Failed to fetch match details",
    });
  }

  const matches = result.data as Array<Record<string, unknown>>;
  const match = matches.find((m: Record<string, unknown>) => m.id === matchId);

  if (!match) {
    return JSON.stringify({
      error: true,
      message:
        `Match with ID "${matchId}" not found in recent matches. ` +
        "It may be too old or the match ID is incorrect. " +
        "Use get_cric_score to find the correct match ID.",
    });
  }

  const hitsInfo = getHitsSummary(result.info);

  return JSON.stringify({
    data: match,
    note: "This is the full match detail including scorecard and team info.",
    apiUsage: hitsInfo,
  });
}

/*
  Wrapper: search for series using the series endpoint.
  Since the endpoint is paginated (returns many results), we search client-side
  by loading all pages. For the free tier (100 hits/day), this is expensive,
  so we only check the first page and do a simple name filter.

  The series endpoint returns: id, name, startDate, endDate, odi, t20, test, matches.
*/
export async function handleSearchSeries(args: Record<string, unknown>): Promise<string> {
  const query = (args.query as string || "").toLowerCase().trim();

  if (!query) {
    return JSON.stringify({
      error: true,
      message: "query parameter is required",
    });
  }

  /*
    Load the first page of series results.
    The series endpoint returns 25 results per page by default (no explicit pagination needed).
    For a broader search, we'd need multiple API calls, but that burns through the daily limit.
  */
  const result = await fetchFromCricketApi("series", { offset: "0" });

  if (result.status === "error" || !Array.isArray(result.data)) {
    return JSON.stringify({
      error: true,
      message: result.reason || "Failed to fetch series data",
    });
  }

  const allSeries = result.data as Array<{
    id: string;
    name: string;
    startDate: string;
    endDate: string;
    odi?: number;
    t20?: number;
    test?: number;
    matches?: number;
  }>;

  /*
    Filter series whose name contains the search query (case-insensitive).
  */
  const matching = allSeries.filter((s) => s.name.toLowerCase().includes(query));

  const hitsInfo = getHitsSummary(result.info);

  if (matching.length === 0) {
    return JSON.stringify({
      data: [],
      note:
        `No series matching "${query}" found on the first page of results. ` +
        "The series list may not include T20 leagues like the IPL. " +
        "Try checking match data from get_cric_score instead.",
      apiUsage: hitsInfo,
    });
  }

  return JSON.stringify({
    data: matching,
    note:
      "These are matching series from the first page of results. " +
      "The list mainly contains international tours. League tournaments may not be listed here.",
    apiUsage: hitsInfo,
  });
}

/*
  Fetch detailed player info from the players_info endpoint.
  Takes a player_id (UUID) and returns name, role, batting/bowling style, etc.
*/
export async function handlePlayerInfo(args: Record<string, unknown>): Promise<string> {
  const playerId = args.player_id as string;

  if (!playerId) {
    return JSON.stringify({
      error: true,
      message: "player_id parameter is required",
    });
  }

  const result = await fetchFromCricketApi("players_info", {
    id: playerId,
    offset: "0",
  });

  if (result.status === "error" || !result.data) {
    return JSON.stringify({
      error: true,
      message: result.reason || "Failed to fetch player info",
    });
  }

  const hitsInfo = getHitsSummary(result.info);

  return JSON.stringify({
    data: result.data,
    note: "This is the detailed player information including role, batting/bowling style, and country.",
    apiUsage: hitsInfo,
  });
}

/*
  Web search via Firecrawl API.
  Searches the web and returns results with full-page markdown content.
  Useful for live standings, NRR tables, news, and anything the cricket API doesn't cover.
*/
export async function handleWebSearch(args: Record<string, unknown>): Promise<string> {
  const query = (args.query as string || "").trim();

  if (!query) {
    return JSON.stringify({
      error: true,
      message: "query parameter is required",
    });
  }

  if (!config.firecrawl.apiKey) {
    return JSON.stringify({
      error: true,
      message:
        "Firecrawl API key is not configured. " +
        "Set FIRECRAWL_API_KEY in your environment variables.",
    });
  }

  try {
    const response = await fetch(`${config.firecrawl.baseUrl}/v1/search`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${config.firecrawl.apiKey}`,
      },
      body: JSON.stringify({
        query,
        limit: 5,
        scrapeOptions: {
          formats: ["markdown"],
        },
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      return JSON.stringify({
        error: true,
        message: `Firecrawl search failed: HTTP ${response.status}`,
        details: errorText.slice(0, 500),
      });
    }

    const result = (await response.json()) as {
      success: boolean;
      data?: Array<{ title?: string; description?: string; url?: string; markdown?: string }>;
    };

    if (!result.success || !result.data) {
      return JSON.stringify({
        error: true,
        message: "Firecrawl returned no results.",
      });
    }

    /*
      Extract the core fields from each result and truncate markdown
      to avoid blowing past the LLM's context window.
    */
    const results = result.data.map(
      (item: { title?: string; description?: string; url?: string; markdown?: string }) => ({
        title: item.title || "",
        description: item.description || "",
        url: item.url || "",
        content: item.markdown ? item.markdown.slice(0, 3000) : "",
      }),
    );

    return JSON.stringify({
      data: results,
      totalResults: results.length,
      query,
    });
  } catch (error) {
    return JSON.stringify({
      error: true,
      message: `Failed to execute web search: ${error instanceof Error ? error.message : String(error)}`,
    });
  }
}

/*
  Handler registry — maps tool names to their handler functions.
  Adding a new tool means adding one entry here and one definition in definitions.ts.
  No switch statements, no if/else chains.
*/
const handlerRegistry: Record<
  string,
  (args: Record<string, unknown>) => Promise<string>
> = {
  get_cric_score: (_args) => handleCricScore(),
  get_cached_results: (args) => handleCachedResults(args),
  get_match_detail: (args) => handleMatchDetail(args),
  search_series: (args) => handleSearchSeries(args),
  get_player_info: (args) => handlePlayerInfo(args),
  web_search: (args) => handleWebSearch(args),
};

const AVAILABLE_TOOLS = Object.keys(handlerRegistry).join(", ");

/*
  Look up the tool in the registry and execute it, or return an error.
*/
export async function executeTool(
  name: string,
  args: Record<string, unknown>,
): Promise<string> {
  const handler = handlerRegistry[name];
  if (!handler) {
    return JSON.stringify({
      error: true,
      message: `Unknown tool: "${name}". Available tools: ${AVAILABLE_TOOLS}`,
    });
  }
  return handler(args);
}
