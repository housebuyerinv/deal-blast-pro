import buyerMatch from '../../server/http/buyermatch.js'
import buyerResponse from '../../server/http/buyermatch-response.js'
import buyerWorker from '../../server/http/buyermatch-worker.js'
import emailOperations from '../../server/http/email-operations.js'

// Preserve public URLs through Vercel rewrites while sharing one function slot.
// Every handler retains its own method, authentication and environment guards.
const handlers = {
  buyermatch: buyerMatch,
  'buyermatch-response': buyerResponse,
  'buyermatch-worker': buyerWorker,
  'email-operations': emailOperations,
}

export default async function handler(req: any, res: any) {
  const path = new URL(req.url, 'https://internal.invalid').pathname
  const match = /^\/api\/(?:platform\/)?(buyermatch|buyermatch-response|buyermatch-worker|email-operations)$/.exec(path)
  if (!match) return res.status(404).json({ error: 'Not found' })
  return handlers[match[1] as keyof typeof handlers](req, res)
}
