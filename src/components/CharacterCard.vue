<script setup lang="ts">
import { ref } from 'vue'
import type { Character } from '@/types/character'
import { useCharacterStore } from '@/stores/character'
import { useRankStore } from '@/stores/rank'
import { useAlerts } from '@/composables/alerts'

const props = defineProps<{
  character: Character
}>()

const characterStore = useCharacterStore()
const rankStore = useRankStore()
const { confirmAction } = useAlerts()

const isExpanded = ref(false)
const showAdvancedEdit = ref(false)

const openCard = () => {
  isExpanded.value = true
}

const closeCard = () => {
  isExpanded.value = false
  showAdvancedEdit.value = false
}

// Safely mutate the store reference directly to bypass vue/no-mutating-props
const updateStringField = (event: Event, field: 'name' | 'series' | 'note' | 'imageUrl') => {
  const target = event.target as HTMLInputElement
  const storeChar = characterStore.characters.find((c) => c.id === props.character.id)
  if (storeChar) {
    storeChar[field] = target.value
  }
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
  <!-- 1. THE GRID THUMBNAIL -->
  <div class="character-card-thumb" :class="{ 'is-skipped': character.skip }" @click="openCard">
    <div class="image-wrapper">
      <img :src="character.imageUrl" :alt="character.name" draggable="false" />
      <div class="info-overlay">
        <span class="name">{{ character.name }}</span>
      </div>
    </div>
    <div v-if="character.note" class="note-badge">
      {{ character.note }}
    </div>
  </div>

  <!-- 2. THE EXPANDED CENTERED MODAL -->
  <Teleport to="body">
    <Transition name="fade">
      <div v-if="isExpanded" class="expanded-backdrop" @click="closeCard">
        <!-- Expanded Card Container -->
        <div class="expanded-card" @click.stop>
          <!-- Close Button -->
          <button class="btn-close" @click="closeCard">✖</button>

          <!-- Large Visual -->
          <div class="expanded-visual">
            <img :src="character.imageUrl" :alt="character.name" draggable="false" />
            <div class="info-overlay">
              <span class="name">{{ character.name }}</span>
              <span class="series">{{ character.series }}</span>
            </div>
          </div>

          <!-- Edit Controls Panel -->
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

            <button class="btn-action btn-merge" @click="handleMergeRight">➡️ Merge Right</button>

            <!-- Advanced Edit Toggle -->
            <button
              class="btn-action btn-edit-toggle"
              @click="showAdvancedEdit = !showAdvancedEdit"
            >
              {{ showAdvancedEdit ? '▴ Hide Edit Details' : '▾ Edit Details' }}
            </button>

            <!-- Advanced Edit Accordion -->
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
              <button class="btn-action text-danger" @click="handleDelete">🗑️ Delete</button>
            </div>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
/* =========================================
   1. GRID THUMBNAIL (Standard Size)
   ========================================= */
.character-card-thumb {
  position: relative;
  width: 110px; /* Matches legacy visual scale */
  background-color: #2b2d31;
  border: 1px solid #1e1f22;
  border-radius: 6px;
  box-shadow: 0 4px 6px rgba(0, 0, 0, 0.2);
  cursor: grab;
  user-select: none;
  transition:
    transform 0.2s ease,
    box-shadow 0.2s ease;
  overflow: hidden;
  box-sizing: border-box;
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

.name {
  font-size: 0.85rem;
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
  margin-top: 2px;
  display: block;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
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

/* =========================================
   2. EXPANDED CENTERED MODAL
   ========================================= */
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
  width: 260px; /* Larger than thumbnail for easy reading */
  background-color: #2b2d31;
  border: 1px solid #4e5058;
  border-radius: 8px;
  box-shadow: 0 12px 24px rgba(0, 0, 0, 0.6);
  display: flex;
  flex-direction: column;
  overflow: hidden;
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

/* Transitions */
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.2s ease;
}
.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}

/* Reused UI Elements */
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
</style>
