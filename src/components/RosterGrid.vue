<script setup lang="ts">
import { watch } from 'vue'
import type { Ref } from 'vue'
import { useDragAndDrop } from '@formkit/drag-and-drop/vue'
import { useCharacterStore } from '@/stores/character'
import type { Character } from '@/types/character'
import CharacterCard from './CharacterCard.vue'

const characterStore = useCharacterStore()

const [parentRef, characters] = useDragAndDrop(characterStore.characters, {
  group: 'roster',
  draggingClass: 'is-dragging',
}) as unknown as [Ref<HTMLElement | null>, Ref<Character[]>]

let previousIds = characterStore.characters.map((c) => c.id)

// 1. Sync Drag-and-Drop changes BACK to Pinia
watch(
  characters,
  (newOrder: Character[]) => {
    // Prevent sync if a search is active (failsafe)
    if (characterStore.searchQuery) return

    const newIds = newOrder.map((c) => c.id)

    if (newIds.join(',') !== previousIds.join(',')) {
      if (newIds.length === previousIds.length) {
        let firstDiff = -1
        let lastDiff = -1

        for (let i = 0; i < newIds.length; i++) {
          if (newIds[i] !== previousIds[i]) {
            if (firstDiff === -1) firstDiff = i
            lastDiff = i
          }
        }

        if (firstDiff !== -1 && lastDiff !== -1) {
          let oldIndex = -1
          let newIndex = -1

          if (previousIds[firstDiff] === newIds[lastDiff]) {
            oldIndex = firstDiff
            newIndex = lastDiff
          } else if (previousIds[lastDiff] === newIds[firstDiff]) {
            oldIndex = lastDiff
            newIndex = firstDiff
          }

          if (oldIndex !== -1 && newIndex !== -1) {
            characterStore.characters = [...newOrder]
            characterStore.applyDragAndDropSort(oldIndex, newIndex)
          }
        } else {
          characterStore.updateAll([...newOrder])
        }
      } else {
        characterStore.updateAll([...newOrder])
      }
      previousIds = characterStore.characters.map((c) => c.id)
    }
  },
  { deep: true },
)

// 2. Sync External Pinia changes (Parses/Imports) INTO FormKit
watch(
  () => characterStore.characters,
  (newStoreChars: Character[]) => {
    const storeIds = newStoreChars.map((c) => c.id)
    const uiIds = characters.value.map((c) => c.id)

    if (storeIds.join(',') !== uiIds.join(',')) {
      characters.value.splice(0, characters.value.length, ...newStoreChars)
      previousIds = storeIds
    }
  },
  { deep: true },
)
</script>

<template>
  <div class="roster-container">
    <div v-if="characterStore.characters.length === 0" class="empty-state">
      <p>No characters found. Paste an export above to get started!</p>
    </div>

    <!-- Active Filter State: Read-Only Grid -->
    <div v-if="characterStore.searchQuery" class="character-card-container is-filtered">
      <div v-if="characterStore.filteredCharacters.length === 0" class="empty-state w-full">
        <p>No characters match your search.</p>
      </div>
      <CharacterCard
        v-for="char in characterStore.filteredCharacters"
        :key="char.id"
        :character="char"
        :readonly="true"
      />
    </div>

    <!-- Default State: Interactive Drag & Drop Grid -->
    <div
      v-show="characterStore.characters.length > 0 && !characterStore.searchQuery"
      ref="parentRef"
      class="character-card-container"
    >
      <CharacterCard v-for="char in characters" :key="char.id" :character="char" />
    </div>
  </div>
</template>

<style scoped>
.roster-container {
  padding: 0;
}

.character-card-container {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  justify-content: flex-start;
  align-items: flex-start;
}

.w-full {
  width: 100%;
}

.empty-state {
  text-align: center;
  padding: 40px;
  color: #949ba4;
  border: 2px dashed #4e5058;
  border-radius: 8px;
}

/* Visual cue that dragging is disabled */
.is-filtered {
  opacity: 0.95;
}

.is-dragging {
  opacity: 0.5;
  transform: scale(1.05);
  box-shadow: 0 12px 24px rgba(0, 0, 0, 0.6);
  z-index: 100;
}
</style>
