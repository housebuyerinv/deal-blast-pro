import React from 'react';
import { PropertyData, ProfitMetrics } from '../types';

interface Props {
  data: PropertyData;
  metrics: ProfitMetrics;
}

export const ProfitCalculator: React.FC<Props> = ({ data, metrics }) => {
  const formatCurrency = (val: number) => `$${Math.round(val).toLocaleString()}`;
  const formatPercent = (val: number) => `${val.toFixed(2)}%`;

  const scoreColors = {
    Strong: 'bg-green-500/20 text-green-400 border-green-500/30',
    Okay: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
    Weak: 'bg-red-500/20 text-red-400 border-red-500/30'
  };

  const statusColors = {
    positive: 'text-green-400',
    neutral: 'text-yellow-400',
    negative: 'text-red-400'
  };

  return (
    <div className="bg-[#1a1a1a] border border-white/5 rounded-2xl overflow-hidden flex flex-col animate-fade-in shadow-2xl">
      <div className="px-5 py-4 border-b border-white/5 flex items-center justify-between bg-white/[0.02]">
        <div className="flex flex-col">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-[18px] text-white/40">analytics</span>
            <h3 className="text-[12px] font-bold text-white uppercase tracking-widest">Financial Audit</h3>
          </div>
          <p className="text-[10px] text-white/30 uppercase mt-0.5">Custom Rules applied for {data.type}</p>
        </div>
        <div className={`px-3 py-1 rounded-full text-[10px] font-black border ${scoreColors[metrics.score]}`}>
          {metrics.score.toUpperCase()} DEAL
        </div>
      </div>

      <div className="p-6 grid grid-cols-2 md:grid-cols-4 gap-8">
        <Metric label="Market Value (ARV)" value={formatCurrency(data.arv)} sublabel="Est. Resale" />
        <Metric label="Total Purchase" value={formatCurrency(data.price + data.fee)} sublabel="Buyer Entry Price" highlight />
        <Metric label="Gross Margin" value={formatCurrency(metrics.profit)} sublabel="Equity Spread" highlight color="text-green-400" />
        <Metric label="Wholesale Fee" value={formatCurrency(data.fee)} sublabel="Your Assignment" />
        
        <Metric label="Cap Rate" value={formatPercent(metrics.capRate)} sublabel="Annualized Yield" />
        <Metric label="Rent-to-Price" value={formatPercent(metrics.rentToPrice)} sublabel="Monthly ROI Ratio" />
        <Metric label="All-In Cost %" value={`${Math.round((metrics.allIn / data.arv) * 100)}%`} sublabel="Cost-to-ARV Ratio" />
        <Metric label="Rehab Cost" value={formatCurrency(data.rehab)} sublabel="Buyer's Renovation" />
      </div>

      {/* Score Explanation Section */}
      <div className="p-5 border-t border-white/5 bg-black/20">
        <div className="flex items-center gap-2 mb-4">
          <span className="text-[10px] font-black text-white/30 uppercase tracking-[2px]">Deal Score Breakdown</span>
          <div className="h-px flex-1 bg-white/5" />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {metrics.explanations.map((exp, i) => (
            <div key={i} className="flex items-center justify-between p-3 rounded-xl bg-white/[0.03] border border-white/5">
              <span className="text-[11px] font-medium text-white/60">{exp.label}</span>
              <div className="flex items-center gap-2">
                <span className={`text-[11px] font-bold ${statusColors[exp.status]}`}>{exp.value}</span>
                <span className={`material-symbols-outlined text-[14px] ${statusColors[exp.status]}`}>
                  {exp.status === 'positive' ? 'check_circle' : exp.status === 'negative' ? 'error' : 'info'}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

const Metric = ({ label, value, sublabel, highlight = false, color = "text-white" }: { label: string, value: string, sublabel: string, highlight?: boolean, color?: string }) => (
  <div className="flex flex-col gap-0.5">
    <p className="text-[10px] font-bold text-white/30 uppercase tracking-widest">{label}</p>
    <p className={`text-xl font-black tracking-tighter ${highlight ? color : 'text-white/80'}`}>{value}</p>
    <p className="text-[9px] text-white/20 italic uppercase font-medium">{sublabel}</p>
  </div>
);
