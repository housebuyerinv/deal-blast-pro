import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'

const dashboard = fs.readFileSync(new URL('../src/pages/app/Dashboard.tsx', import.meta.url), 'utf8')

test('customer Get Started panel fills the KPI row while owner infrastructure stays hidden', () => {
  assert.match(dashboard, /!ownerAdminToolsVisible && \(/)
  assert.match(dashboard, /Get Started/)
  assert.match(dashboard, /Add a deal or import buyers to start matching opportunities\./)
  assert.doesNotMatch(dashboard, /Workspace Snapshot/)
  assert.doesNotMatch(dashboard, /Next step: Add a deal or import buyers to start matching\./)
  assert.match(dashboard, /to="\/app\/intake" className="btn btn-ghost text-xs">Add Deal/)
  assert.match(dashboard, /to="\/app\/buyers" className="btn btn-ghost text-xs">Import Buyers/)
  assert.match(dashboard, /ownerAdminToolsVisible && <>[\s\S]*<Link to="\/portal"/)
})
