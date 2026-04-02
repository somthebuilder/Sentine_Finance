import { Stock } from "../models/stock";
import { Theme } from "../models/theme";
import { calculateThemeRelevanceDetails } from "./themeService";
import { polishReasonsIfNeeded } from "./aiEnrichmentService";

export type ScoreBreakdown = {
  themeRelevance: number;
  revenueGrowthScore: number;
  momentumScore: number;
  institutionalScore: number;
  accelerationScore: number;
  breakoutScore: number;
  baseScore: number;
  themeStrengthMultiplier: number;
  eliteBoost: number;
  rawCompositeScore: number;
};

export type StockRecommendation = {
  name: string;
  score: number;
  conviction: "HIGH" | "MEDIUM" | "LOW";
  tier: "A+ (High Growth)" | "A (Strong)" | "B (Watchlist)" | "C (Ignore)";
  signals: string[];
  whyNow: string;
  scoreBreakdown: ScoreBreakdown;
  reasons: string[];
  // Backward compatibility for existing UI renderer.
  reason: string[];
};

export type RankedByTheme = { theme: string; strength: number; topStocks: StockRecommendation[] };

function normalizeTo01MaybePercent(value: number): number {
  if (!Number.isFinite(value)) return 0;
  if (value > 1 && value <= 100) return value / 100;
  if (value > 1) return Math.min(1, value);
  return Math.max(0, value);
}

function peRatioToValueScore(peRatio: number): number {
  if (!Number.isFinite(peRatio) || peRatio <= 0) return 0;
  const normalized = Math.max(0, Math.min(1, peRatio / 100));
  return 1 - normalized;
}

function accelerationScore(stock: Stock): number {
  const curr = normalizeTo01MaybePercent(stock.revenueGrowth);
  const prev = normalizeTo01MaybePercent(stock.previousRevenueGrowth);
  return Math.max(0, Math.min(1, curr - prev + 0.5)); // centered acceleration proxy
}

function breakoutScore(stock: Stock): number {
  const momentum = normalizeTo01MaybePercent(stock.momentumScore);
  const inst = normalizeTo01MaybePercent(stock.institutionalOwnership);
  return Math.max(0, Math.min(1, momentum * 0.7 + inst * 0.3));
}

function formatPercentLikeDecimal(value: number): string {
  if (!Number.isFinite(value)) return "0.0%";
  const pct = value > 1 ? (value <= 100 ? value : 100) : value * 100;
  return `${pct.toFixed(1)}%`;
}

function pickStrongMetric(
  revenueGrowthScore: number,
  momentumScore: number,
  institutionalScore: number
): "revenueGrowth" | "momentumScore" | "institutionalScore" {
  const entries: [string, number][] = [
    ["revenueGrowth", revenueGrowthScore],
    ["momentumScore", momentumScore],
    ["institutionalScore", institutionalScore],
  ];
  entries.sort((a, b) => b[1] - a[1]);
  return entries[0][0] as any;
}

export function calculateFinalScore(stock: Stock, theme: Theme): number {
  const { themeRelevance } = calculateThemeRelevanceDetails(stock, theme);
  const revenueGrowthScore = normalizeTo01MaybePercent(stock.revenueGrowth);
  const momentumScore = normalizeTo01MaybePercent(stock.momentumScore);
  const institutionalScore = normalizeTo01MaybePercent(stock.institutionalOwnership);
  const peValueScore = peRatioToValueScore(stock.peRatio);
  const acceleration = accelerationScore(stock);
  const breakout = breakoutScore(stock);

  const fundamentalScore = (revenueGrowthScore + momentumScore + institutionalScore + peValueScore) / 4;
  // Sharper scoring formula requested by user.
  const stockScore = themeRelevance * 0.3 + fundamentalScore * 0.5 + acceleration * 0.1 + breakout * 0.2;
  const scaled = Math.min(stockScore * 1.5, 1);
  return Number(scaled.toFixed(6));
}

export function generateReason(
  stock: Stock,
  theme: Theme,
  themeRelevanceDetails: ReturnType<typeof calculateThemeRelevanceDetails>,
): string[] {
  // 1 theme-based reason (specific: what matched)
  const matchedTags = themeRelevanceDetails.matchedTags;
  const themeReason = matchedTags.length
    ? `Tags align with ${theme.theme} theme keywords: ${matchedTags.join(", ")}`
    : `Sector/subsector aligns with ${theme.theme}`;

  // 1 metric-based reason (specific: strongest metric)
  const revenueGrowthScore = normalizeTo01MaybePercent(stock.revenueGrowth);
  const momentumScore = normalizeTo01MaybePercent(stock.momentumScore);
  const institutionalScore = normalizeTo01MaybePercent(stock.institutionalOwnership);
  const strongest = pickStrongMetric(revenueGrowthScore, momentumScore, institutionalScore);

  if (strongest === "revenueGrowth") {
    return [themeReason, `Revenue growth is strongest (${formatPercentLikeDecimal(stock.revenueGrowth)})`];
  }
  if (strongest === "momentumScore") {
    return [themeReason, `Momentum score is strongest (${formatPercentLikeDecimal(stock.momentumScore)})`];
  }
  return [themeReason, `Institutional ownership score is strongest (${formatPercentLikeDecimal(stock.institutionalOwnership)})`];
}

export function passesGrowthFilter(stock: Stock): boolean {
  const sectorUnknown =
    !stock.sector ||
    stock.sector.toLowerCase() === "unknown" ||
    stock.sector.toLowerCase() === "na" ||
    stock.sector.toLowerCase() === "n/a";

  if (sectorUnknown) {
    // For parsed screener-style tables (proxy metrics), keep a slightly softer gate.
    return (
      normalizeTo01MaybePercent(stock.momentumScore) > 0.5 &&
      normalizeTo01MaybePercent(stock.revenueGrowth) > 0.08 &&
      normalizeTo01MaybePercent(stock.institutionalOwnership) > 0.12
    );
  }

  return (
    normalizeTo01MaybePercent(stock.momentumScore) > 0.65 &&
    normalizeTo01MaybePercent(stock.revenueGrowth) > 0.12 &&
    normalizeTo01MaybePercent(stock.institutionalOwnership) > 0.15
  );
}

function isElite(stock: Stock): boolean {
  return (
    normalizeTo01MaybePercent(stock.revenueGrowth) > 0.2 &&
    normalizeTo01MaybePercent(stock.momentumScore) > 0.7 &&
    normalizeTo01MaybePercent(stock.institutionalOwnership) > 0.3
  );
}

function getTier(score: number): "A+ (High Growth)" | "A (Strong)" | "B (Watchlist)" | "C (Ignore)" {
  if (score > 0.75) return "A+ (High Growth)";
  if (score > 0.6) return "A (Strong)";
  if (score > 0.5) return "B (Watchlist)";
  return "C (Ignore)";
}

function convictionForScore(score: number): "HIGH" | "MEDIUM" | "LOW" {
  if (score >= 0.7) return "HIGH";
  if (score >= 0.5) return "MEDIUM";
  return "LOW";
}

function buildSignals(stock: Stock): string[] {
  const signals: string[] = [];
  if (normalizeTo01MaybePercent(stock.momentumScore) > 0.7) signals.push("Breakout Candidate");
  if (normalizeTo01MaybePercent(stock.revenueGrowth) > 0.2) signals.push("High Growth");
  if (normalizeTo01MaybePercent(stock.institutionalOwnership) > 0.3) signals.push("Institutional Buying");
  return signals.slice(0, 3);
}

function buildWhyNow(stock: Stock, theme: Theme): string {
  const chunks: string[] = [];
  if (normalizeTo01MaybePercent(stock.momentumScore) > 0.7) chunks.push("strong momentum");
  if (normalizeTo01MaybePercent(stock.revenueGrowth) > 0.2) chunks.push("high growth");
  if (normalizeTo01MaybePercent(stock.institutionalOwnership) > 0.3) chunks.push("institutional accumulation");
  if (!chunks.length) chunks.push("improving fundamentals");
  return `${chunks.join(" + ")} with ${theme.theme.toLowerCase()} macro support`;
}

export async function rankStocksByTheme(themes: Theme[], stocks: Stock[]): Promise<RankedByTheme[]> {
  const topN = 5;

  const ranked: RankedByTheme[] = [];
  for (const theme of themes) {
    const strengthRaw = Number(theme.strength ?? 0);
    const strengthNormalized = Number.isFinite(strengthRaw) ? Math.max(0, Math.min(1, strengthRaw)) : 0;

    const scored = stocks
      .filter(passesGrowthFilter)
      .map((stock) => {
        const details = calculateThemeRelevanceDetails(stock, theme);

        // Deterministic match gate with token-aware overlap from themeService.
        // Relax slightly so valid sector/subsector matches are not dropped.
        if (details.themeRelevance <= 0.35) return null;

        const revenueGrowthScore = normalizeTo01MaybePercent(stock.revenueGrowth);
        const momentumScore = normalizeTo01MaybePercent(stock.momentumScore);
        const institutionalScore = normalizeTo01MaybePercent(stock.institutionalOwnership);

        // Base score is deterministic; then weight by theme strength.
        const baseScore = calculateFinalScore(stock, theme);
        const themeStrengthMultiplier = 1 + strengthNormalized * 0.3;
        const eliteBoost = isElite(stock) ? 0.15 : 0;
        const rawComposite = baseScore * themeStrengthMultiplier + eliteBoost;
        // Soft calibration prevents score saturation at exactly 1 for many stocks.
        let score = 1 - Math.exp(-rawComposite * 0.9);
        score = Math.max(0, Math.min(1, score));
        score = Number(score.toFixed(6));

        const reasons = generateReason(stock, theme, details);
        const signals = buildSignals(stock);
        const whyNow = buildWhyNow(stock, theme);
        const acc = accelerationScore(stock);
        const br = breakoutScore(stock);

        return {
          name: stock.name,
          score,
          conviction: convictionForScore(score),
          tier: getTier(score),
          signals,
          whyNow,
          scoreBreakdown: {
            themeRelevance: Number(details.themeRelevance.toFixed(6)),
            revenueGrowthScore: Number(revenueGrowthScore.toFixed(6)),
            momentumScore: Number(momentumScore.toFixed(6)),
            institutionalScore: Number(institutionalScore.toFixed(6)),
            accelerationScore: Number(acc.toFixed(6)),
            breakoutScore: Number(br.toFixed(6)),
            baseScore: Number(baseScore.toFixed(6)),
            themeStrengthMultiplier: Number(themeStrengthMultiplier.toFixed(6)),
            eliteBoost: Number(eliteBoost.toFixed(6)),
            rawCompositeScore: Number(rawComposite.toFixed(6)),
          },
          reasons,
          reason: reasons,
        } satisfies StockRecommendation;
      })
      .filter((x): x is StockRecommendation => x !== null);

    const topStocks = scored.sort((a, b) => b.score - a.score).slice(0, topN);

    if (topStocks.length) {
      // Optional AI polish only for top 3.
      for (let i = 0; i < topStocks.length; i++) {
        const polished = await polishReasonsIfNeeded(topStocks[i].reasons, i + 1);
        topStocks[i].reasons = polished;
        topStocks[i].reason = polished;
      }

      ranked.push({
        theme: theme.theme,
        strength: Number(strengthNormalized.toFixed(3)),
        topStocks,
      });
    }
  }

  return ranked;
}

