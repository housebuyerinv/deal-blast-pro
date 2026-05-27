import React from 'react';
import { CompData } from '../types';

export const CompNotesView: React.FC<{ comps: CompData }> = ({ comps }) => {
  return (
    <div className="bg-[#1a1a1a] border border-[rgba(218,220,224,0.1)] rounded-2xl overflow-hidden flex flex-col">
      <div className="px-4 py-3 border-b border-white/5 flex items-center justify-between bg-white/[0.02]">
        <div className="flex items-center gap-2">
          <span className="material-symbols-outlined text-[18px] text-white/40">map</span>
          <h3 className="text-[12px] font-medium text-white/90 tracking-wide uppercase">Comparable Notes</h3>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-medium text-white/40 uppercase">ARV Confidence</span>
          <div className="h-1.5 w-24 bg-white/5 rounded-full overflow-hidden">
            <div 
              className={`h-full transition-all duration-1000 ${comps.confidenceScore > 80 ? 'bg-green-500' : comps.confidenceScore > 60 ? 'bg-yellow-500' : 'bg-red-500'}`}
              style={{ width: `${comps.confidenceScore}%` }}
            />
          </div>
          <span className="text-[11px] font-bold text-white/80">{comps.confidenceScore}%</span>
        </div>
      </div>

      <div className="p-4 grid grid-cols-1 md:grid-cols-2 gap-4">
        <CompBox title="Sold Comps" content={comps.soldComps} icon="sell" />
        <CompBox title="Rent Comps" content={comps.rentComps} icon="home_work" />
        <CompBox title="ARV Support" content={comps.arvSupport} icon="verified" />
        <div className="bg-black/20 rounded-xl p-3 flex flex-col gap-2 border border-white/5">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold text-white/30 uppercase">Distance & Condition</span>
            <span className="text-[11px] font-medium text-white/60">{comps.distance} Miles Out</span>
          </div>
          <p className="text-[12px] text-white/70 italic leading-snug">
            {comps.conditionNotes || "No condition notes provided."}
          </p>
        </div>
      </div>
    </div>
  );
};

const CompBox = ({ title, content, icon }: { title: string, content: string, icon: string }) => (
  <div className="bg-black/20 rounded-xl p-3 flex flex-col gap-1 border border-white/5">
    <div className="flex items-center gap-1.5 mb-1">
      <span className="material-symbols-outlined text-[14px] text-white/30">{icon}</span>
      <span className="text-[10px] font-bold text-white/40 uppercase tracking-wider">{title}</span>
    </div>
    <p className="text-[12px] text-white/80 whitespace-pre-wrap">
      {content || "No data provided."}
    </p>
  </div>
);
