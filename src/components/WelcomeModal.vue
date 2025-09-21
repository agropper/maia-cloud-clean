<template>
  <!-- Welcome Modal -->
  <QDialog v-model="showModal" persistent>
    <QCard class="welcome-modal">
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
          @click="handleUnderstand"
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
import { ref, onMounted } from 'vue'
import {
  QDialog,
  QCard,
  QCardSection,
  QCardActions,
  QBtn
} from 'quasar'
import HelpPage from './HelpPage.vue'

const showModal = ref(false)
const showHelpPage = ref(false)

const handleUnderstand = () => {
  showModal.value = false
  // Store that user has seen the welcome modal
  localStorage.setItem('maia-welcome-seen', 'true')
  // Also store the timestamp for future reference
  localStorage.setItem('maia-welcome-seen-timestamp', new Date().toISOString())
  
  // Always show help page after welcome modal
  console.log('[*] Showing help page after welcome modal')
  showHelpPage.value = true
}

const handleHelpClose = () => {
  showHelpPage.value = false
  console.log('[*] Help page closed, user can now continue')
}

onMounted(() => {
  // Only show modal if user hasn't seen it before and not on admin routes
  const hasSeenWelcome = localStorage.getItem('maia-welcome-seen')
  const isAdminRoute = window.location.pathname === '/admin' || window.location.pathname === '/admin/register'
  
  console.log('🔍 [WelcomeModal] Checking conditions:', {
    hasSeenWelcome,
    isAdminRoute,
    pathname: window.location.pathname,
    willShow: !hasSeenWelcome && !isAdminRoute
  })
  
  if (!hasSeenWelcome && !isAdminRoute) {
    console.log('✅ [WelcomeModal] Showing welcome modal')
    showModal.value = true
  } else {
    console.log('❌ [WelcomeModal] Not showing modal - already seen or admin route')
  }
})
</script>

<style scoped>
.welcome-modal {
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
