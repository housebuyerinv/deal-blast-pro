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

const buyers = read('src/pages/app/Buyers.tsx')
const sidebar = read('src/components/layout/Sidebar.tsx')
const dashboard = read('src/pages/app/Dashboard.tsx')
const buyerStorage = read('src/lib/buyerPortalSubmissionStorage.ts')
const dealStorage = read('src/lib/dealSubmissionStorage.ts')

const buyerCountHelper = section(
  buyerStorage,
  'export const countPendingBuyerPortalSubmissions',
  'export const listRecentBuyerPortalSubmissionActivity'
)
const dealCountHelper = section(
  dealStorage,
  'export async function countPendingDealSubmissions',
  'export async function listRecentDealSubmissionActivity'
)
const recentBuyerHelper = section(
  buyerStorage,
  'export const listRecentBuyerPortalSubmissionActivity',
  'export const markBuyerPortalSubmissionsImported'
)
const recentDealHelper = section(
  dealStorage,
  'export async function listRecentDealSubmissionActivity',
  'async function loadDealSubmissionsForReview'
)
const buyerCountEffect = section(
  buyers,
  'const refreshBuyerPortalQueueCount = async',
  'const importBuyerPortalQueue = async'
)
const recentActivity = section(
  dashboard,
  'function RecentActivity()',
  'function LiveOperationalStream()'
)
const dashboardCounters = section(
  dashboard,
  'export default function Dashboard()',
  'function TimeDateWidget()'
)

verify(
  'Buyer count helper is head-only and never downloads buyer_data',
  buyerCountHelper.includes(".select('id', { count: 'exact', head: true })") &&
    !buyerCountHelper.includes('buyer_data') &&
    !buyerCountHelper.includes('listPendingBuyerPortalSubmissions')
)
verify(
  'Deal count helper is head-only and never downloads deal_data',
  dealCountHelper.includes(".select('id', { count: 'exact', head: true })") &&
    !dealCountHelper.includes('deal_data') &&
    !dealCountHelper.includes('listDealSubmissionsForReview')
)
verify(
  'Buyers has no three-second polling and uses a 60-second count-only fallback',
  !buyerCountEffect.includes('3000') &&
    buyerCountEffect.includes('countPendingBuyerPortalSubmissions') &&
    buyerCountEffect.includes('setInterval(refresh, 60000)')
)
verify(
  'Buyers refreshes on focus and only the buyer queue event',
  buyerCountEffect.includes("addEventListener('focus', refresh)") &&
    buyerCountEffect.includes("addEventListener('dealblastpro:buyer-portal-queue-changed', refresh)") &&
    !buyerCountEffect.includes('dealblastpro:storage-sync')
)
verify(
  'Sidebar counts use count-only helpers and do not use full queue helpers',
  sidebar.includes('countPendingDealSubmissions') &&
    sidebar.includes('countPendingBuyerPortalSubmissions') &&
    !sidebar.includes('listDealSubmissionsForReview') &&
    !sidebar.includes('listPendingBuyerPortalSubmissions')
)
verify(
  'Sidebar does not duplicate queue refreshes through storage-sync',
  !sidebar.includes('dealblastpro:storage-sync')
)
verify(
  'Sidebar buyer fallback is at least 60 seconds and count-only',
  sidebar.includes('setInterval(refreshBuyerPortalBadge, 60000)')
)
verify(
  'Dashboard counters use only head-count helpers with a 60-second fallback',
  dashboardCounters.includes('countPendingDealSubmissions') &&
    dashboardCounters.includes('countPendingBuyerPortalSubmissions') &&
    dashboardCounters.includes('setInterval(refresh, 60000)') &&
    !dashboardCounters.includes('listPendingDealSubmissions')
)
verify(
  'Dashboard counters do not duplicate queue refreshes through generic storage events',
  !dashboardCounters.includes('dealblastpro:storage-sync') &&
    !dashboardCounters.includes("addEventListener('storage'")
)
verify(
  'Recent Activity has no recurring poll or store-wide subscription',
  !recentActivity.includes('setInterval') &&
    !recentActivity.includes('useAppStore.subscribe') &&
    !recentActivity.includes('dealblastpro:storage-sync')
)
verify(
  'Recent Activity refreshes on focus and one listener per queue mutation type',
  recentActivity.includes("addEventListener('focus', refresh)") &&
    recentActivity.match(/addEventListener\('dealblastpro:buyer-portal-queue-changed', refresh\)/g)?.length === 1 &&
    recentActivity.match(/addEventListener\('dealblastpro:deal-submission-queue-changed', refresh\)/g)?.length === 1
)
verify(
  'Recent Activity requests at most four deal and four buyer rows',
  recentActivity.includes('listRecentDealSubmissionActivity(4)') &&
    recentActivity.includes('listRecentBuyerPortalSubmissionActivity(4)') &&
    recentDealHelper.includes('.limit(safeLimit)') &&
    recentBuyerHelper.includes('.limit(safeLimit)') &&
    recentDealHelper.includes('Math.min(4') &&
    recentBuyerHelper.includes('Math.min(4')
)
verify(
  'Recent deal activity selects only activity fields and one bounded JSON payload',
  recentDealHelper.includes(
    ".select('id,status,deal_data,created_at,updated_at,converted_at,inventory_deal_id')"
  ) &&
    !recentDealHelper.includes("select('*')")
)
verify(
  'Recent buyer activity selects only activity fields and one bounded JSON payload',
  recentBuyerHelper.includes(".select('id, status, buyer_data, created_at')") &&
    !recentBuyerHelper.includes("select('*')")
)

for (const check of checks) {
  console.log(`${check.ok ? 'PASS' : 'FAIL'}: ${check.name}`)
}

const failed = checks.filter(check => !check.ok)
if (failed.length) {
  console.error(`\n${failed.length} Phase 1 egress verification check(s) failed.`)
  process.exit(1)
}

console.log(`\nAll ${checks.length} Phase 1 egress verification checks passed.`)
