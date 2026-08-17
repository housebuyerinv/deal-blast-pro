import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')

test('customer dashboard snapshot is compact, actionable, and owner-admin only', async () => {
  const source = await readFile(join(root, 'src/pages/app/Dashboard.tsx'), 'utf8')
  assert.match(source, /Workspace Snapshot/)
  assert.match(source, /Next step: Add a deal or import buyers to start matching\./)
  assert.match(source, /to="\/app\/intake"[^>]*>Add Deal/)
  assert.match(source, /to="\/app\/buyers"[^>]*>Import Buyers/)
  assert.match(source, /!ownerAdminToolsVisible && \(/)
})
