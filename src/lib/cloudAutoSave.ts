import { useEffect } from 'react'
import { uploadLocalAppDataToCloud } from './cloudSync'
import { supabase } from './supabase'

let saveTimer: ReturnType<typeof setTimeout> | null = null
let lastSavedSnapshot = ''
let lastSkippedAt = 0
let saveGeneration = 0
let autoSaveAllowed = true

function cancelPendingSave() {
  autoSaveAllowed = false
  saveGeneration++
  if (saveTimer) { clearTimeout(saveTimer); saveTimer = null }
}

export function scheduleCloudAutoSave() {
  if (!autoSaveAllowed) return
  if (saveTimer) clearTimeout(saveTimer)
  const generation = ++saveGeneration

  saveTimer = setTimeout(async () => {
    if (!autoSaveAllowed || generation !== saveGeneration) return
    saveTimer = null
    try {
      const { data: sessionData } = await supabase.auth.getSession()
      if (!autoSaveAllowed || generation !== saveGeneration) return
      if (!sessionData.session?.user) return

      const snapshot = window.localStorage.getItem('dealblastpro-v1') || ''
      if (!snapshot || snapshot === lastSavedSnapshot) return

      await uploadLocalAppDataToCloud()
      if (!autoSaveAllowed || generation !== saveGeneration) return
      lastSavedSnapshot = snapshot
    } catch (e) {
      if (!autoSaveAllowed || generation !== saveGeneration) return
      const now = Date.now()
      if (now - lastSkippedAt > 300000) {
        lastSkippedAt = now
        console.warn('[Deal Blast Pro] Cloud auto-save skipped', e)
      }
    }
  }, 10000)
}

export function useCloudAutoSave(enabled = true) {
  useEffect(() => {
    if (!enabled) { cancelPendingSave(); return }
    autoSaveAllowed = true
    const handler = () => scheduleCloudAutoSave()

    window.addEventListener('dealblastpro:storage-sync', handler)
    const interval = window.setInterval(handler, 300000)

    return () => {
      window.removeEventListener('dealblastpro:storage-sync', handler)
      window.clearInterval(interval)
      cancelPendingSave()
    }
  }, [enabled])
}


