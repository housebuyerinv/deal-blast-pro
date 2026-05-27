import { Buyer, MarketRecommendation, PropertyData } from '../types';

/**
 * Analyzes buyers to recommend the best market to blast for a specific deal.
 */
export const getBestMarketRecommendation = (buyers: Buyer[], data: PropertyData): MarketRecommendation => {
  if (buyers.length === 0) return { market: 'Unknown', confidence: 0, reason: 'No buyer data synced', action: 'Import leads first' };

  const markets: Record<string, { activity: number; buyers: number; score: number }> = {};
  
  buyers.forEach(b => {
    b.states.forEach(st => {
      const key = st; // Aggregate by state for high level recommendation
      if (!markets[key]) markets[key] = { activity: 0, buyers: 0, score: 0 };
      
      let weight = 0;
      if (b.type === data.type) weight += 10;
      if (b.status === 'Hot') weight += 5;
      
      markets[key].buyers++;
      markets[key].activity += b.activity.clicked + (b.activity.responded * 3) + (b.activity.offered * 10);
      markets[key].score += weight;
    });
  });

  const topMarket = Object.entries(markets)
    .sort((a, b) => (b[1].activity * b[1].score) - (a[1].activity * a[1].score))[0];

  if (!topMarket) return { market: 'N/A', confidence: 0, reason: 'Insufficient data', action: 'Expand outreach' };

  const [market, stats] = topMarket;
  const confidence = Math.min(100, Math.round((stats.activity / 10) * 100));

  return {
    market,
    confidence,
    reason: `Market engagement score of ${stats.activity} with ${stats.buyers} active ${data.type} buyers.`,
    action: `Blast ${market} first to capture high-intent leads.`
  };
};
