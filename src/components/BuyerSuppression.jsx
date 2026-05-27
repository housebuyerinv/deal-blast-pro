import React, { useState } from 'react';
import { SuppressionList } from '../types';
import { SectionLabel, PillButton } from './UI';

interface Props {
  suppression: SuppressionList;
  onChange: (s: SuppressionList) => void;
  excludeDomains: boolean;
  onExcludeDomainsChange: (v: boolean) => void;
}

export const BuyerSuppression: React.FC<Props> = ({ suppression, onChange, excludeDomains, onExcludeDomainsChange }) => {
  const [activeTab, setActiveTab] = useState<keyof SuppressionList>('unsubscribed');
  const [newInput, setNewInput] = useState('');

  const addEntries = () => {
    const entries = newInput.split(/[\n,]/).map(e => e.trim().toLowerCase()).filter(e => e.length > 3);
    const updated = { ...suppression };
    updated[activeTab] = Array.from(new Set([...updated[activeTab], ...entries]));
    onChange(updated);
    setNewInput('');
  };

  const removeEntry = (tab: keyof SuppressionList, entry: string) => {
    const updated = { ...suppression };
    updated[tab] = updated[tab].filter(e => e !== entry);
    onChange(updated);
  };

  const tabs: { id: keyof SuppressionList; label: string; icon: string }[] = [
    { id: 'unsubscribed', label: 'Unsubbed', icon: 'unsubscribe' },
    { id: 'bounced', label: 'Bounced', icon: 'error' },
    { id: 'doNotContact', label: 'DNC', icon: 'block' },
    { id: 'manual', label: 'Excluded', icon: 'person_off' }
  ];

  return (
    <div className="flex flex-col gap-4 animate-fade-in">
      <SectionLabel>Suppression Logic</SectionLabel>
      
      <div className="flex flex-col gap-2">
        <button 
          onClick={() => onExcludeDomainsChange(!excludeDomains)}
          className={`w-full flex items-center justify-between p-3 rounded-xl border transition-all ${excludeDomains ? 'bg-orange-500/10 border-orange-500/30' : 'bg-white/5 border-white/10 opacity-60'}`}
        >
          <div className="flex flex-col items-start text-left">
            <span className="text-[11px] font-bold text-white uppercase tracking-wider">Duplicate Domain Detection</span>
            <span className="text-[9px] text-white/40">Only 1 email per company domain</span>
          </div>
          <span className={`material-symbols-outlined text-[20px] ${excludeDomains ? 'text-orange-400' : 'text-white/20'}`}>
            {excludeDomains ? 'domain_verification' : 'domain_disabled'}
          </span>
        </button>

        <div className="flex bg-white/5 rounded-xl p-1 gap-1">
          {tabs.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex-1 flex flex-col items-center py-2 rounded-lg transition-all ${activeTab === tab.id ? 'bg-white/10 text-white' : 'text-white/30 hover:text-white/50'}`}
            >
              <span className="material-symbols-outlined text-[18px]">{tab.icon}</span>
              <span className="text-[9px] font-black uppercase tracking-tighter mt-0.5">{tab.label}</span>
            </button>
          ))}
        </div>

        <div className="flex flex-col gap-2 p-3 bg-white/5 border border-white/10 rounded-xl">
          <textarea
            value={newInput}
            onChange={(e) => setNewInput(e.target.value)}
            placeholder={`Paste ${activeTab} emails/domains...`}
            className="w-full h-16 bg-transparent border-none text-[11px] text-white focus:outline-none resize-none"
          />
          <PillButton variant="outline" onClick={addEntries} disabled={!newInput.trim()}>
            Add to {activeTab} List
          </PillButton>
        </div>

        <div className="flex flex-col gap-1 max-h-[150px] overflow-y-auto dark-scrollbar pr-1">
          {suppression[activeTab].map(entry => (
            <div key={entry} className="flex items-center justify-between py-1.5 px-3 bg-black/20 rounded-lg group">
              <span className="text-[11px] text-white/70 truncate">{entry}</span>
              <button onClick={() => removeEntry(activeTab, entry)} className="opacity-0 group-hover:opacity-100 transition-opacity text-white/30 hover:text-red-400">
                <span className="material-symbols-outlined text-[14px]">close</span>
              </button>
            </div>
          ))}
          {suppression[activeTab].length === 0 && (
            <p className="text-[10px] text-center text-white/20 py-4 italic uppercase tracking-widest">List is empty</p>
          )}
        </div>
      </div>
    </div>
  );
};
