<script setup lang="ts">
import { watch, ref } from 'vue'
import type { Ref } from 'vue'
import { useDragAndDrop } from '@formkit/drag-and-drop/vue'
import { useCharacterStore } from '@/stores/character'
import type { Character } from '@/types/character'
import CharacterCard from './CharacterCard.vue'

const characterStore = useCharacterStore()
const filteredCards = ref<InstanceType<typeof CharacterCard>[]>([])
const gridCards = ref<InstanceType<typeof CharacterCard>[]>([])

const [parentRef, characters] = useDragAndDrop(characterStore.characters, {
  group: 'roster',
  draggingClass: 'is-dragging',
}) as unknown as [Ref<HTMLElement | null>, Ref<Character[]>]

let previousIds = characterStore.characters.map((c) => c.id)

const handleNavigate = (targetIndex: number, listType: 'filtered' | 'grid') => {
  // 1. Get the logical data array to find the true target
  const dataList = listType === 'filtered' ? characterStore.filteredCharacters : characters.value

  // 2. Ensure the target index exists within the array bounds
  if (targetIndex < 0 || targetIndex >= dataList.length) return

  // 3. Grab the ID of the character we actually want to open
  const targetId = dataList[targetIndex]!.id

  // 4. Get the scrambled array of Vue component instances
  const refList = listType === 'filtered' ? filteredCards.value : gridCards.value

  // 5. Iterate and match by ID, ignoring the unreliable array index
  refList.forEach((card) => {
    if (card?.characterId === targetId) {
      card.openCard?.()
    } else {
      card.closeCard?.()
    }
  })
}

// 1. Sync Drag-and-Drop changes BACK to Pinia
watch(
  () => characters.value.map((c) => c.id).join(','),
  (newIdsStr, oldIdsStr) => {
    if (characterStore.searchQuery) return

    if (newIdsStr !== oldIdsStr) {
      const newIds = newIdsStr.split(',')
      const previousIds = oldIdsStr ? oldIdsStr.split(',') : []

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

          // Dragged left-to-right (e.g., Index 0 to 2)
          if (
            previousIds[firstDiff] === newIds[lastDiff] &&
            previousIds[firstDiff + 1] === newIds[firstDiff]
          ) {
            oldIndex = firstDiff
            newIndex = lastDiff
          }
          // Dragged right-to-left (e.g., Index 2 to 0)
          else if (
            previousIds[lastDiff] === newIds[firstDiff] &&
            previousIds[lastDiff - 1] === newIds[lastDiff]
          ) {
            oldIndex = lastDiff
            newIndex = firstDiff
          }

          if (oldIndex !== -1 && newIndex !== -1) {
            characterStore.characters = [...characters.value]
            characterStore.applyDragAndDropSort(oldIndex, newIndex)
          } else {
            characterStore.updateAll([...characters.value])
          }
        }
      } else {
        characterStore.updateAll([...characters.value])
      }
    }
  },
)

// 2. Sync External Pinia changes (Parses/Imports) INTO FormKit
watch(
  () => characterStore.characters.map((c) => c.id).join(','),
  (newStoreIdsStr) => {
    const uiIdsStr = characters.value.map((c) => c.id).join(',')
    if (newStoreIdsStr !== uiIdsStr) {
      characters.value.splice(0, characters.value.length, ...characterStore.characters)
    }
  },
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
        v-for="(char, index) in characterStore.filteredCharacters"
        :key="char.id"
        ref="filteredCards"
        :character="char"
        :index="index"
        @open-adjacent="(targetIndex) => handleNavigate(targetIndex, 'filtered')"
      />
    </div>

    <!-- Default State: Interactive Drag & Drop Grid -->
    <div
      v-show="characterStore.characters.length > 0 && !characterStore.searchQuery"
      ref="parentRef"
      class="character-card-container"
    >
      <CharacterCard
        v-for="(char, index) in characters"
        :key="char.id"
        ref="gridCards"
        :character="char"
        :index="index"
        @open-adjacent="(targetIndex) => handleNavigate(targetIndex, 'grid')"
      />
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
