<template>
  <!-- Help Welcome Modal -->
  <QDialog v-model="isOpen" persistent>
    <QCard class="help-welcome-modal">
      <QCardSection class="text-center">
        <div class="text-h4 q-mb-md">Welcome to MAIA</div>
        <div class="text-subtitle1 text-grey-7 q-mb-lg">
          Your Medical AI Assistant
        </div>
      </QCardSection>

      <QCardSection class="q-px-xl">
        <div class="welcome-content">
          <p class="welcome-paragraph">
            The Medical AI Assistant (MAIA) lets you choose from different privacy modes: Public, Supported, and Private.
          </p>

          <p class="welcome-paragraph">
            <strong>Public</strong> is the default for new users. It allows you to become familiar with privacy features such as the differences between a private AI and a commercial AI like ChatGPT. A private AI has access to your health records and acts as a gatekeeper, so you can control what you share with commercial AIs.
          </p>

          <p class="welcome-paragraph">
            <strong>Supported</strong> lets you use MAIA at no cost to you. When you sign in, the MAIA administrator agrees to pay for and maintain your private AI and records knowledge base. The administrator approves new accounts and provides technical support only. Your records will be private to you, the administrator and people you share a chat with. As with the public option, you and your private AI control what commercial AI can see.
          </p>

          <p class="welcome-paragraph">
            <strong>Private</strong> puts you in complete control of your private AI. You will need to pay for hosting costs at Digital Ocean or another hosting service. For support, you will need to set up an administrator or participate in a community. Only you and the people you specify will be able to access to your MAIA.
          </p>
        </div>
      </QCardSection>

      <QCardActions class="q-px-xl q-pb-xl">
        <QBtn
          color="primary"
          label="I understand these options"
          @click="handleShowHelp"
          class="full-width welcome-button"
        />
      </QCardActions>
    </QCard>
  </QDialog>

  <!-- Help Page -->
  <HelpPage 
    v-if="showHelpPage" 
    :is-visible="showHelpPage"
    @close="handleHelpClose"
  />
</template>

<script setup>
import { ref, watch } from 'vue'
import {
  QDialog,
  QCard,
  QCardSection,
  QCardActions,
  QBtn
} from 'quasar'
import HelpPage from './HelpPage.vue'

// Props - using modelValue for v-model support
const props = defineProps({
  modelValue: {
    type: Boolean,
    default: false
  }
})

// Emits - standard v-model pattern
const emit = defineEmits(['update:modelValue'])

const isOpen = ref(props.modelValue)
const showHelpPage = ref(false)

// Watch for v-model changes
watch(() => props.modelValue, (newValue) => {
  isOpen.value = newValue
})

// Watch for internal changes and emit to parent
watch(isOpen, (newValue) => {
  emit('update:modelValue', newValue)
})

const handleShowHelp = () => {
  // Close this modal and show help page
  isOpen.value = false
  showHelpPage.value = true
}

const handleHelpClose = () => {
  showHelpPage.value = false
}
</script>

<style scoped>
.help-welcome-modal {
  max-width: 900px;
  width: 90vw;
}

.welcome-content {
  line-height: 1.6;
}

.welcome-paragraph {
  margin-bottom: 1.5rem;
  font-size: 1rem;
  color: #333;
}

.welcome-paragraph:last-of-type {
  margin-bottom: 0;
}

.welcome-button {
  height: 48px;
  font-size: 16px;
  font-weight: 500;
}
</style>
