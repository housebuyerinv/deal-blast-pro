import React from 'react';
import { PropertyData, ProfitMetrics } from '../types';

interface Props {
  data: PropertyData;
  metrics: ProfitMetrics;
}

export const SellerFinanceResults: React.FC<Props> = ({ data, metrics }) => {
  const formatCurrency = (val: number) => `$${Math.round(val).toLocaleString()}`;
  const formatPercent = (val: number) => `${val.toFixed(2)}%`;

  return (
    <div className="bg-[#1a1a1a] border border-blue-500/20 rounded-2xl overflow-hidden flex flex-col shadow-lg shadow-blue-500/5">
      <div className="px-4 py-3 border-b border-white/5 flex items-center justify-between bg-blue-500/5">
        <div className="flex items-center gap-2">
          <span className="material-symbols-outlined text-[18px] text-blue-400">handshake</span>
          <h3 className="text-[12px] font-medium text-white/90 tracking-wide uppercase">Seller Finance Calculator</h3>
        </div>
        <div className="text-[10px] font-bold text-blue-400 border border-blue-500/30 px-2 py-0.5 rounded-full">
          CREATIVE TERMS
        </div>
      </div>

      <div className="p-4 grid grid-cols-2 md:grid-cols-3 gap-6">
        <SFMetric 
          label="Buyer Entry Cost" 
          value={formatCurrency(metrics.sfEntryCost)} 
          sublabel="Down Payment + Assignment Fee" 
          highlight
        />
        <SFMetric 
          label="Monthly Cash Flow" 
          value={formatCurrency(metrics.sfCashFlow)} 
          sublabel="Rent - PITI - Expenses" 
          highlight
        />
        <SFMetric 
          label="Cash-on-Cash Return" 
          value={formatPercent(metrics.sfCoC)} 
          sublabel="Annual Return on Entry Cost" 
          highlight
        />
        <SFMetric 
          label="Balloon Term" 
          value={`${data.sellerFinance.balloonTerm} Years`} 
          sublabel="Full Payment Due At End" 
        />
        <SFMetric 
          label="Interest Rate" 
          value={`${data.sellerFinance.interestRate}%`} 
          sublabel="Seller Carry-Back Rate" 
        />
        <SFMetric 
          label="Monthly Expenses" 
          value={formatCurrency(data.sellerFinance.expenses)} 
          sublabel="Tax, Insurance, Maint." 
        />
      </div>
    </div>
  );
};

const SFMetric = ({ label, value, sublabel, highlight = false }: { label: string, value: string, sublabel: string, highlight?: boolean }) => (
  <div className="flex flex-col gap-0.5">
    <p className="text-[10px] font-medium text-white/40 uppercase tracking-wider">{label}</p>
    <p className={`text-lg font-semibold tracking-tight ${highlight ? 'text-blue-400' : 'text-white/80'}`}>{value}</p>
    <p className="text-[10px] text-white/20 italic">{sublabel}</p>
  </div>
);
