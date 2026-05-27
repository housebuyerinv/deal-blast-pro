import React, { useState, useMemo } from 'react';
import { PillButton, SectionLabel, Toast } from './UI';
import { Flow } from 'flow-sdk';
import { jsPDF } from 'jspdf';
import { 
  PropertyData, 
  GeneratedContent, 
  ProfitMetrics, 
  MarketIntelligence, 
  BlastLogEntry, 
  Buyer, 
  AppSettings, 
  ReadinessOverrideReason, 
  ReadinessLog,
  SafetyCheckLog,
  ActivityLog,
  DealBuyerStage
} from '../types';
import { BlastLogTracker } from './BlastLogTracker';
import { getMatchedBuyers, syncPipelineEntries } from '../utils/matching';
import { calculateReadinessScore } from '../utils/readinessLogic';
import { FinalPreBlastChecklist } from './FinalPreBlastChecklist';

interface Props {
  data: PropertyData;
  content: GeneratedContent;
  metrics: ProfitMetrics;
  intelligence: MarketIntelligence;
  buyers: Buyer[];
  settings: AppSettings;
  onUpdateData: (d: PropertyData) => void;
  onUpdateBuyers: (b: Buyer[]) => void;
}

export const DealBlastExport: React.FC<Props> = ({ 
  data, 
  content, 
  metrics, 
  intelligence, 
  buyers, 
  settings, 
  onUpdateData, 
  onUpdateBuyers 
}) => {
  const [activeAction, setActiveAction] = useState<string | null>(null);
  const [pendingBlast, setPendingBlast] = useState<{ id: string, text: string } | null>(null);
  const [isSafetyCheckOpen, setIsSafetyCheckOpen] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const readiness = useMemo(() => calculateReadinessScore(data), [data]);

  const handleSafetyTrigger = (text: string, id: string) => {
    setPendingBlast({ id, text });
    setIsSafetyCheckOpen(true);
  };

  const onSafetyConfirmed = async (decision: SafetyCheckLog['decision'], override?: string) => {
    if (!pendingBlast) return;

    // Log the safety check
    const matched = getMatchedBuyers(buyers, data, settings.minBuyerMatchScore);
    const safetyLog: SafetyCheckLog = {
      id: crypto.randomUUID(),
      timestamp: Date.now(),
      score: readiness.score,
      decision,
      overrideReason: override,
      recipientsCount: matched.length,
      blastType: pendingBlast.id
    };

    const activityLog: ActivityLog = {
      timestamp: Date.now(),
      action: 'Safety Check Completed',
      details: `Pre-blast audit for ${pendingBlast.id}. Decision: ${decision}. Score: ${readiness.score}.`
    };

    onUpdateData({
      ...data,
      safetyCheckLogs: [safetyLog, ...(data.safetyCheckLogs || [])],
      activityLogs: [activityLog, ...(data.activityLogs || [])]
    });

    if (decision === 'Hold' || decision === 'Cancel') {
      setIsSafetyCheckOpen(false);
      setPendingBlast(null);
      return;
    }

    // Process specialized blast filters if requested
    let finalMatched = matched;
    if (decision === 'Warm Buyers Only') {
      finalMatched = matched.filter(b => b.status === 'Warm' || b.status === 'Hot');
    }

    await executeBlast(pendingBlast.text, pendingBlast.id, override, finalMatched);
    setIsSafetyCheckOpen(false);
    setPendingBlast(null);
  };

  const executeBlast = async (text: string, id: string, override?: string, filteredMatched?: any[]) => {
    setActiveAction(id);
    await navigator.clipboard.writeText(text);
    
    if (['email', 'sms', 'facebook', 'bcc', 'export'].includes(id)) {
      const matched = filteredMatched || getMatchedBuyers(buyers, data, settings.minBuyerMatchScore);
      addBlastLogEntry(matched.length, override, matched);
      logBlastToBuyers(matched, id);
    }

    setTimeout(() => {
      setActiveAction(null);
    }, 2000);
  };

  const logBlastToBuyers = (matched: Buyer[], type: string) => {
    const updatedBuyers = buyers.map(buyer => {
      if (matched.find(m => m.id === buyer.id)) {
        const newLog = {
          timestamp: Date.now(),
          action: `${type.toUpperCase()} Blast Sent`,
          details: `Automatically logged during deal blast for: ${data.address}`
        };
        return {
          ...buyer,
          activity: {
            ...buyer.activity,
            blastsSent: (buyer.activity.blastsSent || 0) + 1,
            lastActive: Date.now(),
            lastContactedDate: new Date().toLocaleDateString(),
            logs: [newLog, ...(buyer.activity.logs || [])]
          }
        };
      }
      return buyer;
    });
    onUpdateBuyers(updatedBuyers);
  };

  const addBlastLogEntry = (count: number, override?: string, matched: any[] = []) => {
    const entry: BlastLogEntry = {
      id: crypto.randomUUID(),
      dateSent: new Date().toLocaleDateString(),
      buyerCount: count,
      market: intelligence.bestMarket,
      assetType: data.type,
      responseCount: 0,
      interestedBuyers: 0,
      offersReceived: 0,
      highestOffer: 0,
      averageOffer: 0,
      acceptedOffer: 0,
      followUpStatus: 'Pending First Replies',
      notes: override ? `[SAFETY OVERRIDE] ${override}` : '',
      nextFollowUp: new Date(Date.now() + 48 * 60 * 60 * 1000).toLocaleDateString(),
      recommendation: 'No reblast needed'
    };

    const syncedPipeline = syncPipelineEntries(data, matched);
    const blastedPipeline = syncedPipeline.map(p => {
      if (matched.find(m => m.id === p.buyerId)) {
        return { ...p, stage: 'Blasted' as DealBuyerStage, lastActivity: Date.now(), nextAction: 'Wait for response' };
      }
      return p;
    });

    onUpdateData({ 
      ...data, 
      blastLogs: [entry, ...(data.blastLogs || [])], 
      status: 'Blasted',
      buyerPipeline: blastedPipeline
    });
  };

  const handleExportCSV = async () => {
    const matched = getMatchedBuyers(buyers, data, settings.minBuyerMatchScore);
    const headers = ['Name', 'Email', 'Confidence', 'Tier'];
    const rows = matched.map(m => [m.name, m.email, `${m.score}%`, m.tier]);
    const csv = [headers, ...rows].map(r => r.join(',')).join('\n');
    const base64 = btoa(unescape(encodeURIComponent(csv)));
    
    await Flow.download({
      base64,
      mimeType: 'text/csv',
      filename: `BlastRecipients_${data.address.replace(/\s+/g, '_')}.csv`
    });
  };

  const handleCopyBCCList = async () => {
    const matched = getMatchedBuyers(buyers, data, settings.minBuyerMatchScore);
    const emails = matched.map(m => m.email).join(', ');
    await navigator.clipboard.writeText(emails);
    setToast('BCC List Copied ✓');
  };

  const handleExportPDF = async (type: 'full' | 'checklist') => {
    setActiveAction(type);
    try {
      const doc = new jsPDF();
      const margin = 20;
      let y = margin;

      if (type === 'full') {
        doc.setFontSize(22);
        doc.text("Wholesale Deal Pack", margin, y);
        y += 10;
        doc.setFontSize(12);
        doc.text(data.address, margin, y);
        y += 15;
        doc.setFontSize(14);
        doc.text("Financial Summary", margin, y);
        y += 10;
        doc.setFontSize(10);
        doc.text(`ARV: $${data.arv.toLocaleString()}`, margin, y);
        doc.text(`Purchase + Fee: $${(data.price + data.fee).toLocaleString()}`, margin + 80, y);
        y += 6;
        doc.text(`Rehab Est: $${data.rehab.toLocaleString()}`, margin, y);
        doc.text(`Est. Profit: $${metrics.profit.toLocaleString()}`, margin + 80, y);
        y += 15;
        doc.setFontSize(14);
        doc.text("Marketing Highlights", margin, y);
        y += 8;
        doc.setFontSize(10);
        content.highlights.forEach(h => { doc.text(`• ${h}`, margin, y); y += 6; });
      }

      const pdfData = doc.output('arraybuffer');
      const base64 = btoa(new Uint8Array(pdfData).reduce((data, byte) => data + String.fromCharCode(byte), ''));
      await Flow.download({
        base64,
        mimeType: 'application/pdf',
        filename: `${type === 'full' ? 'DealPack' : 'DD_Checklist'}_${data.address.replace(/\s+/g, '_')}.pdf`
      });
    } finally {
      setActiveAction(null);
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <Toast message={toast} onClose={() => setToast(null)} />
      
      <FinalPreBlastChecklist 
        isOpen={isSafetyCheckOpen}
        data={data}
        buyers={buyers}
        settings={settings}
        blastType={pendingBlast?.id || ''}
        onCancel={() => { setIsSafetyCheckOpen(false); setPendingBlast(null); }}
        onConfirm={onSafetyConfirmed}
      />

      <div className="bg-[#1a1a1a] border border-orange-500/20 rounded-2xl overflow-hidden flex flex-col shadow-xl">
        <div className="px-4 py-3 border-b border-white/5 flex items-center justify-between bg-orange-500/5">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-[18px] text-orange-400">rocket_launch</span>
            <h3 className="text-[12px] font-medium text-white/90 tracking-wide uppercase">Marketing Blast Hub</h3>
          </div>
          {['High Risk', 'Extreme Risk'].includes(readiness.daisyChainRisk) && (
             <span className="text-[9px] font-black bg-red-500 text-white px-2 py-0.5 rounded-full animate-pulse uppercase">Mandatory Safety Review Active</span>
          )}
        </div>

        <div className="p-4 grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="flex flex-col gap-2">
            <SectionLabel>Blast Execution & Copy</SectionLabel>
            <div className="grid grid-cols-1 gap-1.5">
              <PillButton 
                variant="outline" 
                icon={<span className="material-symbols-outlined text-[18px]">mail</span>} 
                onClick={() => handleSafetyTrigger(content.email, 'email')}
              >
                {activeAction === 'email' ? 'Email Copied ✓' : 'Buyer Email Blast'}
              </PillButton>
              <PillButton 
                variant="outline" 
                icon={<span className="material-symbols-outlined text-[18px]">sms</span>} 
                onClick={() => handleSafetyTrigger(content.sms, 'sms')}
              >
                {activeAction === 'sms' ? 'SMS Hook Copied ✓' : 'Buyer SMS Blast'}
              </PillButton>
              <PillButton 
                variant="outline" 
                icon={<span className="material-symbols-outlined text-[18px]">groups</span>} 
                onClick={() => handleSafetyTrigger(content.facebook, 'facebook')}
              >
                {activeAction === 'facebook' ? 'Post Copied ✓' : 'Facebook Post'}
              </PillButton>
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <SectionLabel>Recipient Management</SectionLabel>
            <div className="grid grid-cols-1 gap-1.5">
              <PillButton 
                variant="outline" 
                icon={<span className="material-symbols-outlined text-[18px]">list</span>} 
                onClick={() => handleSafetyTrigger('BCC_LIST_PLACEHOLDER', 'bcc')}
              >
                Copy Gmail BCC List
              </PillButton>
              <PillButton 
                variant="outline" 
                icon={<span className="material-symbols-outlined text-[18px]">download</span>} 
                onClick={() => handleSafetyTrigger('EXPORT_RECIP_PLACEHOLDER', 'export')}
              >
                Export Blast Recipients
              </PillButton>
              <PillButton variant="solid" icon={<span className="material-symbols-outlined text-[18px]">picture_as_pdf</span>} onClick={() => handleExportPDF('full')}>
                {activeAction === 'full' ? 'Generating...' : 'Export PDF Deal Pack'}
              </PillButton>
            </div>
          </div>
        </div>
      </div>

      <BlastLogTracker 
        data={data} 
        onUpdateLogs={(logs) => onUpdateData({ ...data, blastLogs: logs })} 
      />
    </div>
  );
};
