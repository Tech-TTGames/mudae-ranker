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
@import url('https://fonts.googleapis.com/css2?family=Roboto+Condensed:wght@400;500;600;700&display=swap');


html,
body {
  margin: 0;
  padding: 0;
  width: 100%;
  height: 100%;
  background-color: #1e1f22;
  color: #dbdee1;
  font-family:
    'Roboto Condensed',
    system-ui,
    -apple-system,
    sans-serif;

  /* ADD THESE FOR CRISP DARK MODE FONTS */
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
}

* {
  box-sizing: border-box;
  margin: 0;
  padding: 0;
}

.swal-dark-input option {
  background-color: #1e1f22 !important;
  color: #dbdee1 !important;
}

.swal2-container {
  z-index: 10000 !important;
}

::-webkit-scrollbar {
  width: 10px;
  height: 10px;
}
::-webkit-scrollbar-track {
  background: #1e1f22;
}
::-webkit-scrollbar-thumb {
  background: #4e5058;
  border-radius: 5px;
}
::-webkit-scrollbar-thumb:hover {
  background: #6d6f78;
}
</style>
