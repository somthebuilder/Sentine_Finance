export type Stock = {
  name: string;
  symbol?: string;
  exchange: "NSE" | "BSE";
  sector: string;
  subSector?: string;
  tags: string[];

  revenueGrowth: number;
  previousRevenueGrowth: number;
  peRatio: number;
  institutionalOwnership: number;
  momentumScore: number;
};

