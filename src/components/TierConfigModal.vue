<script setup lang="ts">
import { useCharacterStore } from '@/stores/character'
import { useAlerts } from '@/composables/alerts'

const characterStore = useCharacterStore()
const alerts = useAlerts()
const emit = defineEmits(['close'])

const addTier = () => {
  characterStore.tierConfig.push({ label: 'New Tier', size: 10 })
}

const removeTier = (index: number) => {
  characterStore.tierConfig.splice(index, 1)
}

const moveTier = (index: number, direction: number) => {
  const targetIndex = index + direction
  if (targetIndex < 0 || targetIndex >= characterStore.tierConfig.length) return

  const temp = characterStore.tierConfig[index]!
  characterStore.tierConfig[index] = characterStore.tierConfig[targetIndex]!
  characterStore.tierConfig[targetIndex] = temp
}

const applyStratification = () => {
  characterStore.applyTierStratification()
  alerts.showSuccess('Auto-Stratification applied successfully!')
  emit('close')
}
</script>

<template>
  <div class="tier-modal">
    <div class="modal-header">
      <h3>📊 Auto-Stratify Notes</h3>
      <p class="subtitle">
        Automatically assign notes to your characters based on their exact rank. Use
        <strong>-1</strong> size to make a tier infinite (consume the rest of the list).
      </p>
    </div>

    <div class="tier-list">
      <div v-for="(tier, index) in characterStore.tierConfig" :key="index" class="tier-row">
        <div class="tier-actions">
          <button @click="moveTier(index, -1)" :disabled="index === 0">▲</button>
          <button
            @click="moveTier(index, 1)"
            :disabled="index === characterStore.tierConfig.length - 1"
          >
            ▼
          </button>
        </div>

        <input
          v-model="tier.label"
          type="text"
          class="tier-input label-input"
          placeholder="Tier Label (e.g. ❤️)"
        />

        <input
          v-model.number="tier.size"
          type="number"
          class="tier-input size-input"
          placeholder="Size"
          title="Set to -1 for an unbounded tier"
        />

        <button class="btn danger-btn icon-btn" @click="removeTier(index)">❌</button>
      </div>
    </div>

    <div class="modal-footer">
      <button class="btn secondary" @click="addTier">➕ Add Tier</button>
      <button class="btn primary" @click="applyStratification">🚀 Apply to Roster</button>
    </div>
  </div>
</template>

<style scoped>
.tier-modal {
  background-color: #2b2d31;
  padding: 20px;
  border-radius: 8px;
  color: #dbdee1;
  max-width: 500px;
}

.modal-header h3 {
  margin: 0 0 8px 0;
  color: white;
}

.subtitle {
  font-size: 13px;
  color: #949ba4;
  margin-bottom: 20px;
}

.tier-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
  margin-bottom: 20px;
}

.tier-row {
  display: flex;
  align-items: center;
  gap: 10px;
  background-color: #1e1f22;
  padding: 8px;
  border-radius: 6px;
}

.tier-actions {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.tier-actions button {
  background: transparent;
  border: none;
  color: #949ba4;
  cursor: pointer;
  font-size: 10px;
}
.tier-actions button:hover:not(:disabled) {
  color: white;
}
.tier-actions button:disabled {
  opacity: 0.3;
  cursor: not-allowed;
}

.tier-input {
  background-color: #383a40;
  border: 1px solid transparent;
  color: white;
  padding: 8px;
  border-radius: 4px;
  outline: none;
}
.tier-input:focus {
  border-color: #5865f2;
}

.label-input {
  flex: 1;
}
.size-input {
  width: 70px;
  text-align: center;
}

.modal-footer {
  display: flex;
  justify-content: space-between;
  align-items: center;
  border-top: 1px solid #4e5058;
  padding-top: 16px;
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
}

.btn:active:not(:disabled) {
  transform: translateY(1px);
}

.btn.primary {
  background-color: #5865f2;
  color: white;
}
.btn.primary:hover {
  background-color: #4752c4;
}

.btn.secondary {
  background-color: #4e5058;
  color: white;
}
.btn.secondary:hover {
  background-color: #6d6f78;
}

.btn.danger-btn {
  background-color: #da373c;
  color: white;
}
.btn.danger-btn:hover {
  background-color: #a1282a;
}

.icon-btn {
  padding: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
}
</style>
