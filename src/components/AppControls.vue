<script setup lang="ts">
import { ref, computed } from 'vue'
import { useCharacterStore } from '@/stores/character'
import { useRankStore } from '@/stores/rank'
import { useSyncStore } from '@/stores/sync'
import { useAlerts } from '@/composables/alerts'
import {
  generateExportNotesCommand,
  generateExportSortCommand,
  exportCharactersToJson,
} from '@/utils/io.ts'
import TierConfigModal from './TierConfigModal.vue'

const characterStore = useCharacterStore()
const rankStore = useRankStore()
const syncStore = useSyncStore()
const alerts = useAlerts()

// --- Local State ---
const isCompactMode = ref(false)
const enableAutosave = ref(true)
const showTierModal = ref(false)

// Computed helpers based on store state
const hasCharacters = computed(() => characterStore.characters.length > 0)
const flaggedCount = computed(() => characterStore.flaggedCharacters.length)
const isCloudConnected = computed(() => !!syncStore.githubToken)

// --- Input / Parse Flow ---
const handleParseInput = async () => {
  const inputData = await alerts.promptTextArea(
    'Paste a previous export or results from $mmi-s / $mmai-s command here.\n\nSuggested commands: $mmi-s and then after importing order $mmai-s to add series data.',
    'Parse Input',
    'Paste data here...',
  )

  if (inputData) {
    try {
      characterStore.parseInputField(inputData)
      alerts.showSuccess('Import parsed and applied successfully!')
    } catch (error) {
      console.error(error)
      alerts.showError('Failed to parse input data. Check the console for details.')
    }
  }
}

// --- Mass Actions ---
const handleMassSkip = (skip: boolean) => {
  const count = characterStore.massToggleSkip(skip)
  alerts.showSuccess(`${skip ? 'Skipped' : 'Un-skipped'} ${count} characters.`)
}

const handleMassEditNotes = async () => {
  const note = await alerts.promptAction(
    'Enter a note to apply to all target characters (leave blank to clear):',
    'Mass Edit Notes',
  )
  if (note !== null) {
    const count = characterStore.massEditNotes(note)
    alerts.showSuccess(`Updated notes for ${count} characters.`)
  }
}

const handleMassLink = async () => {
  const target = await alerts.promptAction(
    'Enter the EXACT character name to link these characters behind:',
    'Mass Link After',
  )
  if (target) {
    const count = characterStore.massLinkAfter(target)
    if (count > 0) alerts.showSuccess(`Linked ${count} characters after ${target}.`)
    else alerts.showWarning('Target character not found.')
  }
}

const handleMassInsert = () => {
  const targetCount = characterStore.bulkActionTargetList.length

  if (targetCount === 0) {
    alerts.showError('No characters found to insert into placement matches.')
    return
  }

  const started = rankStore.massInsert()
  if (started) {
    alerts.showSuccess(`Started placement matches for ${targetCount} character(s)!`)
  } else {
    alerts.showError('Failed to start placement matches. Check character list.')
  }
}

const handleDeleteSelected = async () => {
  const confirmed = await alerts.confirmAction(
    'Are you sure you want to delete all selected characters? This cannot be undone.',
    'Delete Selected',
  )
  if (confirmed) {
    characterStore.massDeleteFlagged()
    alerts.showSuccess('Selected characters deleted.')
  }
}

// --- Export Flows ---
// --- Export Flows ---
const handleExportJSON = () => {
  // Directly trigger the file download from IO
  exportCharactersToJson(characterStore.characters)
  alerts.showSuccess('JSON backup downloaded!')
}

const handleExportSort = async () => {
  const flagged = characterStore.flaggedCharacters
  const targetList = flagged.length > 0 ? flagged : characterStore.characters

  try {
    const output = generateExportSortCommand(targetList, flagged.length > 0)
    const wantsToCopy = await alerts.displayExportText(
      output,
      'Export Sort ($smp)',
      'Copy your $smp command(s).',
    )
    if (wantsToCopy) copyToClipboard(output)
  } catch (error: unknown) {
    if (error instanceof Error) {
      alerts.showError(error.message)
    } else {
      alerts.showError(String(error))
    }
  }
}

const handleExportNotes = async () => {
  const flagged = characterStore.flaggedCharacters
  const targetList = flagged.length > 0 ? flagged : characterStore.characters

  try {
    const output = generateExportNotesCommand(targetList)
    const wantsToCopy = await alerts.displayExportText(
      output,
      'Export Notes ($note)',
      'Copy your $note command(s).',
    )
    if (wantsToCopy) copyToClipboard(output)
  } catch (error: unknown) {
    if (error instanceof Error) {
      alerts.showError(error.message)
    } else {
      alerts.showError(String(error))
    }
  }
}

const copyToClipboard = (text: string) => {
  navigator.clipboard
    .writeText(text)
    .then(() => alerts.showSuccess('Copied to clipboard!'))
    .catch(() => alerts.showError('Failed to copy.'))
}

// --- System Actions ---
const handleReset = async () => {
  const confirmed = await alerts.confirmAction(
    'Are you sure you want to completely wipe your roster? This cannot be undone!',
    '⚠️ Reset Data',
  )
  if (confirmed) {
    characterStore.characters = []
    alerts.showSuccess('Roster reset.')
  }
}

const toggleCloudSync = async () => {
  if (isCloudConnected.value) {
    const confirmed = await alerts.confirmAction('Disconnect from GitHub Cloud Sync?', 'Disconnect')
    if (confirmed) {
      syncStore.clearCredentials()
      alerts.showSuccess('Disconnected from Cloud.')
    }
  } else {
    // Redirects to GitHub for OAuth
    syncStore.redirectToGitHub()
  }
}
</script>

<template>
  <div class="controls-container">
    <!-- IO / Parsing Group -->
    <div class="control-group">
      <button class="btn parse-btn" @click="handleParseInput">📥 Parse Input</button>
    </div>

    <!-- Ranking Dropdown -->
    <div class="dropdown">
      <button class="btn rank-btn" :disabled="!hasCharacters">⚔️ Ranking ▾</button>
      <div class="dropdown-content">
        <button :disabled="!hasCharacters" @click="rankStore.startRankMode('balanced')">
          Pre-Rank (Finite)
        </button>
        <button
          :disabled="!hasCharacters || !rankStore.isRankingInProgress"
          @click="rankStore.resumeRankMode()"
        >
          Resume Ranking
        </button>
        <button :disabled="!hasCharacters" @click="rankStore.startEndlessRank()">
          ∞ Endless Rank
        </button>
      </div>
    </div>

    <!-- Mass Actions Dropdown -->
    <div class="dropdown">
      <button class="btn secondary" :disabled="!hasCharacters">📦 Mass Actions ▾</button>
      <div class="dropdown-content">
        <button @click="handleMassInsert">📥 Mass Insert (Placement Matches)</button>
        <button @click="handleMassEditNotes">✏️ Edit Local Notes</button>
        <button @click="showTierModal = true">📊 Auto-Stratify Notes</button>
        <button @click="handleMassSkip(true)">⏭️ Mass Skip</button>
        <button @click="handleMassSkip(false)">⏪ Mass Un-Skip</button>
        <button @click="handleMassLink">🔗 Mass Link After</button>
        <hr class="dropdown-divider" />
        <button :disabled="flaggedCount === 0" @click="characterStore.clearAllFlags()">
          ❌ Clear Selection
        </button>
        <button :disabled="flaggedCount === 0" class="text-danger" @click="handleDeleteSelected">
          🗑️ Delete Selected
        </button>
      </div>
    </div>

    <!-- Selection Indicator -->
    <span v-if="flaggedCount > 0" class="selection-indicator"> {{ flaggedCount }} Selected </span>

    <!-- View & Exports Dropdown -->
    <div class="dropdown">
      <button class="btn secondary" :disabled="!hasCharacters">📤 Exports / View ▾</button>
      <div class="dropdown-content">
        <button @click="handleExportSort">🔀 Export Sort ($smp)</button>
        <button @click="handleExportNotes">📝 Export Notes ($note)</button>
        <button @click="handleExportJSON">💾 Export JSON</button>
        <hr class="dropdown-divider" />
        <label class="dropdown-toggle">
          <input type="checkbox" v-model="isCompactMode" /> Compact View
        </label>
        <label class="dropdown-toggle">
          <input type="checkbox" v-model="enableAutosave" /> Autosave
        </label>
      </div>
    </div>
    <input
      type="text"
      v-model="characterStore.searchQuery"
      class="search-input"
      placeholder="Search roster..."
    />

    <!-- System Actions -->
    <div class="control-group system-group">
      <button
        class="btn sync-btn"
        :class="{ connected: isCloudConnected, disconnected: !isCloudConnected }"
        @click="toggleCloudSync"
        :title="isCloudConnected ? 'Disconnect GitHub Sync' : 'Connect to GitHub Gist'"
      >
        {{ isCloudConnected ? '🟢 Cloud Connected' : '⚪ Local Storage' }}
      </button>

      <button class="btn danger-btn" @click="handleReset">⚠️ Reset</button>
    </div>
  </div>
  <div v-if="showTierModal" class="modal-overlay" @click.self="showTierModal = false">
    <TierConfigModal @close="showTierModal = false" />
  </div>
</template>

<style scoped>
.controls-container {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  background-color: #1e1f22;
  padding: 12px 16px;
  border-radius: 8px;
  gap: 12px;
  margin-bottom: 20px;
}

.control-group {
  display: flex;
  align-items: center;
  gap: 8px;
}

.system-group {
  margin-left: auto;
}

.btn {
  font-family: inherit;
  font-weight: 600;
  font-size: 13px;
  padding: 8px 14px;
  border-radius: 4px;
  border: none;
  cursor: pointer;
  transition:
    background-color 0.2s,
    transform 0.1s;
  white-space: nowrap;
}

.btn:active:not(:disabled) {
  transform: translateY(1px);
}
.btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.btn.primary {
  background-color: #5865f2;
  color: white;
}
.btn.primary:hover:not(:disabled) {
  background-color: #4752c4;
}

.btn.secondary {
  background-color: #4e5058;
  color: white;
}
.btn.secondary:hover:not(:disabled) {
  background-color: #6d6f78;
}

.btn.rank-btn {
  background-color: #23a559;
  color: white;
}
.btn.rank-btn:hover:not(:disabled) {
  background-color: #1a7c43;
}

.btn.parse-btn {
  background-color: #23a559;
  color: white;
}
.btn.parse-btn:hover:not(:disabled) {
  background-color: #1a7c43;
}

.btn.danger-btn {
  background-color: #da373c;
  color: white;
}
.btn.danger-btn:hover:not(:disabled) {
  background-color: #a1282a;
}

.btn.sync-btn {
  border: 1px solid transparent;
}
.btn.sync-btn.connected {
  background-color: rgba(35, 165, 89, 0.15);
  color: #23a559;
  border-color: #23a559;
}
.btn.sync-btn.disconnected {
  background-color: rgba(148, 155, 164, 0.1);
  color: #949ba4;
  border-color: #4e5058;
}

.dropdown {
  position: relative;
  display: inline-block;
}

.dropdown-content {
  display: none;
  position: absolute;
  background-color: #2b2d31;
  min-width: 180px;
  box-shadow: 0px 8px 16px 0px rgba(0, 0, 0, 0.4);
  border-radius: 6px;
  padding: 6px;
  z-index: 100;
  top: 100%;
  left: 0;
  margin-top: 4px;
  border: 1px solid #1e1f22;
}

.dropdown:hover .dropdown-content {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.dropdown-content button {
  background: transparent;
  color: #dbdee1;
  border: none;
  padding: 8px 12px;
  text-align: left;
  border-radius: 4px;
  cursor: pointer;
  font-size: 13px;
  transition: background 0.1s;
}

.dropdown-content button:hover:not(:disabled) {
  background-color: #404249;
}

.dropdown-content button:disabled {
  color: #80848e;
  cursor: not-allowed;
}

.text-danger {
  color: #fa777c !important;
}
.text-danger:hover:not(:disabled) {
  background-color: rgba(218, 55, 60, 0.15) !important;
}

.dropdown-divider {
  border: none;
  border-top: 1px solid #4e5058;
  margin: 4px 0;
}

.dropdown-toggle {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  color: #dbdee1;
  font-size: 13px;
  cursor: pointer;
}

.selection-indicator {
  background-color: #5865f2;
  color: white;
  font-size: 12px;
  font-weight: bold;
  padding: 4px 8px;
  border-radius: 12px;
}

.modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  width: 100vw;
  height: 100vh;
  background: rgba(0, 0, 0, 0.6);
  display: flex;
  justify-content: center;
  align-items: center;
  z-index: 9999;
}

.search-input {
  background-color: #1e1f22;
  color: #dbdee1;
  border: 1px solid #4e5058;
  border-radius: 4px;
  padding: 8px 12px;
  font-size: 13px;
  outline: none;
  min-width: 220px;
  font-family: inherit;
}
.search-input:focus {
  border-color: #5865f2;
}
</style>
