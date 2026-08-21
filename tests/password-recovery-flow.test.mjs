import assert from 'node:assert/strict'
import fs from 'node:fs'
import test from 'node:test'

const callback = fs.readFileSync(new URL('../src/pages/public/AuthCallback.tsx', import.meta.url), 'utf8')
const reset = fs.readFileSync(new URL('../src/pages/public/ResetPassword.tsx', import.meta.url), 'utf8')
const forgot = fs.readFileSync(new URL('../src/pages/public/ForgotPassword.tsx', import.meta.url), 'utf8')
const app = fs.readFileSync(new URL('../src/App.tsx', import.meta.url), 'utf8')

test('password recovery callback is isolated from normal auth callbacks', () => {
  assert.match(callback, /callbackType === 'recovery'/)
  assert.match(callback, /navigate\('\/reset-password'/)
  assert.match(callback, /dealblastpro:password-recovery/)
  assert.match(callback, /callbackType === 'email_change'/)
  assert.match(callback, /navigate\('\/app\/dashboard'/)
})

test('password reset form uses the authenticated Supabase recovery session', () => {
  assert.match(reset, /onAuthStateChange/)
  assert.match(reset, /PASSWORD_RECOVERY/)
  assert.match(reset, /sessionStorage\.removeItem\('dealblastpro:password-recovery'\)/)
  assert.match(reset, /updateUser\(\{ password \}\)/)
  assert.match(reset, /supabase\.auth\.signOut\(\)/)
  assert.match(reset, /New password/)
  assert.match(reset, /Confirm password/)
})

test('forgot-password and routing use recovery without logging tokens', () => {
  assert.match(forgot, /resetPasswordForEmail/)
  assert.match(forgot, /auth\/callback\?type=recovery/)
  assert.match(app, /path="\/reset-password"/)
  assert.doesNotMatch(callback + reset + forgot, /console\.(log|debug).*token/i)
})
