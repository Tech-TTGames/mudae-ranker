<script setup lang="ts">
import { ref, computed } from 'vue'
import { useCharacterStore } from '@/stores/character'
import { useRankStore } from '@/stores/rank'
import { useSyncStore } from '@/stores/sync'
import { useAlerts } from '@/composables/alerts'

const characterStore = useCharacterStore()
const rankStore = useRankStore()
const syncStore = useSyncStore()
const alerts = useAlerts()

// --- Local State ---
const isCompactMode = ref(false)
const enableAutosave = ref(true)

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
    // TODO: Connect hybrid JSON/Mudae regex parser here
    alerts.showWarning('Parser logic pending connection!')
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
const handleExportJSON = async () => {
  const exportData = {
    characters: characterStore.characters
  }
  const exportString = JSON.stringify(exportData, null, 2)
  const wantsToCopy = await alerts.displayExportText(
    exportString,
    'Export JSON',
    'Copy this text to back up your characters.'
  )
  if (wantsToCopy) copyToClipboard(exportString)
}

const handleExportSort = async () => {
  const flagged = characterStore.flaggedCharacters
  const targetList = flagged.length > 0 ? flagged : [...characterStore.characters]
  const total = targetList.length

  if (total === 0) return alerts.showError('No characters available to export.')
  if (targetList[0].originalName === undefined) return alerts.showError("Looks like your characters don't have original names stored.")

  // Ensure they are strictly sorted by score
  targetList.sort((a, b) => b.score - a.score)

  let output = ''
  if (flagged.length === 0) {
    output += `$fm ${targetList[0].originalName}\n\n`
  }

  if (total > 1) {
    const MAX_DISCORD_LENGTH = 2000
    let currentChunk = `$smp ${targetList[0].originalName}`

    for (let i = 1; i < total; i++) {
      const nextAddition = `$${targetList[i].originalName}`

      if (currentChunk.length + nextAddition.length > MAX_DISCORD_LENGTH) {
        output += currentChunk + '\n\n'
        currentChunk = `$smp ${targetList[i-1].originalName}${nextAddition}`
      } else {
        currentChunk += nextAddition
      }
    }

    if (currentChunk !== `$smp ${targetList[total - 1].originalName}`) {
      output += currentChunk + '\n\n'
    }
  } else if (flagged.length > 0 && total === 1) {
    return alerts.showError('You need at least 2 characters selected to generate a differential sort.')
  }

  const wantsToCopy = await alerts.displayExportText(output.trim(), 'Export Sort ($smp)', 'Copy your $smp command(s).')
  if (wantsToCopy) copyToClipboard(output.trim())
}

const handleExportNotes = async () => {
  const flagged = characterStore.flaggedCharacters
  const targetList = flagged.length > 0 ? flagged : [...characterStore.characters]

  if (targetList.length === 0) return alerts.showError('No characters available to export.')

  const noteGroups: Record<string, string[]> = {}
  targetList.forEach(c => {
    const note = (c.note || '').trim()
    if (note !== '') {
      if (!noteGroups[note]) noteGroups[note] = []
      noteGroups[note].push(c.originalName)
    }
  })

  if (Object.keys(noteGroups).length === 0) {
    return alerts.showError('None of the targeted characters have notes saved.')
  }

  let output = ''
  const MAX_DISCORD_LENGTH = 2000

  for (const [noteText, names] of Object.entries(noteGroups)) {
    let currentNames: string[] = []
    let currentLength = `$note $${noteText}`.length

    for (let i = 0; i < names.length; i++) {
      const nameLen = names[i].length + (currentNames.length > 0 ? 1 : 0)

      if (currentLength + nameLen > MAX_DISCORD_LENGTH) {
        output += `$note ${currentNames.join('$')}$${noteText}\n`
        currentNames = [names[i]]
        currentLength = `$note $${noteText}`.length + names[i].length
      } else {
        currentNames.push(names[i])
        currentLength += nameLen
      }
    }
    if (currentNames.length > 0) {
      output += `$note ${currentNames.join('$')}$${noteText}\n`
    }
  }

  const wantsToCopy = await alerts.displayExportText(output.trim(), 'Export Notes ($note)', 'Copy your $note command(s).')
  if (wantsToCopy) copyToClipboard(output.trim())
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

const handleNotImplemented = (feature: string) => {
  alerts.showWarning(`${feature} is under construction!`)
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
        <button :disabled="flaggedCount === 0" @click="handleNotImplemented('Batch Insert')">
          ⚡ Batch Insert
        </button>
        <button @click="handleMassEditNotes">✏️ Edit Local Notes</button>
        <button @click="handleNotImplemented('Auto-Stratify')">📊 Auto-Stratify Notes</button>
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
</style>
