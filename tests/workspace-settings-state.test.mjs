import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { URL } from 'node:url'
import vm from 'node:vm'
import ts from 'typescript'
import { build } from 'esbuild'
import { Buffer } from 'node:buffer'

const read = path => fs.readFileSync(new URL('../' + path, import.meta.url), 'utf8')
const naming = ts.transpileModule(read('src/lib/workspaceName.ts'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText
const exports = {}
vm.runInNewContext(naming, { exports })

test('blank profile fields preserve the real same-account workspace name', () => {
  assert.equal(exports.getWorkspaceDisplayName(null, null, 'SYNTHETIC Regular User Workspace'), 'SYNTHETIC Regular User Workspace')
  assert.equal(exports.getWorkspaceDisplayName('My Workspace', '', 'Actual Workspace'), 'Actual Workspace')
  assert.equal(exports.getWorkspaceDisplayName(null, '', 'My Workspace'), 'My Workspace')
})

function loginFromStore(initial) {
  const source = read('src/store/useAppStore.ts')
  const start = source.indexOf('      login: (email, name, options) => {')
  const end = source.indexOf('      logout:', start)
  assert.ok(start > 0 && end > start)
  // Run the actual store transition, stubbing only dependencies/side effects.
  const arrow = source.slice(start, end).trim().replace(/^login: /, '').replace(/,$/, '')
    .replace("import('../lib/buyerSupabaseSync')", 'Promise.resolve({invalidateBuyerHydrationCache(){}})')
  const js = ts.transpileModule('const login = ' + arrow + '; login', { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText
  let state = { ...initial, hydrateInventory() {},
    activateManualPlan(patch) { state = { ...state, trial: { ...state.trial, ...patch } } },
    updateSettings(patch) { state = { ...state, settings: { ...state.settings, ...patch } } },
  }
  const cleanStart = source.indexOf('const cleanWorkspaceState = () => ({')
  const cleanEnd = source.indexOf('const removeDealScopedState', cleanStart)
  const clean = vm.runInNewContext(source.slice(cleanStart, cleanEnd) + '; cleanWorkspaceState')
  const login = vm.runInNewContext(js, {
    get: () => state, set: patch => { state = { ...state, ...patch } },
    cleanWorkspaceState: clean,
    makeWorkspaceInstanceId: user => 'workspace:' + user.id,
    getWorkspaceOwnerPatch: user => ({ workspaceOwnerId: user.id }),
    makeWorkspaceDataScopeKey: user => user.id + ':' + user.email,
    resetLifecycleSettings: () => ({ onboarding: {} }), DEFAULT_SETTINGS: {},
    readOwnerPreviewSession: () => undefined,
  })
  return { login, get: () => state }
}
const initial = () => ({ user: { id: 'A', email: 'a@example.invalid', businessName: 'Workspace A', displayName: 'Person A' }, deals: [{ id: 'A-deal' }], buyers: [{ id: 'A-buyer' }], currentDealId: 'A-deal', workspaceInstanceId: 'workspace:A', settings: {} })
test('account replacement cannot preserve the previous workspace even when requested', () => {
  const store = loginFromStore(initial())
  store.login('b@example.invalid', 'Person B', { id: 'B', preserveWorkspace: true })
  assert.equal(store.get().workspaceOwnerId, 'B')
  assert.equal(store.get().user.businessName, '')
  assert.equal(store.get().user.displayName, '')
  assert.equal(store.get().deals.length, 0)
  assert.equal(store.get().buyers.length, 0)
  assert.equal(store.get().currentDealId, null)
})
test('same account keeps its workspace while a different id with the same email does not', () => {
  const same = loginFromStore(initial())
  same.login('a@example.invalid', 'Person A', { id: 'A', preserveWorkspace: true })
  assert.equal(same.get().user.businessName, 'Workspace A')
  assert.equal(same.get().deals.length, 1)
  const replaced = loginFromStore(initial())
  replaced.login('a@example.invalid', 'Replacement', { id: 'B', preserveWorkspace: true })
  assert.equal(replaced.get().deals.length, 0)
})
test('Settings rejects stale profile results and save binds to the initiating account', () => {
  const settings = read('src/pages/app/Settings.tsx')
  assert.match(settings, /authUser.id !== user.id \|\| useAppStore.getState\(\).user\?\.id !== user.id/)
  assert.match(settings, /getWorkspaceDisplayName\(profile\?\.business_name, profile\?\.company, user.businessName, user.company\)/)
  const account = read('src/lib/accountProfile.ts')
  assert.match(account, /authUser.id !== input.expectedUserId/)
  const load = account.slice(account.indexOf('export async function loadAccountProfile()'), account.indexOf('export async function loadAuthenticatedOnboardingState'))
  assert.doesNotMatch(load, /\.update\(|\.upsert\(|\.insert\(/)
})

const profileBundle = await build({ entryPoints: ['src/lib/accountProfile.ts'], bundle: true, write: false, format: 'esm', platform: 'node',
  plugins: [{ name: 'profile-client-fixture', setup(builder) {
    builder.onResolve({ filter: /supabaseClient$/ }, () => ({ path: 'client', namespace: 'fixture' }))
    builder.onLoad({ filter: /.*/, namespace: 'fixture' }, () => ({ contents: 'export const supabase = globalThis.profileClientFixture' }))
  } }],
})
let authenticatedId = 'B'
let writes = []
globalThis.profileClientFixture = {
  auth: { getUser: async () => ({ data: { user: { id: authenticatedId, email: authenticatedId + '@example.invalid' } } }) },
  from(table) {
    const query = { select() { return query }, eq() { return query },
      upsert(row) { writes.push({ table, row }); return query },
      update(row) { writes.push({ table, row }); return query },
      maybeSingle: async () => ({ data: { user_id: authenticatedId, business_name: null, company: null } }),
      single: async () => ({ data: { user_id: authenticatedId, ...writes.at(-1)?.row } }),
    }
    return query
  },
}
const profileApi = await import('data:text/javascript;base64,' + Buffer.from(profileBundle.outputFiles[0].text).toString('base64'))
test('stale Settings save cannot write to a replacement account', async () => {
  writes = []
  authenticatedId = 'B'
  await assert.rejects(profileApi.saveAccountProfile({ expectedUserId: 'A', fullName: 'Person A', displayName: '', businessName: 'Workspace A' }), /Account changed/)
  assert.equal(writes.length, 0)
})
test('loading Settings and saving a blank business name do not rename the workspace', async () => {
  writes = []
  authenticatedId = 'A'
  await profileApi.loadAccountProfile()
  assert.equal(writes.length, 0)
  await profileApi.saveAccountProfile({ expectedUserId: 'A', fullName: 'Person A', displayName: '', businessName: '' })
  assert.equal(writes.length, 1)
  assert.equal(writes[0].table, 'account_profiles')
  assert.equal(writes[0].row.user_id, 'A')
})

test('same-looking names cannot preserve BuyerMatch-related private state across accounts', () => {
  const store = loginFromStore({ ...initial(), offers: {'A-deal': [{id:'A-offer'}]}, buyerResponses: {'A-buyer': {'A-deal': {exposure:'A-exposure'}}}, documents: {'A-deal': ['A-document']}, viewedDealIds:['A-deal'], viewedBuyerIds:['A-buyer'], blastLogs:{'A-deal':['A-dispatch']}, teamMembers:[{id:'A-admin'}] })
  store.login('b@example.invalid', 'Person A', {id:'B',preserveWorkspace:true,displayName:'Person A'})
  for (const key of ['offers','buyerResponses','documents','viewedDealIds','viewedBuyerIds','blastLogs','teamMembers']) assert.equal(Object.keys(store.get()[key]).length,0,key)
  assert.equal(store.get().user.isOwnerAdmin,false)
})

test('session recovery and account replacement apply server onboarding after workspace clearing', () => {
  const app = read('src/App.tsx')
  const start = app.indexOf("        const email = session.user.email || ''")
  const end = app.indexOf('          setAuthorized(true)', start)
  const block = app.slice(start, app.lastIndexOf('        if (!cancelled)', end))
  // Execute the actual RequireAuth success path together with the real store login.
  const js = ts.transpileModule(block, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText
  for (const previous of [null, initial().user]) {
    const store = loginFromStore({ ...initial(), user: previous, trial: {} })
    vm.runInNewContext(js, {
      session: { user: { id: 'B', email: 'b@example.invalid', user_metadata: {} } },
      payload: { planName: 'Free', workspace: { name: 'Workspace B' } },
      currentUserId: previous?.id, currentUserEmail: previous?.email,
      login: store.login, updateUserProfile() { throw new Error('unexpected same-user path') },
      useAppStore: { getState: store.get }, DEFAULT_SETTINGS: { onboarding: {} },
      getWorkspaceDisplayName: exports.getWorkspaceDisplayName,
      profileToUserNames: () => ({ name: 'Person B', fullName: 'Person B' }),
    })
    assert.equal(store.get().workspaceOwnerId, 'B')
    assert.equal(store.get().user.businessName, 'Workspace B')
    assert.equal(store.get().settings.onboarding.planSelectionCompleted, true)
    assert.equal(store.get().settings.onboarding.selectedPlan, 'Free')
    assert.equal(store.get().trial.plan, 'Free')
    assert.equal(store.get().deals.length, 0)
  }
})

test('another tab cannot reset server-confirmed onboarding or billing during session recovery', () => {
  const source = read('src/store/useAppStore.ts')
  const start = source.indexOf('function syncStoreFromPersistedStorage()')
  const end = source.indexOf("if (typeof window !== 'undefined')", start)
  const js = ts.transpileModule(source.slice(start, end) + '; syncStoreFromPersistedStorage()', { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText
  let state = { ...initial(), settings: { onboarding: { planSelectionCompleted: true, selectedPlan: 'Free' } }, trial: { plan: 'Free', billingStatus: 'Free Active' } }
  const persisted = { ...state, user: undefined, settings: { onboarding: { planSelectionCompleted: false } }, trial: { plan: 'Pro' } }
  vm.runInNewContext(js, {
    window: { localStorage: { getItem: () => JSON.stringify({state:persisted}) } }, STORAGE_KEY: 'fixture', IS_PRODUCTION: true,
    useAppStore: { getState: () => state, setState: patch => { state = {...state,...patch} } },
    privateWorkspaceScopeMatchesUser: () => true, shouldPersistBuyersLocally: false,
    stripPreviewSettings: value => value, readOwnerPreviewSession: () => undefined,
    cleanupOrphanedDealState: () => ({}), shouldApplyWorkspaceSync: () => true,
  })
  assert.equal(state.settings.onboarding.planSelectionCompleted,true)
  assert.equal(state.settings.onboarding.selectedPlan,'Free')
  assert.equal(state.trial.plan,'Free')
})

test('an inventory request started by User A cannot populate User B after replacement', async () => {
  const source = read('src/store/useAppStore.ts')
  const start = source.indexOf('      hydrateInventory: async () => {')
  const end = source.indexOf('      cacheInventoryDeal:', start)
  const arrow = source.slice(start,end).trim().replace(/^hydrateInventory: /,'').replace(/,$/,'')
  const js = ts.transpileModule('const hydrate = '+arrow+'; hydrate', { compilerOptions:{target:ts.ScriptTarget.ES2022} }).outputText
  let state = {...initial(), cleanupOrphanedDealData() {}}
  let complete
  const hydrate = vm.runInNewContext(js, {get:()=>state,set:patch=>{state={...state,...patch}},listInventoryDeals:()=>new Promise(resolve=>{complete=resolve}),makeWorkspaceDataScopeKey:user=>user ? user.id+':'+user.email : ''})
  const pending=hydrate()
  state={...state,user:{id:'B',email:'b@example.invalid'},deals:[]}
  complete({ok:true,data:[{id:'A-deal'}]})
  await pending
  assert.equal(state.deals.length,0)
})
