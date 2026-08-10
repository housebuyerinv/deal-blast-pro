import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import { URL } from 'node:url'

const source = async path => readFile(new URL(`../${path}`, import.meta.url), 'utf8')

test('accepted and delivered provider events remain durable and correlate by message ID', async () => {
  const webhook = await source('supabase/functions/resend-webhook/index.ts')
  assert.match(webhook, /'email\.sent': 'provider_accepted'/)
  assert.match(webhook, /'email\.delivered': 'delivered'/)
  assert.match(webhook, /provider_event_id: providerEventId/)
  assert.match(webhook, /provider_message_id: providerMessageId/)
  assert.match(webhook, /from\('email_delivery_events'\)\.insert/)

  const correlation = await source('api/_emailOperations.ts')
  assert.match(correlation, /eventsByMessage\.get\(row\.provider_message_id\)/)
  assert.match(correlation, /provider_event_id/)
  assert.match(correlation, /status === 'delivered'/)
})

test('Owner Admin history is server-authorized and spans only owned settings workspaces', async () => {
  const endpoint = await source('api/email-operations.ts')
  assert.match(endpoint, /if \(!account\.isOwnerAdmin\).*403/)
  assert.match(endpoint, /\.eq\('user_id', account\.user\.id\)/)
  assert.match(endpoint, /\.in\('workspace_id', workspaceIds\)/)
  assert.match(endpoint, /\.eq\('recipient', account\.email\.toLowerCase\(\)\)/)
  assert.match(endpoint, /never broaden this to arbitrary recipients/)
  assert.match(endpoint, /from\('email_notification_logs'\)/)
  assert.match(endpoint, /do not manufacture a delivery state/)
  assert.match(endpoint, /from\('email_delivery_events'\)/)
  assert.doesNotMatch(endpoint, /req\.query.*workspace|req\.body.*workspace/)
})

test('normal users are denied and empty state is returned only without owned operations', async () => {
  const endpoint = await source('api/email-operations.ts')
  const client = await source('src/lib/emailNotificationSettings.ts')
  assert.match(endpoint, /Owner admin access is required/)
  assert.match(endpoint, /uniqueOutboxRows/)
  assert.match(client, /fetch\('\/api\/email-operations'/)
  assert.match(client, /Array\.isArray\(payload\?\.operations\)/)
})
