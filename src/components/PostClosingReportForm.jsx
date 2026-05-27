import React, { useState } from 'react';
import { PropertyData, ClosingData, PostClosingReport, Buyer } from '../types';
import { SectionLabel, PillButton, DragNumberField, TextInput } from './UI';
import { Flow } from 'flow-sdk';

interface Props {
  data: PropertyData;
  closing: ClosingData;
  buyers: Buyer[];
  onUpdateClosing: (closing: ClosingData) => void;
  onUpdateBuyers: (buyers: Buyer[]) => void;
  onCancel: () => void;
}

export const PostClosingReportForm: React.FC<Props> = ({ data, closing, buyers, onUpdateClosing, onUpdateBuyers, onCancel }) => {
  const [report, setReport] = useState<PostClosingReport>(closing.report || {
    sellerPOC: '',
    fundingDate: new Date().toISOString().split('T')[0],
    majorIssues: '',
    timelineSummary: '',
    lessonsLearned: '',
    buyerPerformanceScore: 8,
    isPrioritized: true,
    finalSalePrice: data.price + closing.finalAssignmentFee
  });

  const [isExporting, setIsExporting] = useState(false);

  const updateField = (field: keyof PostClosingReport, value: any) => {
    setReport(prev => ({ ...prev, [field]: value }));
  };

  const handleSaveAndExport = async () => {
    setIsExporting(true);
    
    // 1. Update the closing object with the report
    const updatedClosing = { ...closing, report };
    
    // 2. Update the buyer globally if they exist in the CRM
    const buyerToUpdate = buyers.find(b => b.name === closing.buyerName || b.email.includes(closing.buyerName.split(' ')[0]));
    if (buyerToUpdate) {
      const updatedBuyers = buyers.map(b => {
        if (b.id === buyerToUpdate.id) {
          return {
            ...b,
            status: 'Closed' as any,
            nextAction: report.isPrioritized ? 'Mark closed' : 'None' as any,
            notes: `${b.notes}\n[Audit ${new Date().toLocaleDateString()}] Score: ${report.buyerPerformanceScore}/10. Prioritize: ${report.isPrioritized ? 'YES' : 'NO'}. Lessons: ${report.lessonsLearned}`,
            activity: {
              ...b.activity,
              lastActive: Date.now()
            }
          };
        }
        return b;
      });
      onUpdateBuyers(updatedBuyers);
    }

    // 3. Save report to closing data
    onUpdateClosing(updatedClosing);

    // 4. Generate Export Text
    const reportText = `
POST-CLOSING DEAL REPORT
-----------------------------------
PROPERTY: ${data.address}
STATUS: OFFICIALLY CLOSED

FINANCIAL SUMMARY:
- Final Sale Price: $${report.finalSalePrice.toLocaleString()}
- Assignment Fee: $${closing.finalAssignmentFee.toLocaleString()}
- Net Wholesale Profit: $${closing.netWholesaleProfit.toLocaleString()}
- EMD Amount: $${(data.offers.find(o => o.buyerName === closing.buyerName)?.emdAmount || 5000).toLocaleString()}

CLOSING DETAILS:
- Buyer Name: ${closing.buyerName}
- Seller / POC: ${report.sellerPOC}
- Title Company: ${closing.titleCompany}
- Closing Date: ${closing.closingDate || 'N/A'}
- Funding Date: ${report.fundingDate}

TIMELINE SUMMARY:
${report.timelineSummary || 'No summary provided.'}

MAJOR ISSUES ENCOUNTERED:
${report.majorIssues || 'None recorded.'}

LESSONS LEARNED:
${report.lessonsLearned || 'None recorded.'}

BUYER EVALUATION:
- Performance Score: ${report.buyerPerformanceScore}/10
- Prioritize for Future Deals: ${report.isPrioritized ? 'YES' : 'NO'}
- Recommended Action: Mark as ${report.buyerPerformanceScore >= 8 ? 'HOT / CLOSED' : 'CLOSED'}

Generated via Deal Pack Pro Audit Engine
-----------------------------------
    `.trim();

    await navigator.clipboard.writeText(reportText);
    
    // Also download as TXT for records
    const base64 = btoa(reportText);
    await Flow.download({
      base64,
      mimeType: 'text/plain',
      filename: `Audit_Report_${data.address.replace(/\s+/g, '_')}.txt`
    });

    setIsExporting(false);
  };

  return (
    <div className="bg-[#1a1a1a] border border-green-500/40 rounded-2xl overflow-hidden flex flex-col shadow-2xl animate-fade-in max-w-4xl mx-auto w-full">
      <div className="px-6 py-4 border-b border-white/10 flex items-center justify-between bg-green-500/5">
        <div className="flex items-center gap-3">
          <span className="material-symbols-outlined text-green-400">summarize</span>
          <h3 className="text-sm font-bold text-white uppercase tracking-widest">Post-Closing Audit Generator</h3>
        </div>
        <button onClick={onCancel} className="text-white/30 hover:text-white transition-colors">
          <span className="material-symbols-outlined">close</span>
        </button>
      </div>

      <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-8">
        {/* Quantitative Section */}
        <div className="flex flex-col gap-6">
          <section className="flex flex-col gap-4">
            <SectionLabel>Audit Financials & Dates</SectionLabel>
            <div className="grid grid-cols-1 gap-3">
              <DragNumberField 
                label="Final Sale Price" 
                value={report.finalSalePrice} 
                step={1000} 
                onChange={(v) => updateField('finalSalePrice', v)} 
                suffix="$" 
              />
              <div className="grid grid-cols-2 gap-2">
                <div className="bg-black/20 border border-white/5 p-3 rounded-xl flex flex-col gap-1">
                  <p className="text-[10px] font-bold text-white/30 uppercase tracking-widest">Assignment Fee</p>
                  <p className="text-[13px] font-bold text-green-400">${closing.finalAssignmentFee.toLocaleString()}</p>
                </div>
                <div className="bg-black/20 border border-white/5 p-3 rounded-xl flex flex-col gap-1">
                  <p className="text-[10px] font-bold text-white/30 uppercase tracking-widest">Net Profit</p>
                  <p className="text-[13px] font-bold text-green-400">${closing.netWholesaleProfit.toLocaleString()}</p>
                </div>
              </div>
            </div>
          </section>

          <section className="flex flex-col gap-4">
            <SectionLabel>Closing POCs</SectionLabel>
            <div className="grid grid-cols-1 gap-3">
              <div className="flex flex-col gap-0.5">
                <p className="text-[10px] font-bold text-white/30 uppercase tracking-widest px-2">Seller / Point of Contact</p>
                <input 
                  type="text" 
                  placeholder="Contact name at title or seller" 
                  value={report.sellerPOC}
                  onChange={(e) => updateField('sellerPOC', e.target.value)}
                  className="bg-transparent border border-[#595959] rounded-xl h-[34px] px-2.5 text-[11px] text-white focus:outline-none focus:border-[#969696]"
                />
              </div>
              <div className="bg-black/20 border border-white/5 p-3 rounded-xl flex flex-col gap-1.5">
                <p className="text-[10px] font-bold text-white/30 uppercase tracking-widest">Funding Date</p>
                <input 
                  type="date" 
                  value={report.fundingDate} 
                  onChange={(e) => updateField('fundingDate', e.target.value)}
                  className="bg-transparent text-[12px] text-white focus:outline-none invert brightness-200"
                />
              </div>
            </div>
          </section>

          <section className="flex flex-col gap-4">
            <SectionLabel>Buyer Performance Audit</SectionLabel>
            <div className="bg-black/20 border border-white/5 p-4 rounded-xl flex flex-col gap-4">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold text-white/60 uppercase">Buyer Satisfaction</span>
                <span className={`text-[11px] font-black px-2 py-0.5 rounded ${report.buyerPerformanceScore >= 8 ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'}`}>
                  {report.buyerPerformanceScore >= 8 ? 'VIP BUYER' : 'Standard'}
                </span>
              </div>
              <DragNumberField 
                label="Performance Score (1-10)" 
                value={report.buyerPerformanceScore} 
                min={1} 
                max={10} 
                step={1} 
                onChange={(v) => updateField('buyerPerformanceScore', v)} 
              />
              <button 
                onClick={() => updateField('isPrioritized', !report.isPrioritized)}
                className={`w-full flex items-center justify-between px-4 py-2.5 rounded-xl border transition-all text-[10px] font-black uppercase tracking-widest ${report.isPrioritized ? 'bg-blue-500/20 text-blue-400 border-blue-500/30' : 'bg-white/5 text-white/20 border-white/10'}`}
              >
                <span>Prioritize for Future Deals</span>
                <span className="material-symbols-outlined text-[18px]">
                  {report.isPrioritized ? 'check_circle' : 'radio_button_unchecked'}
                </span>
              </button>
            </div>
          </section>
        </div>

        {/* Qualitative Section */}
        <div className="flex flex-col gap-6">
          <section className="flex flex-col gap-2">
            <SectionLabel>Timeline Summary</SectionLabel>
            <textarea 
              value={report.timelineSummary}
              onChange={(e) => updateField('timelineSummary', e.target.value)}
              placeholder="Briefly describe the flow from contract to close..."
              className="w-full h-24 bg-black/20 border border-white/5 rounded-xl p-3 text-[11px] text-white/80 focus:outline-none focus:border-white/20 resize-none"
            />
          </section>

          <section className="flex flex-col gap-2">
            <SectionLabel>Major Issues Encountered</SectionLabel>
            <textarea 
              value={report.majorIssues}
              onChange={(e) => updateField('majorIssues', e.target.value)}
              placeholder="Title clouds, buyer financing issues, occupancy delays..."
              className="w-full h-24 bg-black/20 border border-white/5 rounded-xl p-3 text-[11px] text-white/80 focus:outline-none focus:border-white/20 resize-none"
            />
          </section>

          <section className="flex flex-col gap-2">
            <SectionLabel>Lessons Learned</SectionLabel>
            <textarea 
              value={report.lessonsLearned}
              onChange={(e) => updateField('lessonsLearned', e.target.value)}
              placeholder="How can we make the next one smoother?"
              className="w-full h-32 bg-black/20 border border-white/5 rounded-xl p-3 text-[11px] text-white/80 focus:outline-none focus:border-white/20 resize-none"
            />
          </section>
        </div>
      </div>

      <div className="p-6 border-t border-white/10 bg-black/40 flex flex-col md:flex-row gap-3">
        <PillButton 
          variant="solid" 
          onClick={handleSaveAndExport} 
          disabled={isExporting}
          icon={<span className="material-symbols-outlined text-[18px]">{isExporting ? 'pending' : 'verified'}</span>}
        >
          {isExporting ? 'Generating Report...' : 'Finalize Audit & Copy Report'}
        </PillButton>
        <PillButton variant="outline" onClick={onCancel}>
          Discard Audit
        </PillButton>
      </div>
    </div>
  );
};
