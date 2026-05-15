/*
  Generic HTTP client for cricketdata.org (CricAPI).
  Every tool function imports this to make API calls.
  Handles rate-limit info extraction so callers can log remaining hits.
*/

import { config } from "../config";

export interface CricketApiResponse {
  status?: string;
  data?: unknown;
  info?: {
    hitsToday?: number;
    hitsUsed?: number;
    hitsLimit?: number;
    totalRows?: number;
  };
  reason?: string;
}

export async function fetchFromCricketApi(
  endpoint: string,
  params?: Record<string, string>,
): Promise<CricketApiResponse> {
  const url = new URL(`${config.cricketApi.baseUrl}/${endpoint}`);
  url.searchParams.set("apikey", config.cricketApi.apiKey);
  if (params) {
    for (const [key, value] of Object.entries(params)) {
      url.searchParams.set(key, value);
    }
  }

  const response = await fetch(url.toString());

  if (!response.ok) {
    return {
      status: "error",
      reason: `HTTP ${response.status}: ${response.statusText}`,
    };
  }

  const data = (await response.json()) as CricketApiResponse;
  return data;
}

/*
  Human-readable summary of how many API hits remain today.
  The free plan allows 100 hits per day, so we should keep users informed.
*/
export function getHitsSummary(info: CricketApiResponse["info"]): string {
  if (!info) return "";
  const used = info.hitsUsed ?? 0;
  const limit = info.hitsLimit ?? 100;
  const remaining = limit - used;
  return `[API hits: ${used}/${limit} used, ${remaining} remaining today]`;
}
