import React, { useState } from 'react';
import { Offer, PropertyData, OfferStatus, OfferType, TimelineEvent } from '../types';
import { SectionLabel, PillButton, ConfirmModal } from './UI';
import { OfferRanking } from './OfferRanking';
import { OfferForm } from './OfferForm';
import { OfferTimeline } from './OfferTimeline';

interface Props {
  data: PropertyData;
  onUpdateOffers: (offers: Offer[]) => void;
  onOfferAdded?: () => void;
}

export const OfferTracker: React.FC<Props> = ({ data, onUpdateOffers, onOfferAdded }) => {
  const [isAdding, setIsAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [viewTimelineId, setViewTimelineId] = useState<string | null>(null);
  const [offerToDelete, setOfferToDelete] = useState<string | null>(null);

  const logTimelineEvent = (offerId: string, status: OfferStatus | 'Notification Sent', action: string, notes?: string) => {
    const newEvent: TimelineEvent = {
      id: crypto.randomUUID(),
      timestamp: Date.now(),
      status,
      action,
      notes
    };
    onUpdateOffers(data.offers.map(o => o.id === offerId ? {
      ...o,
      status: (status === 'Notification Sent') ? o.status : status,
      timeline: [...(o.timeline || []), newEvent]
    } : o));
  };

  const handleAddOffer = (offer: Offer) => {
    const newOffer = {
      ...offer,
      timeline: [{
        id: crypto.randomUUID(),
        timestamp: Date.now(),
        status: 'Created' as any,
        action: 'Offer Received & Logged',
        notes: `Initial offer of $${offer.amount.toLocaleString()} received via ${offer.type}.`
      }]
    };
    onUpdateOffers([...data.offers, newOffer]);
    setIsAdding(false);
    if (onOfferAdded) onOfferAdded();
  };

  const handleUpdateOffer = (offer: Offer) => {
    onUpdateOffers(data.offers.map(o => o.id === offer.id ? offer : o));
    setEditingId(null);
  };

  const handleDeleteOffer = () => {
    if (offerToDelete) {
      onUpdateOffers(data.offers.filter(o => o.id !== offerToDelete));
      setOfferToDelete(null);
    }
  };

  const generateNotification = (offer: Offer, type: string) => {
    const ask = data.price + data.fee;
    const deadline = new Date(Date.now() + 48 * 60 * 60 * 1000).toLocaleDateString();
    let subject = '';
    let body = '';
    let statusUpdate: OfferStatus | null = null;

    switch (type) {
      case 'counter':
        subject = `Counteroffer: ${data.address}`;
        const counterAmount = Math.max(offer.amount, ask);
        body = `Hi ${offer.buyerName},\n\nThank you for your offer of $${offer.amount.toLocaleString()} on ${data.address}. \n\nWe are currently reviewing multiple offers and are looking for a net closer to $${counterAmount.toLocaleString()}. Given your ${offer.type} terms, could you increase your offer to that level and shorten the closing timeline to ${Math.min(offer.closingDays, 14)} days?\n\nNext Step: Please let me know if you'd like to counter by ${deadline}.\n\nBest,\n${data.signature}`;
        statusUpdate = 'Counter Sent';
        break;
      case 'highest_best':
        subject = `Highest and Best Request: ${data.address}`;
        body = `Hi ${offer.buyerName},\n\nWe have received multiple competitive offers for ${data.address}. The seller has requested a "Highest and Best" round. \n\nIf you would like to improve your offer of $${offer.amount.toLocaleString()}, please submit your final terms by ${deadline}.\n\nCurrent Status: ${offer.status}\nNext Step: Submit final terms.\n\nBest,\n${data.signature}`;
        statusUpdate = 'Under Review';
        break;
      case 'rejected':
        subject = `Offer Update: ${data.address}`;
        body = `Hi ${offer.buyerName},\n\nThank you for your offer on ${data.address}. At this time, the seller has decided to move forward with another offer that more closely aligned with their net goals.\n\nStatus: Rejected\nNext Step: Keep an eye out for our next deal!\n\nBest,\n${data.signature}`;
        statusUpdate = 'Rejected';
        break;
      case 'backup':
        subject = `Backup Buyer Notice: ${data.address}`;
        body = `Hi ${offer.buyerName},\n\nWe have accepted a primary offer on ${data.address}. However, the seller was impressed with your terms and would like to hold your $${offer.amount.toLocaleString()} offer as a formal Backup.\n\nStatus: Backup Position\nNext Step: Standby for inspection results.\n\nBest,\n${data.signature}`;
        statusUpdate = 'Backup';
        break;
      case 'accepted':
        subject = `CONGRATULATIONS: Offer Accepted for ${data.address}`;
        body = `Hi ${offer.buyerName},\n\nI am thrilled to inform you that your offer of $${offer.amount.toLocaleString()} on ${data.address} has been ACCEPTED!\n\nStatus: Accepted / Under Contract\nNext Step: Please send EMD to title within 24 hours.\n\nBest,\n${data.signature}`;
        statusUpdate = 'Accepted';
        break;
      case 'missing_docs':
        subject = `Urgent: Missing POF/BIO for ${data.address}`;
        body = `Hi ${offer.buyerName},\n\nWe received your offer for ${data.address}. However, our files indicate we are still missing your Proof of Funds (POF) or Buyer Bio. \n\nWe cannot present your $${offer.amount.toLocaleString()} offer to the seller until these are received.\n\nNext Step: Email POF/BIO immediately.\n\nBest,\n${data.signature}`;
        break;
      case 'closed':
        subject = `Deal Closed: ${data.address}`;
        body = `Hi ${offer.buyerName},\n\nJust a quick note to let you know that the transaction for ${data.address} has officially closed. \n\nThank you for your interest and we look forward to doing the next one with you.\n\nBest,\n${data.signature}`;
        statusUpdate = 'Dead';
        break;
    }

    logTimelineEvent(offer.id, statusUpdate || 'Notification Sent', `Copied ${type.replace('_', ' ').toUpperCase()} Notification`, body);
    navigator.clipboard.writeText(`Subject: ${subject}\n\n${body}`);
  };

  return (
    <div className="flex flex-col gap-6 animate-fade-in">
      <ConfirmModal 
        isOpen={!!offerToDelete}
        title="Delete Offer?"
        message="Are you sure you want to permanently remove this offer from the pipeline?"
        confirmLabel="Delete"
        variant="danger"
        onConfirm={handleDeleteOffer}
        onCancel={() => setOfferToDelete(null)}
      />

      <OfferRanking offers={data.offers} askPrice={data.price + data.fee} />

      <div className="bg-[#1a1a1a] border border-white/5 rounded-2xl overflow-hidden flex flex-col shadow-xl">
        <div className="px-4 py-3 border-b border-white/5 flex items-center justify-between bg-white/[0.02]">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-[18px] text-white/40">payments</span>
            <h3 className="text-[12px] font-medium text-white/90 tracking-wide uppercase">Offer Pipeline</h3>
          </div>
          <button 
            onClick={() => setIsAdding(true)}
            className="flex items-center gap-1.5 text-[10px] font-black bg-blue-500 text-white px-3 py-1 rounded-full hover:bg-blue-400 transition-colors uppercase tracking-widest"
          >
            <span className="material-symbols-outlined text-[14px]">add</span>
            New Offer
          </button>
        </div>

        <div className="p-4 flex flex-col gap-4">
          {(isAdding || editingId) && (
            <OfferForm 
              initialOffer={editingId ? data.offers.find(o => o.id === editingId) : undefined}
              onSave={editingId ? handleUpdateOffer : handleAddOffer}
              onCancel={() => { setIsAdding(false); setEditingId(null); }}
            />
          )}

          <div className="flex flex-col gap-3">
            {data.offers.length === 0 ? (
              <div className="py-12 flex flex-col items-center justify-center opacity-20 text-center">
                <span className="material-symbols-outlined text-[48px]">pending_actions</span>
                <p className="text-[11px] font-bold uppercase tracking-widest mt-2">No offers tracked yet</p>
              </div>
            ) : (
              data.offers.sort((a, b) => b.amount - a.amount).map(offer => (
                <div key={offer.id} className={`bg-black/20 border border-white/5 rounded-xl flex flex-col group transition-all hover:border-blue-500/30 ${viewTimelineId === offer.id ? 'ring-1 ring-blue-500/50' : ''}`}>
                  <div className="p-4 flex flex-col gap-4">
                    <div className="flex items-start justify-between">
                      <div className="flex flex-col">
                        <div className="flex items-center gap-2">
                          <span className="text-[14px] font-bold text-white">{offer.buyerName}</span>
                          <StatusPill status={offer.status} />
                        </div>
                        <span className="text-[10px] text-white/40 truncate">{offer.buyerEmail}</span>
                      </div>
                      <div className="flex flex-col items-end">
                        <span className="text-xl font-black text-white tracking-tighter">${offer.amount.toLocaleString()}</span>
                        <span className="text-[9px] font-bold text-blue-400 uppercase tracking-widest">{offer.type}</span>
                      </div>
                    </div>

                    {/* Notification Buttons (Copy-based) */}
                    <div className="flex flex-wrap gap-1.5">
                      <NotifyBtn label="Counter" icon="compare_arrows" onClick={() => generateNotification(offer, 'counter')} />
                      <NotifyBtn label="H&B" icon="priority_high" onClick={() => generateNotification(offer, 'highest_best')} />
                      <NotifyBtn label="Reject" icon="close" onClick={() => generateNotification(offer, 'rejected')} />
                      <NotifyBtn label="Backup" icon="history" onClick={() => generateNotification(offer, 'backup')} />
                      <NotifyBtn label="Accept" icon="check_circle" onClick={() => generateNotification(offer, 'accepted')} color="text-green-400" />
                      <NotifyBtn label="POF/BIO" icon="description" onClick={() => generateNotification(offer, 'missing_docs')} />
                    </div>

                    <div className="grid grid-cols-2 md:grid-cols-4 gap-2 py-3 border-y border-white/5">
                      <DocCheck label="POF" received={offer.pofReceived} />
                      <DocCheck label="BIO" received={offer.bioReceived} />
                      <div className="flex flex-col">
                        <span className="text-[8px] font-bold text-white/20 uppercase tracking-widest">Closing</span>
                        <span className="text-[11px] text-white/70 font-bold">{offer.closingDays} Days</span>
                      </div>
                      <div className="flex flex-col">
                        <span className="text-[8px] font-bold text-white/20 uppercase tracking-widest">EMD</span>
                        <span className="text-[11px] text-white/70 font-bold">${offer.emdAmount.toLocaleString()}</span>
                      </div>
                    </div>

                    <div className="flex items-center justify-between gap-2">
                      <div className="flex gap-1">
                        <button onClick={() => setEditingId(offer.id)} className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-white/5 text-white/40 hover:text-white transition-colors">
                          <span className="material-symbols-outlined text-[18px]">edit</span>
                        </button>
                        <button onClick={() => setOfferToDelete(offer.id)} className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-red-500/10 text-white/40 hover:text-red-400 transition-colors">
                          <span className="material-symbols-outlined text-[18px]">delete</span>
                        </button>
                      </div>
                      <button 
                        onClick={() => setViewTimelineId(viewTimelineId === offer.id ? null : offer.id)}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white/5 hover:bg-white/10 text-[10px] font-black text-white/60 hover:text-white uppercase transition-all tracking-widest"
                      >
                        <span className="material-symbols-outlined text-[16px]">history</span>
                        {viewTimelineId === offer.id ? 'Hide Timeline' : 'View Timeline'}
                      </button>
                    </div>
                  </div>

                  {/* Timeline View */}
                  {viewTimelineId === offer.id && (
                    <div className="border-t border-white/5 bg-white/[0.01] p-4 animate-fade-in">
                      <div className="flex items-center gap-2 mb-4">
                        <span className="text-[10px] font-black text-white/30 uppercase tracking-[2px]">Offer Timeline</span>
                        <div className="h-px flex-1 bg-white/5" />
                      </div>
                      <OfferTimeline timeline={offer.timeline || []} />
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

const NotifyBtn = ({ label, icon, onClick, color = "text-white/40" }: { label: string, icon: string, onClick: () => void, color?: string }) => {
  const [copied, setCopied] = useState(false);
  return (
    <button 
      onClick={() => { onClick(); setCopied(true); setTimeout(() => setCopied(false), 2000); }}
      className={`flex items-center gap-1 px-2 py-1 rounded-lg border border-white/5 bg-white/5 hover:bg-white/10 transition-all ${copied ? 'bg-green-500/20 text-green-400 border-green-500/20' : color} hover:text-white`}
    >
      <span className="material-symbols-outlined text-[14px]">{copied ? 'check' : icon}</span>
      <span className="text-[9px] font-black uppercase tracking-tighter">{copied ? 'Copied ✓' : label}</span>
    </button>
  );
};

const StatusPill = ({ status }: { status: OfferStatus }) => {
  const styles: Record<OfferStatus, string> = {
    'New Offer': 'bg-blue-500/10 text-blue-400 border-blue-500/20',
    'Under Review': 'bg-orange-500/10 text-orange-400 border-orange-500/20',
    'Counter Sent': 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20',
    'Accepted': 'bg-green-500/10 text-green-400 border-green-500/20',
    'Rejected': 'bg-red-500/10 text-red-400 border-red-500/20',
    'Backup': 'bg-white/5 text-white/40 border-white/10',
    'Dead': 'bg-black text-white/20 border-white/5'
  };
  return <span className={`text-[8px] px-1.5 py-0.5 rounded border uppercase font-bold tracking-tighter ${styles[status]}`}>{status}</span>;
};

const DocCheck = ({ label, received }: { label: string, received: boolean }) => (
  <div className="flex items-center gap-1.5">
    <span className={`material-symbols-outlined text-[14px] ${received ? 'text-green-400' : 'text-red-400 opacity-40'}`}>
      {received ? 'check_circle' : 'cancel'}
    </span>
    <span className={`text-[10px] font-bold uppercase tracking-widest ${received ? 'text-white/60' : 'text-white/20'}`}>{label}</span>
  </div>
);
