import React from 'react';
import { Buyer, PropertyData, DueDiligenceItem } from '../types';

interface Props {
  recipientCount: number;
  excludedCount: number;
  scoreRange: { min: number; max: number };
  ddItems: DueDiligenceItem[];
  isReady: boolean;
}

export const FinalBlastReview: React.FC<Props> = ({ 
  recipientCount, 
  excludedCount, 
  scoreRange, 
  ddItems, 
  isReady 
}) => {
  const missingCritical = ddItems.filter(i => i.isCritical && i.status === 'Pending').map(i => i.label);
  const totalPending = ddItems.filter(i => i.status === 'Pending').length;

  return (
    <div className="bg-[#1a1a1a] border border-white/5 rounded-2xl overflow-hidden flex flex-col animate-fade-in shadow-2xl">
      <div className="px-4 py-3 border-b border-white/5 flex items-center justify-between bg-white/[0.02]">
        <div className="flex items-center gap-2">
          <span className="material-symbols-outlined text-[18px] text-white/40">visibility</span>
          <h3 className="text-[12px] font-medium text-white/90 tracking-wide uppercase">Final Blast Review</h3>
        </div>
        <div className={`px-2 py-0.5 rounded-full text-[9px] font-black border ${isReady ? 'bg-green-500/20 text-green-400 border-green-500/30' : 'bg-red-500/20 text-red-400 border-red-500/30'}`}>
          {isReady ? 'DEAL IS BUYER-READY' : 'DEAL NOT READY'}
        </div>
      </div>

      <div className="p-4 grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Recipient Stats */}
        <div className="bg-black/20 rounded-xl p-3 border border-white/5 flex flex-col gap-1">
          <p className="text-[10px] font-bold text-white/30 uppercase tracking-widest">Reach Statistics</p>
          <div className="flex items-baseline gap-2 mt-1">
            <span className="text-2xl font-black text-white">{recipientCount}</span>
            <span className="text-[11px] text-white/40">Recipients</span>
          </div>
          <p className="text-[10px] text-red-400/60 font-medium">-{excludedCount} Excluded via Suppression</p>
        </div>

        {/* Quality Stats */}
        <div className="bg-black/20 rounded-xl p-3 border border-white/5 flex flex-col gap-1">
          <p className="text-[10px] font-bold text-white/30 uppercase tracking-widest">Match Quality</p>
          <div className="flex items-baseline gap-2 mt-1">
            <span className="text-2xl font-black text-blue-400">{scoreRange.max}%</span>
            <span className="text-[11px] text-white/40">Peak Score</span>
          </div>
          <p className="text-[10px] text-white/40 font-medium">Range: {scoreRange.min}% - {scoreRange.max}%</p>
        </div>

        {/* Readiness Warnings */}
        <div className="bg-black/20 rounded-xl p-3 border border-white/5 flex flex-col gap-1 overflow-hidden">
          <p className="text-[10px] font-bold text-white/30 uppercase tracking-widest">Asset Readiness</p>
          {totalPending === 0 ? (
            <div className="flex items-center gap-1.5 mt-2 text-green-400">
              <span className="material-symbols-outlined text-[16px]">verified</span>
              <span className="text-[11px] font-bold">100% Data Complete</span>
            </div>
          ) : (
            <div className="flex flex-col gap-1 mt-1">
              <span className="text-[11px] font-bold text-orange-400">{totalPending} Pending Tasks</span>
              {missingCritical.length > 0 && (
                <div className="flex items-start gap-1 text-red-400">
                  <span className="material-symbols-outlined text-[12px] mt-0.5">warning</span>
                  <p className="text-[9px] font-black leading-tight truncate uppercase">Critical Missing: {missingCritical[0]}...</p>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {!isReady && (
        <div className="px-4 pb-4">
          <div className="bg-red-500/5 border border-red-500/20 rounded-xl p-3 flex items-center gap-3">
            <span className="material-symbols-outlined text-red-400">error_outline</span>
            <p className="text-[11px] text-red-400/80 leading-relaxed">
              <span className="font-black uppercase mr-1 underline">Warning:</span> 
              This deal is missing critical data points or has too many pending due diligence items. Blasting this deal now may reduce buyer trust.
            </p>
          </div>
        </div>
      )}
    </div>
  );
};
