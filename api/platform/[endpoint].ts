import buyerMatch from '../../server/http/buyermatch.js'
import buyerAccount from '../../server/http/buyermatch-buyer.js'
import buyerResponse from '../../server/http/buyermatch-response.js'
import buyerWorker from '../../server/http/buyermatch-worker.js'
import emailOperations from '../../server/http/email-operations.js'
import s2Attestation from '../../server/http/s2-attestation.js'

// Preserve public URLs through Vercel rewrites while sharing one function slot.
// Every handler retains its own method, authentication and environment guards.
const handlers = {
  buyermatch: buyerMatch,
  'buyermatch-buyer': buyerAccount,
  'buyermatch-response': buyerResponse,
  'buyermatch-worker': buyerWorker,
  'email-operations': emailOperations,
  's2-attestation': s2Attestation,
}

export default async function handler(req: any, res: any) {
  const url = new URL(req.url, 'https://internal.invalid')
  const path = url.pathname
  const match = /^\/api\/(?:platform\/)?(buyermatch|buyermatch-buyer|buyermatch-response|buyermatch-worker|email-operations|s2-attestation)$/.exec(path)
  if (!match) return res.status(404).json({ error: 'Not found' })
  // Vercel's [endpoint] route adds this exact, path-bound selector internally.
  // Normalize only that routing artifact, never arbitrary/duplicate query input.
  // The protected handler still independently rejects all query/body/framing input.
  if (match[1] === 's2-attestation' && url.search === '?endpoint=s2-attestation') {
    const originalUrl = req.url
    try {
      req.url = path
      return await s2Attestation(req, res)
    } finally {
      req.url = originalUrl
    }
  }
  return handlers[match[1] as keyof typeof handlers](req, res)
}
