import React, { useMemo } from 'react';
import { ClosingData } from '../types';

interface Props {
  closing: ClosingData;
}

export const ClosingAlerts: React.FC<Props> = ({ closing }) => {
  const alerts = useMemo(() => {
    const list: { label: string; icon: string; severity: 'high' | 'medium' }[] = [];
    const now = new Date();
    const checklist = closing.checklist || [];
    
    // 1. Missed EMD Deadline
    if (closing.emdDeadline) {
      const deadline = new Date(closing.emdDeadline);
      const isEmdDone = checklist.find(i => i.id === 'emd_deposited')?.status === 'Completed';
      if (!isEmdDone && now > deadline) {
        list.push({ label: 'CRITICAL: Missed EMD Deadline', icon: 'priority_high', severity: 'high' });
      }
    }

    // 2. Missing Signed Assignment
    const isAssignmentSigned = checklist.find(i => i.id === 'assignment_signed')?.status === 'Completed';
    if (!isAssignmentSigned && (closing.status === 'Clear to Close' || closing.status === 'Closing Scheduled')) {
      list.push({ label: 'Missing Signed Assignment Agreement', icon: 'contract_edit', severity: 'high' });
    }

    // 3. Title Issues
    if (closing.hasTitleIssue) {
      list.push({ label: 'Active Title Issues Detected', icon: 'warning', severity: 'high' });
    }

    // 4. Buyer Not Responding
    if (!closing.buyerResponding) {
      list.push({ label: 'Buyer is Unresponsive', icon: 'person_off', severity: 'high' });
    }

    // 5. Closing Date Approaching
    if (closing.closingDate) {
      const closingDay = new Date(closing.closingDate);
      const diff = (closingDay.getTime() - now.getTime()) / (1000 * 3600 * 24);
      if (diff >= 0 && diff <= 3 && closing.status !== 'Closed') {
        list.push({ label: `Closing Approaching: ${Math.ceil(diff)} days left`, icon: 'schedule', severity: 'medium' });
      }
    }

    // 6. Missing Buyer Docs
    const docsDone = checklist.find(i => i.id === 'buyer_docs')?.status === 'Completed';
    if (!docsDone && closing.status !== 'Accepted') {
      list.push({ label: 'Missing Buyer POF/BIO for Closing File', icon: 'description', severity: 'medium' });
    }

    return list;
  }, [closing]);

  if (alerts.length === 0) return null;

  return (
    <div className="flex flex-col gap-2">
      {alerts.map((alert, i) => (
        <div 
          key={i} 
          className={`px-4 py-3 rounded-xl border flex items-center gap-3 animate-fade-in ${
            alert.severity === 'high' 
              ? 'bg-red-500/10 border-red-500/30 text-red-400' 
              : 'bg-orange-500/10 border-orange-500/30 text-orange-400'
          }`}
        >
          <span className="material-symbols-outlined text-[20px]">{alert.icon}</span>
          <span className="text-[11px] font-black uppercase tracking-widest flex-1">{alert.label}</span>
          <div className="w-2 h-2 rounded-full bg-current animate-pulse" />
        </div>
      ))}
    </div>
  );
};
