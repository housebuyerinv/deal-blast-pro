import React, { useMemo } from 'react';
import { Buyer, BuyerStatus, NextAction } from '../types';
import { SectionLabel, PillButton } from './UI';
import { BuyerStatusBadge } from './BuyerStatusBadge';

interface Props {
  buyers: Buyer[];
  onUpdateStatus: (id: string, status: BuyerStatus) => void;
  onUpdateAction: (id: string, action: NextAction) => void;
  onExecuteAction: (id: string) => void;
}

const ACTIONS: NextAction[] = [
  'Send deal', 'Follow up', 'Request offer', 'Call/Text', 'Remove', 'Suppress', 'Mark closed', 'None'
];

export const FollowUpQueue: React.FC<Props> = ({ buyers, onUpdateStatus, onUpdateAction, onExecuteAction }) => {
  const queue = useMemo(() => {
    return buyers
      .filter(b => ['Hot', 'Warm', 'Offered'].includes(b.status) && b.nextAction !== 'None')
      .sort((a, b) => {
        const priority = { 'Offered': 0, 'Hot': 1, 'Warm': 2 };
        return priority[a.status as keyof typeof priority] - priority[b.status as keyof typeof priority];
      });
  }, [buyers]);

  if (queue.length === 0) {
    return (
      <div className="p-8 border border-dashed border-white/10 rounded-xl flex flex-col items-center justify-center opacity-30 text-center animate-fade-in mx-2">
        <span className="material-symbols-outlined text-[32px] mb-2">check_circle</span>
        <p className="text-[11px] font-medium uppercase tracking-widest">Pipeline Clear</p>
        <p className="text-[10px] mt-1">No active leads require immediate attention.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4 animate-fade-in px-2">
      <div className="flex items-center justify-between">
        <SectionLabel>Active Follow-Ups ({queue.length})</SectionLabel>
        <span className="text-[9px] font-black bg-blue-500/20 text-blue-400 px-2 py-0.5 rounded uppercase">Action Required</span>
      </div>
      
      <div className="flex flex-col gap-2">
        {queue.map(buyer => (
          <div key={buyer.id} className="bg-white/5 border border-white/10 rounded-xl overflow-hidden group hover:border-white/20 transition-all shadow-lg">
            <div className="p-3 flex flex-col gap-3">
              <div className="flex items-start justify-between">
                <div className="flex flex-col min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-[13px] font-bold text-white truncate">{buyer.name}</span>
                    <BuyerStatusBadge status={buyer.status} small />
                  </div>
                  <span className="text-[10px] text-white/30 truncate">{buyer.email}</span>
                </div>
                <div className="flex flex-col items-end">
                  <span className="text-[9px] font-black text-blue-400 uppercase tracking-widest">Next Step</span>
                  <select 
                    value={buyer.nextAction} 
                    onChange={(e) => onUpdateAction(buyer.id, e.target.value as NextAction)}
                    className="bg-transparent text-[11px] font-black text-white focus:outline-none text-right cursor-pointer"
                  >
                    {ACTIONS.map(a => <option key={a} value={a} className="bg-[#0e0e0e]">{a}</option>)}
                  </select>
                </div>
              </div>

              <div className="bg-black/40 rounded-lg p-2.5 flex items-center justify-between border border-white/5">
                <div className="flex gap-4">
                  <Stat label="Clicks" value={buyer.activity.clicked} color="text-orange-400" />
                  <Stat label="Replies" value={buyer.activity.responded} color="text-blue-400" />
                  <Stat label="Active" value={buyer.activity.lastContactedDate || '--'} />
                </div>
              </div>

              <div className="flex gap-2">
                <button 
                  onClick={() => onExecuteAction(buyer.id)}
                  className="flex-1 flex items-center justify-center gap-2 h-[34px] rounded-xl bg-white text-black text-[11px] font-black uppercase tracking-widest hover:bg-gray-200 transition-colors"
                >
                  <span className="material-symbols-outlined text-[18px]">bolt</span>
                  Execute Action
                </button>
                <button 
                  onClick={() => onUpdateStatus(buyer.id, 'Closed')}
                  className="w-10 h-[34px] rounded-xl border border-white/10 flex items-center justify-center hover:bg-green-500/20 hover:text-green-400 transition-all"
                  title="Mark as Closed"
                >
                  <span className="material-symbols-outlined text-[18px]">task_alt</span>
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

const Stat = ({ label, value, color = "text-white/60" }: { label: string, value: string | number, color?: string }) => (
  <div className="flex flex-col">
    <span className="text-[8px] font-bold text-white/20 uppercase tracking-widest">{label}</span>
    <span className={`text-[11px] font-black ${color}`}>{value}</span>
  </div>
);
