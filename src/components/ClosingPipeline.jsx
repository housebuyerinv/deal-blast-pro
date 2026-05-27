import React, { useState } from 'react';
import { PropertyData, ClosingData, ClosingStatus, ClosingChecklistItem, Buyer } from '../types';
import { SectionLabel, DragNumberField, FieldDropdown, PillButton } from './UI';
import { ClosingChecklist } from './ClosingChecklist';
import { ClosingAlerts } from './ClosingAlerts';
import { PostClosingReportForm } from './PostClosingReportForm';

interface Props {
  data: PropertyData;
  buyers: Buyer[];
  onUpdateClosing: (closing: ClosingData) => void;
  onUpdateBuyers: (buyers: Buyer[]) => void;
}

const STATUSES: ClosingStatus[] = [
  'Accepted', 'PSA Sent', 'PSA Signed', 'EMD Deposited', 'Title Opened', 
  'Inspection Scheduled', 'Buyer Docs Received', 'Assignment Sent', 
  'Assignment Signed', 'Clear to Close', 'Closing Scheduled', 
  'Funded', 'Closed', 'Dead'
];

export const ClosingPipeline: React.FC<Props> = ({ data, buyers, onUpdateClosing, onUpdateBuyers }) => {
  const [showReport, setShowReport] = useState(false);
  const closing = data.closing;

  if (!closing) {
    return (
      <div className="h-full flex flex-col items-center justify-center text-center opacity-20 max-w-xs mx-auto py-24">
        <span className="material-symbols-outlined text-[64px] mb-4">gavel</span>
        <p className="text-[13px] font-bold uppercase tracking-widest">No Accepted Offer</p>
        <p className="text-[11px] mt-2 leading-relaxed">Accept a buyer's offer in the "Offers" tab to initialize the closing pipeline tracking.</p>
      </div>
    );
  }

  const updateField = (field: keyof ClosingData, value: any) => {
    onUpdateClosing({ ...closing, [field]: value });
  };

  const updateChecklist = (items: ClosingChecklistItem[]) => {
    onUpdateClosing({ ...closing, checklist: items });
  };

  return (
    <div className="flex flex-col gap-6 animate-fade-in">
      <ClosingAlerts closing={closing} />

      {closing.status === 'Closed' && !showReport && (
        <div className="bg-green-500/10 border border-green-500/30 rounded-2xl p-4 flex flex-col md:flex-row items-center justify-between gap-4 animate-fade-in">
          <div className="flex items-center gap-3">
            <span className="material-symbols-outlined text-green-400 text-[32px]">task_alt</span>
            <div className="flex flex-col">
              <span className="text-[13px] font-bold text-white uppercase tracking-tight">Transaction Complete</span>
              <span className="text-[11px] text-white/50">Deal has officially closed. Run a post-closing audit to capture insights.</span>
            </div>
          </div>
          <PillButton variant="solid" onClick={() => setShowReport(true)} icon={<span className="material-symbols-outlined text-[18px]">summarize</span>}>
            Generate Post-Closing Report
          </PillButton>
        </div>
      )}

      {showReport ? (
        <PostClosingReportForm 
          data={data} 
          closing={closing} 
          buyers={buyers}
          onUpdateClosing={(c) => { onUpdateClosing(c); setShowReport(false); }}
          onUpdateBuyers={onUpdateBuyers}
          onCancel={() => setShowReport(false)}
        />
      ) : (
        <>
          <div className="bg-[#1a1a1a] border border-green-500/20 rounded-2xl overflow-hidden flex flex-col shadow-xl">
            <div className="px-4 py-3 border-b border-white/5 flex items-center justify-between bg-green-500/5">
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-[18px] text-green-400">handshake</span>
                <h3 className="text-[12px] font-medium text-white/90 tracking-wide uppercase">Closing Pipeline Dashboard</h3>
              </div>
              <FieldDropdown 
                label="Stage" 
                value={closing.status} 
                options={STATUSES} 
                onChange={(v) => updateField('status', v as ClosingStatus)}
                className="w-40"
              />
            </div>

            <div className="p-4 grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="flex flex-col gap-4">
                <SectionLabel>Transaction Participants</SectionLabel>
                <div className="grid grid-cols-1 gap-3">
                  <div className="bg-black/20 border border-white/5 p-3 rounded-xl flex flex-col gap-1">
                    <p className="text-[10px] font-bold text-white/30 uppercase tracking-widest">Assigned Buyer</p>
                    <p className="text-[13px] font-bold text-white">{closing.buyerName}</p>
                  </div>
                  
                  <div className="bg-black/20 border border-white/5 p-3 rounded-xl flex flex-col gap-2">
                    <p className="text-[10px] font-bold text-white/30 uppercase tracking-widest">Title Company Info</p>
                    <input 
                      type="text" 
                      placeholder="Title Company Name" 
                      value={closing.titleCompany}
                      onChange={(e) => updateField('titleCompany', e.target.value)}
                      className="bg-transparent border border-[#595959] rounded-lg h-[34px] px-2.5 text-[11px] text-white focus:outline-none focus:border-[#969696]"
                    />
                    <input 
                      type="text" 
                      placeholder="Escrow Officer Contact" 
                      value={closing.titleContact}
                      onChange={(e) => updateField('titleContact', e.target.value)}
                      className="bg-transparent border border-[#595959] rounded-lg h-[34px] px-2.5 text-[11px] text-white focus:outline-none focus:border-[#969696]"
                    />
                  </div>
                </div>
              </div>

              <div className="flex flex-col gap-4">
                <SectionLabel>Critical Dates</SectionLabel>
                <div className="grid grid-cols-1 gap-3">
                  <DateInput label="EMD Deadline" value={closing.emdDeadline} onChange={(v) => updateField('emdDeadline', v)} />
                  <DateInput label="Inspection Deadline" value={closing.inspectionDeadline} onChange={(v) => updateField('inspectionDeadline', v)} />
                  <DateInput label="Target Closing Date" value={closing.closingDate} onChange={(v) => updateField('closingDate', v)} />
                </div>
              </div>
            </div>

            <div className="p-4 border-t border-white/5 grid grid-cols-2 md:grid-cols-4 gap-6">
              <MetricBox label="Purchase Price" value={`$${data.price.toLocaleString()}`} />
              <MetricBox label="Assignment Fee" value={`$${closing.finalAssignmentFee.toLocaleString()}`} highlight />
              <MetricBox label="Closing Costs" value={`$${Math.round(data.price * 0.02).toLocaleString()}`} />
              <MetricBox label="Net Wholesale Profit" value={`$${closing.netWholesaleProfit.toLocaleString()}`} highlight />
            </div>

            <div className="p-4 border-t border-white/5 bg-black/20 grid grid-cols-2 gap-4">
              <ToggleButton 
                label="Title Issues Detected" 
                active={closing.hasTitleIssue} 
                onClick={() => updateField('hasTitleIssue', !closing.hasTitleIssue)}
                activeColor="bg-red-500/20 text-red-400 border-red-500/30"
              />
              <ToggleButton 
                label="Buyer Responding" 
                active={closing.buyerResponding} 
                onClick={() => updateField('buyerResponding', !closing.buyerResponding)}
                activeColor="bg-green-500/20 text-green-400 border-green-500/30"
                inactiveColor="bg-red-500/20 text-red-400 border-red-500/30"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="md:col-span-2 flex flex-col gap-4">
              <SectionLabel>Closing Checklist (14 Steps)</SectionLabel>
              <ClosingChecklist items={closing.checklist} onChange={updateChecklist} />
            </div>
            <div className="flex flex-col gap-4">
              <SectionLabel>Closing File Notes</SectionLabel>
              <textarea 
                value={closing.notes}
                onChange={(e) => updateField('notes', e.target.value)}
                placeholder="Log title updates, buyer communication, or walkthrough notes here..."
                className="w-full h-[400px] bg-white/5 border border-white/10 rounded-2xl p-4 text-[12px] text-white/70 focus:outline-none focus:border-white/20 resize-none dark-scrollbar"
              />
            </div>
          </div>
        </>
      )}
    </div>
  );
};

const DateInput = ({ label, value, onChange }: { label: string, value?: string, onChange: (v: string) => void }) => (
  <div className="bg-black/20 border border-white/5 p-3 rounded-xl flex flex-col gap-1.5">
    <p className="text-[10px] font-bold text-white/30 uppercase tracking-widest">{label}</p>
    <input 
      type="date" 
      value={value} 
      onChange={(e) => onChange(e.target.value)}
      className="bg-transparent text-[12px] text-white focus:outline-none invert brightness-200"
    />
  </div>
);

const MetricBox = ({ label, value, highlight = false }: { label: string, value: string, highlight?: boolean }) => (
  <div className="flex flex-col">
    <span className="text-[10px] font-bold text-white/20 uppercase tracking-widest">{label}</span>
    <span className={`text-[15px] font-black tracking-tight ${highlight ? 'text-green-400' : 'text-white/80'}`}>{value}</span>
  </div>
);

const ToggleButton = ({ label, active, onClick, activeColor, inactiveColor = "bg-white/5 text-white/30 border-white/10" }: { label: string, active: boolean, onClick: () => void, activeColor: string, inactiveColor?: string }) => (
  <button 
    onClick={onClick}
    className={`flex items-center justify-between px-4 py-3 rounded-xl border transition-all text-[11px] font-bold uppercase tracking-widest ${active ? activeColor : inactiveColor}`}
  >
    <span>{label}</span>
    <span className="material-symbols-outlined text-[18px]">
      {active ? 'check_circle' : 'radio_button_unchecked'}
    </span>
  </button>
);
