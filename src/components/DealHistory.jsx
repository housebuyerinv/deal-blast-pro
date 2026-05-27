import React from 'react';
import { SavedDeal } from '../types';
import { SectionLabel } from './UI';

interface Props {
  deals: SavedDeal[];
  onLoad: (deal: SavedDeal) => void;
  onDuplicate: (deal: SavedDeal) => void;
  onDelete: (id: string) => void;
}

export const DealHistory: React.FC<Props> = ({ deals, onLoad, onDuplicate, onDelete }) => {
  if (deals.length === 0) {
    return (
      <div className="p-8 flex flex-col items-center justify-center text-center opacity-40">
        <span className="material-symbols-outlined text-[48px] mb-2">history</span>
        <p className="text-[12px] font-medium uppercase tracking-widest">No Saved Deals</p>
        <p className="text-[11px] mt-1 max-w-[200px]">Save your current analysis to see it here later.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4 animate-fade-in">
      <SectionLabel>Saved Property History</SectionLabel>
      <div className="flex flex-col gap-2">
        {deals.sort((a, b) => b.timestamp - a.timestamp).map((deal) => (
          <div key={deal.id} className="bg-white/5 border border-white/10 rounded-xl p-3 flex flex-col gap-2 group transition-all hover:border-white/20">
            <div className="flex items-start justify-between">
              <div className="flex flex-col">
                <h4 className="text-[13px] font-bold text-white truncate max-w-[200px]">{deal.data.address || 'Unnamed Property'}</h4>
                <p className="text-[10px] text-white/40 uppercase tracking-tighter">
                  {new Date(deal.timestamp).toLocaleDateString()} • ${deal.data.arv.toLocaleString()} ARV
                </p>
              </div>
              <div className="flex gap-1 opacity-40 group-hover:opacity-100 transition-opacity">
                <button onClick={() => onDelete(deal.id)} className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-red-500/20 hover:text-red-400">
                  <span className="material-symbols-outlined text-[18px]">delete</span>
                </button>
              </div>
            </div>
            
            <div className="grid grid-cols-2 gap-1.5 mt-1">
              <button 
                onClick={() => onLoad(deal)}
                className="flex items-center justify-center gap-1.5 bg-white/10 hover:bg-white/20 text-white text-[11px] font-bold py-1.5 rounded-lg transition-colors"
              >
                <span className="material-symbols-outlined text-[14px]">edit</span>
                <span>OPEN</span>
              </button>
              <button 
                onClick={() => onDuplicate(deal)}
                className="flex items-center justify-center gap-1.5 bg-white/5 hover:bg-white/10 text-white/60 hover:text-white text-[11px] font-bold py-1.5 rounded-lg transition-colors"
              >
                <span className="material-symbols-outlined text-[14px]">content_copy</span>
                <span>DUPLICATE</span>
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
