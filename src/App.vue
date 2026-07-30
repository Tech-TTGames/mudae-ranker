<script setup lang="ts">
import { onMounted, computed } from 'vue'
import { useAppBoot } from '@/composables/setup'
import { useRankStore } from '@/stores/rank'
import { AppMode } from '@/types/app'
import RankingModal from '@/components/RankingModal.vue'

const { bootApplication } = useAppBoot()
const rankStore = useRankStore()

// Modal automatically appears whenever a ranking engine (Swiss/Endless/Placement) is active
const isRankingActive = computed(() => rankStore.mode !== AppMode.Edit)

onMounted(() => {
  bootApplication()
})
</script>

<template>
  <div id="app-container">
    <!-- Main Application View -->
    <router-view />

    <!-- Global Match / Ranking Overlay -->
    <RankingModal v-if="isRankingActive" />
  </div>
</template>

<style>
#app-container {
  min-height: 100vh;
  background-color: #1e1f22;
  color: #dbdee1;
  font-family:
    Inter,
    system-ui,
    -apple-system,
    sans-serif;
}

* {
  box-sizing: border-box;
  margin: 0;
  padding: 0;
}

html,
body {
  margin: 0;
  padding: 0;
  width: 100%;
  height: 100%;
  background-color: #1e1f22;
  color: #dbdee1;
}
</style>
