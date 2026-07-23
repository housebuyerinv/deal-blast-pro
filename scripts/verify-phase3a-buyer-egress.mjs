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

const sync = read('src/lib/buyerSupabaseSync.ts')
const store = read('src/store/useAppStore.ts')
const buyers = read('src/pages/app/Buyers.tsx')
const recovery = read('src/lib/buyerRecovery.ts')

const hydration = section(sync, 'export async function fetchBuyersFromSupabase', 'function dedupeBuyersBeforeSupabaseSave')
const upsert = section(sync, 'export async function upsertBuyersToSupabase', 'export async function insertBuyerToSupabase')
const update = section(sync, 'export async function updateBuyerInSupabase', 'export async function deleteBuyersFromSupabase')
const deletion = section(sync, 'export async function deleteBuyersFromSupabase', 'export async function deleteAllBuyersFromSupabase')
const addBuyer = section(store, 'addBuyer: (partial) =>', 'updateBuyer: (id, updates) =>')
const updateBuyer = section(store, 'updateBuyer: (id, updates) =>', 'deleteBuyer: (id) =>')
const deleteBuyer = section(store, 'deleteBuyer: (id) =>', 'importBuyers: (incoming) =>')
const hydrateEffect = section(buyers, '// BUYER_SUPABASE_HYDRATE_ON_PAGE_OPEN', "const [search, setSearch]")
const portalApproval = section(buyers, 'const approvePortalRows = async', 'const skipPortalInvalid = async')
const bulkApproval = section(buyers, 'const approveSelected = async', 'const downloadSelectedBuyerProfiles')

verify(
  'Concurrent hydrations share one workspace-scoped in-flight request',
  sync.includes('const buyerHydrationInFlight = new Map<string, Promise<BuyerHydrationResult>>()') &&
    hydration.includes('buyerHydrationInFlight.get(cacheKey)') &&
    hydration.includes('buyerHydrationInFlight.set(cacheKey, request)')
)
verify(
  'Hydration cache key includes authenticated user and workspace identities',
  sync.includes('return `${scope.userId}:${scope.workspaceId}`') &&
    sync.includes('const cacheKey = trackBuyerScope(scope)')
)
verify(
  'Fresh hydration results are reused for at least five minutes',
  sync.includes('const BUYER_HYDRATION_FRESH_MS = 5 * 60 * 1000') &&
    hydration.includes('Date.now() - cached.completedAt < BUYER_HYDRATION_FRESH_MS')
)
verify(
  'Identity changes, logout, and explicit recovery invalidate hydration cache',
  sync.includes('if (activeBuyerScopeKey && activeBuyerScopeKey !== nextKey)') &&
    store.includes("m.invalidateBuyerHydrationCache()") &&
    recovery.includes('invalidateBuyerHydrationCache()') &&
    recovery.includes('fetchBuyersFromSupabase({ force: true })')
)
verify(
  'Create/upsert performs targeted duplicate lookup and no full hydration',
  upsert.includes(".select('id,email,data,created_at,updated_at')") &&
    upsert.includes(".in('email', incomingEmails)") &&
    !upsert.includes('fetchBuyersFromSupabase')
)
verify(
  'Plan capacity remains count-only in the authoritative import API',
  read('api/import-buyers.ts').includes(".select('id', { count: 'exact', head: true })")
)
verify(
  'Update writes only the affected buyer and performs no full hydration',
  update.includes('upsertBuyersToSupabase([{') &&
    !update.includes('fetchBuyersFromSupabase')
)
verify(
  'Delete removes only confirmed IDs and performs no full hydration',
  deletion.includes(".in('id', chunk)") &&
    deletion.includes('invalidateActiveBuyerHydrationCache()') &&
    !deletion.includes('fetchBuyersFromSupabase')
)
verify(
  'Successful create and update merge only returned buyers into Zustand',
  addBuyer.includes('result.data') &&
    addBuyer.includes('s.buyers.map(existing =>') &&
    updateBuyer.includes('result.data') &&
    updateBuyer.includes('buyers: s.buyers.map')
)
verify(
  'Delete mutates local state only after server confirmation',
  deleteBuyer.indexOf('m.deleteBuyersFromSupabase([id])') < deleteBuyer.indexOf('buyers: s.buyers.filter')
)
verify(
  'Failed mutations do not change Zustand state or hydration cache',
  addBuyer.indexOf('if (!result.ok || !result.data)') < addBuyer.indexOf('set(s => ({') &&
    updateBuyer.indexOf('if (!result.ok)') < updateBuyer.indexOf('set(s => ({') &&
    deleteBuyer.indexOf('if (!result.ok)') < deleteBuyer.indexOf('set(s => {') &&
    upsert.indexOf('if (apiResult.ok) invalidateActiveBuyerHydrationCache()') >= 0 &&
    deletion.indexOf('invalidateActiveBuyerHydrationCache()') > deletion.indexOf('if (error)')
)
verify(
  'Older in-flight hydration cannot publish or cache pre-mutation rows',
  hydration.includes('requestGeneration !== buyerHydrationGeneration') &&
    hydration.includes("error: 'Buyer hydration was superseded by newer workspace data.'") &&
    sync.includes('function invalidateActiveBuyerHydrationCache()') &&
    sync.includes('buyerHydrationGeneration += 1')
)
verify(
  'Buyers page mount uses shared freshness cache and has no focus hydration',
  hydrateEffect.includes('fetchBuyersFromSupabase()') &&
    !hydrateEffect.includes("addEventListener('focus'") &&
    !hydrateEffect.includes('setInterval')
)
verify(
  'Each bulk approval flow performs no more than one deliberate forced reconciliation',
  (portalApproval.match(/fetchBuyersFromSupabase\(\{ force: true \}\)/g) || []).length === 1 &&
    (bulkApproval.match(/fetchBuyersFromSupabase\(\{ force: true \}\)/g) || []).length === 1
)
verify(
  'Normal create, update, and delete paths never invoke buyer recovery',
  !addBuyer.includes('buyerRecovery') &&
    !updateBuyer.includes('buyerRecovery') &&
    !deleteBuyer.includes('buyerRecovery') &&
    !upsert.includes('buyerRecovery') &&
    !update.includes('buyerRecovery') &&
    !deletion.includes('buyerRecovery')
)

for (const check of checks) {
  console.log(`${check.ok ? 'PASS' : 'FAIL'}: ${check.name}`)
}

const failed = checks.filter(check => !check.ok)
if (failed.length) {
  console.error(`\n${failed.length} Phase 3A buyer egress verification check(s) failed.`)
  process.exit(1)
}

console.log(`\nAll ${checks.length} Phase 3A buyer egress verification checks passed.`)
