import { watch } from 'vue'
import { watchDebounced } from '@vueuse/core';

export function useAutoSave<T>(
  getPayload: () => T,
  storageKey: string,
  cloudSyncCallback?: () => void,
  cloudDebounceMs: number = 10000
) {
  // 1. INSTANT: Bulletproof local backup so no data is ever lost if the tab closes
  watch(
    getPayload,
    (newPayload) => {
      try {
        if (newPayload) {
          localStorage.setItem(storageKey, JSON.stringify(newPayload))
        } else {
          localStorage.removeItem(storageKey)
        }
      } catch (e) {
        console.error(`[AutoSave] Local storage failed for ${storageKey}:`, e)
      }
    },
    { deep: true }
  )

  // 2. DELAYED: Safely batch GitHub API calls
  if (cloudSyncCallback) {
    watchDebounced(
      getPayload,
      () => {
        cloudSyncCallback()
      },
      { deep: true, debounce: cloudDebounceMs, maxWait: 30000 }
    )
  }
}
