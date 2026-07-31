<script setup lang="ts">
import { onMounted, onUnmounted, computed, ref } from 'vue'
import { useRankStore } from '@/stores/rank'
import { useCharacterStore } from '@/stores/character'
import { AppMode } from '@/types/app'
import CharacterCard from './CharacterCard.vue'

const rankStore = useRankStore()
const characterStore = useCharacterStore()

// Track choice animations ('left', 'right', 'skip-left', 'skip-right')
const animatingChoice = ref<string | null>(null)

// Map to the store's tuple array
const leftChar = computed(() => rankStore.currentMatch[0])
const rightChar = computed(() => rankStore.currentMatch[1])

// --- Dynamic Progress Text ---
const rankProgressText = computed(() => {
  if (rankStore.mode === AppMode.Endless) {
    return '∞ Endless Mode'
  }

  if (rankStore.mode === AppMode.Placement) {
    const left = leftChar.value ? leftChar.value.placementMatchesLeft : 0
    return `Calibration Phase: ${left} match(es) remaining`
  }

  if (rankStore.mode === AppMode.RankFinite) {
    if (!leftChar.value) return 'Calculating bracket...'

    const currentRound = (leftChar.value.swissMatches || 0) + 1
    const maxRounds = rankStore.maxSwissRounds || 3

    const activeChars = characterStore.unskippedCharacters
    const totalMatchesNeeded = Math.ceil((activeChars.length * maxRounds) / 2)

    const currentMatchesPlayed = Math.floor(
      activeChars.reduce((sum, c) => sum + (c.swissMatches || 0), 0) / 2,
    )

    return `Swiss Bracket: Match ${currentMatchesPlayed + 1} / ${totalMatchesNeeded} (Round ${currentRound}/${maxRounds})`
  }

  return ''
})

// --- Match Resolution Wrappers ---
const chooseWinner = (winner: 'left' | 'right') => {
  if (animatingChoice.value) return

  animatingChoice.value = winner

  setTimeout(() => {
    if (winner === 'left') rankStore.resolveMatch(0)
    else if (winner === 'right') rankStore.resolveMatch(1)

    animatingChoice.value = null
  }, 200)
}

const skipCharacter = (side: 'left' | 'right') => {
  if (animatingChoice.value) return

  animatingChoice.value = `skip-${side}`

  setTimeout(() => {
    rankStore.skipParticipant(side === 'left' ? 0 : 1)
    animatingChoice.value = null
  }, 200)
}

const triggerUndo = () => {
  if (rankStore.canUndo) {
    rankStore.undoRank()
  }
}

// --- Keyboard Event Handler ---
const handleKeyDown = (event: KeyboardEvent) => {
  const target = event.target as HTMLElement | null
  if (target && ['INPUT', 'TEXTAREA'].includes(target.tagName)) return

  // Trap Ctrl+Z for Undo
  if (event.ctrlKey && event.key === 'z') {
    event.preventDefault()
    triggerUndo()
    return
  }

  switch (event.key) {
    case 'ArrowLeft':
    case 'a':
    case 'A':
      event.preventDefault()
      chooseWinner('left')
      break

    case 'ArrowRight':
    case 'd':
    case 'D':
      event.preventDefault()
      chooseWinner('right')
      break

    case 'ArrowUp':
    case 'w':
    case 'W':
      event.preventDefault()
      skipCharacter('left')
      break

    case 'ArrowDown':
    case 's':
    case 'S':
      event.preventDefault()
      skipCharacter('right')
      break

    case 'Escape':
      event.preventDefault()
      rankStore.pauseRankMode()
      break
  }
}

onMounted(() => {
  window.addEventListener('keydown', handleKeyDown)
})

onUnmounted(() => {
  window.removeEventListener('keydown', handleKeyDown)
})
</script>

<template>
  <Teleport to="body">
    <Transition name="modal-fade">
      <div v-if="rankStore.isRankingInProgress" class="ranking-modal-overlay">
        <div class="modal-header">
          <div class="rank-stats">
            <span>Which one is better?</span>
            <span class="progress-text">{{ rankProgressText }}</span>
          </div>
          <div class="header-controls">
            <button class="undo-btn" :disabled="!rankStore.canUndo" @click="triggerUndo">
              ⮌ Undo
            </button>
            <button class="close-btn" @click="rankStore.pauseRankMode">✕</button>
          </div>
        </div>

        <div v-if="leftChar && rightChar" class="vs-container">
          <!-- Left Candidate -->
          <div
            class="matchup-slot"
            :class="{
              'chosen-winner': animatingChoice === 'left',
              'chosen-loser': animatingChoice === 'right',
              skipped: animatingChoice === 'skip-left',
            }"
            @click.stop="chooseWinner('left')"
          >
            <CharacterCard :character="leftChar" :readonly="true" />
            <div class="slot-action-label"><span class="key-hint">← / A</span> Select</div>
            <button class="skip-btn" @click.stop="skipCharacter('left')">
              <span class="key-hint">↑ / W</span> Skip Left
            </button>
          </div>

          <!-- VS Divider -->
          <div class="vs-divider">
            <span class="vs-text">VS</span>
          </div>

          <!-- Right Candidate -->
          <div
            class="matchup-slot"
            :class="{
              'chosen-winner': animatingChoice === 'right',
              'chosen-loser': animatingChoice === 'left',
              skipped: animatingChoice === 'skip-right',
            }"
            @click.stop="chooseWinner('right')"
          >
            <CharacterCard :character="rightChar" :readonly="true" />
            <div class="slot-action-label"><span class="key-hint">D / →</span> Select</div>
            <button class="skip-btn" @click.stop="skipCharacter('right')">
              <span class="key-hint">↓ / S</span> Skip Right
            </button>
          </div>
        </div>

        <div class="keyboard-legend">
          <p>
            Shortcuts: <strong>←/A</strong> Pick Left | <strong>→/D</strong> Pick Right |
            <strong>↑/W</strong> Skip Left | <strong>↓/S</strong> Skip Right |
            <strong>Ctrl+Z</strong> Undo | <strong>Esc</strong> Pause
          </p>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.matchup-slot :deep(.character-card-thumb) {
  width: clamp(240px, 22vw, 380px) !important;
  border-radius: 12px; /* Bumped slightly to look smoother at larger sizes */
  border-width: 2px;
  pointer-events: none;
}

.matchup-slot :deep(.thumb-name) {
  /* Scale the text dynamically so it doesn't look tiny on a 380px card */
  font-size: clamp(1.15rem, 1.5vw, 1.4rem);
  font-weight: 500;
  padding: 8px 6px;
  white-space: normal;
  line-height: 1.2;
}

.matchup-slot :deep(.note-badge) {
  font-size: 0.85rem;
  padding: 4px 8px;
}

.ranking-modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  width: 100vw;
  height: 100vh;
  background-color: rgba(15, 15, 20, 0.94);
  backdrop-filter: blur(10px);
  z-index: 9999;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  padding: 24px;
  box-sizing: border-box;
}

.modal-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  color: #f2f3f5;
}

.rank-stats {
  display: flex;
  flex-direction: column;
}

.rank-stats span:first-child {
  font-size: 20px;
  font-weight: bold;
}

.progress-text {
  font-size: 14px;
  color: #949ba4;
}

.header-controls {
  display: flex;
  gap: 12px;
}

.undo-btn {
  background: #4e5058;
  color: white;
  border: none;
  padding: 8px 16px;
  border-radius: 4px;
  cursor: pointer;
  font-weight: bold;
  transition: background 0.2s;
}

.undo-btn:hover:not(:disabled) {
  background: #6d6f78;
}

.undo-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.close-btn {
  background: #da373c;
  color: white;
  border: none;
  padding: 8px 16px;
  border-radius: 4px;
  cursor: pointer;
  font-weight: bold;
  transition: background 0.2s;
}

.close-btn:hover {
  background: #a1282a;
}

.vs-container {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 50px;
  flex: 1;
}

.matchup-slot {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  cursor: pointer;
  transition:
    transform 0.2s ease,
    opacity 0.2s ease;
  padding: 16px;
  border-radius: 12px;
}

.matchup-slot:hover {
  transform: translateY(-4px);
}

.slot-action-label {
  color: #dbdee1;
  font-size: 14px;
}

.skip-btn {
  background: #4e5058;
  color: white;
  border: none;
  padding: 6px 12px;
  border-radius: 4px;
  font-size: 12px;
  cursor: pointer;
  transition: background 0.2s;
}

.skip-btn:hover {
  background: #da373c;
}

.vs-divider {
  display: flex;
  align-items: center;
  justify-content: center;
}

.vs-text {
  font-size: 56px;
  font-weight: 900;
  font-style: italic;
  color: #f2f3f5;
  text-shadow: 0 0 16px rgba(255, 255, 255, 0.2);
}

.key-hint {
  background: rgba(0, 0, 0, 0.4);
  padding: 2px 6px;
  border-radius: 4px;
  font-family: monospace;
  font-size: 11px;
  margin-left: 4px;
}

.keyboard-legend {
  text-align: center;
  color: #949ba4;
  font-size: 13px;
  border-top: 1px solid rgba(255, 255, 255, 0.1);
  padding-top: 12px;
}

/* Match Animations */
.chosen-winner {
  transform: scale(1.08) !important;
}

.chosen-loser {
  opacity: 0.15;
  transform: scale(0.92) !important;
}

.skipped {
  opacity: 0.1;
  transform: translateY(-60px) !important;
}

.modal-fade-enter-active,
.modal-fade-leave-active {
  transition: opacity 0.25s ease;
}

.modal-fade-enter-from,
.modal-fade-leave-to {
  opacity: 0;
}

@media (max-width: 768px) {
  .ranking-modal-overlay {
    padding: 16px;
    justify-content: flex-start; /* Prevent vertical stretching issues */
    overflow-y: auto; /* Let users scroll if it gets too tight */
  }

  /* Stack header elements */
  .modal-header {
    flex-direction: column;
    gap: 12px;
    text-align: center;
    margin-bottom: 20px;
  }

  /* Stack the cards vertically */
  .vs-container {
    flex-direction: column;
    gap: 20px;
  }

  /* Shrink the cards slightly so both fit on a vertical phone screen */
  .matchup-slot :deep(.character-card-thumb) {
    width: 200px !important;
  }

  /* Hide elements that waste space on mobile */
  .vs-divider,
  .keyboard-legend {
    display: none;
  }

  /* Adjust skip buttons for touch */
  .skip-btn {
    padding: 8px 16px; /* Larger touch target */
    font-size: 13px;
  }
}
</style>
