import React, { useState, useMemo } from 'react';
import { Partner, PartnerTag, SavedDeal, AppSettings } from '../types';
import { SectionLabel, PillButton, SegmentedToggle, ConfirmModal } from './UI';
import { PartnerForm } from './PartnerForm';
import { PartnerCard } from './PartnerCard';
import { PartnerRanking } from './PartnerRanking';
import { PartnerFollowUpQueue } from './PartnerFollowUpQueue';
import { PartnerTemplates } from './PartnerTemplates';

interface Props {
  partners: Partner[];
  history: SavedDeal[];
  settings: AppSettings;
  onUpdatePartners: (partners: Partner[]) => void;
}

export const PartnerManager: React.FC<Props> = ({ partners, history, settings, onUpdatePartners }) => {
  const [isAdding, setIsAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [tagFilter, setTagFilter] = useState<PartnerTag | 'All'>('All');
  const [view, setView] = useState<'records' | 'ranking' | 'followup' | 'templates'>('records');
  const [partnerToDelete, setPartnerToDelete] = useState<string | null>(null);

  const filteredPartners = useMemo(() => {
    return partners
      .filter(p => {
        const matchesSearch = p.name.toLowerCase().includes(search.toLowerCase()) || 
                            p.company.toLowerCase().includes(search.toLowerCase()) ||
                            p.email.toLowerCase().includes(search.toLowerCase());
        const matchesTag = tagFilter === 'All' || p.tags.includes(tagFilter as PartnerTag);
        return matchesSearch && matchesTag;
      })
      .sort((a, b) => b.timestamp - a.timestamp);
  }, [partners, search, tagFilter]);

  const handleAddPartner = (partner: Partner) => {
    onUpdatePartners([...partners, partner]);
    setIsAdding(false);
  };

  const handleUpdatePartner = (partner: Partner) => {
    onUpdatePartners(partners.map(p => p.id === partner.id ? partner : p));
    setEditingId(null);
  };

  const handleDeletePartner = () => {
    if (partnerToDelete) {
      onUpdatePartners(partners.filter(p => p.id !== partnerToDelete));
      setPartnerToDelete(null);
    }
  };

  return (
    <div className="flex flex-col gap-6 animate-fade-in">
      <ConfirmModal 
        isOpen={!!partnerToDelete}
        title="Delete Partner Performance?"
        message="This will permanently remove the partner's historical tracking data."
        confirmLabel="Delete Partner"
        variant="danger"
        onConfirm={handleDeletePartner}
        onCancel={() => setPartnerToDelete(null)}
      />

      <div className="px-2">
        <SegmentedToggle 
          value={view}
          onChange={(v) => setView(v as any)}
          items={[
            { value: 'records', label: 'DB', icon: <span className="material-symbols-outlined text-[16px]">contact_page</span> },
            { value: 'followup', label: 'Queue', icon: <span className="material-symbols-outlined text-[16px]">notification_important</span> },
            { value: 'ranking', label: 'Rank', icon: <span className="material-symbols-outlined text-[16px]">leaderboard</span> },
            { value: 'templates', label: 'Text', icon: <span className="material-symbols-outlined text-[16px]">description</span> }
          ]}
        />
      </div>

      {view === 'records' && (
        <div className="flex flex-col gap-6">
          <div className="flex flex-col gap-3 px-2">
            <div className="flex items-center justify-between">
              <SectionLabel>Partner / POC Tracker</SectionLabel>
              <button 
                onClick={() => setIsAdding(true)}
                className="w-8 h-8 rounded-full bg-blue-500 hover:bg-blue-400 flex items-center justify-center transition-colors shadow-lg"
              >
                <span className="material-symbols-outlined text-[18px] text-white">add</span>
              </button>
            </div>

            <div className="flex flex-col gap-2">
              <div className="relative">
                <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-[18px] text-white/20">search</span>
                <input 
                  type="text" 
                  placeholder="Search Partners..." 
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="w-full bg-white/5 border border-[#595959] rounded-xl h-[38px] pl-10 pr-3 text-[11px] text-white focus:outline-none focus:border-[#969696] transition-colors"
                />
              </div>
              <div className="flex gap-1 overflow-x-auto no-scrollbar pb-1">
                {['All', 'Trusted', 'Needs Review', 'Weak Source', 'Do Not Work With'].map(tag => (
                  <button
                    key={tag}
                    onClick={() => setTagFilter(tag as any)}
                    className={`whitespace-nowrap px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-widest border transition-all ${
                      tagFilter === tag ? 'bg-white text-black border-white' : 'bg-transparent text-white/40 border-white/10 hover:border-white/30'
                    }`}
                  >
                    {tag}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {(isAdding || editingId) && (
            <div className="px-2">
              <PartnerForm 
                initialPartner={editingId ? partners.find(p => p.id === editingId) : undefined}
                onSave={editingId ? handleUpdatePartner : handleAddPartner}
                onCancel={() => { setIsAdding(false); setEditingId(null); }}
              />
            </div>
          )}

          <div className="flex flex-col gap-3 px-2">
            {filteredPartners.length === 0 ? (
              <div className="py-12 border border-dashed border-white/10 rounded-2xl flex flex-col items-center justify-center opacity-30 text-center">
                <span className="material-symbols-outlined text-[48px] mb-2">contact_page</span>
                <p className="text-[12px] font-bold uppercase tracking-widest">No Partners Found</p>
                <p className="text-[10px] mt-1 max-w-[200px]">Add co-wholesalers, agents, or bird dogs to track their deal quality.</p>
              </div>
            ) : (
              filteredPartners.map(partner => (
                <PartnerCard 
                  key={partner.id} 
                  partner={partner} 
                  onEdit={() => setEditingId(partner.id)} 
                  onDelete={() => setPartnerToDelete(partner.id)} 
                />
              ))
            )}
          </div>
        </div>
      )}

      {view === 'ranking' && <PartnerRanking partners={partners} />}
      {view === 'followup' && <PartnerFollowUpQueue partners={partners} history={history} settings={settings} />}
      {view === 'templates' && <PartnerTemplates />}
    </div>
  );
};
