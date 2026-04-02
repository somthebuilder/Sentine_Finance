import { Trend } from "../models/trend";

export type TravilyTrendsResult = {
  trends: Trend[];
  fetchedAt: string;
};

const CACHE_KEY = "trends";
let cachedTrends: Trend[] | null = null;
let cachedAtMs: number | null = null;

function getEnv(name: string): string | undefined;
function getEnv(name: string, fallback: string): string;
function getEnv(name: string, fallback?: string) {
  const v = process.env[name];
  if (v === undefined || v === "") return fallback;
  return v;
}

function toConfidence01(value: unknown): number {
  const n = typeof value === "number" ? value : value ? Number(value) : 0;
  if (!Number.isFinite(n)) return 0;
  // If it's likely a percent (0..100), normalize.
  if (n > 1 && n <= 100) return n / 100;
  if (n > 1) return Math.min(1, n); // best-effort clamp
  return Math.max(0, n);
}

function extractTrendText(item: any): string {
  const candidates = [
    item?.trend,
    item?.topic,
    item?.title,
    item?.name,
    item?.label,
    item?.headline,
    item?.content,
    item?.description,
  ];
  const found = candidates.find((c) => typeof c === "string" && c.trim().length > 0);
  return (found ?? "").toString().trim();
}

function extractConfidence(item: any): number {
  return (
    toConfidence01(item?.confidence) ||
    toConfidence01(item?.score) ||
    toConfidence01(item?.probability) ||
    toConfidence01(item?.weight) ||
    0
  );
}

function extractTimestamp(item: any): string {
  const raw = item?.timestamp ?? item?.createdAt ?? item?.time;
  if (!raw) return new Date().toISOString();
  const d = new Date(raw);
  return Number.isFinite(d.getTime()) ? d.toISOString() : new Date().toISOString();
}

function normalizeToTrends(input: any): Trend[] {
  const items: any[] = Array.isArray(input)
    ? input
    : Array.isArray(input?.trends)
      ? input.trends
      : Array.isArray(input?.topics)
        ? input.topics
        : Array.isArray(input?.data)
          ? input.data
          : [];

  return items
    .map((item) => {
      const trend = extractTrendText(item);
      if (!trend) return null;
      return {
        trend,
        confidence: extractConfidence(item),
        source: "travily" as const,
        timestamp: extractTimestamp(item),
      };
    })
    .filter(Boolean) as Trend[];
}

function getCachedTrendsTtlMs() {
  const ttl = getEnv("TRAVILY_CACHE_TTL_MS", "60000");
  const n = Number(ttl);
  return Number.isFinite(n) ? n : 60000;
}

export async function fetchTrendsFromTravily(): Promise<TravilyTrendsResult> {
  const baseUrl = getEnv("TRAVILY_BASE_URL", "https://api.tavily.com");

  // Keep the server functional even if credentials aren't configured yet.
  const apiKey = getEnv("TRAVILY_API_KEY");
  if (!apiKey) {
    return { trends: [], fetchedAt: new Date().toISOString() };
  }

  if (cachedTrends && cachedAtMs) {
    const ageMs = Date.now() - cachedAtMs;
    if (ageMs < getCachedTrendsTtlMs()) {
      return { trends: cachedTrends, fetchedAt: new Date().toISOString() };
    }
  }

  const endpointPath = getEnv("TRAVILY_SEARCH_ENDPOINT", "/search");
  const timeoutMs = Number(getEnv("TRAVILY_TIMEOUT_MS", "8000") ?? "8000");
  const authScheme = getEnv("TRAVILY_AUTH_SCHEME", "bearer")?.toLowerCase() ?? "bearer"; // bearer | xapikey | query

  const url = new URL(endpointPath, baseUrl);

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };

  if (authScheme === "bearer") headers["Authorization"] = `Bearer ${apiKey}`;
  if (authScheme === "xapikey") headers["X-API-Key"] = apiKey;
  if (authScheme === "query") url.searchParams.set("api_key", apiKey);

  const query = getEnv("TRAVILY_TRENDS_QUERY", "macro economic trends") ?? "macro economic trends";

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    // Tavily: https://api.tavily.com/search (documented as POST with Bearer auth)
    const res = await fetch(url.toString(), {
      method: "POST",
      headers,
      signal: controller.signal,
      body: JSON.stringify({ query }),
    });

    const json = await res.json().catch(() => null);
    if (!res.ok || !json) {
      return { trends: [], fetchedAt: new Date().toISOString() };
    }

    const items: any[] = Array.isArray(json?.results)
      ? json.results
      : Array.isArray(json?.data)
        ? json.data
        : Array.isArray(json)
          ? json
          : [];

    const trends = normalizeToTrends(items)
      .filter((t) => t.trend.length > 0)
      .sort((a, b) => b.confidence - a.confidence)
      .slice(0, 50);

    cachedTrends = trends;
    cachedAtMs = Date.now();
    return { trends, fetchedAt: new Date().toISOString() };
  } catch {
    // Travily is optional for MVP; fail soft.
    return { trends: [], fetchedAt: new Date().toISOString() };
  } finally {
    clearTimeout(timeout);
  }
}

