import type { AppSettings, AppState } from './types'

export const APP_STORAGE_VERSION = 2
export const MAX_PERSISTED_APP_BYTES = 180_000

export function settingsWithoutPreview(settings: AppSettings): AppSettings {
  return { ...settings, ownerPreviewPlan: 'Owner Admin' }
}

export function buildProductionPersistedState(state: AppState & Record<string, any>) {
  return {
    workspaceInstanceId: state.workspaceInstanceId || null,
    workspaceOwnerId: state.workspaceOwnerId || null,
    workspaceOwnerEmail: state.workspaceOwnerEmail || null,
    workspaceDataScopeKey: state.workspaceDataScopeKey || null,
    trial: state.trial,
    settings: settingsWithoutPreview(state.settings),
    sidebarOpen: Boolean(state.sidebarOpen),
  }
}

export function migratePersistedAppState(value: any) {
  const state = value?.state && typeof value.state === 'object' ? value.state : {}
  return {
    ...value,
    version: APP_STORAGE_VERSION,
    state: {
      workspaceInstanceId: state.workspaceInstanceId || null,
      workspaceOwnerId: state.workspaceOwnerId || null,
      workspaceOwnerEmail: state.workspaceOwnerEmail || null,
      workspaceDataScopeKey: state.workspaceDataScopeKey || null,
      trial: state.trial,
      settings: state.settings ? settingsWithoutPreview(state.settings) : state.settings,
      sidebarOpen: Boolean(state.sidebarOpen),
    },
  }
}

export function persistedPayloadIsSafe(value: string) {
  return new TextEncoder().encode(value).byteLength <= MAX_PERSISTED_APP_BYTES
}
