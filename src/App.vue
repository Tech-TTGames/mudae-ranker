<script setup lang="ts">
import { onMounted } from 'vue'
import { useAppBoot } from '@/composables/setup'

const { bootApplication } = useAppBoot()

onMounted(() => {
  bootApplication()
})
</script>

<template>
  <router-view />
</template>
