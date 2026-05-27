import React from 'react';
import { BuyerStatus } from '../types';

export const BuyerStatusBadge: React.FC<{ status: string; small?: boolean }> = ({ status, small = false }) => {
  const s = String(status || '').trim();
  const normalized = s.toUpperCase();

  // Mapping normalized status to styles
  // Defaults to the 'New' (gray) style if no match is found
  const getStyle = () => {
    switch (normalized) {
      case 'ACTIVE':
      case 'CLOSED':
        return 'bg-green-500/10 text-green-400 border-green-500/30 font-bold';
      case 'HOT':
        return 'bg-red-500/10 text-red-400 border-red-500/30 font-bold';
      case 'WARM':
        return 'bg-orange-500/10 text-orange-400 border-orange-500/20';
      case 'OFFERED':
        return 'bg-blue-500/10 text-blue-400 border-blue-500/20';
      case 'SUPPRESSED':
        return 'bg-yellow-500/10 text-yellow-500/60 border-yellow-500/20 border-dashed';
      case 'DO NOT CONTACT':
        return 'bg-red-900/20 text-red-500 border-red-900/40';
      case 'UNRESPONSIVE':
        return 'bg-white/5 text-white/20 border-dashed border-white/10';
      case 'NEW':
      default:
        return 'bg-white/5 text-white/40 border-white/10';
    }
  };

  return (
    <span className={`px-1.5 py-0.5 rounded border ${getStyle()} ${small ? 'text-[8px]' : 'text-[9px]'} uppercase tracking-tighter whitespace-nowrap`}>
      {s}
    </span>
  );
};
