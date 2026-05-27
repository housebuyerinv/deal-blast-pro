import React from 'react';
import { DueDiligenceItem } from '../types';

interface Props {
  items: DueDiligenceItem[];
  onChange: (items: DueDiligenceItem[]) => void;
}

export const DueDiligenceChecklist: React.FC<Props> = ({ items, onChange }) => {
  const toggleStatus = (index: number) => {
    const newItems = [...items];
    const current = newItems[index].status;
    const nextStatus: Record<string, 'Pending' | 'Completed' | 'N/A'> = {
      'Pending': 'Completed',
      'Completed': 'N/A',
      'N/A': 'Pending'
    };
    newItems[index].status = nextStatus[current];
    onChange(newItems);
  };

  const getStatusStyle = (status: string) => {
    switch (status) {
      case 'Completed': return 'bg-green-500/20 text-green-400 border-green-500/30';
      case 'N/A': return 'bg-white/5 text-white/40 border-white/10';
      default: return 'bg-yellow-500/10 text-yellow-500/60 border-yellow-500/20';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'Completed': return 'check_circle';
      case 'N/A': return 'block';
      default: return 'pending';
    }
  };

  return (
    <div className="grid grid-cols-1 gap-1.5 animate-fade-in">
      {items.map((item, idx) => (
        <button
          key={item.label}
          onClick={() => toggleStatus(idx)}
          className={`flex items-center justify-between p-2.5 rounded-xl border transition-all text-left ${getStatusStyle(item.status)}`}
        >
          <div className="flex flex-col gap-0.5">
            <div className="flex items-center gap-1.5">
              <span className="text-[11px] font-medium tracking-tight uppercase">{item.label}</span>
              {item.isCritical && (
                <span className="text-[8px] font-bold bg-red-500/20 text-red-400 px-1 rounded">CRITICAL</span>
              )}
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-[9px] font-bold opacity-80">{item.status}</span>
            <span className="material-symbols-outlined text-[16px]">{getStatusIcon(item.status)}</span>
          </div>
        </button>
      ))}
    </div>
  );
};
