import React, { useState } from 'react';
import { DueDiligenceItem, PropertyData } from '../types';
import { PillButton } from './UI';

interface Props {
  items: DueDiligenceItem[];
  propertyName: string;
  data?: PropertyData;
}

export const StatusSummary: React.FC<Props> = ({ items, propertyName, data }) => {
  const [copied, setCopied] = useState(false);

  const total = items.filter(i => i.status !== 'N/A').length;
  const completedCount = items.filter(i => i.status === 'Completed').length;
  const completionPercent = total > 0 ? Math.round((completedCount / total) * 100) : 0;
  
  const pendingItems = items.filter(i => i.status === 'Pending');
  
  // NEW Strict Requirements Check
  const blockers: string[] = [];
  if (data) {
    if (!data.launchChecklist?.hasPOC) blockers.push('Proof of Control');
    if (data.fee === 0) blockers.push('Assignment Fee');
    if (!data.pocName) blockers.push('POC Name');
    if (!data.titleCompany) blockers.push('Title Company');
    if (data.rehab === 0) blockers.push('Rehab Estimate');
  }

  const getReadiness = () => {
    if (blockers.length > 0) return 'Needs Info';
    if (completionPercent >= 90) return 'Buyer Ready';
    return 'Processing';
  };

  const readiness = getReadiness();

  const readinessStyles: Record<string, string> = {
    'Buyer Ready': 'text-green-400 border-green-500/30 bg-green-500/10',
    'Needs Info': 'text-red-400 border-red-500/30 bg-red-500/10',
    'Processing': 'text-yellow-400 border-yellow-500/30 bg-yellow-500/10'
  };

  const handleCopyRequest = () => {
    const list = [...blockers.map(b => `• ${b} (REQUIRED FOR BLAST)`), ...pendingItems.map(i => `• ${i.label}`)].join('\n');
    const emailBody = `Hi Team,\n\nI am currently finalizing the due diligence pack for ${propertyName || 'the property'}. \n\nWE ARE CURRENTLY BLOCKED from blasting to our buyers due to missing information:\n\n${list}\n\nPlease send these over immediately so we can move this to "Ready to Blast" status.\n\nBest regards,`;
    
    navigator.clipboard.writeText(emailBody);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="bg-[#1a1a1a] border border-[rgba(218,220,224,0.1)] rounded-2xl overflow-hidden animate-fade-in shadow-xl">
      <div className="flex flex-col md:flex-row divide-y md:divide-y-0 md:divide-x divide-white/5">
        
        {/* Progress Circle & Completion */}
        <div className="p-5 flex flex-col items-center justify-center gap-2 min-w-[160px] bg-white/[0.02]">
          <div className="relative w-16 h-16">
            <svg className="w-full h-full" viewBox="0 0 36 36">
              <path className="stroke-white/5" strokeWidth="3" fill="none" d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" />
              <path className={`transition-all duration-1000 ${blockers.length > 0 ? 'stroke-red-500' : 'stroke-white'}`} strokeDasharray={`${completionPercent}, 100`} strokeWidth="3" strokeLinecap="round" fill="none" d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" />
            </svg>
            <div className={`absolute inset-0 flex items-center justify-center text-[14px] font-bold ${blockers.length > 0 ? 'text-red-400' : 'text-white'}`}>
              {completionPercent}%
            </div>
          </div>
          <div className="text-center">
            <p className="text-[10px] font-bold text-white/30 uppercase tracking-widest">Global DD Status</p>
          </div>
        </div>

        {/* Readiness State */}
        <div className="flex-1 p-5 flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <div className="flex flex-col gap-0.5">
              <span className="text-[10px] font-bold text-white/30 uppercase tracking-widest">Blast Protection Engine</span>
              <span className={`text-xl font-bold tracking-tight ${readinessStyles[readiness].split(' ')[0]}`}>
                {readiness.toUpperCase()}
              </span>
            </div>
            <div className={`px-3 py-1 rounded-full text-[10px] font-bold border ${readinessStyles[readiness]}`}>
              {readiness}
            </div>
          </div>

          <div className="flex flex-col gap-2">
            {blockers.length > 0 && (
              <div className="flex items-start gap-2 bg-red-500/5 border border-red-500/10 p-2 rounded-lg">
                <span className="material-symbols-outlined text-[16px] text-red-400 mt-0.5">cancel</span>
                <p className="text-[10px] text-red-400 font-bold leading-tight uppercase">
                  Blocked: Missing {blockers.join(', ')}
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Action Area */}
        <div className="p-5 flex flex-col items-center justify-center gap-3 bg-white/[0.01] min-w-[200px]">
          <PillButton 
            variant={blockers.length > 0 ? "filled" : "outline"}
            className={blockers.length > 0 ? "!bg-red-500 !text-white" : ""}
            icon={<span className="material-symbols-outlined text-[18px]">contact_mail</span>}
            onClick={handleCopyRequest}
          >
            {copied ? "Outreach Copied ✓" : "Gen Outreach Email"}
          </PillButton>
          <p className="text-[9px] text-white/30 text-center leading-relaxed">
            Automatically lists all missing required items for POC.
          </p>
        </div>
      </div>
    </div>
  );
};
