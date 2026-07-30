<script setup lang="ts">
import AppControls from '@/components/AppControls.vue'
import CharacterRoster from '@/components/RosterGrid.vue'
import RankingModal from '@/components/RankingModal.vue'
import { useRankStore } from '@/stores/rank'

const rankStore = useRankStore()
</script>

<template>
  <main class="main-layout">
    <AppControls />
    <CharacterRoster />
    <RankingModal v-if="rankStore.isRankingModalOpen" />
  </main>
</template>

<style scoped>
.main-layout {
  max-width: 1400px;
  margin: 0 auto;
  padding: 16px;
}
</style>
