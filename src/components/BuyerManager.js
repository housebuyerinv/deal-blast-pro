import React, { useState, useRef, useMemo } from 'react';
import { Buyer, BuyerStatus, ReviewStatus, PropertyData, AppSettings, SavedDeal, BuyerCategory, AssetType, DealBuyerPipelineEntry, LastImportMetadata } from '../types';
import { 
  SectionLabel, 
  PillButton, 
  Badge, 
  Toast, 
  SearchBar, 
  FieldDropdown, 
  DragNumberField, 
  TextInput, 
  LoadingSpinner, 
  MultiSelectPills, 
  Tooltip,
  Modal,
  Table,
  ConfirmModal
} from './uiRegistry';
import { BuyerStatusBadge } from './BuyerStatusBadge';
import { BuyerProfile } from './BuyerProfile';
import { extractBuyerFromRow, normalizeBuyerForProfile } from '../utils/extractionEngine';
import { calculateBuyerStrength, calculateDealMatch, getStrengthColor } from '../utils/buyerAnalytics';
import { mergeBuyersByEmail } from '../utils/buyerMerge';
import Papa from 'papaparse';
import { Flow } from 'flow-sdk';
import { safeStorage } from '../utils/safeStorage';

interface Props {
  buyers: Buyer[];
  data: PropertyData;
  history: SavedDeal[];
  settings: AppSettings;
  onUpdateBuyers: (buyers: Buyer[]) => void;
  onUpdateSettings: (settings: AppSettings) => void;
  onTabChange: (tab: any) => void;
  onUpdateCurrentDeal?: (data: PropertyData) => void;
}

const SORT_OPTIONS = ['Recently Added', 'Strength Score', 'Deal Match %', 'Name A–Z', 'Budget High to Low', 'Market A–Z', 'Status'];
const STATES_LIST = ['AL', 'AK', 'AZ', 'AR', 'CA', 'CO', 'CT', 'DE', 'FL', 'GA', 'HI', 'IA', 'ID', 'IL', 'IN', 'KS', 'KY', 'LA', 'MA', 'MD', 'ME', 'MI', 'MN', 'MO', 'MS', 'MT', 'NE', 'NV', 'NH', 'NJ', 'NM', 'NY', 'NC', 'ND', 'OH', 'OK', 'OR', 'PA', 'RI', 'SC', 'SD', 'TN', 'TX', 'UT', 'VA', 'VT', 'WA', 'WI', 'WV', 'WY'];
const PROPERTY_TYPES: AssetType[] = ['SFR Flip', 'Rental', 'BRRRR', 'Section 8', 'Multifamily', 'Value Add Multifamily', 'Commercial', 'Land', 'Mobile Home Park', 'Hotel', 'Self Storage', 'Creative/Seller Finance', 'Any'];
const BUYER_STATUSES: BuyerStatus[] = ['New', 'Needs Review', 'Ready', 'Active', 'Inactive', 'Rejected', 'Warm', 'Hot', 'Offered', 'Closed', 'Unresponsive', 'Suppressed', 'Do Not Contact'];
const REVIEW_STATUSES: ReviewStatus[] = ['Needs Review', 'Reviewed', 'Ready'];

type PreviewFilter = 'All' | 'Valid' | 'Dups' | 'Rejected' | 'Edited' | 'Needs Review';

export const BuyerManager: React.FC<Props> = ({ buyers, data, history, settings, onUpdateBuyers, onUpdateSettings, onTabChange, onUpdateCurrentDeal }) => {
  const [selectedBuyerId, setSelectedBuyerId] = useState<string | null>(null);
  const [jumpToSection, setJumpToSection] = useState<string | undefined>(undefined);
  const [search, setSearch] = useState('');
  const [sortBy, setSortBy] = useState('Recently Added');
  const [toast, setToast] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  // Undo Workflow State
  const [showUndoModal, setShowUndoModal] = useState(false);
  const lastImportMeta: LastImportMetadata | null = useMemo(() => {
    const saved = safeStorage.getItem('dbp_last_import_metadata');
    return saved ? JSON.parse(saved) : null;
  }, [buyers]); // Refresh when buyers list updates

  // Filter State
  const [filterState, setFilterState] = useState<string[]>([]);
  const [filterNationwide, setFilterNationwide] = useState(false);
  const [filterCreative, setFilterCreative] = useState(false);
  const [filterNotes, setFilterNotes] = useState(false);
  const [filterLand, setFilterLand] = useState(false);
  const [filterMultifamily, setFilterMultifamily] = useState(false);
  const [filterSFR, setFilterSFR] = useState(false);
  const [filterCommercial, setFilterCommercial] = useState(false);
  const [filterHotel, setFilterHotel] = useState(false);
  const [filterStorage, setFilterStorage] = useState(false);
  const [filterMHP, setFilterMHP] = useState(false);
  const [filterMissingPhone, setFilterMissingPhone] = useState(false);
  const [filterMissingBudget, setFilterMissingBudget] = useState(false);
  const [filterStatus, setFilterStatus] = useState<string>('All');

  // Import Workflow State
  const [showImportModal, setShowImportModal] = useState(false);
  const [importStep, setImportStep] = useState<'upload' | 'preview'>('upload');
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [pastedText, setPastedText] = useState('');
  const [mergedParsed, setMergedParsed] = useState<Buyer[]>([]);
  const [editingRowId, setEditingRowId] = useState<string | null>(null);
  const [rejectedIds, setRejectedIds] = useState<Set<string>>(new Set());
  const [previewFilter, setPreviewFilter] = useState<PreviewFilter>('All');
  const [isParsing, setIsParsing] = useState(false);
  
  const fileInputRef = useRef<HTMLInputElement>(null);

  const clearAllFilters = () => {
    setSearch('');
    setFilterState([]);
    setFilterNationwide(false);
    setFilterCreative(false);
    setFilterNotes(false);
    setFilterLand(false);
    setFilterMultifamily(false);
    setFilterSFR(false);
    setFilterCommercial(false);
    setFilterHotel(false);
    setFilterStorage(false);
    setFilterMHP(false);
    setFilterMissingPhone(false);
    setFilterMissingBudget(false);
    setFilterStatus('All');
  };

  const safeBuyers = useMemo(() => (buyers || []).map(b => normalizeBuyerForProfile(b)), [buyers]);

  const scoredBuyers = useMemo(() => {
    return safeBuyers.map(b => ({
      ...b,
      strength: calculateBuyerStrength(b),
      match: calculateDealMatch(b, data)
    }));
  }, [safeBuyers, data]);

  const filteredBuyers = useMemo(() => {
    let list = scoredBuyers.filter(b => {
      const matchesSearch = (b.name || "").toLowerCase().includes(search.toLowerCase()) || 
                           (b.email || "").toLowerCase().includes(search.toLowerCase()) ||
                           (b.company || "").toLowerCase().includes(search.toLowerCase());
      
      const matchesState = filterState.length === 0 || filterState.some(s => (b.states || []).includes(s));
      const matchesNationwide = !filterNationwide || b.isNationwide;
      const matchesCreative = !filterCreative || b.acceptsCreativeTerms;
      
      const checkTagsAndNotes = (term: string) => {
        const t = term.toLowerCase();
        return (b.tags || []).some(tag => tag.toLowerCase().includes(t)) || 
               (b.propertyTypes || []).some(pt => pt.toLowerCase().includes(t)) ||
               (b.strategyTags || [] as any).some((st: any) => st.toLowerCase().includes(t)) ||
               (b.notes || "").toLowerCase().includes(t);
      };

      const matchesNotes = !filterNotes || checkTagsAndNotes('notes') || checkTagsAndNotes('paper') || checkTagsAndNotes('mortgage');
      const matchesLand = !filterLand || checkTagsAndNotes('land');
      const matchesMultifamily = !filterMultifamily || checkTagsAndNotes('multifamily');
      const matchesSFR = !filterSFR || checkTagsAndNotes('sfr') || checkTagsAndNotes('rental') || checkTagsAndNotes('house');
      const matchesCommercial = !filterCommercial || checkTagsAndNotes('commercial') || checkTagsAndNotes('business');
      const matchesHotel = !filterHotel || checkTagsAndNotes('hotel') || checkTagsAndNotes('hospitality');
      const matchesStorage = !filterStorage || checkTagsAndNotes('storage');
      const matchesMHP = !filterMHP || checkTagsAndNotes('mhp') || checkTagsAndNotes('rv') || checkTagsAndNotes('park');
      
      const matchesPhone = !filterMissingPhone || (!b.phone && !b.mobilePhone && !b.directPhone);
      const matchesBudget = !filterMissingBudget || (b.maxPrice === 0);
      
      const matchesStatus = filterStatus === 'All' || b.status === filterStatus || b.reviewStatus === filterStatus;

      return matchesSearch && matchesState && matchesNationwide && matchesCreative && matchesNotes && 
             matchesLand && matchesMultifamily && matchesSFR && matchesCommercial && matchesHotel && 
             matchesStorage && matchesMHP && matchesPhone && matchesBudget && matchesStatus;
    });

    if (sortBy === 'Recently Added') list = [...list].sort((a, b) => (b.lastImported || 0) - (a.lastImported || 0));
    if (sortBy === 'Strength Score') list = [...list].sort((a, b) => b.strength - a.strength);
    if (sortBy === 'Deal Match %') list = [...list].sort((a, b) => b.match - a.match);
    if (sortBy === 'Name A–Z') list = [...list].sort((a, b) => (a.name || "").localeCompare(b.name || ""));
    if (sortBy === 'Budget High to Low') list = [...list].sort((a, b) => (b.maxPrice || 0) - (a.maxPrice || 0));

    return list;
  }, [scoredBuyers, search, sortBy, filterState, filterNationwide, filterCreative, filterNotes, filterLand, filterMultifamily, filterSFR, filterCommercial, filterHotel, filterStorage, filterMHP, filterMissingPhone, filterMissingBudget, filterStatus]);

  const toggleSelectAll = () => {
    if (selectedIds.length === filteredBuyers.length) {
      setSelectedIds([]);
    } else {
      setSelectedIds(filteredBuyers.map(b => b.id));
    }
  };

  const handleOpenProfile = (buyerId: string) => {
    const buyer = buyers.find(b => b.id === buyerId);
    if (buyer && buyer.reviewStatus === 'Needs Review') {
      const updated = buyers.map(b => b.id === buyerId ? { ...b, reviewStatus: 'Reviewed' as ReviewStatus, updatedAt: Date.now() } : b);
      onUpdateBuyers(updated);
    }
    setSelectedBuyerId(buyerId);
  };

  const handleBulkAction = async (action: 'export_emails' | 'export_csv' | 'add_tag' | 'set_status' | 'move_to_review' | 'add_to_blast' | 'mark_reviewed' | 'mark_new') => {
    if (selectedIds.length === 0) return;
    const selectedBuyers = buyers.filter(b => selectedIds.includes(b.id));

    if (action === 'export_emails') {
      const emails = selectedBuyers.map(b => b.email).join(', ');
      await navigator.clipboard.writeText(emails);
      setToast(`${selectedIds.length} Emails Copied ✓`);
    } else if (action === 'export_csv') {
      const headers = ['Name', 'Email', 'Phone', 'Company', 'Status', 'Review Status', 'Max Budget', 'Notes'];
      const rows = selectedBuyers.map(b => [
        b.name, b.email, b.mobilePhone || b.phone || b.directPhone, b.company, b.status, b.reviewStatus, b.maxPrice, b.notes.replace(/\n/g, ' ')
      ]);
      const csv = [headers, ...rows].map(r => r.join(',')).join('\n');
      const base64 = btoa(unescape(encodeURIComponent(csv)));
      await Flow.download({
        base64,
        mimeType: 'text/csv',
        filename: `BuyerExport_${new Date().toISOString().split('T')[0]}.csv`
      });
      setToast('CSV Exported ✓');
    } else if (action === 'move_to_review') {
      const next = buyers.map(b => selectedIds.includes(b.id) ? { ...b, reviewStatus: 'Needs Review' as ReviewStatus, updatedAt: Date.now() } : b);
      onUpdateBuyers(next);
      setToast(`Updated ${selectedIds.length} records to Needs Review ✓`);
      setSelectedIds([]);
    } else if (action === 'mark_reviewed') {
      const next = buyers.map(b => selectedIds.includes(b.id) ? { ...b, reviewStatus: 'Reviewed' as ReviewStatus, updatedAt: Date.now() } : b);
      onUpdateBuyers(next);
      setToast(`Updated ${selectedIds.length} records to Reviewed ✓`);
      setSelectedIds([]);
    } else if (action === 'mark_new') {
      const next = buyers.map(b => selectedIds.includes(b.id) ? { ...b, status: 'New' as BuyerStatus, reviewStatus: 'Needs Review' as ReviewStatus, updatedAt: Date.now() } : b);
      onUpdateBuyers(next);
      setToast(`Updated ${selectedIds.length} records to New/Needs Review ✓`);
      setSelectedIds([]);
    } else if (action === 'add_to_blast' && onUpdateCurrentDeal) {
      const nextPipeline: DealBuyerPipelineEntry[] = [...(data.buyerPipeline || [])];
      selectedBuyers.forEach(b => {
        if (!nextPipeline.find(p => p.buyerId === b.id)) {
          nextPipeline.push({
            id: crypto.randomUUID(),
            buyerId: b.id,
            buyerName: b.name,
            email: b.email,
            phone: b.mobilePhone || b.phone || b.directPhone,
            buyerType: b.type,
            stage: 'Matched',
            priority: 'Medium',
            offerAmount: 0,
            terms: '',
            lastActivity: Date.now(),
            nextAction: 'Send Initial Blast',
            notes: 'Added to blast queue via Bulk Action.',
            pofStatus: 'Missing',
            ndaStatus: 'Unsent',
            contractStatus: 'Unsent',
            emdStatus: 'Unsent'
          });
        }
      });
      onUpdateCurrentDeal({ ...data, buyerPipeline: nextPipeline });
      setToast(`Added ${selectedIds.length} buyers to Blast Pipeline ✓`);
      setSelectedIds([]);
    }
  };

  const handleBulkStatus = (status: BuyerStatus) => {
    const next = buyers.map(b => selectedIds.includes(b.id) ? { ...b, status, updatedAt: Date.now() } : b);
    onUpdateBuyers(next);
    setToast(`Updated ${selectedIds.length} records to ${status} ✓`);
    setSelectedIds([]);
  };

  // Import Handlers
  const openImport = () => {
    setSelectedFiles([]);
    setPastedText('');
    setMergedParsed([]);
    setRejectedIds(new Set());
    setPreviewFilter('All');
    setEditingRowId(null);
    setImportStep('upload');
    setError(null);
    setShowImportModal(true);
  };

  const startBatchParse = async () => {
    if (selectedFiles.length === 0 && !pastedText.trim()) {
      setError("No file selected or text provided.");
      return;
    }

    setIsParsing(true);
    setError(null);
    const globalMerged: Buyer[] = [];
    const seenEmails = new Set(buyers.map(b => (b.email || "").toLowerCase()));

    try {
      for (const file of selectedFiles) {
        const isTxt = file.name.endsWith('.txt');
        
        if (isTxt) {
          const content = await file.text();
          const lines = content.split('\n').map(l => l.trim()).filter(Boolean);
          lines.forEach(line => {
            const parts = line.split(/[,\t]/);
            const emailPart = parts.find(p => p.includes('@'))?.toLowerCase().trim() || '';
            if (!emailPart) return;
            const b = normalizeBuyerForProfile({
              id: crypto.randomUUID(),
              name: parts[0] || 'TXT Import',
              email: emailPart,
              lastImported: Date.now(),
              sourceFile: file.name,
              isDuplicate: seenEmails.has(emailPart)
            });
            if (emailPart) seenEmails.add(emailPart);
            globalMerged.push(b);
          });
        } else {
          // CSV Parsing
          await new Promise<void>((resolve, reject) => {
            Papa.parse(file, {
              header: true,
              skipEmptyLines: true,
              complete: (results) => {
                const rows = results.data;
                const parsed = rows.map((row: any) => {
                  const email = (row.Email || row.email || row.EMAIL || '').toLowerCase().trim();
                  if (!email && !row.Name && !row.name) return null;
                  const b = normalizeBuyerForProfile(extractBuyerFromRow(row));
                  b.id = crypto.randomUUID();
                  b.sourceFile = file.name;
                  b.lastImported = Date.now();
                  b.isDuplicate = seenEmails.has(email);
                  b.rawData = row;
                  if (email) seenEmails.add(email);
                  if (!email || !b.maxPrice || !b.states || b.states.length === 0) b.needsReview = true;
                  return b;
                }).filter(Boolean) as Buyer[];
                globalMerged.push(...parsed);
                resolve();
              },
              error: (err) => reject(err)
            });
          });
        }
      }

      if (pastedText.trim()) {
        const lines = pastedText.split('\n').map(l => l.trim()).filter(Boolean);
        lines.forEach(line => {
          const parts = line.split(/[,\t]/);
          const email = parts.find(p => p.includes('@'))?.toLowerCase().trim() || '';
          if (!email) return;
          const isDup = seenEmails.has(email);
          seenEmails.add(email);
          const b = normalizeBuyerForProfile({
            id: crypto.randomUUID(),
            name: parts[0] || 'Pasted Lead',
            email,
            company: 'Unknown',
            lastImported: Date.now(),
            needsReview: true,
            sourceFile: 'Pasted Text',
            isDuplicate: isDup,
            rawData: { name: parts[0], email }
          });
          globalMerged.push(b);
        });
      }

      if (globalMerged.length === 0) {
        setError("No valid buyer rows found in the provided content.");
        setIsParsing(false);
        return;
      }

      setMergedParsed(globalMerged);
      setImportStep('preview');
    } catch (err) {
      setError("File parsing failed, check CSV/TXT format.");
      console.error(err);
    } finally {
      setIsParsing(false);
    }
  };

  const updatePreviewRow = (id: string, updates: Partial<Buyer>) => {
    setMergedParsed(prev => prev.map(b => b.id === id ? { ...b, ...updates, isEdited: true } : b));
  };

  const reParseRow = (row: Buyer) => {
    if (!row.rawData) return;
    const reParsed = normalizeBuyerForProfile(extractBuyerFromRow(row.rawData));
    updatePreviewRow(row.id, { ...reParsed, isEdited: false });
    setToast('Row re-parsed from source ✓');
  };

  const confirmImport = () => {
    const toImport = mergedParsed.filter(b => !rejectedIds.has(b.id));
    
    // SAFE SNAPSHOT BEFORE MERGE
    const snapshotIds = toImport.map(b => b.id);
    const snapshotSummary = `Imported ${toImport.length} buyers from ${selectedFiles.map(f => f.name).join(', ') || 'Manual Entry'}.`;
    
    safeStorage.setItem("buyerDB_backup_before_merge", JSON.stringify(buyers));
    safeStorage.setItem("dbp_last_import_metadata", JSON.stringify({
      batchIds: snapshotIds,
      timestamp: Date.now(),
      summary: snapshotSummary
    } as LastImportMetadata));
    
    const nextBuyers = mergeBuyersByEmail(buyers, toImport);
    onUpdateBuyers(nextBuyers);
    setToast(`Imported ${toImport.length} buyers successfully ✓`);
    setShowImportModal(false);
  };

  const handleUndoImport = (mode: 'restore' | 'batch_only') => {
    if (!lastImportMeta) return;

    if (mode === 'restore') {
      const backupStr = safeStorage.getItem("buyerDB_backup_before_merge");
      if (backupStr) {
        const restored = JSON.parse(backupStr);
        onUpdateBuyers(restored);
        setToast('Buyer database restored to pre-import state ✓');
      }
    } else {
      const idsToRemove = lastImportMeta.batchIds;
      const filtered = buyers.filter(b => !idsToRemove.includes(b.id));
      onUpdateBuyers(filtered);
      setToast(`Removed ${idsToRemove.length} imported records. Others kept ✓`);
    }

    safeStorage.removeItem("dbp_last_import_metadata");
    setShowUndoModal(false);
  };

  const previewStats = useMemo(() => {
    const total = mergedParsed.length;
    const dups = mergedParsed.filter(b => b.isDuplicate && !rejectedIds.has(b.id)).length;
    const review = mergedParsed.filter(b => b.needsReview && !rejectedIds.has(b.id)).length;
    const edited = mergedParsed.filter(b => b.isEdited && !rejectedIds.has(b.id)).length;
    const rejected = rejectedIds.size;
    const valid = mergedParsed.filter(b => !b.isDuplicate && !b.needsReview && !rejectedIds.has(b.id)).length;
    return { total, dups, review, edited, rejected, valid };
  }, [mergedParsed, rejectedIds]);

  const filteredPreviewRows = useMemo(() => {
    return mergedParsed.filter(b => {
      const isRejected = rejectedIds.has(b.id);
      if (previewFilter === 'Rejected') return isRejected;
      if (isRejected) return false;
      if (previewFilter === 'All') return true;
      if (previewFilter === 'Valid') return !b.isDuplicate && !b.needsReview;
      if (previewFilter === 'Dups') return b.isDuplicate;
      if (previewFilter === 'Edited') return b.isEdited;
      if (previewFilter === 'Needs Review') return b.needsReview;
      return true;
    });
  }, [mergedParsed, previewFilter, rejectedIds]);

  const toggleSelect = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setSelectedIds(prev => prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]);
  };

  const getAssetStyle = (type: string) => {
    const t = String(type || "").toLowerCase();
    if (t.includes('sfr') || t.includes('flip') || t.includes('rental') || t.includes('brrrr')) return { color: 'text-green-500', icon: 'house', title: 'SFR / Rental / BRRRR' };
    if (t.includes('multifamily')) return { color: 'text-blue-500', icon: 'apartment', title: 'Multifamily' };
    if (t.includes('commercial')) return { color: 'text-purple-500', icon: 'business', title: 'Commercial' };
    if (t.includes('hotel') || t.includes('hospitality')) return { color: 'text-pink-500', icon: 'hotel', title: 'Hotel / Hospitality' };
    if (t.includes('storage')) return { color: 'text-cyan-500', icon: 'inventory_2', title: 'Self Storage' };
    if (t.includes('land')) return { color: 'text-amber-500', icon: 'landscape', title: 'Land' };
    if (t.includes('mhp') || t.includes('rv') || t.includes('park')) return { color: 'text-orange-500', icon: 'holiday_village', title: 'MHP / RV Park' };
    if (t.includes('creative')) return { color: 'text-orange-400', icon: 'handshake', title: 'Accepts Creative Terms' };
    return { color: 'text-white/20', icon: 'category', title: 'Other' };
  };

  const formatPhone = (val: string) => {
    if (!val) return '';
    const clean = val.replace(/\D/g, '');
    if (clean.length === 10) return `${clean.slice(0,3)}.${clean.slice(3,6)}.${clean.slice(6)}`;
    return val;
  };

  if (selectedBuyerId) {
    const b = safeBuyers.find(b => b.id === selectedBuyerId);
    if (b) return <BuyerProfile initialSection={jumpToSection} buyer={b} deals={history.map(h => h.data)} onUpdate={(u) => onUpdateBuyers(buyers.map(x => x.id === u.id ? u : x))} onDelete={(id) => { onUpdateBuyers(buyers.filter(x => x.id !== id)); setSelectedBuyerId(null); }} onSendToMarketing={() => {}} onBack={() => { setSelectedBuyerId(null); setJumpToSection(undefined); }} />;
  }

  return (
    <div className="flex flex-col gap-6 animate-fade-in pb-32 h-full relative">
      <Toast message={toast} onClose={() => setToast(null)} />

      {/* Undo Last Import Confirmation Modal */}
      <Modal isOpen={showUndoModal} onClose={() => setShowUndoModal(false)} title="Undo Last Import?" size="sm">
         <div className="flex flex-col gap-6 text-center animate-fade-in">
            <div className="w-16 h-16 rounded-full bg-orange-500/10 border border-orange-500/20 flex items-center justify-center mx-auto text-orange-400">
               <span className="material-symbols-outlined text-[32px]">history</span>
            </div>
            <div className="flex flex-col gap-2">
               <p className="text-[13px] text-white/80 leading-relaxed italic px-4">
                 “This will restore the buyer database to the state before your most recent import. This will not affect manually edited records after that import unless they were part of the imported batch.”
               </p>
               {lastImportMeta && (
                  <Badge variant="orange" className="!mx-auto mt-2">{lastImportMeta.summary}</Badge>
               )}
            </div>
            <div className="flex flex-col gap-3 mt-4">
               <PillButton variant="solid" className="!bg-red-600 !text-white" onClick={() => handleUndoImport('restore')}>Restore Full Backup</PillButton>
               <PillButton variant="outline" className="!text-orange-400 !border-orange-500/30" onClick={() => handleUndoImport('batch_only')}>Remove Last Import Batch Only</PillButton>
               <button onClick={() => setShowUndoModal(false)} className="text-[10px] font-black text-white/30 hover:text-white uppercase tracking-widest mt-2 transition-all">Cancel</button>
            </div>
         </div>
      </Modal>

      {/* Floating Bulk Action Bar */}
      {selectedIds.length > 0 && (
        <div className="fixed bottom-10 left-1/2 -translate-x-1/2 z-[2000] w-full max-w-5xl px-4 animate-slide-up">
           <div className="bg-[#1a1a1a] border border-blue-500/40 rounded-[32px] p-4 shadow-[0_40px_100px_rgba(0,0,0,0.9)] flex items-center justify-between gap-6 backdrop-blur-3xl">
              <div className="flex items-center gap-6 pl-4 border-r border-white/10 pr-6">
                 <div className="flex flex-col">
                    <span className="text-xl font-black text-white">{selectedIds.length}</span>
                    <span className="text-[9px] font-black text-blue-400 uppercase tracking-widest">Buyers Selected</span>
                 </div>
                 <button onClick={() => setSelectedIds([])} className="text-[10px] font-black text-white/40 hover:text-white uppercase transition-all px-3 py-1.5 rounded-xl hover:bg-white/5">Clear Selection</button>
              </div>

              <div className="flex flex-wrap items-center gap-2 flex-1">
                 <button onClick={() => handleBulkAction('export_emails')} className="h-10 px-4 rounded-xl bg-white/5 hover:bg-white/10 text-[10px] font-black uppercase text-white transition-all flex items-center gap-2"><span className="material-symbols-outlined text-[18px] text-blue-400">mail</span> Emails</button>
                 <button onClick={() => handleBulkAction('export_csv')} className="h-10 px-4 rounded-xl bg-white/5 hover:bg-white/10 text-[10px] font-black uppercase text-white transition-all flex items-center gap-2"><span className="material-symbols-outlined text-[18px] text-green-400">download</span> CSV</button>
                 <div className="h-6 w-px bg-white/10" />
                 <button onClick={() => handleBulkAction('mark_reviewed')} className="h-10 px-4 rounded-xl bg-green-500/10 hover:bg-green-600 border border-green-500/20 text-[10px] font-black uppercase text-green-400 hover:text-white transition-all flex items-center gap-2"><span className="material-symbols-outlined text-[18px]">verified</span> Reviewed</button>
                 <button onClick={() => handleBulkAction('mark_new')} className="h-10 px-4 rounded-xl bg-orange-500/10 hover:bg-orange-600 border border-orange-500/20 text-[10px] font-black uppercase text-orange-400 hover:text-white transition-all flex items-center gap-2"><span className="material-symbols-outlined text-[18px]">fiber_new</span> Mark New</button>
                 <div className="h-6 w-px bg-white/10" />
                 <FieldDropdown 
                    label="Bulk Status" 
                    value="SET STATUS" 
                    options={BUYER_STATUSES} 
                    onChange={(v) => handleBulkStatus(v as BuyerStatus)} 
                    className="!min-h-0 !h-10 !w-40"
                 />
                 <button onClick={() => handleBulkAction('add_to_blast')} className="h-10 px-4 rounded-xl bg-blue-600 hover:bg-blue-500 text-[10px] font-black uppercase text-white transition-all flex items-center gap-2 shadow-lg shadow-blue-600/20 ml-auto"><span className="material-symbols-outlined text-[18px]">rocket_launch</span> Add to Blast Queue</button>
              </div>
           </div>
        </div>
      )}

      <Modal 
        isOpen={showImportModal} 
        onClose={() => setShowImportModal(false)} 
        title={importStep === 'upload' ? "Import CSVs & Buyer Lists" : "Merge Preview Audit"} 
        size="lg"
      >
        {importStep === 'upload' ? (
          <div className="flex flex-col gap-8 animate-fade-in">
             <div className="flex flex-col gap-4">
                <SectionLabel>1. Select File(s)</SectionLabel>
                {error && (
                  <div className="bg-red-500/10 border border-red-500/30 p-3 rounded-xl flex items-center gap-3">
                    <span className="material-symbols-outlined text-red-500 text-[20px]">error</span>
                    <span className="text-[11px] font-bold text-red-400 uppercase">{error}</span>
                  </div>
                )}
                <div 
                  onClick={() => fileInputRef.current?.click()}
                  className="border-2 border-dashed border-white/10 rounded-[32px] py-12 flex flex-col items-center justify-center gap-3 cursor-pointer hover:border-blue-500/40 hover:bg-blue-500/5 transition-all group"
                >
                  <span className="material-symbols-outlined text-[48px] text-white/10 group-hover:text-blue-400 transition-colors">upload_file</span>
                  <div className="text-center px-4">
                    <p className="text-[12px] font-black text-white uppercase tracking-widest">
                      {selectedFiles.length > 0 ? `${selectedFiles.length} files selected` : 'Drop CSVs/TXT or click to upload'}
                    </p>
                    {selectedFiles.length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-2 justify-center">
                        {selectedFiles.map(f => <Badge variant="blue" key={f.name}>{f.name}</Badge>)}
                      </div>
                    )}
                    <input ref={fileInputRef} type="file" multiple accept=".csv,.txt" onChange={(e) => { setSelectedFiles(Array.from(e.target.files || [])); setError(null); }} className="hidden" />
                  </div>
                </div>
             </div>
             <div className="flex flex-col gap-4">
                <SectionLabel>2. Paste Content</SectionLabel>
                <textarea 
                  value={pastedText} 
                  onChange={(e) => { setPastedText(e.target.value); setError(null); }} 
                  placeholder="Paste Name, Email list here..." 
                  className="w-full h-32 bg-black/40 border border-[#595959] rounded-2xl p-4 text-[12px] text-white focus:border-blue-500 resize-none transition-all outline-none" 
                />
             </div>
             <div className="flex gap-2">
                <PillButton variant="outline" className="flex-1" onClick={() => setShowImportModal(false)}>Cancel</PillButton>
                <PillButton variant="solid" className="flex-[2] !bg-blue-600 !text-white" disabled={isParsing} onClick={startBatchParse}>{isParsing ? 'Parsing...' : 'Scan & Load for Preview'}</PillButton>
             </div>
          </div>
        ) : (
          <div className="flex flex-col gap-6 animate-fade-in h-[75vh]">
             <div className="grid grid-cols-3 md:grid-cols-6 gap-2">
                <PreviewStat label="Total" val={previewStats.total} active={previewFilter === 'All'} onClick={() => setPreviewFilter('All')} />
                <PreviewStat label="Valid" val={previewStats.valid} active={previewFilter === 'Valid'} onClick={() => setPreviewFilter('Valid')} color="text-green-400" />
                <PreviewStat label="Dups" val={previewStats.dups} active={previewFilter === 'Dups'} onClick={() => setPreviewFilter('Dups')} color="text-orange-400" />
                <PreviewStat label="Review" val={previewStats.review} active={previewFilter === 'Needs Review'} onClick={() => setPreviewFilter('Needs Review')} color="text-yellow-400" />
                <PreviewStat label="Rejected" val={previewStats.rejected} active={previewFilter === 'Rejected'} onClick={() => setPreviewFilter('Rejected')} color="text-red-400" />
             </div>
             <div className="flex-1 overflow-hidden flex flex-col bg-black/40 border border-white/5 rounded-[32px]">
                <div className="overflow-auto dark-scrollbar flex-1 relative">
                   <table className="w-full text-left border-collapse min-w-[1200px]">
                      <thead className="sticky top-0 z-20 bg-[#1a1a1a] border-b border-white/10">
                         <tr>
                            <th className="p-5 text-[9px] font-black text-white/30 uppercase tracking-widest">Indicators</th>
                            <th className="p-5 text-[9px] font-black text-white/30 uppercase tracking-widest">Identity</th>
                            <th className="p-5 text-[9px] font-black text-white/30 uppercase tracking-widest">Financials</th>
                            <th className="p-5 text-[9px] font-black text-white/30 uppercase tracking-widest">Geography</th>
                            <th className="p-5 text-[9px] font-black text-white/30 uppercase text-right sticky right-0 bg-[#1a1a1a] shadow-[-10px_0_10px_rgba(0,0,0,0.2)] z-10">Actions</th>
                         </tr>
                      </thead>
                      <tbody className="divide-y divide-white/5">
                         {filteredPreviewRows.map(row => (
                           <React.Fragment key={row.id}>
                             <tr className={`group hover:bg-white/[0.02] transition-all ${rejectedIds.has(row.id) ? 'opacity-20' : ''}`}>
                                <td className="p-5">
                                   <div className="flex flex-wrap gap-1">
                                      {row.acceptsCreativeTerms && <Badge variant="orange">CREATIVE TERMS</Badge>}
                                      {row.isDuplicate && <Badge variant="orange">DUP</Badge>}
                                      {row.needsReview && <Badge variant="yellow">REVIEW</Badge>}
                                   </div>
                                </td>
                                <td className="p-5">
                                   <div className="flex flex-col">
                                      <span className="text-[12px] font-bold text-white uppercase">{row.name}</span>
                                      <span className="text-[10px] text-blue-400 font-bold">{row.email}</span>
                                      {(row.mobilePhone || row.directPhone || row.phone) && (
                                         <span className="text-[9px] text-white/40 mt-0.5">📞 {formatPhone(row.mobilePhone || row.directPhone || row.phone)}</span>
                                      )}
                                   </div>
                                </td>
                                <td className="p-5">
                                   <span className="text-[11px] font-black text-green-400 uppercase tracking-tighter">Budget: ${((row.maxPrice || 0) / 1000).toLocaleString()}k</span>
                                </td>
                                <td className="p-5">
                                   <span className="text-[9px] text-white/60 font-bold uppercase truncate max-w-[200px]">{row.isNationwide ? 'NATIONWIDE' : row.states.join(', ') || 'NONE'}</span>
                                </td>
                                <td className="p-5 text-right sticky right-0 bg-[#0c0c0c]/80 backdrop-blur-md group-hover:bg-[#1a1a1a] shadow-[-10px_0_10px_rgba(0,0,0,0.2)] z-10">
                                   <div className="flex justify-end gap-1">
                                      <button title="Edit Buyer" onClick={() => setEditingRowId(editingRowId === row.id ? null : row.id)} className={`w-9 h-9 rounded-xl transition-all flex items-center justify-center border ${editingRowId === row.id ? 'bg-white text-black border-white' : 'border-white/5 text-white/30 hover:text-white'}`}><span className="material-symbols-outlined text-[20px]">{editingRowId === row.id ? 'expand_less' : 'edit'}</span></button>
                                      <button title="Reject Row" onClick={() => { const n = new Set(rejectedIds); n.has(row.id) ? n.delete(row.id) : n.add(row.id); setRejectedIds(n); }} className="w-9 h-9 rounded-xl bg-red-500/10 text-red-500 border border-red-500/20 hover:bg-red-600 hover:text-white flex items-center justify-center"><span className="material-symbols-outlined text-[20px]">{rejectedIds.has(row.id) ? 'undo' : 'close'}</span></button>
                                   </div>
                                </td>
                             </tr>
                             {editingRowId === row.id && (
                               <tr>
                                  <td colSpan={5} className="p-0 bg-white/[0.03] animate-dropdown border-b border-white/10">
                                     <div className="p-8 grid grid-cols-1 md:grid-cols-3 gap-10">
                                        <div className="flex flex-col gap-4">
                                           <SectionLabel>Identity & Contact</SectionLabel>
                                           <TextInput label="Full Name" value={row.name} onChange={(v) => updatePreviewRow(row.id, { name: v })} className="!h-10" />
                                           <TextInput label="Email" value={row.email} onChange={(v) => updatePreviewRow(row.id, { email: v })} className="!h-10" />
                                           <div className="grid grid-cols-2 gap-2">
                                              <TextInput label="Direct Phone" value={row.directPhone || ''} onChange={(v) => updatePreviewRow(row.id, { directPhone: v })} className="!h-10" />
                                              <TextInput label="Mobile Phone" value={row.mobilePhone || ''} onChange={(v) => updatePreviewRow(row.id, { mobilePhone: v })} className="!h-10" />
                                           </div>
                                           <TextInput label="Company / Entity" value={row.company} onChange={(v) => updatePreviewRow(row.id, { company: v })} className="!h-10" />
                                           <FieldDropdown label="Status" value={row.status} options={BUYER_STATUSES} onChange={(v) => updatePreviewRow(row.id, { status: v as BuyerStatus })} />
                                           <FieldDropdown label="Review Status" value={row.reviewStatus} options={REVIEW_STATUSES} onChange={(v) => updatePreviewRow(row.id, { reviewStatus: v as ReviewStatus })} />
                                        </div>
                                        <div className="flex flex-col gap-4">
                                           <SectionLabel>Buy Box & Financials</SectionLabel>
                                           <TextInput label="Raw Budget Text" value={row.rawBudgetText || ''} onChange={(v) => updatePreviewRow(row.id, { rawBudgetText: v })} className="!h-12" />
                                           <div className="grid grid-cols-2 gap-3">
                                              <DragNumberField label="Min Budget" value={row.minPrice} step={25000} suffix="$" onChange={(v) => updatePreviewRow(row.id, { minPrice: v })} />
                                              <DragNumberField label="Max Budget" value={row.maxPrice} step={25000} suffix="$" onChange={(v) => updatePreviewRow(row.id, { maxPrice: v })} />
                                           </div>
                                           <div className="grid grid-cols-2 gap-2">
                                              <DragNumberField label="Cap Rate" value={row.capRate || 0} step={0.1} suffix="%" onChange={(v) => updatePreviewRow(row.id, { capRate: v })} />
                                              <TextInput label="Units" value={row.unitRange || ''} onChange={(v) => updatePreviewRow(row.id, { unitRange: v })} className="!h-10" />
                                           </div>
                                           <MultiSelectPills label="Property Types / Asset Focus" options={PROPERTY_TYPES} selected={row.propertyTypes || []} onChange={(v) => updatePreviewRow(row.id, { propertyTypes: v as AssetType[] })} />
                                           <div className="bg-orange-500/5 border border-orange-500/20 rounded-2xl p-4 flex flex-col gap-3">
                                              <div className="flex items-center justify-between">
                                                 <span className="text-[11px] font-bold text-white uppercase">Accepts Creative Terms</span>
                                                 <button onClick={() => updatePreviewRow(row.id, { acceptsCreativeTerms: !row.acceptsCreativeTerms })} className={`w-12 h-7 rounded-full border transition-all flex items-center px-1 ${row.acceptsCreativeTerms ? 'bg-orange-500 border-orange-400 justify-end' : 'bg-black border-white/10 justify-start'}`}><div className="w-5 h-5 rounded-full bg-white shadow-lg" /></button>
                                              </div>
                                              {row.acceptsCreativeTerms && <TextInput label="Creative Terms Notes" value={row.creativeTermsNotes || ''} onChange={(v) => updatePreviewRow(row.id, { creativeTermsNotes: v })} className="!h-20" />}
                                           </div>
                                        </div>
                                        <div className="flex flex-col gap-4">
                                           <SectionLabel>Geography & Notes</SectionLabel>
                                           <button onClick={() => updatePreviewRow(row.id, { isNationwide: !row.isNationwide })} className={`flex items-center justify-between h-10 px-4 rounded-xl border transition-all ${row.isNationwide ? 'bg-purple-500 text-white border-purple-400' : 'bg-black/40 border-white/10 text-white/40'}`}>
                                              <span className="text-[10px] font-black uppercase">Nationwide</span>
                                              <span className="material-symbols-outlined">{row.isNationwide ? 'check_circle' : 'radio_button_unchecked'}</span>
                                           </button>
                                           <MultiSelectPills label="Preferred States" options={STATES_LIST} selected={row.states || []} onChange={(v) => updatePreviewRow(row.id, { states: v })} />
                                           <TextInput label="Preferred Markets / Cities" value={row.city || ''} onChange={(v) => updatePreviewRow(row.id, { city: v })} className="!h-10" />
                                           <TextInput label="General Notes" value={row.notes || ''} onChange={(v) => updatePreviewRow(row.id, { notes: v })} className="!h-24" />
                                           <div className="flex flex-col gap-2 pt-4 border-t border-white/5">
                                              <PillButton variant="solid" onClick={() => setEditingRowId(null)} className="!bg-blue-600 !text-white shadow-lg">Save Row</PillButton>
                                              <div className="grid grid-cols-2 gap-2">
                                                 <PillButton variant="outline" onClick={() => setEditingRowId(null)}>Cancel Edit</PillButton>
                                                 <PillButton variant="outline" onClick={() => reParseRow(row)} className="!text-orange-400 !border-orange-400/20">Re-Parse Row</PillButton>
                                              </div>
                                           </div>
                                        </div>
                                     </div>
                                  </td>
                               </tr>
                             )}
                           </React.Fragment>
                         ))}
                      </tbody>
                   </table>
                </div>
             </div>
             <div className="p-8 bg-black/60 border-t border-white/5 flex items-center justify-between">
                <div className="flex flex-col"><SectionLabel>Merge Authorize</SectionLabel><p className="text-[10px] text-white/40 uppercase font-black">Reviewing {mergedParsed.length} records. {rejectedIds.size} flagged for removal.</p></div>
                <div className="flex gap-3"><PillButton variant="outline" className="!w-fit !px-10" onClick={() => setImportStep('upload')}>Back</PillButton><PillButton variant="solid" className="!w-fit !px-20 !h-14 !bg-green-600 !text-white shadow-xl" onClick={confirmImport}>Confirm Merge & Finalize CRM</PillButton></div>
             </div>
          </div>
        )}
      </Modal>
      
      <div className="px-2 flex items-center justify-between">
         <SectionLabel>Buyer CRM & Master DB</SectionLabel>
         <div className="flex gap-2">
            <PillButton 
              variant="outline" 
              onClick={() => setShowUndoModal(true)} 
              disabled={!lastImportMeta}
              icon={<span className="material-symbols-outlined">{lastImportMeta ? 'undo' : 'history_toggle_off'}</span>}
              className={`!w-fit !px-4 ${!lastImportMeta ? 'opacity-20' : '!text-orange-400 !border-orange-500/20'}`}
            >
              Undo Last Import
            </PillButton>
            {filteredBuyers.length > 0 && (
              <button 
                onClick={toggleSelectAll} 
                className="px-4 h-9 rounded-xl border border-white/10 text-white/60 text-[10px] font-black uppercase hover:bg-white/5 transition-all"
              >
                {selectedIds.length === filteredBuyers.length ? 'Deselect All' : 'Select All Visible'}
              </button>
            )}
            <PillButton variant="outline" onClick={openImport} icon={<span className="material-symbols-outlined">upload_file</span>} className="!w-fit !px-4">Import CSVs</PillButton>
         </div>
      </div>

      <section className="flex flex-col gap-6">
        <div className="px-2 flex flex-col gap-6 bg-black/20 p-6 rounded-[32px] border border-white/5 shadow-inner">
           <div className="flex flex-col md:flex-row gap-3">
              <div className="flex-1"><SearchBar value={search} onChange={setSearch} placeholder="Search names, emails, states..." /></div>
              <div className="w-full md:w-64"><FieldDropdown label="Sort Records" value={sortBy} options={SORT_OPTIONS} onChange={setSortBy} /></div>
           </div>

           {/* Filter Bar */}
           <div className="flex flex-col gap-4">
              <div className="flex flex-wrap gap-2">
                 <div className="w-full md:w-64">
                    <MultiSelectDropdown label="State Filter" options={STATES_LIST} selected={filterState} onChange={setFilterState} />
                 </div>
                 <div className="w-full md:w-64">
                    <FieldDropdown label="Status Filter" value={filterStatus} options={['All', 'Ready', 'Active', 'Needs Review']} onChange={setFilterStatus} />
                 </div>
              </div>
              <div className="flex flex-wrap gap-2">
                 <FilterToggle active={filterNationwide} onClick={() => setFilterNationwide(!filterNationwide)} label="Nationwide" />
                 <FilterToggle active={filterCreative} onClick={() => setFilterCreative(!filterCreative)} label="Creative Terms" />
                 <FilterToggle active={filterNotes} onClick={() => setFilterNotes(!filterNotes)} label="Notes Buyers" />
                 <FilterToggle active={filterLand} onClick={() => setFilterLand(!filterLand)} label="Land Buyers" />
                 <FilterToggle active={filterMultifamily} onClick={() => setFilterMultifamily(!filterMultifamily)} label="Multifamily" />
                 <FilterToggle active={filterSFR} onClick={() => setFilterSFR(!filterSFR)} label="SFR / Rental" />
                 <FilterToggle active={filterCommercial} onClick={() => setFilterCommercial(!filterCommercial)} label="Commercial" />
                 <FilterToggle active={filterHotel} onClick={() => setFilterHotel(!filterHotel)} label="Hotel / Hospitality" />
                 <FilterToggle active={filterStorage} onClick={() => setFilterStorage(!filterStorage)} label="Self Storage" />
                 <FilterToggle active={filterMHP} onClick={() => setFilterMHP(!filterMHP)} label="MHP / RV Park" />
                 <FilterToggle active={filterMissingPhone} onClick={() => setFilterMissingPhone(!filterMissingPhone)} label="Missing Phone" danger />
                 <FilterToggle active={filterMissingBudget} onClick={() => setFilterMissingBudget(!filterMissingBudget)} label="Missing Budget" danger />
                 <button onClick={clearAllFilters} className="px-4 h-9 rounded-xl border border-red-500/20 text-red-500 text-[10px] font-black uppercase hover:bg-red-500 hover:text-white transition-all ml-auto">Clear All Filters</button>
              </div>
           </div>

           <div className="flex items-center justify-between px-2">
              <div className="flex items-center gap-2">
                 <span className="text-[10px] font-black text-white/30 uppercase tracking-widest">Showing</span>
                 <span className="text-[12px] font-black text-blue-400">{filteredBuyers.length} of {safeBuyers.length} buyers</span>
              </div>
           </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 px-2">
          {filteredBuyers.map(buyer => {
            const uniqueIcons: any[] = [];
            const seen = new Set();
            [buyer.type, ...(buyer.propertyTypes || [])].forEach(t => {
              const s = getAssetStyle(t);
              if (!seen.has(s.icon)) { uniqueIcons.push(s); seen.add(s.icon); }
            });

            const displayPhone = buyer.mobilePhone || buyer.directPhone || buyer.phone;
            const isSelected = selectedIds.includes(buyer.id);
            const isNewBadge = buyer.reviewStatus === 'Needs Review';

            return (
              <div key={buyer.id} 
                onClick={() => handleOpenProfile(buyer.id)} 
                className={`bg-[#111111] border rounded-[32px] p-6 flex flex-col gap-4 group hover:border-blue-500/40 cursor-pointer shadow-xl transition-all relative h-full ${isSelected ? 'ring-2 ring-blue-500 border-blue-500 bg-blue-500/[0.02]' : 'border-white/10'}`}
              >
                <div onClick={(e) => toggleSelect(buyer.id, e)} className={`absolute -top-2 -left-2 w-8 h-8 rounded-full flex items-center justify-center border transition-all z-10 ${isSelected ? 'bg-blue-500 border-blue-400 shadow-[0_4px_10px_rgba(59,130,246,0.3)]' : 'bg-black border-white/10 opacity-0 group-hover:opacity-100'}`}><span className="material-symbols-outlined text-[18px] text-white">check</span></div>
                <div className="flex items-center justify-end gap-2 min-h-[22px]">
                   {buyer.acceptsCreativeTerms && <span title="Creative Terms" className="material-symbols-outlined text-orange-500 text-[18px]">handshake</span>}
                   {buyer.status !== 'New' && <BuyerStatusBadge status={buyer.status} />}
                   {isNewBadge && <Badge variant="green" className="!px-1.5 !py-0.5 animate-pulse">NEW</Badge>}
                </div>
                <div className="flex items-start justify-between gap-4">
                  <div className="flex flex-col min-w-0 pr-2">
                    <h4 className="text-[16px] font-black text-white uppercase truncate">{buyer.name || 'Untitled lead'}</h4>
                    <span className="text-[12px] text-blue-400 font-bold truncate mt-1">{buyer.email}</span>
                    {displayPhone && (
                      <span className="text-[11px] text-white/50 font-medium mt-0.5">📞 {formatPhone(displayPhone)}</span>
                    )}
                  </div>
                  <div className="flex flex-col items-end gap-1.5 flex-shrink-0">
                    <div className={`px-2 py-0.5 rounded border text-[8px] font-black uppercase tracking-widest ${getStrengthColor(buyer.strength)}`}>STR: {buyer.strength}</div>
                  </div>
                </div>
                <div className="flex flex-col gap-2">
                  <span className="text-[9px] font-black text-white/20 uppercase tracking-widest">Target Markets</span>
                  <div className="flex flex-wrap gap-1.5">
                     {buyer.isNationwide ? (
                        <span className="px-2 py-0.5 rounded bg-purple-500/10 text-purple-400 border border-purple-500/20 text-[9px] font-black uppercase">Nationwide</span>
                     ) : (
                       <>
                         {(buyer.states || []).slice(0, 5).map(s => <span key={s} className="bg-blue-500/10 text-blue-400 px-2 py-0.5 rounded border border-blue-500/20 text-[9px] font-black uppercase">{s}</span>)}
                         {buyer.states.length > 5 && <span className="text-[9px] text-white/20 font-bold">+{buyer.states.length - 5}</span>}
                       </>
                     )}
                  </div>
                </div>
                <div className="flex items-center justify-between gap-4 bg-white/[0.02] p-4 rounded-2xl border border-white/5 mt-auto">
                   <div className="flex flex-col min-w-fit"><span className="text-[9px] font-black text-white/20 uppercase">Max Budget</span><span className="text-[14px] font-black text-green-400 tracking-tighter">${((buyer.maxPrice || 0) / 1000).toLocaleString()}k</span></div>
                   <div className="max-w-full flex justify-end gap-1.5 flex-1 items-center">
                      {uniqueIcons.slice(0, 4).map((iconObj, idx) => (
                        <Tooltip key={idx} text={iconObj.title}><span title={iconObj.title} className={`material-symbols-outlined text-[18px] ${iconObj.color} shrink-0`}>{iconObj.icon}</span></Tooltip>
                      ))}
                      {uniqueIcons.length > 4 && (
                        <div className="px-1.5 py-0.5 rounded-lg bg-white/5 border border-white/10 text-[9px] font-bold text-white/40 cursor-help" title={uniqueIcons.slice(4).map(i => i.title).join(', ')}>
                          +{uniqueIcons.length - 4}
                        </div>
                      )}
                   </div>
                </div>
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
};

const FilterToggle = ({ active, onClick, label, danger = false }: { active: boolean, onClick: () => void, label: string, danger?: boolean }) => (
  <button 
    onClick={onClick}
    className={`px-4 h-9 rounded-xl border text-[10px] font-black uppercase transition-all whitespace-nowrap ${
      active 
        ? danger ? 'bg-red-500 border-red-400 text-white' : 'bg-blue-600 border-blue-500 text-white' 
        : 'bg-white/5 border-white/10 text-white/40 hover:border-white/20 hover:text-white'
    }`}
  >
    {label}
  </button>
);

const MultiSelectDropdown = ({ label, options, selected, onChange }: { label: string, options: string[], selected: string[], onChange: (v: string[]) => void }) => {
  const [isOpen, setIsOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const toggle = (opt: string) => {
    const next = selected.includes(opt) ? selected.filter(s => s !== opt) : [...selected, opt];
    onChange(next);
  };
  return (
    <div ref={ref} className="relative">
      <button onClick={() => setIsOpen(!isOpen)} className="w-full text-left border border-white/15 hover:border-white/30 transition-all rounded-xl flex flex-col gap-0 justify-center pb-2.5 pl-4 pr-1 pt-1.5 bg-black/40 min-h-[52px]">
         <p className="text-[10px] font-bold text-white/40 uppercase tracking-tight">{label}</p>
         <div className="flex items-center justify-between">
            <span className="text-[13px] font-semibold text-white truncate pr-2 uppercase">
               {selected.length === 0 ? 'Any State' : selected.length === 1 ? selected[0] : `${selected.length} States`}
            </span>
            <span className="material-symbols-outlined text-[20px] text-white/30 mr-1">keyboard_arrow_down</span>
         </div>
      </button>
      {isOpen && (
        <div className="absolute z-[100] top-[calc(100%+8px)] left-0 w-64 bg-[#0c0c0c] border border-white/15 rounded-2xl overflow-hidden shadow-2xl backdrop-blur-xl p-4">
           <div className="max-h-64 overflow-y-auto dark-scrollbar flex flex-wrap gap-1">
              {options.map(opt => (
                <button key={opt} onClick={() => toggle(opt)} className={`px-2 py-1 rounded-lg border text-[9px] font-black uppercase transition-all ${selected.includes(opt) ? 'bg-blue-600 border-blue-500 text-white' : 'bg-white/5 border-white/10 text-white/40'}`}>{opt}</button>
              ))}
           </div>
           <div className="mt-4 pt-4 border-t border-white/5 flex justify-between">
              <button onClick={() => onChange([])} className="text-[9px] font-black text-red-400 uppercase">Clear</button>
              <button onClick={() => setIsOpen(false)} className="text-[9px] font-black text-blue-400 uppercase">Done</button>
           </div>
        </div>
      )}
    </div>
  );
};

const PreviewStat = ({ label, val, color = "text-white", active, onClick }: { label: string, val: number, color?: string, active: boolean, onClick: () => void }) => (
  <button onClick={onClick} className={`p-3 rounded-2xl border flex flex-col items-center justify-center transition-all cursor-pointer ${active ? 'bg-white text-black shadow-xl border-white scale-[1.02]' : 'bg-black/20 border-white/10 hover:border-white/20'}`}>
     <span className={`text-xl font-black ${active ? 'text-black' : color}`}>{val}</span>
     <span className={`text-[8px] font-black uppercase tracking-widest ${active ? 'text-black/40' : 'text-white/20'}`}>{label}</span>
  </button>
);
