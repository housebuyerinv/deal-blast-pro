import React from 'react';
import { Partner } from '../types';

interface Props {
  partner: Partner;
  onEdit: () => void;
  onDelete: () => void;
}

export const PartnerCard: React.FC<Props> = ({ partner, onEdit, onDelete }) => {
  const conversionRate = partner.dealsSubmitted > 0 
    ? (partner.dealsClosed / partner.dealsSubmitted) * 100 
    : 0;

  const getTagStyle = (tag: string) => {
    switch (tag) {
      case 'Trusted': return 'bg-green-500/10 text-green-400 border-green-500/20';
      case 'Needs Review': return 'bg-yellow-500/10 text-yellow-500/60 border-yellow-500/20';
      case 'Weak Source': return 'bg-orange-500/10 text-orange-400 border-orange-500/20';
      case 'Do Not Work With': return 'bg-red-500/10 text-red-400 border-red-500/20';
      default: return 'bg-white/5 text-white/40 border-white/10';
    }
  };

  return (
    <div className="bg-[#1a1a1a] border border-white/5 rounded-2xl overflow-hidden flex flex-col group transition-all hover:border-blue-500/30 shadow-xl">
      <div className="p-4 flex flex-col gap-4">
        {/* Header */}
        <div className="flex items-start justify-between">
          <div className="flex flex-col gap-0.5 min-w-0">
            <h4 className="text-[14px] font-bold text-white truncate">{partner.name}</h4>
            <div className="flex items-center gap-1.5">
              <span className="text-[10px] text-white/40 uppercase font-medium truncate">{partner.company || 'Private POC'}</span>
              <span className="text-white/10">•</span>
              <span className="text-[10px] text-blue-400/80 font-bold uppercase">{partner.source}</span>
            </div>
          </div>
          <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
            <button onClick={onEdit} className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-white/5 text-white/30">
              <span className="material-symbols-outlined text-[18px]">edit</span>
            </button>
            <button onClick={onDelete} className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-red-500/10 text-white/30 hover:text-red-400">
              <span className="material-symbols-outlined text-[18px]">delete</span>
            </button>
          </div>
        </div>

        {/* Tags */}
        <div className="flex flex-wrap gap-1.5">
          {partner.tags.map(tag => (
            <span key={tag} className={`px-1.5 py-0.5 rounded text-[8px] font-black uppercase border tracking-widest ${getTagStyle(tag)}`}>
              {tag}
            </span>
          ))}
          {!partner.proofOfControl && (
            <span className="px-1.5 py-0.5 rounded text-[8px] font-black uppercase border border-red-500/30 text-red-400 bg-red-500/5">NO CONTROL</span>
          )}
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-3 gap-2 py-3 border-y border-white/5">
          <Stat label="Deals" value={`${partner.dealsClosed}/${partner.dealsSubmitted}`} sub="Closed/Sub" />
          <Stat label="Avg Quality" value={`${partner.avgDealQuality}/10`} sub="Rating" />
          <Stat label="Conv." value={`${conversionRate.toFixed(0)}%`} sub="Submit -> Close" highlight={conversionRate > 15} />
        </div>

        {/* Secondary Details */}
        <div className="flex items-center justify-between text-[10px]">
          <div className="flex gap-3">
            <Detail label="Resp." value={partner.responsiveness} />
            <Detail label="Split" value={`${partner.jvSplit}%`} />
          </div>
          <div className="flex items-center gap-1">
            <span className="material-symbols-outlined text-[12px] text-white/20">schedule</span>
            <span className="text-white/20">{new Date(partner.timestamp).toLocaleDateString()}</span>
          </div>
        </div>

        {/* Notes Preview */}
        {partner.notes && (
          <p className="text-[11px] text-white/40 leading-relaxed italic bg-black/20 p-2 rounded-lg border border-white/5">
            "{partner.notes.slice(0, 100)}{partner.notes.length > 100 ? '...' : ''}"
          </p>
        )}

        {/* Actions */}
        <div className="flex gap-2">
          <a 
            href={`mailto:${partner.email}?subject=Follow-up regarding deal submissions`}
            className="flex-1 flex items-center justify-center gap-2 h-[34px] rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-[10px] font-black text-white/60 hover:text-white uppercase tracking-widest transition-all"
          >
            <span className="material-symbols-outlined text-[16px]">mail</span>
            Email
          </a>
          <a 
            href={`tel:${partner.phone}`}
            className="flex-1 flex items-center justify-center gap-2 h-[34px] rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-[10px] font-black text-white/60 hover:text-white uppercase tracking-widest transition-all"
          >
            <span className="material-symbols-outlined text-[16px]">call</span>
            Call
          </a>
        </div>
      </div>
    </div>
  );
};

const Stat = ({ label, value, sub, highlight = false }: { label: string, value: string, sub: string, highlight?: boolean }) => (
  <div className="flex flex-col">
    <span className="text-[8px] font-black text-white/20 uppercase tracking-widest">{label}</span>
    <span className={`text-[13px] font-black tracking-tight ${highlight ? 'text-green-400' : 'text-white/80'}`}>{value}</span>
    <span className="text-[8px] text-white/20 font-medium">{sub}</span>
  </div>
);

const Detail = ({ label, value }: { label: string, value: string }) => (
  <div className="flex items-center gap-1.5">
    <span className="text-white/20 font-bold uppercase">{label}:</span>
    <span className="text-white/60 font-medium">{value}</span>
  </div>
);
