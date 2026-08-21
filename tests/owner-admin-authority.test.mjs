import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const source = (relative) => readFile(join(root, relative), 'utf8')

test('account status exposes only the server-resolved Owner Admin decision', async () => {
  const accountStatus = await source('api/account-status.ts')
  const accountAuth = await source('api/_accountAuth.ts')

  assert.match(accountStatus, /isOwnerAdmin:\s*account\.isOwnerAdmin/)
  assert.match(accountAuth, /process\.env\.DEALBLAST_OWNER_ADMIN_EMAILS/)
  assert.doesNotMatch(accountStatus, /DEALBLAST_OWNER_ADMIN_EMAILS|SUPER_ADMIN_EMAILS/)
})

test('client authority uses the authenticated account flag and no email allowlist', async () => {
  const accessControl = await source('src/lib/accessControl.ts')
  const constants = await source('src/lib/constants.ts')
  const app = await source('src/App.tsx')

  assert.match(accessControl, /user\?\.isOwnerAdmin === true/)
  assert.doesNotMatch(accessControl, /email|SUPER_ADMIN_EMAILS/)
  assert.doesNotMatch(constants, /SUPER_ADMIN_EMAILS|housebuyerinv@gmail\.com/)
  assert.match(app, /isOwnerAdmin:\s*payload\?\.isOwnerAdmin === true/g)
})

test('Owner Admin APIs remain protected by server-derived account authority', async () => {
  const platformActions = await source('src/server/platformActions.ts')

  assert.match(platformActions, /action==='admin-customer-lifecycle'[\s\S]*if\(!account\.isOwnerAdmin\)return send\(403/)
  assert.match(platformActions, /action==='admin-announcement-campaign'[\s\S]*if\(!account\.isOwnerAdmin\)return send\(403/)
})
