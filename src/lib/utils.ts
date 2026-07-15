export function generateId(prefix = 'ID'): string {
  return prefix + Date.now().toString(36).toUpperCase() + Math.random().toString(36).slice(2, 6).toUpperCase()
}

export function formatCurrency(n?: number): string {
  if (n == null || isNaN(n)) return '—'
  return new Intl.NumberFormat('en-US', { 
    style: 'currency', 
    currency: 'USD', 
    maximumFractionDigits: 0 
  }).format(n)
}

export function formatNumber(n?: number): string {
  if (n == null || isNaN(n)) return '—'
  return new Intl.NumberFormat('en-US').format(n)
}

export function formatDate(d: string | Date, short = false): string {
  const date = typeof d === 'string' ? new Date(d) : d
  if (short) {
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  }
  return date.toLocaleDateString('en-US', { 
    month: 'short', day: 'numeric', year: 'numeric',
    hour: 'numeric', minute: '2-digit'
  })
}

export function parseCurrencyInput(v: string): number | '' {
  if (!v || v.trim() === '') return ''
  const cleaned = v.replace(/[$,\s]/g, '')
  const num = parseFloat(cleaned)
  return isNaN(num) ? '' : num
}

export function safeGet<T>(obj: any, path: string, fallback: T): T {
  return path.split('.').reduce((o, k) => (o ? o[k] : undefined), obj) ?? fallback
}

export async function copyToClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    // Fallback
    const ta = document.createElement('textarea')
    ta.value = text
    document.body.appendChild(ta)
    ta.select()
    document.execCommand('copy')
    document.body.removeChild(ta)
    return true
  }
}

export function downloadText(filename: string, content: string) {
  const blob = new Blob([content], { type: 'text/plain' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

export function downloadCSV(filename: string, rows: any[][]) {
  const csv = rows.map(r => r.map(cell => {
    const s = String(cell ?? '')
    return s.includes(',') || s.includes('"') ? `"${s.replace(/"/g, '""')}"` : s
  }).join(',')).join('\n')
  const blob = new Blob([csv], { type: 'text/csv' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

export function createObjectURL(file: File): string {
  return URL.createObjectURL(file)
}


