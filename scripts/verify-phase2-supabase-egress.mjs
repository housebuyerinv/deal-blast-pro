import fs from 'node:fs'
import path from 'node:path'

const root = process.cwd()
const read = relativePath => fs.readFileSync(path.join(root, relativePath), 'utf8')
const checks = []

function verify(name, condition) {
  checks.push({ name, ok: Boolean(condition) })
}

function section(source, start, end) {
  const startIndex = source.indexOf(start)
  const endIndex = source.indexOf(end, startIndex + start.length)
  if (startIndex < 0 || endIndex < 0) return ''
  return source.slice(startIndex, endIndex)
}

const app = read('src/App.tsx')
const accountProfile = read('src/lib/accountProfile.ts')
const cloudSync = read('src/lib/cloudSync.ts')
const paymentPendingEffect = section(
  app,
  "if (billingStatus !== 'Payment Pending') return",
  '}, [billingStatus, activateManualPlan])'
)
const narrowStatusHelper = section(
  accountProfile,
  'export async function loadPaymentPendingAccountStatus',
  'export type EditableAccountProfile'
)

verify(
  'Payment Pending never calls loadCloudTrialActivation',
  !app.includes("import { loadCloudTrialActivation }") &&
    !paymentPendingEffect.includes('loadCloudTrialActivation')
)
verify(
  'Payment Pending never reads cloud_snapshots.snapshot',
  !paymentPendingEffect.includes('cloud_snapshots') &&
    !paymentPendingEffect.includes("select('snapshot')")
)
verify(
  'Payment Pending polling is 60 seconds',
  paymentPendingEffect.includes('setInterval(() => { void checkActivation() }, 60000)') &&
    !paymentPendingEffect.includes('15000')
)
verify(
  'Polling is installed only while Payment Pending',
  paymentPendingEffect.startsWith("if (billingStatus !== 'Payment Pending') return")
)
verify(
  'Polling stops after activation changes billing status',
  paymentPendingEffect.includes("activation.billingStatus === 'Payment Pending'") &&
    paymentPendingEffect.includes('activateManualPlan({') &&
    app.includes('}, [billingStatus, activateManualPlan])') &&
    paymentPendingEffect.includes('window.clearInterval(interval)')
)
verify(
  'Focus and visibility restoration refresh remain',
  paymentPendingEffect.includes("window.addEventListener('focus', refreshWhenVisible)") &&
    paymentPendingEffect.includes("document.addEventListener('visibilitychange', refreshWhenVisible)") &&
    paymentPendingEffect.includes("document.visibilityState === 'visible'")
)
verify(
  'Overlapping and same-burst requests are prevented',
  paymentPendingEffect.includes('inFlight ||') &&
    paymentPendingEffect.includes('Date.now() - lastRefreshStartedAt < 1000') &&
    paymentPendingEffect.includes('inFlight = true') &&
    paymentPendingEffect.includes('inFlight = false')
)
verify(
  'In-flight request is cancelled on effect cleanup',
  paymentPendingEffect.includes('new AbortController()') &&
    paymentPendingEffect.includes('activeController?.abort()')
)
verify(
  'Narrow request uses authoritative workspace plan assignment',
  narrowStatusHelper.includes(".from('workspace_plan_assignments')") &&
    narrowStatusHelper.includes(".eq('user_id', userId)") &&
    narrowStatusHelper.includes('.maybeSingle()')
)
verify(
  'Narrow request selects only required billing fields',
  accountProfile.includes(
    "const BILLING_STATUS_FIELDS = 'plan_name,billing_status,billing_interval,current_period_end'"
  ) &&
    narrowStatusHelper.includes('.select(BILLING_STATUS_FIELDS)') &&
    !narrowStatusHelper.includes("select('*')") &&
    !narrowStatusHelper.includes('snapshot')
)
verify(
  'Existing nonbilling cloud snapshot functions remain unchanged and available',
  cloudSync.includes('export async function uploadLocalAppDataToCloud()') &&
    cloudSync.includes('export async function loadCloudAppDataToLocal(') &&
    cloudSync.includes('export async function loadCloudTrialActivation()')
)

for (const check of checks) {
  console.log(`${check.ok ? 'PASS' : 'FAIL'}: ${check.name}`)
}

const failed = checks.filter(check => !check.ok)
if (failed.length) {
  console.error(`\n${failed.length} Phase 2 egress verification check(s) failed.`)
  process.exit(1)
}

console.log(`\nAll ${checks.length} Phase 2 egress verification checks passed.`)
