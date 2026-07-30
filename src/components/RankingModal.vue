<script setup lang="ts">
import { onMounted, onUnmounted, computed, ref } from 'vue'
import { useRankStore } from '@/stores/rank'
import CharacterCard from './CharacterCard.vue'

const rankStore = useRankStore()

// Track choice animations ('left', 'right', 'skip-left', 'skip-right')
const animatingChoice = ref<string | null>(null)

// Map to the store's tuple array
const leftChar = computed(() => rankStore.currentMatch[0])
const rightChar = computed(() => rankStore.currentMatch[1])

// --- Match Resolution Wrappers ---
const chooseWinner = (winner: 'left' | 'right') => {
  if (animatingChoice.value) return

  animatingChoice.value = winner

  setTimeout(() => {
    // 0 = Left Wins, 1 = Right Wins
    if (winner === 'left') rankStore.resolveMatch(0)
    else if (winner === 'right') rankStore.resolveMatch(1)

    animatingChoice.value = null
  }, 200)
}

const skipCharacter = (side: 'left' | 'right') => {
  if (animatingChoice.value) return

  animatingChoice.value = `skip-${side}`

  setTimeout(() => {
    // Pass the index to our new store action
    rankStore.skipParticipant(side === 'left' ? 0 : 1)
    animatingChoice.value = null
  }, 200)
}

// --- Keyboard Event Handler ---
const handleKeyDown = (event: KeyboardEvent) => {
  const target = event.target as HTMLElement | null
  // Safely check if target exists and is an input element before ignoring keystrokes
  if (target && ['INPUT', 'TEXTAREA'].includes(target.tagName)) return

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
            <span
              >Matches Completed: <strong>{{ rankStore.undoStack.length }}</strong></span
            >
          </div>
          <button class="close-btn" @click="rankStore.pauseRankMode">✕ Pause</button>
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
            @click="chooseWinner('left')"
          >
            <CharacterCard :character="leftChar" :is-interactive="false" />
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
            @click="chooseWinner('right')"
          >
            <CharacterCard :character="rightChar" :is-interactive="false" />
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
            <strong>Esc</strong> Pause
          </p>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
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
</style>
