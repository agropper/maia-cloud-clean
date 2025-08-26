<script setup lang="ts">
import ChatPrompt from '../components/ChatPrompt.vue'
import TooltipTest from '../components/TooltipTest.vue'
import { computed } from 'vue'

// Check if we're on the tooltip test route
const isTooltipTest = computed(() => {
  return window.location.pathname === '/vue-tooltip-test'
})
</script>

<template>
  <div class="wrapper">
    <TooltipTest v-if="isTooltipTest" />
    <ChatPrompt v-else />
  </div>
</template>
