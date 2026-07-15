import { useEffect } from 'react'
import { uploadLocalAppDataToCloud } from './cloudSync'
import { supabase } from './supabase'

let saveTimer: ReturnType<typeof setTimeout> | null = null
let lastSavedSnapshot = ''
let lastSkippedAt = 0

export function scheduleCloudAutoSave() {
  if (saveTimer) clearTimeout(saveTimer)

  saveTimer = setTimeout(async () => {
    try {
      const { data: sessionData } = await supabase.auth.getSession()
      if (!sessionData.session?.user) return

      const snapshot = window.localStorage.getItem('dealblastpro-v1') || ''
      if (!snapshot || snapshot === lastSavedSnapshot) return

      await uploadLocalAppDataToCloud()
      lastSavedSnapshot = snapshot
    } catch (e) {
      const now = Date.now()
      if (now - lastSkippedAt > 300000) {
        lastSkippedAt = now
        console.warn('[Deal Blast Pro] Cloud auto-save skipped', e)
      }
    }
  }, 10000)
}

export function useCloudAutoSave() {
  useEffect(() => {
    const handler = () => scheduleCloudAutoSave()

    window.addEventListener('dealblastpro:storage-sync', handler)
    const interval = window.setInterval(handler, 300000)

    return () => {
      window.removeEventListener('dealblastpro:storage-sync', handler)
      window.clearInterval(interval)
    }
  }, [])
}


