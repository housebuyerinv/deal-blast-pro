
﻿import { StorageAdapter } from './storageAdapter';
import { localStorageAdapter } from './localStorageAdapter';
import { apiAdapter } from './apiAdapter.stub';

const safeLower = (value: any) => String(value ?? '').toLowerCase();

const appMode = safeLower((import.meta as any).env?.VITE_APP_MODE || 'local');

export const isApiMode = appMode === 'api';

export const storage: StorageAdapter = (isApiMode ? apiAdapter : localStorageAdapter) as StorageAdapter;

export const getStorageMode = () => isApiMode ? 'api' : 'local';

export const getActiveAdapterName = () => 
  isApiMode ? 'apiAdapter.stub' : 'localStorageAdapter';

// Helper to safely call adapter methods with fallback
export async function safeStorageCall<T>(
  method: () => Promise<T>, 
  fallback: T, 
  errorMessage: string
): Promise<T> {
  try {
    return await method();
  } catch (error) {
    console.warn(`[Storage] ${errorMessage}`, error);
    return fallback;
  }
}


