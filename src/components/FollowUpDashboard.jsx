import React, { useMemo } from 'react';
import { Buyer } from '../types';
import { SectionLabel } from './UI';
import { BuyerStatusBadge } from './BuyerStatusBadge';

interface Props {
  buyers: Buyer[];
  onSelectBuyer: (id: string) => void;
}

export const FollowUpDashboard: React.FC<Props> = ({ buyers, onSelectBuyer }) => {
  const dashboardData = useMemo(() => {
    return {
      urgent: buyers.filter(b => (b.status === 'Hot' || b.status === 'Offered') && b.nextAction !== 'None'),
      hot: buyers.filter(b => b.status === 'Hot'),
      offers: buyers.filter(b => b.status === 'Offered'),
      needingInfo: buyers.filter(b => b.nextAction === 'Follow up'),
      toSuppress: buyers.filter(b => b.status === 'Unresponsive' || b.isBounced || b.isUnsubscribed)
    };
  }, [buyers]);

  return (
    <div className="flex flex-col gap-6 animate-fade-in">
      <div className="grid grid-cols-2 gap-3">
        <DashCard 
          label="Urgent" 
          count={dashboardData.urgent.length} 
          icon="priority_high" 
          color="text-red-400" 
          bg="bg-red-400/10"
        />
        <DashCard 
          label="Hot Buyers" 
          count={dashboardData.hot.length} 
          icon="local_fire_department" 
          color="text-orange-400" 
          bg="bg-orange-400/10"
        />
        <DashCard 
          label="Offers Pending" 
          count={dashboardData.offers.length} 
          icon="payments" 
          color="text-green-400" 
          bg="bg-green-400/10"
        />
        <DashCard 
          label="To Suppress" 
          count={dashboardData.toSuppress.length} 
          icon="person_remove" 
          color="text-white/40" 
          bg="bg-white/5"
        />
      </div>

      <section className="flex flex-col gap-3">
        <SectionLabel>Urgent Attention Required</SectionLabel>
        <div className="flex flex-col gap-2">
          {dashboardData.urgent.length === 0 ? (
            <div className="p-8 border border-dashed border-white/5 rounded-xl text-center opacity-20">
              <p className="text-[10px] font-bold uppercase tracking-widest">Inbox Zero Reached</p>
            </div>
          ) : (
            dashboardData.urgent.slice(0, 5).map(buyer => (
              <button 
                key={buyer.id}
                onClick={() => onSelectBuyer(buyer.id)}
                className="bg-white/5 border border-white/10 rounded-xl p-3 flex items-center justify-between hover:bg-white/10 transition-all text-left group"
              >
                <div className="flex flex-col gap-0.5 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-[12px] font-bold text-white truncate">{buyer.name}</span>
                    <BuyerStatusBadge status={buyer.status} small />
                  </div>
                  <span className="text-[10px] text-blue-400 font-bold uppercase tracking-widest">{buyer.nextAction}</span>
                </div>
                <span className="material-symbols-outlined text-white/20 group-hover:text-white/60 transition-colors">chevron_right</span>
              </button>
            ))
          )}
        </div>
      </section>

      <section className="flex flex-col gap-3">
        <SectionLabel>Leads Needing Info</SectionLabel>
        <div className="flex flex-col gap-2">
          {dashboardData.needingInfo.length === 0 ? (
            <p className="text-[10px] text-center text-white/20 py-4 italic uppercase tracking-widest">No follow-ups needed</p>
          ) : (
            dashboardData.needingInfo.slice(0, 3).map(buyer => (
              <div key={buyer.id} className="bg-black/20 border border-white/5 rounded-xl p-2.5 flex items-center justify-between">
                <span className="text-[11px] font-medium text-white/60 truncate">{buyer.name}</span>
                <span className="text-[9px] text-white/20">{buyer.activity.lastContactedDate || 'Never'}</span>
              </div>
            ))
          )}
        </div>
      </section>
    </div>
  );
};

const DashCard = ({ label, count, icon, color, bg }: { label: string, count: number, icon: string, color: string, bg: string }) => (
  <div className={`p-4 rounded-2xl flex flex-col gap-1 border border-white/5 shadow-xl ${bg}`}>
    <div className="flex items-center justify-between">
      <span className={`material-symbols-outlined text-[20px] ${color}`}>{icon}</span>
      <span className="text-xl font-black text-white">{count}</span>
    </div>
    <p className="text-[10px] font-bold text-white/40 uppercase tracking-widest mt-1">{label}</p>
  </div>
);
