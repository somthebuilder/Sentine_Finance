import { Theme } from "../models/theme";

export type TavilyStructuredData = {
  summary: string;
  drivers: string[];
  sectors: string[];
  keywords: string[];
};

const ALLOWED_DOMAINS = [
  "moneycontrol.com",
  "economictimes.indiatimes.com",
  "screener.in",
];

function getEnv(name: string): string | undefined;
function getEnv(name: string, fallback: string): string;
function getEnv(name: string, fallback?: string) {
  const v = process.env[name];
  if (v === undefined || v === "") return fallback;
  return v;
}

function getHostname(input: unknown): string | undefined {
  const raw = (input ?? "").toString().trim();
  if (!raw) return undefined;

  // If a URL is missing scheme, try to recover.
  const candidate = raw.startsWith("http://") || raw.startsWith("https://") ? raw : `https://${raw}`;

  try {
    return new URL(candidate).hostname.toLowerCase();
  } catch {
    return undefined;
  }
}

function isAllowedTavilyResult(r: any): boolean {
  const urlCandidate = r?.url ?? r?.link ?? r?.source ?? r?.metadata?.url;
  const host = getHostname(urlCandidate);
  if (!host) return false;
  return ALLOWED_DOMAINS.some((d) => host === d || host.endsWith(`.${d}`));
}

function sanitizeText(s: unknown, maxLen: number) {
  const str = (s ?? "").toString().replace(/\s+/g, " ").trim();
  return str.length > maxLen ? `${str.slice(0, maxLen - 1)}…` : str;
}

function extractDriversFromResults(results: any[], limit: number): string[] {
  const drivers: string[] = [];
  for (const r of results) {
    if (!isAllowedTavilyResult(r)) continue;
    const title = sanitizeText(r?.title, 140);
    const content = sanitizeText(r?.content, 180);
    const pick = title || content;
    if (!pick) continue;
    drivers.push(pick);
    if (drivers.length >= limit) break;
  }
  return drivers;
}

export async function enrichThemeDriversWithTavily(theme: Theme): Promise<TavilyStructuredData> {
  const apiKey = getEnv("TRAVILY_API_KEY");
  const baseUrl = getEnv("TRAVILY_BASE_URL", "https://api.tavily.com");
  if (!apiKey) {
    return { summary: "", drivers: [], sectors: theme.sectors, keywords: theme.keywords };
  }

  const controller = new AbortController();
  const timeoutMs = Number(getEnv("TRAVILY_TIMEOUT_MS", "8000") ?? "8000");
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    // Bias Tavily towards the sources we trust, but still enforce an allowlist filter on returned URLs.
    const query = `${theme.theme} drivers ${theme.keywords.join(" ")} site:moneycontrol.com site:economictimes.indiatimes.com site:screener.in`;
    const url = `${baseUrl.replace(/\/$/, "")}/search`;
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      signal: controller.signal,
      body: JSON.stringify({ query }),
    });

    const json = await res.json().catch(() => null);
    const results: any[] = Array.isArray(json?.results) ? json.results : [];
    const firstAllowed = results.find((r) => isAllowedTavilyResult(r));
    const summary = sanitizeText(firstAllowed?.content ?? firstAllowed?.title, 280);
    const drivers = extractDriversFromResults(results, 4);
    return { summary, drivers, sectors: theme.sectors, keywords: theme.keywords };
  } catch {
    return { summary: "", drivers: [], sectors: theme.sectors, keywords: theme.keywords };
  } finally {
    clearTimeout(timeout);
  }
}

