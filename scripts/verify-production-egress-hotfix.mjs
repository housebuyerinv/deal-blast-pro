import fs from 'node:fs'
import path from 'node:path'

const root = process.cwd()
const read = file => fs.readFileSync(path.join(root, file), 'utf8')
const checks = []
const check = (name, ok) => checks.push({ name, ok: Boolean(ok) })
const section = (source, start, end) => {
  const from = source.indexOf(start)
  const to = source.indexOf(end, from + start.length)
  return from >= 0 && to >= 0 ? source.slice(from, to) : ''
}

const app = read('src/App.tsx')
const profile = read('src/lib/accountProfile.ts')
const cloud = read('src/lib/cloudSync.ts')
const buyerStorage = read('src/lib/buyerPortalSubmissionStorage.ts')
const dealStorage = read('src/lib/dealSubmissionStorage.ts')
const buyers = read('src/pages/app/Buyers.tsx')
const sidebar = read('src/components/layout/Sidebar.tsx')
const dashboard = read('src/pages/app/Dashboard.tsx')
const sync = read('src/lib/buyerSupabaseSync.ts')
const store = read('src/store/useAppStore.ts')
const recovery = read('src/lib/buyerRecovery.ts')

const buyerCount = section(buyerStorage, 'export const countPendingBuyerPortalSubmissions', 'export const markBuyerPortalSubmissionsImported')
const dealCount = section(dealStorage, 'export async function countPendingDealSubmissions', 'export async function listDealSubmissionsForReview')
const buyerBadge = section(buyers, 'const refreshBuyerPortalQueueCount = async', 'const importBuyerPortalQueue = async')
const dashboardCounters = section(dashboard, 'export default function Dashboard()', 'function TimeDateWidget()')
const payment = section(app, "if (billingStatus !== 'Payment Pending') return", '}, [billingStatus, activateManualPlan])')
const narrowStatus = section(profile, 'export async function loadPaymentPendingAccountStatus', 'export type EditableAccountProfile')
const hydration = section(sync, 'export async function fetchBuyersFromSupabase', 'function dedupeBuyersBeforeSupabaseSave')
const upsert = section(sync, 'export async function upsertBuyersToSupabase', 'export async function insertBuyerToSupabase')
const update = section(sync, 'export async function updateBuyerInSupabase', 'export async function deleteBuyersFromSupabase')
const deletion = section(sync, 'export async function deleteBuyersFromSupabase', 'export async function deleteAllBuyersFromSupabase')
const addBuyer = section(store, 'addBuyer: (partial) =>', 'updateBuyer: (id, updates) =>')
const updateBuyer = section(store, 'updateBuyer: (id, updates) =>', 'deleteBuyer: (id) =>')
const deleteBuyer = section(store, 'deleteBuyer: (id) =>', 'importBuyers: (incoming) =>')

check('Buyer pending count is head-only and omits buyer_data', buyerCount.includes(".select('id', { count: 'exact', head: true })") && !buyerCount.includes('buyer_data'))
check('Deal pending count is head-only and omits deal_data', dealCount.includes(".select('id', { count: 'exact', head: true })") && !dealCount.includes('deal_data'))
check('Buyers removed 3-second hydration and uses a 60-second count fallback', !buyerBadge.includes('3000') && buyerBadge.includes('countPendingBuyerPortalSubmissions') && buyerBadge.includes('setInterval(refresh, 60000)'))
check('Sidebar badge reads are count-only with a 60-second fallback', sidebar.includes('countPendingDealSubmissions') && sidebar.includes('countPendingBuyerPortalSubmissions') && sidebar.includes('setInterval(refreshBuyerPortalBadge, 60000)') && !sidebar.includes('listPendingBuyerPortalSubmissions'))
check('Dashboard counters are count-only with a 60-second fallback', dashboardCounters.includes('countPendingDealSubmissions') && dashboardCounters.includes('countPendingBuyerPortalSubmissions') && dashboardCounters.includes('setInterval(refresh, 60000)') && !dashboardCounters.includes('listPendingDealSubmissions'))
check('Generic storage events do not amplify Dashboard queue refreshes', !dashboardCounters.includes("addEventListener('storage'") && !dashboardCounters.includes('dealblastpro:storage-sync'))
check('Production local activity stream remains local and unchanged in shape', dashboard.includes("localStorage.getItem('dealblastpro-buyer-portal-queue')") && dashboard.includes('const id = setInterval(load, 15000)') && !dashboard.includes('listRecentDealSubmissionActivity') && !dashboard.includes('listRecentBuyerPortalSubmissionActivity'))
check('Pending Docs remains accessible without a false numeric count', dashboard.includes("label: 'Pending Docs', value: 'Review'"))

check('Payment Pending does not call cloud snapshot trial activation', !app.includes("import { loadCloudTrialActivation }") && !payment.includes('loadCloudTrialActivation') && !payment.includes('cloud_snapshots'))
check('Payment Pending polls only at 60 seconds and on restored visibility/focus', payment.startsWith("if (billingStatus !== 'Payment Pending') return") && payment.includes('60000') && !payment.includes('15000') && payment.includes("addEventListener('focus', refreshWhenVisible)") && payment.includes("addEventListener('visibilitychange', refreshWhenVisible)"))
check('Payment Pending requests are coalesced, guarded, abortable, and cleaned up', payment.includes('inFlight ||') && payment.includes('Date.now() - lastRefreshStartedAt < 1000') && payment.includes('new AbortController()') && payment.includes('inFlight = false') && payment.includes('activeController?.abort()'))
check('Billing status query is owner-scoped and selects only four columns', narrowStatus.includes(".from('workspace_plan_assignments')") && narrowStatus.includes(".eq('user_id', userId)") && narrowStatus.includes('.select(BILLING_STATUS_FIELDS)') && profile.includes("const BILLING_STATUS_FIELDS = 'plan_name,billing_status,billing_interval,current_period_end'") && !narrowStatus.includes("select('*')"))
check('Legitimate cloud hydration/autosave APIs remain present', cloud.includes('uploadLocalAppDataToCloud') && cloud.includes('loadCloudAppDataToLocal') && cloud.includes('loadCloudTrialActivation'))

check('Concurrent buyer hydrations share a user/workspace-scoped request', sync.includes('buyerHydrationInFlight') && hydration.includes('buyerHydrationInFlight.get(cacheKey)') && sync.includes('return `${scope.userId}:${scope.workspaceId}`'))
check('Buyer hydration freshness is at least five minutes', sync.includes('const BUYER_HYDRATION_FRESH_MS = 5 * 60 * 1000'))
check('Buyer cache invalidates on identity changes and recovery', sync.includes('activeBuyerScopeKey !== nextKey') && recovery.includes('invalidateBuyerHydrationCache()') && recovery.includes('fetchBuyersFromSupabase({ force: true })'))
check('Create uses targeted duplicate lookup and no full hydration', upsert.includes(".in('email', incomingEmails)") && !upsert.includes('fetchBuyersFromSupabase'))
check('Capacity enforcement remains count-only', read('api/import-buyers.ts').includes(".select('id', { count: 'exact', head: true })"))
check('Update and delete avoid full hydration', !update.includes('fetchBuyersFromSupabase') && !deletion.includes('fetchBuyersFromSupabase'))
check('Successful mutations merge/remove only the affected buyer after confirmation', addBuyer.includes('result.data') && updateBuyer.includes('result.data') && deleteBuyer.indexOf('deleteBuyersFromSupabase([id])') < deleteBuyer.indexOf('buyers: s.buyers.filter'))
check('Failed mutations return before local-state changes', addBuyer.indexOf('if (!result.ok || !result.data)') < addBuyer.indexOf('set(s => ({') && updateBuyer.indexOf('if (!result.ok)') < updateBuyer.indexOf('set(s => ({') && deleteBuyer.indexOf('if (!result.ok)') < deleteBuyer.indexOf('set(s => {'))
check('Stale in-flight hydration cannot overwrite a newer mutation', hydration.includes('requestGeneration !== buyerHydrationGeneration') && sync.includes('buyerHydrationGeneration += 1'))
check('Normal mutations never invoke buyer recovery', !addBuyer.includes('buyerRecovery') && !updateBuyer.includes('buyerRecovery') && !deleteBuyer.includes('buyerRecovery'))

for (const result of checks) console.log(`${result.ok ? 'PASS' : 'FAIL'}: ${result.name}`)
const failed = checks.filter(result => !result.ok)
if (failed.length) {
  console.error(`\n${failed.length} production egress hotfix check(s) failed.`)
  process.exit(1)
}
console.log(`\nAll ${checks.length} production egress hotfix checks passed.`)
