import React, { useState } from 'react';
import { Partner, PartnerTag, Responsiveness } from '../types';
import { SectionLabel, PillButton, DragNumberField, FieldDropdown } from './UI';

interface Props {
  initialPartner?: Partner;
  onSave: (partner: Partner) => void;
  onCancel: () => void;
}

const TAG_OPTIONS: PartnerTag[] = ['Trusted', 'Needs Review', 'Weak Source', 'Do Not Work With'];

export const PartnerForm: React.FC<Props> = ({ initialPartner, onSave, onCancel }) => {
  const [form, setForm] = useState<Partner>(initialPartner || {
    id: crypto.randomUUID(),
    name: '',
    company: '',
    email: '',
    phone: '',
    source: '',
    dealsSubmitted: 0,
    dealsAccepted: 0,
    dealsBlasted: 0,
    dealsClosed: 0,
    dealsDead: 0,
    avgDealQuality: 5,
    totalJVProfit: 0,
    proofOfControl: true,
    responsiveness: 'Medium',
    jvSplit: 50,
    notes: '',
    tags: [],
    timestamp: Date.now()
  });

  const toggleTag = (tag: PartnerTag) => {
    const next = form.tags.includes(tag) 
      ? form.tags.filter(t => t !== tag) 
      : [...form.tags, tag];
    setForm({ ...form, tags: next });
  };

  return (
    <div className="bg-white/5 border border-white/10 rounded-2xl p-4 flex flex-col gap-5 animate-dropdown shadow-2xl relative overflow-hidden">
      <div className="absolute top-0 left-0 w-1 h-full bg-blue-500" />
      
      <div className="flex items-center justify-between">
        <h4 className="text-[11px] font-black uppercase tracking-[2px] text-blue-400">
          {initialPartner ? 'Edit Partner Performance' : 'New Partner / POC Entry'}
        </h4>
        <button onClick={onCancel} className="text-red-500 hover:text-red-400 transition-colors">
          <span className="material-symbols-outlined text-[18px]">close</span>
        </button>
      </div>

      <div className="grid grid-cols-1 gap-4">
        <div className="flex flex-col gap-2">
          <SectionLabel>Core Information</SectionLabel>
          <div className="grid grid-cols-2 gap-2">
            <input 
              type="text" placeholder="POC Full Name" value={form.name}
              onChange={(e) => setForm({...form, name: e.target.value})}
              className="bg-transparent border border-[#595959] rounded-xl h-[34px] px-2.5 text-[11px] text-white focus:outline-none focus:border-[#969696]"
            />
            <input 
              type="text" placeholder="Company" value={form.company}
              onChange={(e) => setForm({...form, company: e.target.value})}
              className="bg-transparent border border-[#595959] rounded-xl h-[34px] px-2.5 text-[11px] text-white focus:outline-none focus:border-[#969696]"
            />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <input 
              type="email" placeholder="Email Address" value={form.email}
              onChange={(e) => setForm({...form, email: e.target.value})}
              className="bg-transparent border border-[#595959] rounded-xl h-[34px] px-2.5 text-[11px] text-white focus:outline-none focus:border-[#969696]"
            />
            <input 
              type="text" placeholder="Phone" value={form.phone}
              onChange={(e) => setForm({...form, phone: e.target.value})}
              className="bg-transparent border border-[#595959] rounded-xl h-[34px] px-2.5 text-[11px] text-white focus:outline-none focus:border-[#969696]"
            />
          </div>
          <input 
            type="text" placeholder="Lead Source (e.g. Facebook, Referral, REI Reply)" value={form.source}
            onChange={(e) => setForm({...form, source: e.target.value})}
            className="bg-transparent border border-[#595959] rounded-xl h-[34px] px-2.5 text-[11px] text-white focus:outline-none focus:border-[#969696]"
          />
        </div>

        <div className="flex flex-col gap-2">
          <SectionLabel>Performance Metrics (Syncs from History)</SectionLabel>
          <div className="grid grid-cols-2 gap-2 opacity-60">
            <DragNumberField label="Deals Submitted" value={form.dealsSubmitted} min={0} onChange={(v) => setForm({...form, dealsSubmitted: v})} />
            <DragNumberField label="Deals Accepted" value={form.dealsAccepted} min={0} onChange={(v) => setForm({...form, dealsAccepted: v})} />
            <DragNumberField label="Deals Closed" value={form.dealsClosed} min={0} onChange={(v) => setForm({...form, dealsClosed: v})} />
            <DragNumberField label="Deals Dead" value={form.dealsDead} min={0} onChange={(v) => setForm({...form, dealsDead: v})} />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <DragNumberField label="JV Split %" value={form.jvSplit} min={0} max={100} suffix="%" onChange={(v) => setForm({...form, jvSplit: v})} />
            <div className="bg-black/20 border border-white/5 rounded-xl px-3 flex flex-col justify-center">
              <span className="text-[9px] font-bold text-white/20 uppercase">Calculated Profit</span>
              <span className="text-[12px] font-black text-green-400">${form.totalJVProfit.toLocaleString()}</span>
            </div>
          </div>
        </div>

        <div className="flex flex-col gap-2">
          <SectionLabel>Vetting & Tags</SectionLabel>
          <div className="flex gap-2">
            <FieldDropdown 
              label="Responsiveness" 
              value={form.responsiveness} 
              options={['High', 'Medium', 'Low']} 
              onChange={(v) => setForm({...form, responsiveness: v as Responsiveness})}
              className="flex-1"
            />
            <button 
              onClick={() => setForm({...form, proofOfControl: !form.proofOfControl})}
              className={`flex-1 flex flex-col items-center justify-center rounded-xl border transition-all ${form.proofOfControl ? 'bg-green-500/10 border-green-500/30 text-green-400' : 'bg-white/5 border-white/10 text-white/30'}`}
            >
              <span className="text-[9px] font-black uppercase tracking-widest pt-1">Proof of Control</span>
              <span className="text-[11px] font-bold pb-1">{form.proofOfControl ? 'PROVIDED' : 'MISSING'}</span>
            </button>
          </div>
          <div className="flex flex-wrap gap-1.5 mt-1">
            {TAG_OPTIONS.map(tag => (
              <button
                key={tag}
                onClick={() => toggleTag(tag)}
                className={`px-2 py-1 rounded text-[9px] font-black uppercase tracking-tighter border transition-all ${
                  form.tags.includes(tag) 
                    ? 'bg-blue-500 text-white border-blue-400' 
                    : 'bg-white/5 text-white/40 border-white/10'
                }`}
              >
                {tag}
              </button>
            ))}
          </div>
        </div>

        <div className="flex flex-col gap-1">
          <SectionLabel>Partner Notes</SectionLabel>
          <textarea 
            placeholder="Log specific deal wins, losses, or behavioral red flags..."
            value={form.notes}
            onChange={(e) => setForm({...form, notes: e.target.value})}
            className="w-full h-20 bg-transparent border border-[#595959] rounded-xl p-2.5 text-[11px] text-white focus:outline-none focus:border-[#969696] resize-none"
          />
        </div>
      </div>

      <div className="flex gap-2 pt-2">
        <PillButton variant="solid" onClick={() => onSave(form)}>Save Performance</PillButton>
        <PillButton variant="danger" onClick={onCancel}>Cancel</PillButton>
      </div>
    </div>
  );
};
