import { useCharacterStore } from '@/stores/character'
import { useRankStore } from '@/stores/rank'
import { useSyncStore } from '@/stores/sync'
import { useAutoSave } from '@/composables/autosave'
import { useAlerts } from '@/composables/alerts'
import type { AppSavePayload } from '@/types/app'

export function useAppBoot() {
  const characterStore = useCharacterStore()
  const rankStore = useRankStore()
  const syncStore = useSyncStore()
  const { showSuccess, showError, confirmAction } = useAlerts()

  const LOCAL_STORAGE_KEY = 'mudaeRankerCache'

  // --- Payload Management ---
  const buildSavePayload = (): AppSavePayload => ({
    appState: {
      rankingInProgress: rankStore.isRankingInProgress,
      activeMode: rankStore.mode,
    },
    characters: characterStore.characters,
    tierConfig: characterStore.tierConfig,
    metadata: {
      timestamp: Date.now(),
      deviceId: syncStore.deviceId,
    },
  })

  const loadSavePayload = (payload: AppSavePayload) => {
    if (payload.appState && 'activeMode' in payload.appState) {
      rankStore.mode = payload.appState.activeMode
    }

    const chars = payload.characters || []
    if (chars.length > 0) {
      characterStore.updateAll(chars)
    }

    if (payload.tierConfig) {
      characterStore.tierConfig = payload.tierConfig
    }

    // Resume active modes based on state
    if (rankStore.mode === 1) rankStore.resumeRankMode() // RankFinite
    else if (rankStore.mode === 3) rankStore.startEndlessRank() // Endless
  }

  // --- Sync Triggers ---
  const syncToCloud = () => {
    if (syncStore.githubToken && syncStore.gistId) {
      syncStore.pushToGist(buildSavePayload())
    }
  }

  // Attach the watchers
  useAutoSave(buildSavePayload, LOCAL_STORAGE_KEY, syncToCloud, 10000)

  // --- Boot Sequence & Conflict Resolution ---
  const bootApplication = async () => {
    // 1. Load Local Cache Synchronously
    const cachedSession = localStorage.getItem(LOCAL_STORAGE_KEY)
    let localData: AppSavePayload | null = null

    if (cachedSession) {
      try {
        const parsedData = JSON.parse(cachedSession) as AppSavePayload
        if (parsedData) {
          localData = parsedData
          loadSavePayload(localData)
        }
      } catch (e) {
        console.error("Failed to load local cache:", e)
      }
    }

    // 2. Initialize Cloud Sync
    const urlParams = new URLSearchParams(window.location.search)
    const code = urlParams.get('code')

    // CASE A: Returning from GitHub Auth Redirect
    if (code) {
      try {
        const token = await syncStore.exchangeAuthCodeForToken(code)
        syncStore.githubToken = token
        localStorage.setItem('gh_sync_token', token)

        const initialPayload = JSON.stringify(buildSavePayload())
        const gistInfo = await syncStore.findOrCreateSyncGist(token, initialPayload)

        syncStore.gistId = gistInfo.id
        localStorage.setItem('gh_sync_gist_id', gistInfo.id)

        if (!gistInfo.isNew) {
          const cloudData = await syncStore.pullFromGist()

          if (!localData || localData.characters.length === 0) {
            if (cloudData) loadSavePayload(cloudData)
            showSuccess("Connected! Loaded your save layout from the cloud.")
          } else {
            const userWantsCloud = await confirmAction(
              "An existing cloud save was found!\n\nClick 'Yes' to LOAD your cloud save (this will overwrite your current screen).\n\nClick 'Cancel' to KEEP your current screen and overwrite the cloud instead.",
              "Cloud Save Found"
            )

            if (userWantsCloud) {
              if (cloudData) loadSavePayload(cloudData)
              showSuccess("Connected! Synced your data down from the cloud.")
            } else {
              await syncStore.pushToGist(buildSavePayload())
              showSuccess("Connected! Cloud save updated with your current local layout.")
            }
          }
        } else {
          showSuccess("Connected! Created a fresh private save slot in your cloud.")
        }
      } catch (err: any) {
        showError("GitHub Sync Activation Failed: " + (err.message || "Network link failed."))
      } finally {
        // Scrub code from URL
        urlParams.delete('code')
        const newUrl = window.location.pathname + (urlParams.toString() ? '?' + urlParams.toString() : '')
        window.history.replaceState({}, document.title, newUrl)
      }
    }
    // CASE B: Regular Bootup
    else if (syncStore.githubToken && syncStore.gistId) {
      try {
        const cloudData = await syncStore.pullFromGist()
        if (!cloudData) return

        const cloudMeta = cloudData.metadata || { timestamp: 0, deviceId: 'unknown' }
        const localMeta = localData?.metadata || { timestamp: 0, deviceId: 'unknown' }

        if (cloudMeta.deviceId === syncStore.deviceId) {
          if (cloudMeta.timestamp > localMeta.timestamp) {
            console.log("☁️ Found a newer save from THIS device. Hydrating...")
            loadSavePayload(cloudData)
          } else {
            console.log("☁️ Local save is newer than Cloud save. Queuing push...")
            syncStore.lastSyncedCloudState = null // Forces overwrite on next tick
          }
        } else {
          if (cloudMeta.timestamp > localMeta.timestamp) {
            const dateStr = new Date(cloudMeta.timestamp).toLocaleString()
            const userWantsCloud = await confirmAction(
              `Found a newer save from another device (Saved: ${dateStr}).\n\nClick 'Yes' to LOAD the cloud save (overwriting this device).\n\nClick 'Cancel' to KEEP your current screen (overwriting the cloud).`,
              "⚠️ CLOUD CONFLICT DETECTED ⚠️"
            )

            if (userWantsCloud) {
              loadSavePayload(cloudData)
              showSuccess("☁️ Synced data from your other device.")
            } else {
              console.log("☁️ User rejected cloud save. Forcing cloud overwrite...")
              syncStore.lastSyncedCloudState = null
            }
          }
        }
      } catch (err) {
        console.error("❌ Failed to download background cloud sync on boot:", err)
      }
    }
  }

  return {
    bootApplication
  }
}
