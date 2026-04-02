export type Trend = {
  trend: string;
  confidence: number;
  source: "travily";
  timestamp: string;

  // Added by our theme mapper:
  theme?: string;
};

