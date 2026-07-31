<script setup lang="ts">
import { ref } from 'vue'
import type { Character } from '@/types/character'
import { useCharacterStore } from '@/stores/character'
import { useRankStore } from '@/stores/rank'
import { useAlerts } from '@/composables/alerts'

const props = withDefaults(
  defineProps<{
    character: Character
    readonly?: boolean
  }>(),
  {
    readonly: false,
  },
)

const characterStore = useCharacterStore()
const rankStore = useRankStore()
const { confirmAction } = useAlerts()

const isExpanded = ref(false)
const showAdvancedEdit = ref(false)

const openCard = () => {
  if (props.readonly) return
  isExpanded.value = true
}

const closeCard = () => {
  isExpanded.value = false
  showAdvancedEdit.value = false
}

const updateStringField = (
  event: Event,
  field: 'name' | 'series' | 'note' | 'imageUrl' | 'linkedTo',
) => {
  const target = event.target as HTMLInputElement
  const storeChar = characterStore.characters.find((c) => c.id === props.character.id)
  if (storeChar) {
    storeChar[field] = target.value
  }
}

const updateSkipToggle = (event: Event) => {
  const target = event.target as HTMLInputElement
  characterStore.toggleSingleSkip(props.character.id, target.checked)
}

const toggleFlag = () => {
  const storeChar = characterStore.characters.find((c) => c.id === props.character.id)
  if (storeChar) {
    storeChar.flag = !storeChar.flag
  }
}

const handleMergeRight = () => {
  characterStore.absorbAdjacent(props.character.id, 1)
  closeCard()
}

const handleInsert = () => {
  const storeChar = characterStore.characters.find((c) => c.id === props.character.id)
  if (storeChar) {
    rankStore.startPlacementMatches([storeChar])
    closeCard()
  }
}

const handleDelete = async () => {
  const confirmed = await confirmAction(
    `Are you sure you want to delete ${props.character.name}?`,
    'Delete Character',
  )
  if (confirmed) {
    characterStore.deleteCharacter(props.character.id)
    closeCard()
  }
}
</script>

<template>
  <div
    class="character-card-thumb"
    :class="{
      'is-skipped': character.skip && !character.linkedTo,
      'is-linked': character.skip && character.linkedTo,
    }"
    @click="openCard"
  >
    <div class="image-wrapper">
      <img :src="character.imageUrl" :alt="character.name" draggable="false" @dragstart.prevent />
      <div class="info-overlay">
        <span class="thumb-name">{{ character.name }}</span>
      </div>
    </div>
    <div v-if="character.note" class="note-badge">
      {{ character.note }}
    </div>

    <!-- Teleport nested inside root element -->
    <Teleport to="body">
      <Transition name="fade">
        <div v-if="isExpanded" class="expanded-backdrop" @click.stop="closeCard">
          <div class="expanded-card" @click.stop>
            <button class="btn-close" @click="closeCard">✖</button>

            <div class="expanded-visual">
              <img
                :src="character.imageUrl"
                :alt="character.name"
                draggable="false"
                @dragstart.prevent
              />
              <div class="info-overlay">
                <span class="name">{{ character.name }}</span>
                <span class="series">{{ character.series }}</span>
              </div>
            </div>

            <div class="expanded-panel">
              <div class="input-group">
                <input
                  type="text"
                  class="card-text-input"
                  :value="character.note"
                  @change="(e) => updateStringField(e, 'note')"
                  placeholder="Add a custom note..."
                />
              </div>

              <div class="input-group checkbox-group">
                <label class="checkbox-label">
                  <input
                    type="checkbox"
                    class="custom-checkbox"
                    :checked="character.skip"
                    @change="(e) => updateSkipToggle(e)"
                  />
                  <span class="custom-checkbox-box"></span>
                  Manual Rank / Follow-Me
                </label>
              </div>

              <!-- UPDATED: Hidden when not skipped -->
              <div v-if="character.skip" class="input-group" style="margin-bottom: 8px">
                <label class="small-label">Follow-Me Link:</label>
                <input
                  type="text"
                  class="card-text-input"
                  :value="character.linkedTo"
                  @change="(e) => updateStringField(e, 'linkedTo')"
                  placeholder="Exact character name..."
                />
              </div>

              <div class="action-grid">
                <button
                  class="btn-action"
                  :class="{ 'is-flagged': character.flag }"
                  @click="toggleFlag"
                >
                  {{ character.flag ? '🚩 Flagged' : '🏳️ Flag' }}
                </button>
                <button class="btn-action btn-insert" @click="handleInsert">⚡ Insert</button>
              </div>

              <button
                class="btn-action btn-merge"
                @click="handleMergeRight"
                :disabled="
                  characterStore.characters.indexOf(character) ===
                  characterStore.characters.length - 1
                "
              >
                ➡️ Merge Right
              </button>

              <button
                class="btn-action btn-edit-toggle"
                @click="showAdvancedEdit = !showAdvancedEdit"
              >
                {{ showAdvancedEdit ? '▴ Hide Edit Details' : '▾ Edit Details' }}
              </button>

              <div v-if="showAdvancedEdit" class="advanced-edit-fields">
                <div class="input-group">
                  <label class="small-label">Name:</label>
                  <input
                    type="text"
                    class="card-text-input"
                    :value="character.name"
                    @change="(e) => updateStringField(e, 'name')"
                  />
                </div>
                <div class="input-group">
                  <label class="small-label">Series:</label>
                  <input
                    type="text"
                    class="card-text-input"
                    :value="character.series"
                    @change="(e) => updateStringField(e, 'series')"
                  />
                </div>
                <div class="input-group">
                  <label class="small-label">Image URL:</label>
                  <input
                    type="text"
                    class="card-text-input"
                    :value="character.imageUrl"
                    @change="(e) => updateStringField(e, 'imageUrl')"
                  />
                </div>
              </div>

              <div class="danger-zone">
                <span class="os-stats">
                  &mu;: {{ character.mu.toFixed(2) }} | &sigma;: {{ character.sigma.toFixed(2) }}
                </span>
                <button class="btn-action text-danger" @click="handleDelete">🗑️ Delete</button>
              </div>
            </div>
          </div>
        </div>
      </Transition>
    </Teleport>
  </div>
</template>

<style scoped>
.character-card-thumb {
  position: relative;
  width: 110px;
  background-color: #2b2d31;
  border: 1px solid #1e1f22;
  border-radius: 6px;
  box-shadow: 0 4px 6px rgba(0, 0, 0, 0.2);
  cursor: grab;
  user-select: none;
  -webkit-user-select: none;
  transition:
    transform 0.2s ease,
    box-shadow 0.2s ease;
  overflow: hidden;
  box-sizing: border-box;
  touch-action: none;
}

.character-card-thumb:hover {
  transform: translateY(-3px);
  box-shadow: 0 8px 16px rgba(0, 0, 0, 0.4);
}

.character-card-thumb:active {
  cursor: grabbing;
}

.character-card-thumb.is-skipped {
  opacity: 0.5;
  filter: grayscale(80%);
}

.image-wrapper {
  position: relative;
  width: 100%;
  aspect-ratio: 225 / 350;
  background: #1e1f22;
}

.image-wrapper img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  pointer-events: none;
  -webkit-user-drag: none;
  user-drag: none;
  user-select: none;
  display: block;
}

.info-overlay {
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  background: rgba(0, 0, 0, 0.75);
  backdrop-filter: blur(2px);
  padding: 6px 8px;
  text-align: center;
  border-top: 1px solid rgba(255, 255, 255, 0.1);
}
.thumb-name {
  font-size: 0.77rem;
  color: #fff;
  font-weight: 300;
  letter-spacing: -0.05em;
  display: block;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.name {
  font-size: 1rem;
  color: #fff;
  font-weight: 600;
  display: block;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.series {
  font-size: 0.75rem;
  color: #949ba4;
  font-weight: 300;
  margin-top: 2px;
  display: block;
  white-space: normal;
  line-height: 1.25;
}

.note-badge {
  position: absolute;
  top: 4px;
  right: 4px;
  background-color: rgba(30, 31, 34, 0.85);
  color: #ffd700;
  font-size: 0.7rem;
  padding: 2px 6px;
  border-radius: 4px;
  border: 1px solid #4e5058;
  backdrop-filter: blur(4px);
  max-width: calc(100% - 8px);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.expanded-backdrop {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background-color: rgba(0, 0, 0, 0.7);
  backdrop-filter: blur(4px);
  z-index: 9999;
  display: flex;
  align-items: center;
  justify-content: center;
}

.expanded-card {
  position: relative;
  width: 260px;
  background-color: #2b2d31;
  border: 1px solid #4e5058;
  border-radius: 8px;
  box-shadow: 0 12px 24px rgba(0, 0, 0, 0.6);
  display: flex;
  flex-direction: column;
}

.btn-close {
  position: absolute;
  top: -10px;
  right: -10px;
  background: #da373c;
  color: white;
  border: none;
  border-radius: 50%;
  width: 30px;
  height: 30px;
  font-size: 14px;
  cursor: pointer;
  z-index: 10;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.5);
  transition: transform 0.1s;
}

.btn-close:hover {
  transform: scale(1.1);
}

.expanded-visual {
  position: relative;
  width: 100%;
  aspect-ratio: 225 / 350;
  background: #1e1f22;
  border-radius: 8px 8px 0 0; /* ADDED */
  overflow: hidden; /* ADDED */
}

.expanded-visual img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}

.expanded-panel {
  padding: 12px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.2s ease;
}
.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}

.input-group {
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.small-label {
  font-size: 0.7rem;
  color: #949ba4;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}
.card-text-input {
  width: 100%;
  box-sizing: border-box;
  background-color: #1e1f22;
  color: #dbdee1;
  border: 1px solid #4e5058;
  border-radius: 4px;
  padding: 6px;
  font-size: 0.8rem;
  outline: none;
}
.card-text-input:focus {
  border-color: #5865f2;
}

.action-grid {
  display: flex;
  gap: 6px;
}
.btn-action {
  flex: 1;
  background-color: #4e5058;
  color: #dbdee1;
  border: none;
  border-radius: 4px;
  padding: 6px;
  font-size: 0.8rem;
  cursor: pointer;
  transition: all 0.2s;
  font-weight: 500;
}
.btn-action:hover {
  background-color: #6d6f78;
}
.btn-action.is-flagged {
  background-color: #ffd700;
  color: #000;
}
.btn-insert {
  background-color: #5865f2;
  color: white;
}
.btn-insert:hover {
  background-color: #4752c4;
}
.btn-merge {
  background-color: #6a1b9a;
  color: white;
  width: 100%;
}
.btn-merge:hover {
  background-color: #8e24aa;
}

.btn-edit-toggle {
  background-color: transparent;
  border: 1px solid #4e5058;
  margin-top: 4px;
}
.btn-edit-toggle:hover {
  background-color: #383a40;
}

.advanced-edit-fields {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 8px;
  background-color: #1e1f22;
  border-radius: 4px;
  margin-top: 2px;
}

.danger-zone {
  display: flex;
  justify-content: flex-end;
  margin-top: 2px;
  border-top: 1px solid #4e5058;
  padding-top: 8px;
}
.text-danger {
  background-color: transparent;
  color: #da373c;
  flex: none;
  padding: 4px 8px;
}
.text-danger:hover {
  background-color: rgba(218, 55, 60, 0.1);
}

.danger-zone {
  display: flex;
  justify-content: space-between; /* Space out the stats and the button */
  align-items: center;
  margin-top: 2px;
  border-top: 1px solid #4e5058;
  padding-top: 8px;
}

.os-stats {
  color: #80848e;
  font-size: 11px;
  font-family: monospace;
}

.character-card-thumb.is-linked {
  opacity: 0.85;
  border-color: #5865f2; /* Subtle blurple border */
}

.checkbox-group {
  margin-top: 6px;
  margin-bottom: 8px;
}

.checkbox-label {
  display: flex;
  align-items: center;
  cursor: pointer;
  font-size: 0.8rem;
  color: #dbdee1;
  user-select: none;
}

.custom-checkbox {
  display: none; /* Hide the ugly native checkbox */
}

.custom-checkbox-box {
  display: inline-block;
  width: 16px;
  height: 16px;
  margin-right: 8px;
  border: 1px solid #4e5058;
  border-radius: 4px;
  background-color: #1e1f22;
  transition: all 0.2s ease;
  position: relative;
}

/* Checked State Background */
.custom-checkbox:checked + .custom-checkbox-box {
  background-color: #5865f2;
  border-color: #5865f2;
}

/* Checked State Checkmark */
.custom-checkbox:checked + .custom-checkbox-box::after {
  content: '';
  position: absolute;
  left: 4px;
  top: 1px;
  width: 4px;
  height: 8px;
  border: solid white;
  border-width: 0 2px 2px 0;
  transform: rotate(45deg);
}
</style>
