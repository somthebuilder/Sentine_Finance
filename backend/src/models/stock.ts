export type Stock = {
  name: string;
  symbol?: string;
  exchange: "NSE" | "BSE";
  sector: string;
  subSector?: string;
  tags: string[];

  // Legacy core fields (kept for compatibility).
  revenueGrowth: number;
  previousRevenueGrowth: number;
  peRatio: number;
  institutionalOwnership: number;
  momentumScore: number;
  netProfitYoYGrowth: number;
  ltDebtToEquity: number;
  piotroski: number;

  // Financial intelligence layer fields.
  distanceFromHigh: number;
  revenueGrowthQoQ: number;
  epsGrowth: number;
  roe: number;
  roce: number;
  altmanZ: number;
  debtToEquity: number;
  peg: number;
  pbv: number;
  industryPbv: number;
  institutionalActivity: number;
  promoterHolding: number;
};

