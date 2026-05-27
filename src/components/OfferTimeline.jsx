import React from 'react';
import { TimelineEvent } from '../types';

interface Props {
  timeline: TimelineEvent[];
}

export const OfferTimeline: React.FC<Props> = ({ timeline }) => {
  if (timeline.length === 0) {
    return (
      <div className="py-4 text-center text-[10px] text-white/20 uppercase font-black">
        Timeline is empty
      </div>
    );
  }

  const sorted = [...timeline].sort((a, b) => b.timestamp - a.timestamp);

  return (
    <div className="flex flex-col gap-4 py-2">
      {sorted.map((event, idx) => (
        <div key={event.id} className="relative flex gap-4 pl-4">
          {/* Timeline Connector */}
          {idx < sorted.length - 1 && (
            <div className="absolute left-[17px] top-6 bottom-[-24px] w-px bg-white/10" />
          )}
          
          {/* Timeline Dot */}
          <div className={`z-10 w-2 h-2 rounded-full mt-1.5 border ${
            event.status === 'Accepted' ? 'bg-green-400 border-green-500' : 
            event.status === 'Rejected' ? 'bg-red-400 border-red-500' : 
            event.status === 'Counter Sent' ? 'bg-yellow-400 border-yellow-500' :
            'bg-white/40 border-white/20'
          }`} />

          <div className="flex flex-col gap-1 min-w-0 flex-1">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-black text-white uppercase tracking-tight truncate">{event.action}</span>
              <span className="text-[9px] text-white/30 font-medium">
                {new Date(event.timestamp).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
              </span>
            </div>
            {event.notes && (
              <p className="text-[11px] text-white/50 leading-relaxed bg-black/20 p-2 rounded-lg border border-white/5">
                {event.notes}
              </p>
            )}
            <div className="flex items-center gap-1.5">
              <span className="text-[8px] font-black text-white/20 uppercase tracking-widest">{event.status}</span>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
};
