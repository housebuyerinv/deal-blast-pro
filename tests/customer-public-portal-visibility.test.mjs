import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'

const topbar = fs.readFileSync(new URL('../src/components/layout/Topbar.tsx', import.meta.url), 'utf8')
const dashboard = fs.readFileSync(new URL('../src/pages/app/Dashboard.tsx', import.meta.url), 'utf8')

test('public portal visibility uses the effective owner-admin authorization', () => {
  assert.match(topbar, /hasEffectiveOwnerAdminBypass\(user, settings\)/)
  assert.match(topbar, /ownerAdminPortalVisible && <Link to="\/portal"/)
  assert.match(dashboard, /ownerAdminToolsVisible && <div>Public Portal:/)
})

test('customers use internal intake instead of the owner portal', () => {
  assert.match(dashboard, /ownerAdminToolsVisible \? '\/portal' : '\/app\/intake'/)
  assert.match(dashboard, /ownerAdminToolsVisible && <div className="text-\[11px\].*Public Portal link/s)
})
