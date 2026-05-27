import React, { useMemo, useState, useEffect } from 'react';
import { Buyer, PropertyData, ProfitMetrics, BuyerBlastConfig, MatchFilters, AppSettings } from '../types';
import { SectionLabel } from './UI';
import { FinalBlastReview } from './FinalBlastReview';
import { getMatchedBuyers, MatchResult } from '../utils/matching';

interface Props {
  buyers: Buyer[];
  data: PropertyData;
  metrics: ProfitMetrics;
  config: BuyerBlastConfig;
  settings: AppSettings;
}

/**
 * PRODUCTION UTILITY: getScoreHex
 * Final source of truth for match score visualization colors.
 */
const getScoreHex = (score: number) => {
  if (score >= 85) return '#22c55e';
  if (score >= 70) return '#10b981';
  if (score >= 55) return '#facc15';
  return '#ef4444';
};

export const BuyerMatcher: React.FC<Props> = ({ buyers, data, metrics, config, settings }) => {
  const [filters, setFilters] = useState<MatchFilters>({
    state: '',
    city: '',
    assetType: 'Any',
    maxBudget: 0,
    creativeOnly: false,
    cashOnly: false,
    minScore: settings.minBuyerMatchScore,
    minStatus: 'New'
  });

  useEffect(() => {
    setFilters(f => ({ ...f, minScore: settings.minBuyerMatchScore }));
  }, [settings.minBuyerMatchScore]);

  const { matchedBuyers, excludedCount, scoreRange } = useMemo(() => {
    const matched = getMatchedBuyers(buyers, data, filters.minScore);
    
    // Count exclusions based on status/suppression
    const excludedCount = buyers.filter(b => b.status === 'Suppressed' || b.isBounced || b.isUnsubscribed).length;
    
    const finalSelection = matched.slice(0, 850);
    const scores = finalSelection.map(b => b.score);
    
    return { 
      matchedBuyers: finalSelection, 
      excludedCount, 
      scoreRange: { 
        min: scores.length > 0 ? Math.min(...scores) : 0, 
        max: scores.length > 0 ? Math.max(...scores) : 0 
      }
    };
  }, [buyers, data, metrics, config, filters, settings.minBuyerMatchScore]);

  return (
    <div className="flex flex-col gap-6">
      <FinalBlastReview recipientCount={matchedBuyers.length} excludedCount={excludedCount} scoreRange={scoreRange} ddItems={data.dueDiligenceItems} isReady={data.dueDiligenceItems.every(i => !i.isCritical || i.status === 'Completed')} />
      
      <div className="bg-[#1a1a1a] border border-blue-500/20 rounded-2xl overflow-hidden flex flex-col shadow-xl">
        <div className="px-4 py-3 border-b border-white/5 flex items-center justify-between bg-blue-500/5">
          <SectionLabel>Buyer Matching Logic (Tiers Applied)</SectionLabel>
          <div className="flex gap-2">
             <span className="text-[9px] font-bold text-white/40 uppercase">Limit: 850 / Blast</span>
          </div>
        </div>
        
        <div className="p-4 flex flex-col gap-2">
          {matchedBuyers.slice(0, 15).map(buyer => {
            const hex = getScoreHex(buyer.score);
            return (
              <div key={buyer.id} className="bg-black/20 border border-white/5 rounded-xl p-3 flex items-center justify-between">
                <div className="flex flex-col">
                  <div className="flex items-center gap-2">
                    <span className="text-[13px] font-bold text-white">{buyer.name}</span>
                    <span className="text-[8px] font-black px-1.5 py-0.5 rounded border uppercase whitespace-nowrap" 
                      style={{ 
                        backgroundColor: `${hex}1A`, 
                        color: hex, 
                        borderColor: `${hex}4D`,
                        opacity: 1,
                        filter: 'none'
                      }}>
                      {buyer.tier.toUpperCase()} CONFIDENCE
                    </span>
                  </div>
                  <span className="text-[10px] text-white/30 truncate max-w-[200px]">
                    {buyer.isNationwide ? 'Nationwide' : buyer.states.join(', ')} • {buyer.type}
                  </span>
                </div>
                <span className="text-xl font-black" style={{ color: hex, opacity: 1, filter: 'none' }}>{buyer.score}%</span>
              </div>
            );
          })}
          {matchedBuyers.length > 15 && (
            <p className="text-[10px] text-center text-white/20 py-2 italic">+ {matchedBuyers.length - 15} additional matches within constraints</p>
          )}
        </div>
      </div>
    </div>
  );
};
