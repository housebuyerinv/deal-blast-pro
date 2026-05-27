import React, { useState } from 'react';
import { Offer, OfferStatus, OfferType } from '../types';
import { SectionLabel, PillButton, DragNumberField, FieldDropdown } from './UI';

interface Props {
  initialOffer?: Offer;
  onSave: (offer: Offer) => void;
  onCancel: () => void;
}

export const OfferForm: React.FC<Props> = ({ initialOffer, onSave, onCancel }) => {
  const [form, setForm] = useState<Offer>(initialOffer || {
    id: crypto.randomUUID(),
    buyerName: '',
    buyerEmail: '',
    amount: 0,
    type: 'Cash',
    emdAmount: 5000,
    closingDays: 14,
    contingencies: '',
    pofReceived: false,
    bioReceived: false,
    status: 'New Offer',
    notes: '',
    lastFollowUp: Date.now()
  });

  return (
    <div className="bg-white/5 border border-white/10 rounded-xl p-4 flex flex-col gap-4 animate-dropdown">
      <div className="flex items-center justify-between border-b border-white/5 pb-2">
        <h4 className="text-[11px] font-black uppercase tracking-[2px] text-blue-400">
          {initialOffer ? 'Edit Offer' : 'Log New Offer'}
        </h4>
        <button onClick={onCancel} className="text-red-500 hover:text-red-400 transition-colors">
          <span className="material-symbols-outlined text-[18px]">close</span>
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div className="flex flex-col gap-1">
          <SectionLabel>Buyer Details</SectionLabel>
          <input 
            type="text" placeholder="Buyer Name" value={form.buyerName}
            onChange={(e) => setForm({...form, buyerName: e.target.value})}
            className="bg-transparent border border-[#595959] rounded-xl h-[34px] px-2.5 text-[11px] text-white focus:outline-none"
          />
          <input 
            type="email" placeholder="Buyer Email" value={form.buyerEmail}
            onChange={(e) => setForm({...form, buyerEmail: e.target.value})}
            className="bg-transparent border border-[#595959] rounded-xl h-[34px] px-2.5 text-[11px] text-white focus:outline-none"
          />
        </div>

        <div className="flex flex-col gap-1">
          <SectionLabel>Offer Amount & Type</SectionLabel>
          <div className="flex gap-2">
            <DragNumberField label="Amount" value={form.amount} step={1000} onChange={(v) => setForm({...form, amount: v})} suffix="$" className="flex-1" />
            <FieldDropdown label="Type" value={form.type} options={['Cash', 'Financing', 'Creative']} onChange={(v) => setForm({...form, type: v as any})} className="flex-1" />
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <DragNumberField label="EMD" value={form.emdAmount} step={500} onChange={(v) => setForm({...form, emdAmount: v})} suffix="$" />
        <DragNumberField label="Days to Close" value={form.closingDays} min={1} max={90} step={1} onChange={(v) => setForm({...form, closingDays: v})} suffix="d" />
        <FieldDropdown label="Status" value={form.status} options={['New Offer', 'Under Review', 'Counter Sent', 'Accepted', 'Rejected', 'Backup', 'Dead']} onChange={(v) => setForm({...form, status: v as any})} />
        <div className="flex items-center gap-2 px-2">
          <button onClick={() => setForm({...form, pofReceived: !form.pofReceived})} className={`flex-1 h-[34px] rounded-xl text-[9px] font-black border transition-all ${form.pofReceived ? 'bg-green-500 border-green-400 text-white' : 'border-[#595959] text-white/40'}`}>POF</button>
          <button onClick={() => setForm({...form, bioReceived: !form.bioReceived})} className={`flex-1 h-[34px] rounded-xl text-[9px] font-black border transition-all ${form.bioReceived ? 'bg-green-500 border-green-400 text-white' : 'border-[#595959] text-white/40'}`}>BIO</button>
        </div>
      </div>

      <div className="flex flex-col gap-1">
        <SectionLabel>Contingencies & Notes</SectionLabel>
        <textarea 
          placeholder="List any contingencies or additional notes..."
          value={form.notes}
          onChange={(e) => setForm({...form, notes: e.target.value})}
          className="w-full h-16 bg-transparent border border-[#595959] rounded-xl p-2.5 text-[11px] text-white focus:outline-none resize-none"
        />
      </div>

      <div className="flex gap-2 pt-2">
        <PillButton variant="solid" onClick={() => onSave(form)}>Save Offer</PillButton>
        <PillButton variant="danger" onClick={onCancel}>Cancel</PillButton>
      </div>
    </div>
  );
};
