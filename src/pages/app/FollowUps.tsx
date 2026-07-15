
﻿import { useState, useMemo } from 'react'
import { useAppStore } from '../../store/useAppStore'
import { toast } from 'sonner'
import { Check, Calendar, X as CloseIcon, Plus, Users, Home, FileText, CheckCircle, Target, AlertTriangle, Zap, Clock, TrendingUp, Download } from 'lucide-react'
import DealTerminalDrawer from '../../components/inventory/DealTerminalDrawer'

const safeLower = (value: any) => String(value ?? '').toLowerCase();

export default function FollowUps() {
  const { 
    followUps, 
    completeFollowUp, 
    deals,
    buyers,
    logActivity,
    createTask,
    generateAutoFollowUpsFromInventory,
    generateAutoFollowUpsFromBuyers,
    getFollowUpStats,
    prioritizeFollowUps
  } = useAppStore()
  const [filter, setFilter] = useState<'all' | 'today' | 'tomorrow' | 'week' | 'overdue' | 'completed'>('all')
  const [taskTypeFilter, setTaskTypeFilter] = useState<string>('all')
  const [priorityFilter, setPriorityFilter] = useState<'all' | 'High' | 'Medium' | 'Low'>('all')
  const [assignedFilter, setAssignedFilter] = useState<string>('all')
  const [searchTerm, setSearchTerm] = useState('')
  const [sortBy, setSortBy] = useState<'priority' | 'due' | 'newest' | 'deal' | 'type'>('due')

  const [showGenerator, setShowGenerator] = useState(false)
  const [showNewTask, setShowNewTask] = useState(false)
  const [selectedFollowUp, setSelectedFollowUp] = useState<any>(null)
  const [selectedTimeline, setSelectedTimeline] = useState<any>(null)
  const [generatorData, setGeneratorData] = useState({ template: '24-hour buyer follow-up', subject: '', body: '' })

  // Reschedule modal state (supports single + bulk)
  const [showReschedule, setShowReschedule] = useState(false)
  const [rescheduleId, setRescheduleId] = useState<string | null>(null)
  const [rescheduleTargetIds, setRescheduleTargetIds] = useState<string[]>([]) // for bulk
  const [rescheduleDate, setRescheduleDate] = useState('')
  const [rescheduleTime, setRescheduleTime] = useState('')
  const [rescheduleNotes, setRescheduleNotes] = useState('')

  // Local drawer state for in-page deal viewing (no navigation, sidebar unchanged)
  const [drawerDealId, setDrawerDealId] = useState<string | null>(null)

  // Task selection for bulk actions
  const [selectedTaskIds, setSelectedTaskIds] = useState<string[]>([])

  // New Task form state
  const [newTaskForm, setNewTaskForm] = useState({
    name: '', dealId: '', buyerId: '', sellerId: '', dueDate: '', type: 'Buyer Follow-Up', priority: 'Medium', notes: '', recurringInterval: 0
  })

  const stats = getFollowUpStats()
  const allFollowUps = [...(followUps || [])]

  const getDeal = (id: string) => (deals || []).find((d: any) => d.id === id)
  const getBuyer = (id?: string) => id ? (buyers || []).find((b: any) => b.id === id) : null

  // Selection helpers (UI only)
  const toggleTask = (id: string, e?: any) => {
    if (e) e.stopPropagation()
    setSelectedTaskIds(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    )
  }

  const selectAllVisible = () => {
    const visibleIds = filtered.map(f => f.id)
    setSelectedTaskIds(visibleIds)
  }

  const clearSelection = () => setSelectedTaskIds([])

  const getVisibleSelectedCount = () => {
    return selectedTaskIds.filter(id => filtered.some(f => f.id === id)).length
  }

  const openBulkReschedule = () => {
    const visibleSelected = selectedTaskIds.filter(id => filtered.some(f => f.id === id))
    if (visibleSelected.length === 0) return

    setRescheduleTargetIds(visibleSelected)
    setRescheduleId(null)
    setRescheduleDate('')
    setRescheduleTime('')
    setRescheduleNotes(`Bulk reschedule of ${visibleSelected.length} tasks`)
    setShowReschedule(true)
  }

  const getVisibleSelected = () => selectedTaskIds.filter(id => filtered.some(f => f.id === id))

  const bulkComplete = () => {
    const targets = getVisibleSelected()
    targets.forEach(id => {
      const f = followUps.find((x: any) => x.id === id)
      if (f && !f.completed) {
        completeFollowUp(id)
        // Note: recurring auto-create is handled inside handleComplete if needed
      }
    })
    toast.success(`Completed ${targets.length} tasks`)
    clearSelection()
  }

  const bulkSkip = () => {
    const targets = getVisibleSelected()
    targets.forEach(id => completeFollowUp(id))
    toast.success(`Skipped ${targets.length} tasks`)
    clearSelection()
  }

  const bulkExport = () => {
    const targets = getVisibleSelected()
    const rows = targets.map(id => {
      const f = followUps.find((x: any) => x.id === id)
      if (!f) return ''
      const d = getDeal(f.dealId)
      return [
        f.type || 'Task',
        f.priority || 'Medium',
        d?.property?.address || '',
        new Date(f.dueDate).toLocaleDateString(),
        (f as any).assignee || 'Admin',
        f.notes || ''
      ].join(',')
    }).filter(Boolean)

    const csv = 'Type,Priority,Deal,Due,Assigned,Notes\n' + rows.join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'selected-tasks.csv'
    a.click()
    URL.revokeObjectURL(url)
    toast.success(`Exported ${rows.length} selected tasks`)
  }

  const bulkDelete = () => {
    const targets = getVisibleSelected()
    if (!confirm(`Delete ${targets.length} selected tasks? (This will mark them complete)`)) return
    targets.forEach(id => completeFollowUp(id))
    toast.success(`Deleted ${targets.length} tasks`)
    clearSelection()
  }

  // Smart filtering + search + sort + priority + assigned (all safe)
  const filtered = useMemo(() => {
    let list = allFollowUps.filter(f => {
      if (filter === 'completed') return f.completed
      if (f.completed) return false

      const due = new Date(f.dueDate || Date.now())
      const today = new Date(); today.setHours(0,0,0,0)
      const tomorrow = new Date(today); tomorrow.setDate(tomorrow.getDate() + 1)
      const weekEnd = new Date(today); weekEnd.setDate(weekEnd.getDate() + 7)

      if (filter === 'today') return due.toDateString() === today.toDateString()
      if (filter === 'tomorrow') return due.toDateString() === tomorrow.toDateString()
      if (filter === 'week') return due >= today && due <= weekEnd
      if (filter === 'overdue') return due <= new Date()
      return true
    })

    // Task type
    if (taskTypeFilter !== 'all') {
      list = list.filter(f => (f.type || 'Buyer Follow-Up') === taskTypeFilter)
    }

    // Priority
    if (priorityFilter !== 'all') {
      list = list.filter(f => (f.priority || 'Medium') === priorityFilter)
    }

    // Assigned (mock safe)
    if (assignedFilter !== 'all') {
      list = list.filter(f => {
        const assignee = (f as any).assignee || 'Admin'
        return assignee === assignedFilter
      })
    }

    // Search (deal / buyer / seller / title / notes) - null safe
    if (searchTerm.trim()) {
      const q = safeLower(searchTerm).trim()
      list = list.filter(f => {
        const deal = getDeal(f.dealId)
        const buyer = getBuyer(f.buyerId)
        const dealStr = safeLower(deal?.property?.address || '')
        const buyerStr = safeLower(buyer?.name || '')
        const sellerStr = safeLower(f.sellerId || '')
        const titleStr = safeLower(f.notes || f.type || '')
        return dealStr.includes(q) || buyerStr.includes(q) || sellerStr.includes(q) || titleStr.includes(q)
      })
    }

    // Sorting
    list = [...list].sort((a, b) => {
      if (sortBy === 'priority') {
        const order: any = { High: 3, Medium: 2, Low: 1 }
        return (order[b.priority] || 2) - (order[a.priority] || 2)
      }
      if (sortBy === 'newest') {
        return new Date(b.createdAt || b.dueDate).getTime() - new Date(a.createdAt || a.dueDate).getTime()
      }
      if (sortBy === 'deal') {
        const da = getDeal(a.dealId)?.property?.address || ''
        const db = getDeal(b.dealId)?.property?.address || ''
        return da.localeCompare(db)
      }
      if (sortBy === 'type') {
        return (a.type || '').localeCompare(b.type || '')
      }
      // default: due date
      return new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime()
    })

    // AI prioritize only on broad views
    if ((filter === 'all' || filter === 'overdue') && taskTypeFilter === 'all' && !searchTerm && priorityFilter === 'all') {
      list = prioritizeFollowUps(list)
    }

    return list
  }, [allFollowUps, filter, taskTypeFilter, priorityFilter, assignedFilter, searchTerm, sortBy])

  // getDeal / getBuyer defined above for useMemo safety (null-safe)

  const skipFollowUp = (id: string) => {
    completeFollowUp(id)
    toast('Task skipped')
  }

  const reschedule = (id: string) => {
    const f = followUps.find((x: any) => x.id === id)
    if (!f) return
    setRescheduleId(id)
    setRescheduleDate('')
    setRescheduleTime('')
    setRescheduleNotes((f.notes || f.type || '') + ' (rescheduled)')
    setShowReschedule(true)
  }

  const saveReschedule = () => {
    if (!rescheduleDate) {
      toast.error('Please select a date')
      return
    }

    // Build new due date
    let due = new Date(rescheduleDate)
    if (rescheduleTime) {
      const [hours, minutes] = rescheduleTime.split(':').map(Number)
      due.setHours(hours || 9, minutes || 0, 0, 0)
    } else {
      due.setHours(9, 0, 0, 0)
    }
    const dueIso = due.toISOString()

    const targets = rescheduleTargetIds.length > 0 
      ? rescheduleTargetIds 
      : (rescheduleId ? [rescheduleId] : [])

    if (targets.length === 0) return

    let count = 0
    targets.forEach(id => {
      const f = followUps.find((x: any) => x.id === id)
      if (!f) return

      createTask({
        dealId: f.dealId,
        buyerId: f.buyerId,
        sellerId: f.sellerId || undefined,
        type: f.type,
        priority: f.priority,
        notes: rescheduleNotes || (f.notes || f.type) + ' (rescheduled)',
        dueDate: dueIso
      })
      completeFollowUp(id)
      count++
    })

    toast.success(`Rescheduled ${count} task${count > 1 ? 's' : ''} to ${due.toLocaleDateString()}${rescheduleTime ? ' ' + rescheduleTime : ''}`)

    // Reset
    setShowReschedule(false)
    setRescheduleId(null)
    setRescheduleTargetIds([])
    setRescheduleDate('')
    setRescheduleTime('')
    setRescheduleNotes('')
  }

  const openDeal = (dealId: string) => {
    if (!dealId) {
      toast.error('Deal details unavailable.')
      return
    }
    setDrawerDealId(dealId)
    // Do NOT navigate — stay on Follow-Up Task Center, sidebar unchanged
  }

  const openGenerator = (f: any) => {
    setSelectedFollowUp(f)
    const deal = getDeal(f.dealId)
    const buyer = getBuyer(f.buyerId)
    setGeneratorData({
      template: f.type || '24-hour buyer follow-up',
      subject: `Follow-up: ${deal?.property.address || 'Deal'}`,
      body: `Hi ${buyer?.name || 'there'},\n\nFollowing up on the opportunity at ${deal?.property.address}.\n\nPlease let me know if you have any questions or need more information.\n\nBest,`
    })
    setShowGenerator(true)
  }

  // Task type color system (Disposition CRM)
  const getTaskTypeStyle = (type: string) => {
    const t = safeLower(type || 'Buyer Follow-Up')
    if (t.includes('urgent')) return { bg: 'bg-red-500/20 text-red-400', icon: AlertTriangle }
    if (t.includes('buyer')) return { bg: 'bg-blue-500/20 text-blue-400', icon: Users }
    if (t.includes('seller')) return { bg: 'bg-emerald-500/20 text-emerald-400', icon: Home }
    if (t.includes('document')) return { bg: 'bg-amber-500/20 text-amber-400', icon: FileText }
    if (t.includes('title') || t.includes('closing')) return { bg: 'bg-purple-500/20 text-purple-400', icon: CheckCircle }
    if (t.includes('dispo')) return { bg: 'bg-cyan-500/20 text-cyan-400', icon: Target }
    return { bg: 'bg-slate-500/20 text-slate-400', icon: Clock }
  }

  const getPriorityStyle = (priority: string) => {
    if (priority === 'High') return 'bg-red-500/20 text-red-400'
    if (priority === 'Medium') return 'bg-amber-500/20 text-amber-400'
    return 'bg-[#171B26] text-[#8B92A3]'
  }

  const getTaskBorderColor = (type: string, priority: string) => {
    const t = safeLower(type || '')
    const p = safeLower(priority || '')

    if (p === 'high' || t.includes('urgent')) return '#ef4444'      // red
    if (t.includes('title') || t.includes('closing')) return '#a78bfa' // purple
    if (t.includes('buyer')) return '#22c55e'                       // green
    if (t.includes('seller')) return '#3b82f6'                      // blue
    if (t.includes('document')) return '#f59e0b'                    // amber
    if (t.includes('dispo')) return '#67e8f9'                       // cyan
    return '#3b82f6'                                                // default blue/cyan
  }

  const openNewTask = () => {
    setNewTaskForm({
      name: '', dealId: '', buyerId: '', sellerId: '', 
      dueDate: new Date(Date.now() + 86400000 * 2).toISOString().slice(0,16),
      type: 'Buyer Follow-Up', priority: 'Medium', notes: '', recurringInterval: 0
    })
    setShowNewTask(true)
  }

  const submitNewTask = () => {
    if (!newTaskForm.name || !newTaskForm.dealId) {
      toast.error('Task name and deal are required')
      return
    }
    createTask({
      ...newTaskForm,
      buyerId: newTaskForm.buyerId || undefined,
      notes: newTaskForm.name + (newTaskForm.notes ? ' — ' + newTaskForm.notes : ''),
      dueDate: newTaskForm.dueDate ? new Date(newTaskForm.dueDate).toISOString() : new Date(Date.now() + 86400000*2).toISOString(),
      recurring: newTaskForm.recurringInterval > 0 ? { intervalDays: newTaskForm.recurringInterval, until: 'replied' } : null
    })
    toast.success('Task created')
    setShowNewTask(false)
  }

  const runAutoInventory = () => {
    const count = generateAutoFollowUpsFromInventory()
    toast.success(`Generated ${count} auto tasks from Inventory Hub`)
  }

  const runAutoBuyers = () => {
    const count = generateAutoFollowUpsFromBuyers()
    toast.success(`Generated ${count} auto buyer follow-up tasks`)
  }

  const handleComplete = (id: string, f: any) => {
    completeFollowUp(id)
    toast.success('Task completed')

    // Recurring support
    if (f.recurring?.intervalDays) {
      const nextDue = new Date(Date.now() + f.recurring.intervalDays * 86400000).toISOString()
      createTask({
        dealId: f.dealId,
        buyerId: f.buyerId,
        sellerId: f.sellerId || undefined,
        type: f.type,
        priority: f.priority,
        notes: f.notes + ' (recurring)',
        dueDate: nextDue,
        recurring: f.recurring
      })
      toast('Recurring follow-up scheduled')
    }
  }

  const copyEmail = (field: 'subject' | 'body' | 'full') => {
    const text = field === 'full' 
      ? `Subject: ${generatorData.subject}\n\n${generatorData.body}`
      : field === 'subject' ? generatorData.subject : generatorData.body
    navigator.clipboard.writeText(text)
    toast.success(`${field === 'full' ? 'Full email' : field} copied`)

    if (selectedFollowUp) {
      logActivity(selectedFollowUp.dealId, 'Follow-Up Email Generated', `Generated ${generatorData.template} for follow-up`)
    }
  }

  const generateFollowUp = () => {
    if (selectedFollowUp) {
      logActivity(selectedFollowUp.dealId, 'Follow-Up Email Generated', `Follow-up email created using ${generatorData.template}`)
      toast.success('Follow-up email generated and logged')
      setShowGenerator(false)
    }
  }

  return (
    <div>
      {/* Header */}
      <div className="flex justify-between items-end mb-4">
        <div>
          <div className="text-xs uppercase tracking-[2px] text-[#8B92A3]">OPERATIONS • DISPOSITION CRM</div>
          <div className="text-3xl font-semibold tracking-tight">Follow-Up Task Center</div>
          <div className="text-sm text-[#8B92A3] mt-1">Auto tasks • Smart prioritization • Recurring outreach</div>
        </div>
        <div className="flex gap-2">
          <button onClick={openNewTask} className="btn btn-green text-sm flex items-center gap-1">
            <Plus size={15} /> New Task
          </button>
          <button onClick={runAutoInventory} className="btn btn-ghost text-sm flex items-center gap-1">
            <Zap size={15} /> Generate From Inventory
          </button>
          <button onClick={runAutoBuyers} className="btn btn-ghost text-sm flex items-center gap-1">
            <Users size={15} /> Generate From Buyers
          </button>
          <button onClick={() => {
            // Trigger re-prioritization (already applied in filtered when 'all')
            toast.success('Tasks re-prioritized by AI urgency')
            setFilter('all'); setTaskTypeFilter('all')
          }} className="btn btn-ghost text-sm flex items-center gap-1">
            <TrendingUp size={15} /> Prioritize Tasks (AI)
          </button>
        </div>
      </div>

      {/* Dashboard KPI Cards - Tinted backgrounds + strong colored borders + glow + hover */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-6">
        {/* Pending Tasks - Blue tint */}
        <div className="card p-5 border border-[#3B82F6]/60 bg-[#1e3a8a]/15 hover:bg-[#1e3a8a]/25 hover:border-[#3B82F6] hover:-translate-y-[2px] hover:shadow-[0_0_25px_-5px_#3B82F6,0_10px_15px_-3px_rgb(0,0,0,0.4)] transition-all duration-200 group">
          <div className="flex items-center gap-2 text-[#60a5fa]">
            <Clock size={18} />
            <div className="text-xs font-semibold uppercase tracking-[1.5px]">Pending Tasks</div>
          </div>
          <div className="text-[42px] leading-none font-bold mt-2 tabular-nums text-[#dbeafe] group-hover:text-white transition-colors">{stats.pending}</div>
        </div>

        {/* Due Today - Amber tint */}
        <div className="card p-5 border border-[#f59e0b]/60 bg-[#78350f]/15 hover:bg-[#78350f]/25 hover:border-[#f59e0b] hover:-translate-y-[2px] hover:shadow-[0_0_25px_-5px_#f59e0b,0_10px_15px_-3px_rgb(0,0,0,0.4)] transition-all duration-200 group">
          <div className="flex items-center gap-2 text-[#fbbf24]">
            <Calendar size={18} />
            <div className="text-xs font-semibold uppercase tracking-[1.5px]">Due Today</div>
          </div>
          <div className="text-[42px] leading-none font-bold mt-2 tabular-nums text-[#fef3c7] group-hover:text-white transition-colors">{stats.dueToday}</div>
        </div>

        {/* Overdue - Red tint */}
        <div className="card p-5 border border-[#ef4444]/60 bg-[#7f1d1d]/15 hover:bg-[#7f1d1d]/25 hover:border-[#ef4444] hover:-translate-y-[2px] hover:shadow-[0_0_25px_-5px_#ef4444,0_10px_15px_-3px_rgb(0,0,0,0.4)] transition-all duration-200 group">
          <div className="flex items-center gap-2 text-[#f87171]">
            <AlertTriangle size={18} />
            <div className="text-xs font-semibold uppercase tracking-[1.5px]">Overdue</div>
          </div>
          <div className="text-[42px] leading-none font-bold mt-2 tabular-nums text-[#fecaca] group-hover:text-white transition-colors">{stats.overdue}</div>
        </div>

        {/* Completed This Week - Green tint */}
        <div className="card p-5 border border-[#22c55e]/60 bg-[#14532d]/15 hover:bg-[#14532d]/25 hover:border-[#22c55e] hover:-translate-y-[2px] hover:shadow-[0_0_25px_-5px_#22c55e,0_10px_15px_-3px_rgb(0,0,0,0.4)] transition-all duration-200 group">
          <div className="flex items-center gap-2 text-[#4ade80]">
            <CheckCircle size={18} />
            <div className="text-xs font-semibold uppercase tracking-[1.5px]">Completed This Week</div>
          </div>
          <div className="text-[42px] leading-none font-bold mt-2 tabular-nums text-[#dcfce7] group-hover:text-white transition-colors">{stats.completedThisWeek}</div>
        </div>

        {/* Auto-Generated - Cyan tint */}
        <div className="card p-5 border border-[#67e8f9]/60 bg-[#164e63]/15 hover:bg-[#164e63]/25 hover:border-[#67e8f9] hover:-translate-y-[2px] hover:shadow-[0_0_25px_-5px_#67e8f9,0_10px_15px_-3px_rgb(0,0,0,0.4)] transition-all duration-200 group">
          <div className="flex items-center gap-2 text-[#67e8f9]">
            <Zap size={18} />
            <div className="text-xs font-semibold uppercase tracking-[1.5px]">Auto-Generated</div>
          </div>
          <div className="text-[42px] leading-none font-bold mt-2 tabular-nums text-[#cffafe] group-hover:text-white transition-colors">{stats.autoGenerated}</div>
          <div className="text-[10px] text-[#64748b] mt-0.5">Inventory + Buyer signals</div>
        </div>
      </div>

      {/* Search + Sort + Additional Filters */}
      <div className="flex flex-wrap items-end gap-3 mb-3">
        <div className="flex-1 min-w-[220px]">
          <div className="text-[10px] uppercase tracking-widest text-[#8B92A3] mb-1">Search Tasks</div>
          <div className="relative">
            <input
              className="input w-full pl-3 text-sm"
              placeholder="Search deal, buyer, seller, task title, notes..."
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
            />
          </div>
        </div>

        <div>
          <div className="text-[10px] uppercase tracking-widest text-[#8B92A3] mb-1">Sort By</div>
          <select className="select text-sm" value={sortBy} onChange={e => setSortBy(e.target.value as any)}>
            <option value="due">Due Date</option>
            <option value="priority">Priority (High first)</option>
            <option value="newest">Newest Created</option>
            <option value="deal">Deal Name</option>
            <option value="type">Task Type</option>
          </select>
        </div>

        <div>
          <div className="text-[10px] uppercase tracking-widest text-[#8B92A3] mb-1">Priority</div>
          <select className="select text-sm" value={priorityFilter} onChange={e => setPriorityFilter(e.target.value as any)}>
            <option value="all">All Priority</option>
            <option value="High">High</option>
            <option value="Medium">Medium</option>
            <option value="Low">Low</option>
          </select>
        </div>

        <div>
          <div className="text-[10px] uppercase tracking-widest text-[#8B92A3] mb-1">Assigned To</div>
          <select className="select text-sm" value={assignedFilter} onChange={e => setAssignedFilter(e.target.value)}>
            <option value="all">All Users</option>
            <option value="Admin">Admin</option>
            <option value="VA">VA</option>
            <option value="Dispo">Dispo</option>
            <option value="Acquisition">Acquisition</option>
          </select>
        </div>

        <div className="ml-auto flex gap-2">
          <button
            onClick={() => {
              if (filtered.length === 0) return
              if (!confirm(`Mark all ${filtered.length} visible tasks complete?`)) return
              filtered.forEach(f => !f.completed && completeFollowUp(f.id))
              toast.success(`Marked ${filtered.length} tasks complete`)
            }}
            disabled={filtered.length === 0}
            className="btn btn-ghost text-sm disabled:opacity-40"
          >
            Mark All Visible Complete
          </button>
          <button
            onClick={() => {
              const rows = filtered.map(f => {
                const d = getDeal(f.dealId)
                return [
                  f.type || 'Task',
                  f.priority || 'Medium',
                  d?.property?.address || '',
                  new Date(f.dueDate).toLocaleDateString(),
                  (f as any).assignee || 'Admin',
                  f.notes || ''
                ].join(',')
              })
              const csv = 'Type,Priority,Deal,Due,Assigned,Notes\n' + rows.join('\n')
              const blob = new Blob([csv], { type: 'text/csv' })
              const url = URL.createObjectURL(blob)
              const a = document.createElement('a')
              a.href = url
              a.download = 'followup-tasks.csv'
              a.click()
              URL.revokeObjectURL(url)
              toast.success('Tasks exported')
            }}
            className="btn btn-ghost text-sm flex items-center gap-1"
          >
            <Download size={14} /> Export Tasks
          </button>
        </div>
      </div>

      {/* Selection Controls + Bulk Action Bar */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <input
              type="checkbox"
              checked={getVisibleSelectedCount() === filtered.length && filtered.length > 0}
              onChange={() => {
                if (getVisibleSelectedCount() === filtered.length) {
                  clearSelection()
                } else {
                  selectAllVisible()
                }
              }}
              className="w-4 h-4 accent-[#67E8F9]"
            />
            <span>Select All Visible</span>
          </label>
          {selectedTaskIds.length > 0 && (
            <button onClick={clearSelection} className="btn btn-ghost text-xs">Clear Selection</button>
          )}
        </div>

        {/* Bulk Action Bar */}
        {selectedTaskIds.length > 0 && (
          <div className="bg-[#171B26] border border-[#252A38] rounded px-4 py-2 flex flex-wrap items-center gap-2 text-sm">
            <span className="font-medium text-[#67E8F9]">{selectedTaskIds.length} selected</span>
            <button onClick={bulkComplete} className="btn btn-green text-xs">Complete Selected</button>
            <button onClick={bulkSkip} className="btn btn-ghost text-xs">Skip Selected</button>
            <button onClick={openBulkReschedule} className="btn btn-ghost text-xs">Reschedule Selected</button>
            <button onClick={bulkExport} className="btn btn-ghost text-xs flex items-center gap-1">
              <Download size={13} /> Export
            </button>
            <button onClick={bulkDelete} className="btn btn-ghost text-xs text-red-400">Delete Selected</button>
            <button onClick={clearSelection} className="btn btn-ghost text-xs ml-1">Clear</button>
          </div>
        )}
      </div>

      {/* Task List - Clean spacious cards, Deal first, structured sections, action footer */}
      <div className="space-y-3">
        {filtered.length === 0 && (
          <div className="empty-state py-12 text-center card">
            <Calendar className="mx-auto mb-3 text-[#8B92A3]" size={32} />
            <div className="font-medium">No active follow-ups</div>
            <div className="text-sm text-[#8B92A3] mt-1 mb-4">Try different filters or create new tasks</div>
            <div className="flex gap-2 justify-center flex-wrap">
              <button onClick={openNewTask} className="btn btn-green">+ New Task</button>
              <button onClick={runAutoInventory} className="btn btn-ghost">Generate From Inventory</button>
              <button onClick={runAutoBuyers} className="btn btn-ghost">Generate From Buyers</button>
            </div>
          </div>
        )}

        {filtered.map(f => {
          const deal = getDeal(f.dealId)
          const buyer = getBuyer(f.buyerId)
          const isOverdue = !f.completed && new Date(f.dueDate || 0) <= new Date()
          const typeStyle = getTaskTypeStyle(f.type)
          const TypeIcon = typeStyle.icon
          const assignee = (f as any).assignee || 'Admin'
          const isAuto = safeLower(f.notes || '').includes('auto') || f.type === 'Urgent' || f.type === 'Document Request'

          const taskTitle = f.name || (f.notes || f.type || 'Follow-up task').split('\n')[0].slice(0, 80)
          const dealAddress = deal?.property?.address || 'Unknown Deal'

          const borderColor = getTaskBorderColor(f.type, f.priority)

          const isSelected = selectedTaskIds.includes(f.id)

          return (
            <div 
              key={f.id} 
              className={`interactive-border bg-[#0F111A] border rounded-lg p-4 group transition-all duration-200 hover:shadow-[0_0_10px_3px_var(--glow-color),0_0_5px_1px_var(--glow-color)_inset] ${isSelected ? 'ring-2 ring-[#67E8F9]/60 border-[#67E8F9]/50' : ''}`}
              style={{ 
                '--border-color': borderColor,
                '--glow-color': borderColor,
                borderColor: `${borderColor}33`
              } as React.CSSProperties}
            >
              {/* Checkbox + Deal address row */}
              <div className="flex items-start gap-3 mb-1">
                <input
                  type="checkbox"
                  checked={isSelected}
                  onChange={(e) => toggleTask(f.id, e)}
                  onClick={e => e.stopPropagation()}
                  className="mt-1 w-4 h-4 accent-[#67E8F9] cursor-pointer"
                />
                <div 
                  className="font-semibold text-xl leading-tight text-[#E2E8F0] group-hover:text-[#67E8F9] cursor-pointer flex-1 transition-colors"
                  onClick={() => openDeal(f.dealId)}
                >
                  {dealAddress}
                </div>
              </div>

              {/* 2. Task title under deal */}
              <div className="font-medium text-base text-[#CBD5E1] mb-2.5">
                {taskTitle}
              </div>

              {/* 3. Badges row */}
              <div className="flex items-center gap-2 flex-wrap mb-3">
                <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded text-xs font-semibold ${typeStyle.bg}`}>
                  <TypeIcon size={14} /> {f.type || 'Task'}
                </span>
                <span className={`text-xs px-2.5 py-0.5 rounded font-semibold ${getPriorityStyle(f.priority)}`}>
                  {f.priority || 'Medium'}
                </span>
                <span className="text-xs px-2 py-0.5 rounded bg-[#171B26] text-[#94A3B8]">{assignee}</span>
                {isAuto && <span className="text-xs px-2 py-0.5 rounded bg-[#67E8F9]/10 text-[#67E8F9] font-medium">AUTO</span>}
                {!isAuto && <span className="text-xs px-2 py-0.5 rounded bg-[#64748B]/10 text-[#94A3B8]">MANUAL</span>}
                {f.recurring && <span className="text-xs px-2 py-0.5 rounded bg-[#A78BFA]/10 text-[#A78BFA]">RECURRING</span>}
              </div>

              {/* 4. 4-column detail grid */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-x-4 gap-y-2.5 mb-3 text-sm border-t border-[#252A38] pt-3">
                <div>
                  <div className="text-[10px] uppercase tracking-widest text-[#64748B]">Due Date</div>
                  <div className={`mt-0.5 font-medium ${isOverdue ? 'text-red-400' : 'text-[#E2E8F0]'}`}>
                    {new Date(f.dueDate || 0).toLocaleString()}
                  </div>
                </div>
                <div>
                  <div className="text-[10px] uppercase tracking-widest text-[#64748B]">Source</div>
                  <div className="mt-0.5 text-[#94A3B8]">{isAuto ? 'Auto-generated' : 'Manual'}</div>
                </div>
                <div>
                  <div className="text-[10px] uppercase tracking-widest text-[#64748B]">Related Contact</div>
                  <div className="mt-0.5 text-[#CBD5E1]">
                    {buyer ? buyer.name : (f.sellerId ? 'Seller related' : '—')}
                  </div>
                </div>
                <div>
                  <div className="text-[10px] uppercase tracking-widest text-[#64748B]">Notes / Activity</div>
                  <div className="mt-0.5 text-[#94A3B8] line-clamp-2 text-xs">
                    {f.notes || 'No additional notes'}
                  </div>
                </div>
              </div>

              {/* 5. Dedicated action footer */}
              <div className="flex flex-wrap items-center gap-2 pt-3 border-t border-[#252A38] text-xs">
                {!f.completed && (
                  <button 
                    onClick={() => handleComplete(f.id, f)} 
                    className="btn btn-green text-xs px-3.5 py-1.5 h-8 flex items-center justify-center gap-1"
                  >
                    <Check size={14} /> Complete
                  </button>
                )}
                {!f.completed && (
                  <button 
                    onClick={() => {
                      if ((f.priority || 'Medium') === 'High' && !confirm('High priority task. Skip anyway?')) return
                      skipFollowUp(f.id)
                    }} 
                    className="btn btn-ghost text-xs px-3 py-1.5 h-8"
                  >
                    Skip
                  </button>
                )}
                <button onClick={() => reschedule(f.id)} className="btn btn-ghost text-xs px-3 py-1.5 h-8">Reschedule</button>
                <button onClick={() => openDeal(f.dealId)} className="btn btn-ghost text-xs px-3 py-1.5 h-8">Open Deal</button>
                <button onClick={() => openGenerator(f)} className="btn btn-primary text-xs px-3 py-1.5 h-8">Email</button>
                <button onClick={() => setSelectedTimeline(f)} className="btn btn-ghost text-xs px-3 py-1.5 h-8">Timeline</button>
              </div>
            </div>
          )
        })}
      </div>

      {/* Email Generator Modal (kept & enhanced) */}
      {showGenerator && selectedFollowUp && (
        <div className="fixed inset-0 bg-black/70 z-[200] flex items-center justify-center p-4">
          <div className="card w-full max-w-2xl p-6">
            <div className="flex justify-between mb-4">
              <div className="font-semibold">Follow-Up Email Generator</div>
              <button onClick={() => setShowGenerator(false)}><CloseIcon size={18} /></button>
            </div>
            <div className="space-y-3">
              <div>
                <div className="text-xs text-[#8B92A3]">Template</div>
                <select className="select w-full" value={generatorData.template} onChange={e => setGeneratorData({...generatorData, template: e.target.value})}>
                  <option>24-hour buyer follow-up</option>
                  <option>48-hour buyer follow-up</option>
                  <option>More info requested follow-up</option>
                  <option>NDA/BIO follow-up</option>
                  <option>Offer follow-up</option>
                  <option>Closing update follow-up</option>
                </select>
              </div>
              <div><div className="text-xs text-[#8B92A3]">Subject</div><input className="input" value={generatorData.subject} onChange={e => setGeneratorData({...generatorData, subject: e.target.value})} /></div>
              <div><div className="text-xs text-[#8B92A3]">Body</div><textarea className="input h-40" value={generatorData.body} onChange={e => setGeneratorData({...generatorData, body: e.target.value})} /></div>
            </div>
            <div className="flex gap-2 mt-4">
              <button onClick={() => copyEmail('subject')} className="btn btn-ghost flex-1">Copy Subject</button>
              <button onClick={() => copyEmail('body')} className="btn btn-ghost flex-1">Copy Body</button>
              <button onClick={() => copyEmail('full')} className="btn btn-ghost flex-1">Copy Full Email</button>
              <button onClick={generateFollowUp} className="btn btn-green flex-1">Generate & Log</button>
            </div>
          </div>
        </div>
      )}

      {/* + New Task Modal (full Disposition CRM form) */}
      {showNewTask && (
        <div className="fixed inset-0 bg-black/70 z-[210] flex items-center justify-center p-4">
          <div className="card w-full max-w-xl p-6">
            <div className="flex justify-between mb-4">
              <div className="font-semibold text-lg">Create New Task</div>
              <button onClick={() => setShowNewTask(false)}><CloseIcon size={18} /></button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="md:col-span-2">
                <div className="text-xs text-[#8B92A3] mb-1">Task Name / Description</div>
                <input className="input w-full" value={newTaskForm.name} onChange={e => setNewTaskForm({...newTaskForm, name: e.target.value})} placeholder="Send OM to top 5 buyers" />
              </div>

              <div>
                <div className="text-xs text-[#8B92A3] mb-1">Related Deal *</div>
                <select className="select w-full" value={newTaskForm.dealId} onChange={e => setNewTaskForm({...newTaskForm, dealId: e.target.value})}>
                  <option value="">Select deal...</option>
                  {deals.map(d => <option key={d.id} value={d.id}>{d.property.address} — {d.status}</option>)}
                </select>
              </div>
              <div>
                <div className="text-xs text-[#8B92A3] mb-1">Related Buyer</div>
                <select className="select w-full" value={newTaskForm.buyerId || ''} onChange={e => setNewTaskForm({...newTaskForm, buyerId: e.target.value || ''})}>
                  <option value="">None / General</option>
                  {buyers.map(b => <option key={b.id} value={b.id}>{b.name} ({b.status})</option>)}
                </select>
              </div>

              <div>
                <div className="text-xs text-[#8B92A3] mb-1">Task Type</div>
                <select className="select w-full" value={newTaskForm.type} onChange={e => setNewTaskForm({...newTaskForm, type: e.target.value})}>
                  <option>Buyer Follow-Up</option>
                  <option>Seller Follow-Up</option>
                  <option>Document Request</option>
                  <option>Title / Closing</option>
                  <option>Dispo Activity</option>
                  <option>Urgent</option>
                </select>
              </div>
              <div>
                <div className="text-xs text-[#8B92A3] mb-1">Priority</div>
                <select className="select w-full" value={newTaskForm.priority} onChange={e => setNewTaskForm({...newTaskForm, priority: e.target.value})}>
                  <option>High</option><option>Medium</option><option>Low</option>
                </select>
              </div>

              <div>
                <div className="text-xs text-[#8B92A3] mb-1">Due Date</div>
                <input type="datetime-local" className="input w-full" value={newTaskForm.dueDate} onChange={e => setNewTaskForm({...newTaskForm, dueDate: e.target.value})} />
              </div>
              <div>
                <div className="text-xs text-[#8B92A3] mb-1">Recurring (every X days, 0 = none)</div>
                <input type="number" className="input w-full" value={newTaskForm.recurringInterval} onChange={e => setNewTaskForm({...newTaskForm, recurringInterval: parseInt(e.target.value) || 0})} />
              </div>

              <div className="md:col-span-2">
                <div className="text-xs text-[#8B92A3] mb-1">Notes / Details</div>
                <textarea className="input w-full h-20" value={newTaskForm.notes} onChange={e => setNewTaskForm({...newTaskForm, notes: e.target.value})} placeholder="Send package, ask for proof of funds..." />
              </div>
            </div>

            <div className="flex gap-2 mt-5">
              <button onClick={() => setShowNewTask(false)} className="btn btn-ghost flex-1">Cancel</button>
              <button onClick={submitNewTask} className="btn btn-green flex-1">Create Task</button>
            </div>
            <div className="text-[10px] text-[#8B92A3] mt-2 text-center">Tasks are stored with full deal/buyer association and appear in prioritization.</div>
          </div>
        </div>
      )}

      {/* Task Timeline Modal (Activity per task + deal) */}
      {selectedTimeline && (
        <div className="fixed inset-0 bg-black/70 z-[210] flex items-center justify-center p-4" onClick={() => setSelectedTimeline(null)}>
          <div className="card w-full max-w-lg p-6" onClick={e => e.stopPropagation()}>
            <div className="flex justify-between mb-4">
              <div>
                <div className="font-semibold">Task Timeline</div>
                <div className="text-sm text-[#8B92A3]">{getDeal(selectedTimeline.dealId)?.property.address}</div>
              </div>
              <button onClick={() => setSelectedTimeline(null)}><CloseIcon size={18} /></button>
            </div>

            <div className="space-y-3 text-sm">
              <div className="text-[#8B92A3] text-xs uppercase tracking-widest">Recent Activity for this Deal</div>
              {(useAppStore.getState().getActivities?.(selectedTimeline.dealId) || []).slice(-6).reverse().map((a: any, i: number) => (
                <div key={i} className="flex gap-3 text-xs">
                  <div className="w-28 text-[#8B92A3] shrink-0">{new Date(a.timestamp).toLocaleString()}</div>
                  <div><span className="font-medium text-[#CBD5E1]">{a.type}</span> — {a.description}</div>
                </div>
              ))}
              {(!useAppStore.getState().getActivities || (useAppStore.getState().getActivities(selectedTimeline.dealId) || []).length === 0) && (
                <div className="text-[#8B92A3] text-xs">No additional activity logged yet.</div>
              )}
              <div className="pt-2 border-t border-[#252A38] text-xs text-[#67E8F9]">Task created • Auto-prioritized based on urgency signals</div>
            </div>
          </div>
        </div>
      )}

      {/* Reschedule Modal - Calendar + Quick options (supports single + bulk) */}
      {showReschedule && (rescheduleId || rescheduleTargetIds.length > 0) && (
        <div className="fixed inset-0 bg-black/70 z-[210] flex items-center justify-center p-4">
          <div className="card w-full max-w-md p-6">
            <div className="flex justify-between mb-4">
              <div className="font-semibold text-lg">
                {rescheduleTargetIds.length > 0 
                  ? `Reschedule ${rescheduleTargetIds.length} Tasks` 
                  : 'Reschedule Task'}
              </div>
              <button onClick={() => setShowReschedule(false)}><CloseIcon size={18} /></button>
            </div>

            {/* Quick select buttons */}
            <div className="mb-4">
              <div className="text-xs uppercase tracking-widest text-[#8B92A3] mb-2">Quick Options</div>
              <div className="flex flex-wrap gap-2">
                {[1, 3, 7, 14].map(days => (
                  <button
                    key={days}
                    onClick={() => {
                      const d = new Date(Date.now() + days * 86400000)
                      setRescheduleDate(d.toISOString().split('T')[0])
                      if (!rescheduleTime) setRescheduleTime('09:00')
                    }}
                    className="btn btn-ghost text-xs px-3 py-1"
                  >
                    {days === 1 ? 'Tomorrow' : `${days} Days`}
                  </button>
                ))}
              </div>
            </div>

            {/* Calendar + Time */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-4">
              <div>
                <div className="text-xs text-[#8B92A3] mb-1">New Due Date *</div>
                <input
                  type="date"
                  className="input w-full"
                  value={rescheduleDate}
                  onChange={e => setRescheduleDate(e.target.value)}
                />
              </div>
              <div>
                <div className="text-xs text-[#8B92A3] mb-1">Time (optional)</div>
                <input
                  type="time"
                  className="input w-full"
                  value={rescheduleTime}
                  onChange={e => setRescheduleTime(e.target.value)}
                />
              </div>
            </div>

            {/* Notes */}
            <div className="mb-4">
              <div className="text-xs text-[#8B92A3] mb-1">Notes</div>
              <textarea
                className="input w-full h-20"
                value={rescheduleNotes}
                onChange={e => setRescheduleNotes(e.target.value)}
                placeholder="Reason for reschedule..."
              />
            </div>

            {/* Preview */}
            {rescheduleDate && (
              <div className="mb-4 p-3 bg-[#171B26] rounded text-sm">
                <div className="text-[#8B92A3] text-xs">New Due Date</div>
                <div className="font-medium text-[#E2E8F0]">
                  {new Date(rescheduleDate + (rescheduleTime ? 'T' + rescheduleTime : 'T09:00')).toLocaleString()}
                </div>
              </div>
            )}

            <div className="flex gap-2">
              <button onClick={() => setShowReschedule(false)} className="btn btn-ghost flex-1">Cancel</button>
              <button 
                onClick={saveReschedule} 
                disabled={!rescheduleDate}
                className="btn btn-green flex-1 disabled:opacity-50"
              >
                Save Reschedule
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Local Deal Detail Drawer (in-page only - no navigation, sidebar stays on Follow-Ups) */}
      {drawerDealId && (
        <DealTerminalDrawer
          dealId={drawerDealId}
          onClose={() => setDrawerDealId(null)}
        />
      )}
    </div>
  )
}


