import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'

export default function NetlifyLegalDocument({ name, fallback }: { name: string; fallback: ReactNode }) {
  const production = import.meta.env.VITE_BM_NETLIFY_PRODUCTION_PROFILE === 'true'
  const [content, setContent] = useState('')
  const [failed, setFailed] = useState(false)
  useEffect(() => {
    if (!production) return
    const controller = new AbortController()
    setContent(''); setFailed(false)
    fetch(`/legal/${name}.txt`, { signal: controller.signal, cache: 'no-store' })
      .then(async response => {
        if (!response.ok || !response.headers.get('content-type')?.startsWith('text/plain')) throw new Error('Unavailable')
        const text = await response.text()
        if (!text || text.length > 200000) throw new Error('Unavailable')
        if (!controller.signal.aborted) setContent(text)
      }).catch(() => { if (!controller.signal.aborted) setFailed(true) })
    return () => controller.abort()
  }, [production, name])
  if (!production) return <>{fallback}</>
  return <main className="max-w-3xl mx-auto px-6 py-12">
    <h1>BuyerMatch legal document</h1>
    <p role="status">{failed ? 'Approved document unavailable. Please try again later.' : content ? '' : 'Loading approved document…'}</p>
    <pre className="whitespace-pre-wrap font-sans">{content}</pre>
  </main>
}
