<template>
  <QDialog v-model="showModal" persistent>
    <QCard class="no-agent-modal">
      <QCardSection class="text-center">
        <QIcon name="smart_toy" size="3rem" color="primary" class="q-mb-md" />
        <div class="text-h5 q-mb-md">No Private AI Agent Yet</div>
        <div class="text-subtitle1 text-grey-7 q-mb-lg">
          You don't have a private AI agent yet. You can request one from the administrator. If approved, you will get a sponsored account for your private AI and health records knowledge base.
        </div>
      </QCardSection>

      <QCardActions class="q-px-xl q-pb-xl">
        <QBtn
          color="grey"
          size="lg"
          label="Sign Out"
          @click="handleSignOut"
          class="q-mr-sm"
        />
        <QSpace />
        <QBtn
          color="primary"
          size="lg"
          label="Request"
          @click="handleRequest"
        />
      </QCardActions>
    </QCard>
  </QDialog>
</template>

<script setup>
import { ref } from 'vue'
import {
  QDialog,
  QCard,
  QCardSection,
  QCardActions,
  QBtn,
  QIcon,
  QSpace
} from 'quasar'

const showModal = ref(false)

const emit = defineEmits(['sign-out', 'request'])

const handleSignOut = () => {
  showModal.value = false
  emit('sign-out')
}

const handleRequest = () => {
  showModal.value = false
  emit('request')
}

// Expose methods to parent component
defineExpose({
  show: () => { showModal.value = true },
  hide: () => { showModal.value = false }
})
</script>

<style scoped>
.no-agent-modal {
  max-width: 500px;
  width: 90vw;
}
</style>
