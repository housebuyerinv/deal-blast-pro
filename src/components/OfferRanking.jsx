import React, { useMemo } from 'react';
import { Offer } from '../types';

interface Props {
  offers: Offer[];
  askPrice: number;
}

export const OfferRanking: React.FC<Props> = ({ offers, askPrice }) => {
  const stats = useMemo(() => {
    if (offers.length === 0) return null;

    const highest = [...offers].sort((a, b) => b.amount - a.amount)[0];
    const fastest = [...offers].sort((a, b) => a.closingDays - b.closingDays)[0];
    const cleanest = [...offers].filter(o => o.pofReceived && o.bioReceived && !o.contingencies)
      .sort((a, b) => b.amount - a.amount)[0] || highest;

    const missingDocsCount = offers.filter(o => !o.pofReceived || !o.bioReceived).length;

    // Weighted Score logic: Price (50%), Speed (25%), Doc Readiness (25%)
    const ranked = offers.map(o => {
      let score = (o.amount / highest.amount) * 50;
      score += (1 - (Math.min(o.closingDays, 30) / 30)) * 25;
      if (o.pofReceived) score += 12.5;
      if (o.bioReceived) score += 12.5;
      return { ...o, rankScore: score };
    }).sort((a, b) => b.rankScore - a.rankScore);

    return { highest, fastest, cleanest, missingDocsCount, ranked };
  }, [offers]);

  if (!stats) return null;

  return (
    <div className="grid grid-cols-1 md:grid-cols-4 gap-4 animate-fade-in">
      <RankCard 
        label="Best Overall" 
        value={stats.ranked[0].buyerName} 
        sub={`Rank Score: ${stats.ranked[0].rankScore.toFixed(1)}`}
        icon="workspace_premium" 
        color="text-yellow-400"
      />
      <RankCard 
        label="Highest Net" 
        value={`$${stats.highest.amount.toLocaleString()}`} 
        sub={`+${Math.round(((stats.highest.amount - askPrice) / askPrice) * 100)}% over ask`}
        icon="trending_up" 
        color="text-green-400"
      />
      <RankCard 
        label="Fastest Close" 
        value={`${stats.fastest.closingDays} Days`} 
        sub={stats.fastest.buyerName}
        icon="speed" 
        color="text-blue-400"
      />
      <RankCard 
        label="Cleanest Terms" 
        value={stats.cleanest.type} 
        sub={stats.cleanest.buyerName}
        icon="verified" 
        color="text-purple-400"
      />
      
      {stats.missingDocsCount > 0 && (
        <div className="md:col-span-4 bg-orange-500/10 border border-orange-500/20 rounded-xl px-4 py-2 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-orange-400">warning</span>
            <span className="text-[11px] font-bold text-orange-400/90 uppercase">{stats.missingDocsCount} Offers missing Buyer Docs (POF/BIO)</span>
          </div>
          <span className="text-[9px] font-black text-orange-400/40 uppercase">Action Recommended</span>
        </div>
      )}
    </div>
  );
};

const RankCard = ({ label, value, sub, icon, color }: { label: string, value: string, sub: string, icon: string, color: string }) => (
  <div className="bg-[#1a1a1a] border border-white/5 p-4 rounded-2xl flex flex-col gap-1 shadow-xl">
    <div className="flex items-center justify-between opacity-40">
      <span className="text-[10px] font-bold uppercase tracking-widest">{label}</span>
      <span className={`material-symbols-outlined text-[18px] ${color}`}>{icon}</span>
    </div>
    <span className="text-lg font-black text-white truncate">{value}</span>
    <span className="text-[10px] text-white/30 truncate">{sub}</span>
  </div>
);
