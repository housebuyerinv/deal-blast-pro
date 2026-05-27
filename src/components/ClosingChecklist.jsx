import React from 'react';
import { ClosingChecklistItem } from '../types';

interface Props {
  items: ClosingChecklistItem[];
  onChange: (items: ClosingChecklistItem[]) => void;
}

export const ClosingChecklist: React.FC<Props> = ({ items, onChange }) => {
  const toggleItem = (id: string) => {
    const next: Record<string, 'Pending' | 'Completed' | 'Warning'> = {
      'Pending': 'Completed',
      'Completed': 'Warning',
      'Warning': 'Pending'
    };
    onChange(items.map(i => i.id === id ? { ...i, status: next[i.status] } : i));
  };

  const getStyle = (status: string) => {
    switch (status) {
      case 'Completed': return 'bg-green-500/10 text-green-400 border-green-500/20';
      case 'Warning': return 'bg-red-500/10 text-red-400 border-red-500/20';
      default: return 'bg-white/5 text-white/30 border-white/10';
    }
  };

  const getIcon = (status: string) => {
    switch (status) {
      case 'Completed': return 'check_circle';
      case 'Warning': return 'error';
      default: return 'circle';
    }
  };

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
      {items.map((item, idx) => (
        <button 
          key={item.id}
          onClick={() => toggleItem(item.id)}
          className={`flex items-center justify-between px-3 py-2.5 rounded-xl border transition-all text-left ${getStyle(item.status)}`}
        >
          <div className="flex items-center gap-3">
            <span className="text-[10px] font-black opacity-20 w-4">{idx + 1}</span>
            <span className="text-[11px] font-bold uppercase tracking-tight">{item.label}</span>
          </div>
          <span className="material-symbols-outlined text-[18px]">{getIcon(item.status)}</span>
        </button>
      ))}
    </div>
  );
};
