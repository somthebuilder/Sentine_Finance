export const METRIC_GLOSSARY: Record<string, string[]> = {
  name: ["name", "stock", "company", "company name"],
  symbol: ["symbol", "ticker", "code"],
  exchange: ["exchange", "market"],
  sector: ["sector", "industry sector", "segment"],
  subSector: ["subsector", "sub sector", "industry", "business segment"],
  tags: ["tags", "keywords", "themes"],

  revenueGrowth: [
    "revenuegrowth",
    "revgrowthannyoy",
    "revann3ygrowth",
    "revann3ygrowth%",
    "revann2ygrowth",
    "revann2ygrowth%",
  ],
  previousRevenueGrowth: [
    "previousrevenuegrowth",
    "revann2ygrowth",
    "revann2ygrowth%",
    "revenueqoqgrowth",
    "revenueqoqgrowth%",
  ],
  peRatio: ["peratio", "pe", "p/e", "pettm"],
  institutionalOwnership: [
    "institutionalownership",
    "delivery%volavg6m",
    "delivery%volavgmonth",
    "deliveryvolavgmonth",
    "deliveryvolavg6m",
  ],
  momentumScore: [
    "momentumscore",
    "monthchg%",
    "weekchg%",
    "qtrchg%",
    "1yrchg%",
    "2ypricechg%",
    "3ypricechg%",
  ],
  ltDebtToEquity: [
    "ltdebttoequityann",
    "totaldebttototalequityann",
  ],
  netProfitYoYGrowth: [
    "netprofitannyoygrowth%",
    "operatingprofitannyoygrowth%",
    "epsttmgrowth%",
    "epsgrowth%",
    "profitgrowth%",
  ],
  roe: ["roeann%", "roeann", "roe"],
  piotroski: ["piotroskiscore", "fscore"],
  bvps: ["bvshlatest", "bvshann", "bookvaluepershare"],
};

export function normalizeHeaderKey(input: string): string {
  return (input ?? "")
    .toString()
    .replace(/\uFEFF/g, "")
    .replace(/["']/g, "")
    .toLowerCase()
    .replace(/[%\.\(\)\/:_-]/g, "")
    .replace(/\s+/g, "");
}

function inferCanonicalMetric(headerText: string): string | undefined {
  const h = normalizeHeaderKey(headerText);
  if (!h) return undefined;

  if (/(^stock$|company|security|script|scripname|stockname)/.test(h)) return "name";
  if (/(symbol|ticker|code|isin)/.test(h)) return "symbol";
  if (/(exchange|market)/.test(h)) return "exchange";
  if (/(^sector$|industrysector|sectorname)/.test(h)) return "sector";
  if (/(subsector|industry|businesssegment)/.test(h)) return "subSector";

  if (/(pettm|fwdpe|forwardpe|pe3yr|pe5yr|peratio|^pe$|pricetoearnings)/.test(h)) return "peRatio";
  if (/(revenue.*growth|rev.*growth|sales.*growth|topline.*growth|turnover.*growth|eps.*growth|profit.*growth)/.test(h)) return "revenueGrowth";
  if (/(delivery|institution|instholding|fii|dii|mutualfundholding|publicholding|piotroski|fscore)/.test(h)) return "institutionalOwnership";
  if (/(roe|returnonequity)/.test(h)) return "roe";
  if (/(piotroski|fscore)/.test(h)) return "piotroski";
  if (/(chg|change|return|roc|performance|outperformance|underperformance)/.test(h)) return "momentumScore";
  return undefined;
}

export function buildCanonicalHeaderIndex(headers: string[]): Record<string, number> {
  const normalizedToIndex: Record<string, number> = {};
  headers.forEach((h, i) => {
    normalizedToIndex[normalizeHeaderKey(h)] = i;
  });

  const canonical: Record<string, number> = {};
  for (const [key, aliases] of Object.entries(METRIC_GLOSSARY)) {
    for (const alias of aliases) {
      const idx = normalizedToIndex[normalizeHeaderKey(alias)];
      if (idx !== undefined) {
        canonical[key] = idx;
        break;
      }
    }
  }

  headers.forEach((h, i) => {
    const inferred = inferCanonicalMetric(h);
    if (inferred && canonical[inferred] === undefined) canonical[inferred] = i;
  });
  return canonical;
}

