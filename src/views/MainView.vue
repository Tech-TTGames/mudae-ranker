<script setup lang="ts">
import AppControls from '@/components/AppControls.vue'
import CharacterRoster from '@/components/RosterGrid.vue'
</script>

<template>
  <main class="main-layout">
    <AppControls />
    <CharacterRoster />
  </main>
</template>

<style scoped>
.main-layout {
  max-width: 98%;
  margin: 0 auto;
  padding: 8px;
}
</style>
