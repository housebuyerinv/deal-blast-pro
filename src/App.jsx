import React, { useState, useEffect, useMemo } from 'react';
import { Flow } from 'flow-sdk';
import { safeStorage } from './utils/safeStorage';
import { ErrorBoundary } from './components/ErrorBoundary';
import { appLogger } from './utils/appLogger';
import { 
  normalizeDeal,
  normalizePortalFormState, 
  repairRecordsBatch,
  createInventoryDealFromPortalSubmission,
  sanitizeInventory
} from './utils/schemaNormalizer';

import { 
  NavButton,
  Toast,
  StorageBanner,
  SectionLabel,
  Modal,
  PillButton
} from './components/uiRegistry';

import { FreezeBanner } from './components/FreezeBanner';

import { ManagerDashboard } from './components/ManagerDashboard';
import { SetupWizard } from './components/SetupWizard';
import { DealIntakeGatekeeper } from './components/DealIntakeGatekeeper';
import { ProofOfControlManager } from './components/ProofOfControlManager';
import { BuyerPipelineManager } from './components/BuyerPipelineManager';
import { FollowUpTaskManager } from './components/FollowUpTaskManager';
import { OfferComparisonManager } from './components/OfferComparisonManager';
import { VAWorkQueue } from './components/VAWorkQueue';
import { VAPerformanceTracker } from './components/VAPerformanceTracker';
import { BuyerManager } from './components/BuyerManager';
import { PartnerManager } from './components/PartnerManager';
import { SettingsManager } from './components/SettingsManager';
import { AuditLogViewer } from './components/AuditLogViewer';
import { MarcelCommandCenter } from './components/MarcelCommandCenter';
import { SystemHealthDashboard } from './components/SystemHealthDashboard';
import { GoLiveSmokeTest } from './components/GoLiveSmokeTest';
import { SystemBackup } from './components/SystemBackup';
import { PublicPortal } from './components/PublicPortal';
import { InternalSubmissionsManager } from './components/InternalSubmissionsManager';

import { useNotifications } from './hooks/useNotifications';
import { useFollowUpEngine } from './hooks/useFollowUpEngine';

import { 
  DEFAULT_SETTINGS, 
  NEW_PROPERTY_DATA 
} from './constants';

// WARNING: DO NOT MODIFY SIDEBAR_NAV_V1_LOCKED WITHOUT EXPLICIT USER REQUEST.
const SIDEBAR_NAV_V1_LOCKED = [
  {
    group: 'CORE CONTROL',
    items: [
      { key: 'commandCenter', label: 'Command Center', icon: 'rocket', adminOnly: true },
      { key: 'inventoryHub', label: 'Inventory Hub', icon: 'dashboard', adminOnly: true },
      { key: 'activeQueue', label: 'Active Queue', icon: 'checklist' },
      { key: 'dealSubmissions', label: 'Deal Submissions', icon: 'input' },
    ]
  },
  {
    group: 'DEAL FLOW',
    items: [
      { key: 'dealIntake', label: 'Deal Intake', icon: 'gavel' },
      { key: 'dealDocs', label: 'Deal Docs', icon: 'edit' },
      { key: 'followUps', label: 'Follow-Ups', icon: 'history' },
    ]
  },
  {
    group: 'ASSET STRATEGY',
    items: [
      { key: 'globalBuyerDb', label: 'Global Buyer DB', icon: 'groups' },
      { key: 'buyerPipeline', label: 'Buyer Pipeline', icon: 'rebase_edit' },
      { key: 'biddingHub', label: 'Bidding Hub', icon: 'payments' },
      { key: 'partners', label: 'Partners', icon: 'handshake' },
    ]
  },
  {
    group: 'VA MANAGEMENT',
    items: [
      { key: 'vaPerformance', label: 'VA Performance', icon: 'monitoring' },
      { key: 'vaAuditLogs', label: 'VA Audit Logs', icon: 'history' },
    ]
  },
  {
    group: 'ADMIN TOOLS',
    items: [
      { key: 'systemHealth', label: 'System Health', icon: 'health_and_safety', adminOnly: true },
      { key: 'systemBackup', label: 'System Backup', icon: 'backup', adminOnly: true },
      { key: 'smokeTest', label: 'Smoke Test', icon: 'science', adminOnly: true },
    ]
  },
  {
    group: 'EXTERNAL',
    items: [
      { key: 'publicPortal', label: 'Public Portal', icon: 'open_in_new' },
    ]
  },
  {
    group: 'SYSTEM',
    items: [
      { key: 'systemSettings', label: 'System Settings', icon: 'settings' },
    ]
  }
];

const STORAGE_KEYS = {
  SETTINGS: 'dbp_settings',
  HISTORY: 'dbp_history',
  BUYERS: 'dbp_buyers',
  PARTNERS: 'dbp_partners',
  TASKS: 'dbp_tasks',
  SUBMISSIONS: 'portalSubmissions',
  AUDIT_LOGS: 'dbp_audit_logs',
  VA_TASK_LOGS: 'dbp_va_task_logs',
  REVIEWED_ITEMS: 'dbp_reviewed_items',
  ERRORS: 'dbp_runtime_errors',
  RESOLVED_ALERTS: 'dbp_resolved_alert_ids',
  NOTIFICATIONS: 'dbp_notifications'
};

export default function App() {
  const [settings, setSettings] = useState(() => {
    const saved = safeStorage.getItem(STORAGE_KEYS.SETTINGS);
    const parsed = saved ? JSON.parse(saved) : { ...DEFAULT_SETTINGS };
    if (!parsed.health) parsed.health = DEFAULT_SETTINGS.health;
    if (!parsed.release) parsed.release = DEFAULT_SETTINGS.release;
    if (!parsed.backupTracking) parsed.backupTracking = DEFAULT_SETTINGS.backupTracking;
    if (!parsed.featureFlags) parsed.featureFlags = DEFAULT_SETTINGS.featureFlags;
    return parsed;
  });

  const [activeTab, setActiveTab] = useState(settings.userMode === 'Admin' ? 'commandCenter' : 'activeQueue');
  const [toast, setToast] = useState(null);
  const [acceptedModal, setAcceptedModal] = useState(null);

  const [history, setHistory] = useState(() => {
    const saved = safeStorage.getItem(STORAGE_KEYS.HISTORY);
    const parsed = saved ? JSON.parse(saved) : [];
    if (!Array.isArray(parsed)) return [];
    
    const { clean } = sanitizeInventory(parsed);
    return repairRecordsBatch(clean, 'deal').map((d) => ({
      ...d,
      data: normalizeDeal(d.data || d)
    }));
  });
  
  const [buyers, setBuyers] = useState(() => {
    const saved = safeStorage.getItem(STORAGE_KEYS.BUYERS);
    return saved ? JSON.parse(saved) : [];
  });
  
  const [partners, setPartners] = useState(() => {
    const saved = safeStorage.getItem(STORAGE_KEYS.PARTNERS);
    return saved ? JSON.parse(saved) : [];
  });
  
  const [tasks, setTasks] = useState(() => {
    const saved = safeStorage.getItem(STORAGE_KEYS.TASKS);
    return saved ? JSON.parse(saved) : [];
  });
  
  const [portalSubmissions, setPortalSubmissions] = useState(() => {
    const saved = safeStorage.getItem(STORAGE_KEYS.SUBMISSIONS);
    const parsed = saved ? JSON.parse(saved) : [];
    return repairRecordsBatch(parsed, 'submission');
  });

  const [notifications, setNotifications] = useState(() => {
    const saved = safeStorage.getItem(STORAGE_KEYS.NOTIFICATIONS);
    return saved ? JSON.parse(saved) : [];
  });
  
  const [vaWorkQueue, setVaWorkQueue] = useState([]);
  const [auditLogs, setAuditLogs] = useState([]);
  const [vaTaskLogs, setVaTaskLogs] = useState([]);
  const [reviewedItems, setReviewedItems] = useState([]);
  const [runtimeErrors, setRuntimeErrors] = useState([]);
  const [resolvedAlertIds, setResolvedAlertIds] = useState([]);
  const [submissionAlert, setSubmissionAlert] = useState(null);
  
  const [isPortalMode, setIsPortalMode] = useState(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get('page') === 'submit';
  });
  
  const [isAdminPreviewMode, setIsAdminPreviewMode] = useState(true);

  const [data, setData] = useState(() => normalizeDeal(NEW_PROPERTY_DATA(settings)));
  
  const isAdmin = settings.userMode === 'Admin';

  const publicPortalUrl = useMemo(() => {
    if (settings.customPublicPortalUrl) return settings.customPublicPortalUrl;
    const origin = window.location.origin === 'null' ? '' : window.location.origin;
    return `${origin}${window.location.pathname}?page=submit`;
  }, [settings.customPublicPortalUrl]);

  useEffect(() => { safeStorage.setItem(STORAGE_KEYS.SETTINGS, JSON.stringify(settings)); }, [settings]);
  useEffect(() => { safeStorage.setItem(STORAGE_KEYS.HISTORY, JSON.stringify(history)); }, [history]);
  useEffect(() => { safeStorage.setItem(STORAGE_KEYS.BUYERS, JSON.stringify(buyers)); }, [buyers]);
  useEffect(() => { safeStorage.setItem(STORAGE_KEYS.PARTNERS, JSON.stringify(partners)); }, [partners]);
  useEffect(() => { safeStorage.setItem(STORAGE_KEYS.TASKS, JSON.stringify(tasks)); }, [tasks]);
  useEffect(() => { safeStorage.setItem(STORAGE_KEYS.SUBMISSIONS, JSON.stringify(portalSubmissions)); }, [portalSubmissions]);
  useEffect(() => { safeStorage.setItem(STORAGE_KEYS.NOTIFICATIONS, JSON.stringify(notifications)); }, [notifications]);

  const { tasks: followUpTasks } = useFollowUpEngine(data);
  
  const allDeals = useMemo(() => [data, ...history.map(h => h.data || h)].map(normalizeDeal), [data, history]);
  const normalizedSubmissions = useMemo(() => (portalSubmissions || []).map(normalizePortalFormState), [portalSubmissions]);
  const rawAlerts = useNotifications(tasks, buyers, allDeals, settings, partners, normalizedSubmissions, runtimeErrors);
  
  useEffect(() => {
    const nextNotifs = [...notifications];
    let changed = false;
    rawAlerts.forEach(alert => {
      if (!nextNotifs.find(n => n.id === alert.id) && !resolvedAlertIds.includes(alert.id)) {
        nextNotifs.push({ id: alert.id, type: alert.type, message: alert.message, relatedRecordId: alert.relatedId, status: 'unread', createdAt: alert.timestamp });
        changed = true;
      }
    });
    if (changed) setNotifications(nextNotifs);
  }, [rawAlerts, resolvedAlertIds, notifications]);

  const alerts = useMemo(() => notifications.filter(n => n.status !== 'acknowledged' && n.status !== 'dismissed'), [notifications]);

  const handleUpdateDeals = (updatedDeals) => {
    const currentDealUpdate = updatedDeals.find(d => d.id === data.id);
    if (currentDealUpdate) setData(currentDealUpdate);

    setHistory(prev => prev.map(h => {
      const match = updatedDeals.find(ud => ud.id === h.id);
      return match ? { ...h, data: match, timestamp: Date.now() } : h;
    }));
  };

  const handleAcknowledgeAlert = (id) => {
    setNotifications(prev => prev.map(n => n.id === id ? { 
      ...n, 
      status: 'acknowledged', 
      acknowledgedAt: Date.now() 
    } : n));
    setResolvedAlertIds(prev => [...prev, id]);
  };

  const handleTabChange = (tab) => {
    if (tab === 'publicPortal') {
      setIsPortalMode(true);
    } else {
      setActiveTab(tab);
    }
  };

  const handleRestore = (restored) => {
    try {
      setSettings(prev => ({ ...prev, ...(restored.settings || {}), hasCompletedSetup: true }));
      setBuyers(restored.buyers || []);
      setPartners(restored.partners || []);
      setTasks(restored.tasks || []);
      setPortalSubmissions(repairRecordsBatch(restored.portalSubmissions || [], 'submission'));
      setHistory(repairRecordsBatch(restored.activeInventory || restored.deals || [], 'deal').map(d => ({ id: d.id, timestamp: d.lastUpdated || Date.now(), data: d, content: null })));
      setToast('Backup restored successfully ✓');
    } catch (err) { appLogger.error('Restoration Failed', err); }
  };

  const handlePublicSubmission = (sub) => {
    const normalized = normalizePortalFormState(sub);
    setPortalSubmissions(prev => [normalized, ...prev]);
    setSubmissionAlert(`New Deal Submission: ${normalized.address}`);
  };

  const handleAcceptSubmission = (sub) => {
    const dealData = createInventoryDealFromPortalSubmission(sub);
    const newDealRecord = {
      id: dealData.id,
      timestamp: Date.now(),
      data: dealData,
      content: null
    };
    setHistory(prev => [newDealRecord, ...prev]);
    setPortalSubmissions(prev => prev.map(s => s.id === sub.id ? { ...s, status: 'Accepted' } : s));
    setAcceptedModal(dealData.address);
    setToast('Deal accepted into Active Inventory');
  };

  const handlePortalExit = () => {
    setActiveTab('commandCenter');
    setIsPortalMode(false);
  };

  if (isPortalMode) {
    return (
      <ErrorBoundary>
        <div className="h-screen w-screen bg-[#080808] text-white">
          <PublicPortal 
            onBack={handlePortalExit} 
            onSubmit={handlePublicSubmission} 
            isAdminPreview={false} 
            standalone={true} 
          />
        </div>
      </ErrorBoundary>
    );
  }

  const tabTitle = activeTab.replace(/([A-Z])/g, ' $1').replace(/^./, (str) => str.toUpperCase());

  return (
    <ErrorBoundary>
      <div className="flex h-screen w-screen bg-[#080808] overflow-hidden flex-col text-white">
        <FreezeBanner />
        <StorageBanner />

        {acceptedModal && (
          <Modal isOpen={!!acceptedModal} onClose={() => setAcceptedModal(null)} title="Success" size="sm">
             <div className="flex flex-col gap-6 text-center animate-fade-in">
                <div className="w-16 h-16 rounded-full bg-green-500/10 border border-green-500/20 flex items-center justify-center mx-auto text-green-400">
                   <span className="material-symbols-outlined text-[32px]">check_circle</span>
                </div>
                <div className="flex flex-col gap-2">
                   <h3 className="text-lg font-black text-white uppercase">Deal accepted into Active Inventory</h3>
                   <p className="text-[12px] text-white/60 leading-relaxed italic px-4">
                     {acceptedModal} has been moved to the Inventory Hub.
                   </p>
                </div>
                <div className="flex flex-col gap-2 mt-2">
                   <PillButton variant="solid" onClick={() => { setAcceptedModal(null); setActiveTab('inventoryHub'); }}>Open Inventory Hub</PillButton>
                   <button onClick={() => setAcceptedModal(null)} className="text-[10px] font-black text-white/30 hover:text-white uppercase tracking-widest mt-2 transition-all">Close</button>
                </div>
             </div>
          </Modal>
        )}
        
        {submissionAlert && (
          <div className="bg-blue-600 px-8 py-3 flex items-center justify-between animate-fade-in relative z-[1000] shadow-xl">
             <div className="flex items-center gap-3">
                <span className="material-symbols-outlined text-white animate-bounce">notifications_active</span>
                <span className="text-[12px] font-black uppercase tracking-widest">{submissionAlert}</span>
             </div>
             <button onClick={() => { setSubmissionAlert(null); setActiveTab('dealSubmissions'); }} className="bg-white/10 hover:bg-white/20 px-3 py-1 rounded text-[9px] font-black uppercase mr-4">Review Submissions</button>
             <button onClick={() => setSubmissionAlert(null)} className="text-white/60 hover:text-white transition-all"><span className="material-symbols-outlined">close</span></button>
          </div>
        )}

        <div className="flex-1 flex overflow-hidden">
          <Toast message={toast} onClose={() => setToast(null)} />
          {!settings.hasCompletedSetup && <SetupWizard currentSettings={settings} onComplete={(s) => setSettings({ ...s, hasCompletedSetup: true })} onRestore={handleRestore} />}

          <div className="w-[260px] border-r border-white/5 flex flex-col h-full bg-[#0c0c0c] flex-shrink-0 z-50 shadow-[20px_0_40px_rgba(0,0,0,0.4)]">
            <div className="px-6 py-8 flex flex-col border-b border-white/5">
              <h1 className="text-xl font-bold text-white tracking-tighter uppercase leading-none italic">Deal Blast <span className="text-blue-500">Pro</span></h1>
            </div>

            <div className="flex-1 overflow-y-auto dark-scrollbar px-3 py-4 flex flex-col gap-6">
              {SIDEBAR_NAV_V1_LOCKED.map((section) => (
                <div key={section.group} className="flex flex-col gap-1">
                  <SectionLabel>{section.group}</SectionLabel>
                  {section.items.map((item) => {
                    if (item.adminOnly && !isAdmin) return null;
                    return (
                      <NavButton 
                        key={item.key}
                        active={activeTab === item.key} 
                        icon={item.icon} 
                        label={item.label} 
                        onClick={() => handleTabChange(item.key)} 
                        badge={item.key === 'inventoryHub' ? alerts.length || undefined : undefined}
                      />
                    );
                  })}
                </div>
              ))}
            </div>
          </div>

          <div className="flex-1 flex flex-col h-full bg-[#080808] overflow-hidden relative">
            <div className="h-[72px] px-8 border-b border-white/5 flex items-center justify-between bg-black/40 backdrop-blur-3xl sticky top-0 z-20">
              <div className="flex items-center gap-5">
                <span className="material-symbols-outlined text-white/10 text-[20px]">terminal</span>
                <h2 className="text-sm font-bold text-white uppercase tracking-[4px]">{tabTitle}</h2>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-6 lg:p-10 dark-scrollbar bg-gradient-to-b from-black/0 to-blue-900/5">
              <div className="animate-fade-in h-full">
                {activeTab === 'inventoryHub' && isAdmin && (
                  <ManagerDashboard 
                    alerts={alerts} 
                    deals={allDeals} 
                    buyers={buyers} 
                    tasks={tasks} 
                    partners={partners} 
                    settings={settings} 
                    portalUrl={publicPortalUrl} 
                    onTabChange={handleTabChange} 
                    onStartNewDeal={() => handleTabChange('dealIntake')} 
                    onAcknowledgeAlert={handleAcknowledgeAlert} 
                    onUpdateDeals={handleUpdateDeals}
                  />
                )}
                {activeTab === 'commandCenter' && isAdmin && <MarcelCommandCenter deals={allDeals} buyers={buyers} tasks={tasks} submissions={normalizedSubmissions} vaQueue={vaWorkQueue} vaLogs={vaTaskLogs} followUpTasks={followUpTasks} alerts={alerts} settings={settings} portalUrl={publicPortalUrl} reviewedItems={reviewedItems} runtimeErrors={runtimeErrors} onUpdateErrors={setRuntimeErrors} onUpdateReviewedItems={setReviewedItems} onTabChange={handleTabChange} onLogAction={(l) => setVaTaskLogs([l, ...vaTaskLogs])} onAcknowledgeAlert={handleAcknowledgeAlert} />}
                {activeTab === 'activeQueue' && <VAWorkQueue submissions={normalizedSubmissions} deals={allDeals} followUpTasks={followUpTasks} vaWorkQueue={vaWorkQueue} onUpdateSubmissions={setPortalSubmissions} onUpdateDeals={(d) => setHistory(d.map(item => ({ id: item.id, timestamp: Date.now(), data: item, content: null })))} onUpdateFollowUpTasks={() => {}} onUpdateVaQueue={setVaWorkQueue} onLogAction={() => {}} onManualReplyLog={() => {}} />}
                {activeTab === 'dealSubmissions' && <InternalSubmissionsManager submissions={normalizedSubmissions} buyers={buyers} settings={settings} portalUrl={publicPortalUrl} onUpdateSubmissions={setPortalSubmissions} onAccept={handleAcceptSubmission} />}
                {activeTab === 'dealIntake' && <DealIntakeGatekeeper data={data} onUpdate={setData} onSave={() => { setHistory([{ id: data.id, timestamp: Date.now(), data, content: null }, ...history]); setToast('Deal Saved'); }} />}
                {activeTab === 'dealDocs' && <ProofOfControlManager data={data} onUpdate={setData} vaMode={!isAdmin} />}
                {activeTab === 'followUps' && <FollowUpTaskManager tasks={followUpTasks} data={data} deals={allDeals} buyers={buyers} onUpdateStatus={() => {}} onUpdateStage={() => {}} onOpenOfferEntry={() => {}} onAddNote={() => {}} onDismissConflict={() => {}} />}
                {activeTab === 'globalBuyerDb' && <BuyerManager buyers={buyers} data={data} history={history} settings={settings} onUpdateBuyers={setBuyers} onUpdateSettings={setSettings} onTabChange={handleTabChange} />}
                {activeTab === 'buyerPipeline' && <BuyerPipelineManager data={data} onUpdateData={() => {}} />}
                {activeTab === 'biddingHub' && <OfferComparisonManager deals={allDeals} onUpdateDeals={handleUpdateDeals} />}
                {activeTab === 'partners' && <PartnerManager partners={partners} history={history} settings={settings} onUpdatePartners={setPartners} />}
                {activeTab === 'vaPerformance' && <VAPerformanceTracker logs={vaTaskLogs} submissions={normalizedSubmissions} settings={settings} queue={vaWorkQueue} followUpTasks={followUpTasks} />}
                {activeTab === 'vaAuditLogs' && <AuditLogViewer logs={auditLogs} />}
                {activeTab === 'systemHealth' && isAdmin && <SystemHealthDashboard deals={allDeals} buyers={buyers} submissions={normalizedSubmissions} tasks={tasks} auditLogs={auditLogs} onRepair={() => {}} onClearCache={() => {}} onRestartState={() => {}} />}
                {activeTab === 'smokeTest' && isAdmin && <GoLiveSmokeTest onUpdateHistory={setHistory} onUpdateBuyers={setBuyers} onUpdateSettings={setSettings} onTabChange={handleTabChange} currentBuyers={buyers} currentHistory={history} />}
                {activeTab === 'systemBackup' && isAdmin && <SystemBackup settings={settings} buyers={buyers} partners={partners} history={allDeals} submissions={normalizedSubmissions} tasks={tasks} alerts={alerts} />}
                {activeTab === 'systemSettings' && <SettingsManager settings={settings} onUpdate={setSettings} buyers={buyers} partners={partners} history={history} submissions={normalizedSubmissions} tasks={tasks} runtimeErrors={runtimeErrors} smokeReport={null} onLogAudit={() => {}} onApplyRestore={handleRestore} onLogAction={() => {}} onImport={() => {}} />}
              </div>
            </div>
          </div>
        </div>
      </div>
    </ErrorBoundary>
  );
}
