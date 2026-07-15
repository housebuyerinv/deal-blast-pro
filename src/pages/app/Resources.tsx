
﻿import { useEffect, useMemo, useState } from 'react'
import { Upload, Download, Plus, Trash2, Pencil } from 'lucide-react'
import { toast } from 'sonner'
import { useAppStore } from '../../store/useAppStore'

const safeLower = (value: any) => String(value ?? '').toLowerCase();

type ResourceType =
  | 'Buyer'
  | 'Lender'
  | 'Title Company'
  | 'Contractor'
  | 'Realtor'
  | 'Attorney'
  | 'Insurance'
  | 'Property Manager'
  | 'Vendor'
  | 'JV Partner'

type Visibility = 'private' | 'shared'
type ResourceView = ResourceType | 'All' | 'Shared'

type Resource = {
  id: string
  type: ResourceType
  company: string
  contactName: string
  email: string
  phone: string
  states: string
  tags: string
  notes: string
  visibility: Visibility
  createdAt: string
  updatedAt: string
}

const STORAGE_KEY = 'deal_blast_pro_resources_v1'

const RESOURCE_TYPES: ResourceType[] = [
  'Buyer',
  'Lender',
  'Title Company',
  'Contractor',
  'Realtor',
  'Attorney',
  'Insurance',
  'Property Manager',
  'Vendor',
  'JV Partner',
]

const RESOURCE_LABELS: Record<ResourceType, string> = {
  Buyer: 'Buyers',
  Lender: 'Lenders',
  'Title Company': 'Title Companies',
  Contractor: 'Contractors',
  Realtor: 'Realtors',
  Attorney: 'Attorneys',
  Insurance: 'Insurance',
  'Property Manager': 'Property Managers',
  Vendor: 'Vendors',
  'JV Partner': 'JV Partners',
}

function createId(prefix = 'resource') {
  return crypto.randomUUID ? crypto.randomUUID() : `${prefix}-${Date.now()}-${Math.random()}`
}

function escapeCsv(value: any) {
  const s = String(value ?? '')
  if (s.includes(',') || s.includes('"') || s.includes('\n')) {
    return `"${s.replace(/"/g, '""')}"`
  }
  return s
}

function parseCsvLine(line: string) {
  const result: string[] = []
  let current = ''
  let inQuotes = false

  for (let i = 0; i < line.length; i++) {
    const char = line[i]
    const next = line[i + 1]

    if (char === '"' && inQuotes && next === '"') {
      current += '"'
      i++
    } else if (char === '"') {
      inQuotes = !inQuotes
    } else if (char === ',' && !inQuotes) {
      result.push(current.trim())
      current = ''
    } else {
      current += char
    }
  }

  result.push(current.trim())
  return result
}

function normalizeHeader(h: string) {
  return safeLower(h).replace(/[^a-z0-9]/g, '')
}

function extractEmail(value: string) {
  return value.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i)?.[0] || ''
}

function extractPhone(value: string) {
  return value.match(/(\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/)?.[0]?.trim() || ''
}

function cleanPhone(value: string) {
  return value.replace(/[^\d]/g, '').replace(/^1/, '').replace(/^(\d{3})(\d{3})(\d{4})$/, '$1-$2-$3')
}

function guessResourceFromRaw(raw: string, defaultType: ResourceType): Resource {
  const now = new Date().toISOString()
  const email = extractEmail(raw)
  const phone = cleanPhone(extractPhone(raw))

  let cleaned = raw
    .replace(email, '')
    .replace(extractPhone(raw), '')
    .replace(/[(),<>]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

  const parts = cleaned
    .split(/\s[-–—|/]\s| - | \| |;/)
    .map(p => p.trim())
    .filter(Boolean)

  let contactName = ''
  let company = ''

  if (parts.length >= 2) {
    contactName = parts[0]
    company = parts[1]
  } else {
    contactName = cleaned
  }

  const tagHints: string[] = []

  if (/dscr/i.test(raw)) tagHints.push('DSCR')
  if (/hard money/i.test(raw)) tagHints.push('Hard Money')
  if (/transactional/i.test(raw)) tagHints.push('Transactional Funding')
  if (/emd/i.test(raw)) tagHints.push('EMD Funding')
  if (/double close/i.test(raw)) tagHints.push('Double Close')
  if (/commercial/i.test(raw)) tagHints.push('Commercial')
  if (/sba/i.test(raw)) tagHints.push('SBA')
  if (/business/i.test(raw)) tagHints.push('Business Funding')
  if (/bridge/i.test(raw)) tagHints.push('Bridge')
  if (/fix|flip/i.test(raw)) tagHints.push('Fix & Flip')

  return {
    id: createId('resource'),
    type: defaultType,
    company,
    contactName,
    email,
    phone,
    states: /nationwide/i.test(raw) ? 'Nationwide' : '',
    tags: tagHints.length ? Array.from(new Set(tagHints)).join(', ') : defaultType,
    notes: raw,
    visibility: 'private',
    createdAt: now,
    updatedAt: now,
  }
}

function makeResource(row: Record<string, string>, defaultType: ResourceType): Resource {
  const now = new Date().toISOString()
  const rowText = Object.values(row).join(' ')

  const get = (...keys: string[]) => {
    for (const key of keys) {
      const found = Object.keys(row).find(k => normalizeHeader(k) === normalizeHeader(key))
      if (found && row[found]) return row[found]
    }
    return ''
  }

  const rawType = get('type', 'resourceType', 'category')
  const safeType = RESOURCE_TYPES.includes(rawType as ResourceType)
    ? rawType as ResourceType
    : defaultType

  const fallbackEmail =
    get('email', 'emailAddress') ||
    extractEmail(rowText)

  const fallbackPhone =
    get('phone', 'phoneNumber', 'mobile', 'cell') ||
    cleanPhone(extractPhone(rowText))

  const company =
    get('company', 'companyName', 'business', 'organization') ||
    ''

  const contactName =
    get('contactName', 'name', 'contact', 'fullName', 'person') ||
    ''

  const notes =
    get('notes', 'criteria', 'buyBox', 'description', 'raw') ||
    rowText

  return {
    id: createId('resource'),
    type: safeType,
    company,
    contactName,
    email: fallbackEmail,
    phone: fallbackPhone,
    states: get('states', 'markets', 'state', 'locations', 'coverage'),
    tags: get('tags', 'assetTypes', 'specialty', 'loanTypes', 'trade') || safeType,
    notes,
    visibility: get('visibility') === 'shared' ? 'shared' : 'private',
    createdAt: now,
    updatedAt: now,
  }
}

export default function Resources() {
  const { buyers } = useAppStore()

  const [resources, setResources] = useState<Resource[]>([])
  const [activeType, setActiveType] = useState<ResourceType>('Buyer')
  const [activeView, setActiveView] = useState<ResourceView>('Buyer')
  const [search, setSearch] = useState('')
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [showAdd, setShowAdd] = useState(false)
  const [showEdit, setShowEdit] = useState(false)
  const [editingResource, setEditingResource] = useState<Resource | null>(null)
  const [form, setForm] = useState<Partial<Resource>>({
    type: 'Buyer',
    visibility: 'private',
  })

  useEffect(() => {
    if (!showAdd) return
    setForm(prev => ({
      ...prev,
      type: activeType,
      visibility: prev.visibility || 'private',
    }))
  }, [activeType, showAdd])

  const buyerResources: Resource[] = useMemo(() => {
    return (buyers || []).map((b: any) => ({
      id: 'buyer-' + String(b.id || b.email || Math.random()),
      type: 'Buyer' as ResourceType,
      company: b.company || '',
      contactName: b.name || '',
      email: b.email || '',
      phone: b.phone || '',
      states: (b.markets || []).join(', '),
      tags: [...(b.assetTypes || []), b.type, b.status].filter(Boolean).join(', '),
      notes: b.notes || b.criteria || '',
      visibility: 'private' as Visibility,
      createdAt: b.createdAt || new Date().toISOString(),
      updatedAt: b.updatedAt || b.createdAt || new Date().toISOString(),
    }))
  }, [buyers])

  const allResources = useMemo(() => [...buyerResources, ...resources], [buyerResources, resources])

  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY)
      if (saved) setResources(JSON.parse(saved))
    } catch {}
  }, [])

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(resources))
    } catch {}
  }, [resources])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()

    return allResources.filter(r => {
      const viewMatch =
        activeView === 'All' ||
        (activeView === 'Shared' && r.visibility === 'shared') ||
        r.type === activeView

      const searchMatch =
        !q ||
        safeLower(r.company).includes(q) ||
        safeLower(r.contactName).includes(q) ||
        safeLower(r.email).includes(q) ||
        safeLower(r.phone).includes(q) ||
        safeLower(r.states).includes(q) ||
        safeLower(r.tags).includes(q) ||
        safeLower(r.notes).includes(q)

      return viewMatch && searchMatch
    })
  }, [allResources, activeView, search])

  const counts = {
    total: allResources.length,
    buyers: allResources.filter(r => r.type === 'Buyer').length,
    lenders: allResources.filter(r => r.type === 'Lender').length,
    title: allResources.filter(r => r.type === 'Title Company').length,
    contractors: allResources.filter(r => r.type === 'Contractor').length,
    jv: allResources.filter(r => r.type === 'JV Partner').length,
    shared: allResources.filter(r => r.visibility === 'shared').length,
  }

  const importFile = async (file: File, defaultType: ResourceType) => {
    const text = await file.text()
    const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean)

    if (!lines.length) return toast.error('Empty file')

    let imported: Resource[] = []

    const firstLine = safeLower(lines[0])
    const hasCsvHeader =
      firstLine.includes('email') ||
      firstLine.includes('company') ||
      firstLine.includes('phone') ||
      firstLine.includes('contact') ||
      firstLine.includes('typename') ||
      firstLine.includes('type')

    if (hasCsvHeader) {
      const headers = parseCsvLine(lines[0])
      imported = lines
        .slice(1)
        .map(line => {
          const cols = parseCsvLine(line)
          const row: Record<string, string> = {}

          headers.forEach((h, i) => {
            row[h] = cols[i] || ''
          })

          if (cols.length === 1 && cols[0]) {
            return guessResourceFromRaw(cols[0], defaultType)
          }

          return makeResource(row, defaultType)
        })
        .filter(r => r.email || r.phone || r.company || r.contactName || r.notes)
    } else {
      imported = lines
        .map(line => guessResourceFromRaw(line, defaultType))
        .filter(r => r.email || r.phone || r.company || r.contactName || r.notes)
    }

    setResources(prev => {
      const existing = new Set(
        [...prev, ...buyerResources]
          .map(r => safeLower(r.email))
          .filter(Boolean)
      )

      const fresh = imported.filter(r => !r.email || !existing.has(safeLower(r.email)))

      if (!fresh.length) {
        toast.error('No new resources imported. They may already exist.')
        return prev
      }

      toast.success(`Imported ${fresh.length} ${RESOURCE_LABELS[defaultType]}`)
      return [...fresh, ...prev]
    })
  }

  const exportCsv = () => {
    const headers = [
      'type',
      'company',
      'contactName',
      'email',
      'phone',
      'states',
      'tags',
      'visibility',
      'notes',
      'createdAt',
      'updatedAt',
    ]

    const rows = filtered.map(r => headers.map(h => escapeCsv((r as any)[h])).join(','))
    const csv = [headers.join(','), ...rows].join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')

    a.href = url
    a.download = `deal-blast-pro-resources-${String(activeView).replace(/\s+/g, '-')}.csv`
    a.click()

    URL.revokeObjectURL(url)
  }

  const openAddModal = () => {
    setForm({
      type: activeType,
      visibility: 'private',
    })
    setShowAdd(true)
  }

  const addResource = () => {
    const now = new Date().toISOString()
    const selectedType = (form.type as ResourceType) || activeType

    const resource: Resource = {
      id: createId('resource'),
      type: selectedType,
      company: form.company || '',
      contactName: form.contactName || '',
      email: form.email || '',
      phone: form.phone || '',
      states: form.states || '',
      tags: form.tags || '',
      notes: form.notes || '',
      visibility: (form.visibility as Visibility) || 'private',
      createdAt: now,
      updatedAt: now,
    }

    if (!resource.email && !resource.phone && !resource.company && !resource.contactName) {
      return toast.error('Add at least a name, company, email, or phone')
    }

    setResources(prev => [resource, ...prev])
    setForm({ type: activeType, visibility: 'private' })
    setShowAdd(false)
    toast.success(`${resource.type} resource added`)
  }

  const openEditModal = (resource: Resource) => {
    if (resource.id.startsWith('buyer-')) {
      toast.error('Buyer DB records must be edited in Global Buyer DB')
      return
    }

    setEditingResource({ ...resource })
    setShowEdit(true)
  }

  const saveEditResource = () => {
    if (!editingResource) return

    if (
      !editingResource.email &&
      !editingResource.phone &&
      !editingResource.company &&
      !editingResource.contactName
    ) {
      return toast.error('Add at least a name, company, email, or phone')
    }

    setResources(prev =>
      prev.map(r =>
        r.id === editingResource.id
          ? {
              ...editingResource,
              updatedAt: new Date().toISOString(),
            }
          : r
      )
    )

    setShowEdit(false)
    setEditingResource(null)
    toast.success('Resource updated')
  }

  const deleteSelected = () => {
    const deletableIds = selectedIds.filter(id => !id.startsWith('buyer-'))

    if (!selectedIds.length) return toast.error('No resources selected')
    if (!deletableIds.length) return toast.error('Buyer DB records cannot be deleted here')
    if (!confirm(`Delete ${deletableIds.length} selected saved resources?`)) return

    setResources(prev => prev.filter(r => !deletableIds.includes(r.id)))
    setSelectedIds([])
    toast.success('Deleted selected resources')
  }

  const deleteAll = () => {
    const deletable = resources.filter(r => r.type === activeType)

    if (!deletable.length) {
      return toast.error(`No saved ${RESOURCE_LABELS[activeType]} to delete`)
    }

    if (!confirm(`Delete ALL saved ${RESOURCE_LABELS[activeType]}? Buyer DB records will not be deleted.`)) return

    setResources(prev => prev.filter(r => r.type !== activeType))
    setSelectedIds([])
    toast.success(`Deleted saved ${RESOURCE_LABELS[activeType]}`)
  }

  const toggleSelected = (id: string) => {
    setSelectedIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id])
  }

  const changeActiveType = (type: ResourceType) => {
    setActiveType(type)
    setActiveView(type)
    setSelectedIds([])
    setSearch('')
    setForm(prev => ({
      ...prev,
      type,
    }))
  }

  const changeActiveView = (view: ResourceView) => {
    setActiveView(view)
    setSelectedIds([])
    setSearch('')

    if (view !== 'All' && view !== 'Shared') {
      setActiveType(view)
      setForm(prev => ({
        ...prev,
        type: view,
      }))
    }
  }

  const currentLabel =
    activeView === 'All'
      ? 'All Resources'
      : activeView === 'Shared'
        ? 'Shared Resources'
        : RESOURCE_LABELS[activeView]

  const importLabel = RESOURCE_LABELS[activeType]

  const kpiCards: Array<{ label: string; value: number; style: string; view: ResourceView }> = [
    { label: 'Total Resources', value: counts.total, style: 'bg-green-500/15 border-green-500/50 text-green-400 shadow-green-500/20', view: 'All' },
    { label: 'Buyers', value: counts.buyers, style: 'bg-blue-500/15 border-blue-500/50 text-blue-400 shadow-blue-500/20', view: 'Buyer' },
    { label: 'Lenders', value: counts.lenders, style: 'bg-emerald-500/15 border-emerald-500/50 text-emerald-400 shadow-emerald-500/20', view: 'Lender' },
    { label: 'Title Companies', value: counts.title, style: 'bg-amber-500/15 border-amber-500/50 text-amber-400 shadow-amber-500/20', view: 'Title Company' },
    { label: 'Contractors', value: counts.contractors, style: 'bg-orange-500/15 border-orange-500/50 text-orange-400 shadow-orange-500/20', view: 'Contractor' },
    { label: 'JV Partners', value: counts.jv, style: 'bg-violet-500/15 border-violet-500/50 text-violet-400 shadow-violet-500/20', view: 'JV Partner' },
    { label: 'Shared', value: counts.shared, style: 'bg-cyan-500/15 border-cyan-500/50 text-cyan-400 shadow-cyan-500/20', view: 'Shared' },
  ]

  return (
    <div>
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 mb-4">
        <div>
          <div className="uppercase tracking-widest text-xs text-[#8B92A3]">RESOURCE HUB</div>
          <div className="text-3xl font-semibold tracking-tight">Real Estate Network Resources</div>
          <div className="text-sm text-[#8B92A3]">
            Buyers, lenders, title companies, contractors, vendors, JV partners, and future community resources.
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <button onClick={openAddModal} className="btn btn-primary flex items-center gap-2">
            <Plus size={16} /> Add {activeType}
          </button>

          <button onClick={exportCsv} className="btn btn-ghost flex items-center gap-2">
            <Download size={16} /> Export {currentLabel}
          </button>

          <button onClick={deleteSelected} className="btn btn-ghost text-red-400 flex items-center gap-2">
            <Trash2 size={16} /> Delete Selected
          </button>

          <button onClick={deleteAll} className="btn btn-ghost text-red-400">
            Delete Saved {currentLabel}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-7 gap-2 mb-4">
        {kpiCards.map(card => {
          const isActive = activeView === card.view

          return (
            <button
              key={card.label}
              type="button"
              onClick={() => changeActiveView(card.view)}
              className={`rounded-xl p-4 border shadow-lg text-left transition-all hover:scale-[1.02] hover:ring-2 hover:ring-white/20 ${card.style} ${
                isActive ? 'ring-2 ring-white/40 scale-[1.02]' : ''
              }`}
            >
              <div className="text-2xl font-bold tabular-nums">{card.value}</div>
              <div className="text-xs text-[#D1D5DB]">{card.label}</div>
            </button>
          )
        })}
      </div>

      <div className="card p-3 mb-4">
        <div className="flex flex-col lg:flex-row gap-2 lg:items-center">
          <div className="flex-1">
            <input
              className="input w-full"
              placeholder={`Search ${safeLower(currentLabel)} by company, contact, email, phone, market, tag, or notes...`}
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>

          <select
            className="select"
            value={activeType}
            onChange={e => changeActiveType(e.target.value as ResourceType)}
          >
            {RESOURCE_TYPES.map(t => (
              <option key={t} value={t}>
                {RESOURCE_LABELS[t]}
              </option>
            ))}
          </select>

          <label className="btn btn-ghost flex items-center gap-2 cursor-pointer">
            <Upload size={16} /> Import {importLabel}
            <input
              type="file"
              accept=".csv,.txt"
              className="hidden"
              onChange={e => {
                const file = e.target.files?.[0]
                if (file) importFile(file, activeType)
                e.currentTarget.value = ''
              }}
            />
          </label>
        </div>

        <div className="flex flex-wrap gap-1 mt-3 text-xs">
          {RESOURCE_TYPES.map(t => (
            <button
              key={t}
              onClick={() => changeActiveType(t)}
              className={`btn btn-ghost px-2 py-0.5 ${activeView === t ? 'ring-1 ring-[#22C55E]' : ''}`}
            >
              {RESOURCE_LABELS[t]}
            </button>
          ))}
        </div>
      </div>

      {selectedIds.length > 0 && (
        <div className="mb-3 flex items-center gap-3 bg-[#171B26] border border-[#22c55e]/50 rounded-xl px-3 py-2 text-sm">
          <span className="text-[#22C55E] font-medium">{selectedIds.length} selected</span>
          <button onClick={deleteSelected} className="btn btn-ghost text-xs text-red-400">
            Delete Selected
          </button>
          <button onClick={() => setSelectedIds([])} className="btn btn-ghost text-xs">
            Clear
          </button>
        </div>
      )}

      <div className="card overflow-hidden">
        <div className="overflow-auto">
          <table className="w-full min-w-[1500px] text-sm">
            <thead className="bg-[#0F111A] text-[#8B92A3] text-xs uppercase tracking-wider">
              <tr>
                <th className="p-3 text-left">
                  <input
                    type="checkbox"
                    checked={filtered.length > 0 && filtered.every(r => selectedIds.includes(r.id))}
                    onChange={e => setSelectedIds(e.target.checked ? filtered.map(r => r.id) : [])}
                  />
                </th>
                <th className="p-3 text-left">Type</th>
                <th className="p-3 text-left">Company</th>
                <th className="p-3 text-left">Contact</th>
                <th className="p-3 text-left">Email</th>
                <th className="p-3 text-left">Phone</th>
                <th className="p-3 text-left">States</th>
                <th className="p-3 text-left">Tags</th>
                <th className="p-3 text-left">Visibility</th>
                <th className="p-3 text-left">Updated</th>
                <th className="p-3 text-left">Actions</th>
              </tr>
            </thead>

            <tbody>
              {filtered.map(r => (
                <tr key={r.id} className="border-t border-[#252A38] hover:bg-[#171B26]">
                  <td className="p-3">
                    <input
                      type="checkbox"
                      checked={selectedIds.includes(r.id)}
                      onChange={() => toggleSelected(r.id)}
                    />
                  </td>

                  <td className="p-3">
                    <span className="badge bg-[#171B26]">{r.type}</span>
                  </td>

                  <td className="p-3 font-medium">{r.company || ' '}</td>
                  <td className="p-3">{r.contactName || ' '}</td>
                  <td className="p-3 text-[#67E8F9]">
                    {r.email ? <a href={`mailto:${r.email}`}>{r.email}</a> : ' '}
                  </td>
                  <td className="p-3 whitespace-nowrap min-w-[120px]">
                    {r.phone ? (
                      <a href={`tel:${r.phone}`} className="text-[#E5E7EB] hover:text-[#67E8F9]">
                        {r.phone}
                      </a>
                    ) : ' '}
                  </td>
                  <td className="p-3">{r.states || ' '}</td>
                  <td className="p-3">{r.tags || ' '}</td>

                  <td className="p-3">
                    {r.id.startsWith('buyer-') ? (
                      <span className="badge bg-[#252A38] text-[#8B92A3]">private</span>
                    ) : (
                      <button
                        onClick={() =>
                          setResources(prev =>
                            prev.map(x =>
                              x.id === r.id
                                ? {
                                    ...x,
                                    visibility: x.visibility === 'private' ? 'shared' : 'private',
                                    updatedAt: new Date().toISOString(),
                                  }
                                : x
                            )
                          )
                        }
                        className={`badge ${
                          r.visibility === 'shared'
                            ? 'bg-cyan-500/20 text-cyan-400'
                            : 'bg-[#252A38] text-[#8B92A3]'
                        }`}
                      >
                        {r.visibility}
                      </button>
                    )}
                  </td>

                  <td className="p-3 text-[#8B92A3]">{new Date(r.updatedAt).toLocaleDateString()}</td>

                  <td className="p-3">
                    {r.id.startsWith('buyer-') ? (
                      <span className="text-[#64748B] text-xs">Managed in Buyer DB</span>
                    ) : (
                      <div className="flex items-center gap-3">
                        <button
                          onClick={() => openEditModal(r)}
                          className="text-blue-400 hover:text-blue-300 flex items-center gap-1"
                        >
                          <Pencil size={13} /> Edit
                        </button>

                        <button
                          onClick={() => {
                            if (!confirm('Delete this resource?')) return
                            setResources(prev => prev.filter(x => x.id !== r.id))
                          }}
                          className="text-red-400 hover:text-red-300"
                        >
                          Delete
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {filtered.length === 0 && (
            <div className="empty-state text-[#8B92A3] p-8">
              No {safeLower(currentLabel)} found. Import or add one manually.
            </div>
          )}
        </div>
      </div>

      {showAdd && (
        <div className="fixed inset-0 z-[100] bg-black/70 flex items-center justify-center p-4">
          <div className="card p-5 w-full max-w-3xl">
            <div className="flex justify-between items-center mb-4">
              <div className="text-xl font-semibold">
                Add {RESOURCE_LABELS[(form.type as ResourceType) || activeType]}
              </div>
              <button onClick={() => setShowAdd(false)} className="btn btn-ghost">
                Close
              </button>
            </div>

            <div className="grid md:grid-cols-2 gap-3">
              <select
                className="select"
                value={(form.type as ResourceType) || activeType}
                onChange={e => setForm(p => ({ ...p, type: e.target.value as ResourceType }))}
              >
                {RESOURCE_TYPES.map(t => (
                  <option key={t} value={t}>
                    {RESOURCE_LABELS[t]}
                  </option>
                ))}
              </select>

              <select
                className="select"
                value={form.visibility || 'private'}
                onChange={e => setForm(p => ({ ...p, visibility: e.target.value as Visibility }))}
              >
                <option value="private">Private</option>
                <option value="shared">Shared</option>
              </select>

              <input className="input" placeholder="Company" value={form.company || ''} onChange={e => setForm(p => ({ ...p, company: e.target.value }))} />
              <input className="input" placeholder="Contact Name" value={form.contactName || ''} onChange={e => setForm(p => ({ ...p, contactName: e.target.value }))} />
              <input className="input" placeholder="Email" value={form.email || ''} onChange={e => setForm(p => ({ ...p, email: e.target.value }))} />
              <input className="input" placeholder="Phone" value={form.phone || ''} onChange={e => setForm(p => ({ ...p, phone: e.target.value }))} />
              <div className="md:col-span-2">
                <div className="text-xs text-[#8B92A3] mb-2">States / Markets</div>
                <div className="flex flex-wrap gap-1.5 max-h-[170px] overflow-y-auto border border-[#252A38] rounded-xl p-3 bg-[#070A0F]">
                  {['Nationwide','Any','AL','AK','AZ','AR','CA','CO','CT','DE','FL','GA','HI','ID','IL','IN','IA','KS','KY','LA','ME','MD','MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ','NM','NY','NC','ND','OH','OK','OR','PA','RI','SC','SD','TN','TX','UT','VT','VA','WA','WV','WI','WY','Other'].map(st => {
                    const current = String(form.states || '').split(',').map((x: string) => x.trim()).filter(Boolean)
                    const active = current.includes(st) || (st === 'Other' && (form as any).customMarket)
                    return (
                      <button
                        key={st}
                        type="button"
                        onClick={() => {
                          if (st === 'Other') {
                            setForm(p => ({ ...p, customMarket: (p as any).customMarket || '' } as any))
                            return
                          }
                          const next = active ? current.filter((x: string) => x !== st) : [...current, st]
                          setForm(p => ({ ...p, states: next.join(', ') }))
                        }}
                        className={`px-2.5 py-1 rounded-lg border text-[10px] transition ${active ? 'bg-[#22C55E] text-black border-[#22C55E] font-semibold' : 'bg-[#0B0F17] border-[#252A38] text-[#E6E8EE] hover:border-[#3B82F6]'}`}
                      >
                        {st}
                      </button>
                    )
                  })}
                </div>
                {((form as any).customMarket !== undefined) && (
                  <input
                    className="input mt-2"
                    placeholder="Other market/city"
                    value={(form as any).customMarket || ''}
                    onChange={e => {
                      const oldCustom = (form as any).customMarket || ''
                      const base = String(form.states || '').split(',').map((x: string) => x.trim()).filter((x: string) => x && x !== oldCustom)
                      const custom = e.target.value.trim()
                      setForm(p => ({ ...p, customMarket: e.target.value, states: [...base, custom].filter(Boolean).join(', ') } as any))
                    }}
                  />
                )}
              </div>

              <div className="md:col-span-2">
                <div className="text-xs text-[#8B92A3] mb-2">Tags / Specialty / Asset Types</div>
                <div className="flex flex-wrap gap-2">
                  {['SFH','Multifamily','Small Multifamily','Apartment','Land','Hotel','Retail','Office','Industrial','Storage','Mixed Use','Mobile Home Park','RV Park','Build To Rent','Notes','Commercial','Development','Other'].map(asset => {
                    const current = String(form.tags || '').split(',').map((x: string) => x.trim()).filter(Boolean)
                    const active = current.includes(asset) || (asset === 'Other' && (form as any).customAssetType)
                    return (
                      <button
                        key={asset}
                        type="button"
                        onClick={() => {
                          if (asset === 'Other') {
                            setForm(p => ({ ...p, customAssetType: (p as any).customAssetType || '' } as any))
                            return
                          }
                          const next = active ? current.filter((x: string) => x !== asset) : [...current, asset]
                          setForm(p => ({ ...p, tags: next.join(', ') }))
                        }}
                        className={`px-3 py-1 rounded-lg border text-xs transition ${active ? 'bg-[#22C55E] text-black border-[#22C55E] font-semibold' : 'bg-[#0B0F17] border-[#252A38] text-[#E6E8EE] hover:border-[#3B82F6]'}`}
                      >
                        {asset}
                      </button>
                    )
                  })}
                </div>
                {((form as any).customAssetType !== undefined) && (
                  <input
                    className="input mt-2"
                    placeholder="Other specialty / asset type"
                    value={(form as any).customAssetType || ''}
                    onChange={e => {
                      const oldCustom = (form as any).customAssetType || ''
                      const base = String(form.tags || '').split(',').map((x: string) => x.trim()).filter((x: string) => x && x !== oldCustom)
                      const custom = e.target.value.trim()
                      setForm(p => ({ ...p, customAssetType: e.target.value, tags: [...base, custom].filter(Boolean).join(', ') } as any))
                    }}
                  />
                )}
              </div>
              <textarea className="input md:col-span-2 min-h-[120px]" placeholder="Notes" value={form.notes || ''} onChange={e => setForm(p => ({ ...p, notes: e.target.value }))} />
            </div>

            <div className="flex justify-end gap-2 mt-4">
              <button onClick={() => setShowAdd(false)} className="btn btn-ghost">
                Cancel
              </button>
              <button onClick={addResource} className="btn btn-primary">
                Save {(form.type as ResourceType) || activeType}
              </button>
            </div>
          </div>
        </div>
      )}

      {showEdit && editingResource && (
        <div className="fixed inset-0 z-[100] bg-black/70 flex items-center justify-center p-4">
          <div className="card p-5 w-full max-w-3xl">
            <div className="flex justify-between items-center mb-4">
              <div>
                <div className="text-xl font-semibold">Edit {editingResource.type}</div>
                <div className="text-xs text-[#8B92A3]">Update this imported resource individually.</div>
              </div>

              <button
                onClick={() => {
                  setShowEdit(false)
                  setEditingResource(null)
                }}
                className="btn btn-ghost"
              >
                Close
              </button>
            </div>

            <div className="grid md:grid-cols-2 gap-3">
              <select
                className="select"
                value={editingResource.type}
                onChange={e => setEditingResource(p => p ? ({ ...p, type: e.target.value as ResourceType }) : p)}
              >
                {RESOURCE_TYPES.map(t => (
                  <option key={t} value={t}>
                    {RESOURCE_LABELS[t]}
                  </option>
                ))}
              </select>

              <select
                className="select"
                value={editingResource.visibility}
                onChange={e => setEditingResource(p => p ? ({ ...p, visibility: e.target.value as Visibility }) : p)}
              >
                <option value="private">Private</option>
                <option value="shared">Shared</option>
              </select>

              <input className="input" placeholder="Company" value={editingResource.company} onChange={e => setEditingResource(p => p ? ({ ...p, company: e.target.value }) : p)} />
              <input className="input" placeholder="Contact Name" value={editingResource.contactName} onChange={e => setEditingResource(p => p ? ({ ...p, contactName: e.target.value }) : p)} />
              <input className="input" placeholder="Email" value={editingResource.email} onChange={e => setEditingResource(p => p ? ({ ...p, email: e.target.value }) : p)} />
              <input className="input" placeholder="Phone" value={editingResource.phone} onChange={e => setEditingResource(p => p ? ({ ...p, phone: e.target.value }) : p)} />
              <div className="md:col-span-2">
                <div className="text-xs text-[#8B92A3] mb-2">States / Markets</div>
                <div className="flex flex-wrap gap-1.5 max-h-[170px] overflow-y-auto border border-[#252A38] rounded-xl p-3 bg-[#070A0F]">
                  {['Nationwide','Any','AL','AK','AZ','AR','CA','CO','CT','DE','FL','GA','HI','ID','IL','IN','IA','KS','KY','LA','ME','MD','MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ','NM','NY','NC','ND','OH','OK','OR','PA','RI','SC','SD','TN','TX','UT','VT','VA','WA','WV','WI','WY','Other'].map(st => {
                    const current = String(editingResource.states || '').split(',').map((x: string) => x.trim()).filter(Boolean)
                    const active = current.includes(st)
                    return (
                      <button key={st} type="button" onClick={() => {
                        const next = active ? current.filter((x: string) => x !== st) : [...current, st]
                        setEditingResource(p => p ? ({ ...p, states: next.join(', ') }) : p)
                      }} className={`px-2.5 py-1 rounded-lg border text-[10px] transition ${active ? 'bg-[#22C55E] text-black border-[#22C55E] font-semibold' : 'bg-[#0B0F17] border-[#252A38] text-[#E6E8EE] hover:border-[#3B82F6]'}`}>
                        {st}
                      </button>
                    )
                  })}
                </div>
                <input className="input mt-2" placeholder="Other market/city" value={(editingResource as any).customMarket || ''} onChange={e => {
                  const oldCustom = (editingResource as any).customMarket || ''
                  const base = String(editingResource.states || '').split(',').map((x: string) => x.trim()).filter((x: string) => x && x !== oldCustom)
                  const custom = e.target.value.trim()
                  setEditingResource(p => p ? ({ ...p, customMarket: e.target.value, states: [...base, custom].filter(Boolean).join(', ') } as any) : p)
                }} />
              </div>

              <div className="md:col-span-2">
                <div className="text-xs text-[#8B92A3] mb-2">Tags / Specialty / Asset Types</div>
                <div className="flex flex-wrap gap-2">
                  {['SFH','Multifamily','Small Multifamily','Apartment','Land','Hotel','Retail','Office','Industrial','Storage','Mixed Use','Mobile Home Park','RV Park','Build To Rent','Notes','Commercial','Development','Other'].map(asset => {
                    const current = String(editingResource.tags || '').split(',').map((x: string) => x.trim()).filter(Boolean)
                    const active = current.includes(asset)
                    return (
                      <button key={asset} type="button" onClick={() => {
                        const next = active ? current.filter((x: string) => x !== asset) : [...current, asset]
                        setEditingResource(p => p ? ({ ...p, tags: next.join(', ') }) : p)
                      }} className={`px-3 py-1 rounded-lg border text-xs transition ${active ? 'bg-[#22C55E] text-black border-[#22C55E] font-semibold' : 'bg-[#0B0F17] border-[#252A38] text-[#E6E8EE] hover:border-[#3B82F6]'}`}>
                        {asset}
                      </button>
                    )
                  })}
                </div>
                <input className="input mt-2" placeholder="Other specialty / asset type" value={(editingResource as any).customAssetType || ''} onChange={e => {
                  const oldCustom = (editingResource as any).customAssetType || ''
                  const base = String(editingResource.tags || '').split(',').map((x: string) => x.trim()).filter((x: string) => x && x !== oldCustom)
                  const custom = e.target.value.trim()
                  setEditingResource(p => p ? ({ ...p, customAssetType: e.target.value, tags: [...base, custom].filter(Boolean).join(', ') } as any) : p)
                }} />
              </div>
              <textarea className="input md:col-span-2 min-h-[140px]" placeholder="Notes" value={editingResource.notes} onChange={e => setEditingResource(p => p ? ({ ...p, notes: e.target.value }) : p)} />
            </div>

            <div className="flex justify-between gap-2 mt-4">
              <button
                onClick={() => {
                  if (!confirm('Delete this resource?')) return
                  setResources(prev => prev.filter(x => x.id !== editingResource.id))
                  setShowEdit(false)
                  setEditingResource(null)
                  toast.success('Resource deleted')
                }}
                className="btn btn-ghost text-red-400"
              >
                Delete Resource
              </button>

              <div className="flex justify-end gap-2">
                <button
                  onClick={() => {
                    setShowEdit(false)
                    setEditingResource(null)
                  }}
                  className="btn btn-ghost"
                >
                  Cancel
                </button>

                <button onClick={saveEditResource} className="btn btn-primary">
                  Save Changes
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

