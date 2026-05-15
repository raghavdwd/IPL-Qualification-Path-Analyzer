/*
  Tool definitions in OpenAI-compatible function-calling format.
  These are sent to the LLM so it knows what tools are available,
  what each tool does, and what parameters to pass.

  Each definition follows this structure:
  {
    type: "function",
    function: {
      name: "tool_name",
      description: "What this tool does (the LLM reads this to decide when to call it)",
      parameters: { ... JSON Schema ... }
    }
  }
*/

import type { ToolDefinition } from "../utils/llm";

export const toolDefinitions: ToolDefinition[] = [
  {
    type: "function",
    function: {
      name: "get_cric_score",
      description:
        "Get live cricket scores, recent completed results, and upcoming fixtures. " +
        "Returns matches from approximately the last 7 days and next 7 days. " +
        "Each match includes team names, scores, match status, match type, and series name. " +
        "Results are automatically saved to the local cache. " +
        "Use this as your primary data source for checking match results and schedules.",
      parameters: {
        type: "object",
        properties: {},
        required: [],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_cached_results",
      description:
        "Get all match results accumulated in the local cache. " +
        "Unlike get_cric_score (which only shows the last 7 days), this returns EVERY match " +
        "the bot has seen since it started running. Over time, this builds up a complete " +
        "picture of the season. Optionally filter by series name. " +
        "Use this FIRST when you need to understand the full season standings and results.",
      parameters: {
        type: "object",
        properties: {
          series: {
            type: "string",
            description:
              "Optional filter: only return matches from a specific series " +
              "(e.g. 'Indian Premier League 2026'). Case-insensitive partial match.",
          },
        },
        required: [],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_match_detail",
      description:
        "Get detailed information about a specific cricket match including full scorecard, " +
        "team info (with logos), venue, date, and batting/bowling figures. " +
        "Only works for matches that are currently live or were recently completed (within ~7 days). " +
        "Use this when you need more detail than the compact score from get_cric_score.",
      parameters: {
        type: "object",
        properties: {
          match_id: {
            type: "string",
            description:
              "The unique match ID (UUID format, e.g. '0b3bab15-12b2-4a16-9f41-1096e40ff202'). " +
              "You can get this from the id field in get_cric_score results.",
          },
        },
        required: ["match_id"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "search_series",
      description:
        "Search for cricket series and tournaments by name. " +
        "Returns series with start/end dates, number of matches, and formats (ODI, T20, Test). " +
        "Use this to find information about a specific tournament like the Indian Premier League. " +
        "Note: This endpoint mainly returns international tours. T20 leagues like IPL may not appear here.",
      parameters: {
        type: "object",
        properties: {
          query: {
            type: "string",
            description:
              "Search term to find matching series. Partial matches work (e.g. 'India' or 'Premier').",
          },
        },
        required: ["query"],
      },
    },
  },
];
