<template>
  <QDialog v-model="showModal" persistent>
    <QCard class="welcome-modal">
      <QCardSection class="text-center">
        <div class="text-h4 q-mb-md">Welcome to MAIA</div>
        <div class="text-subtitle1 text-grey-7 q-mb-lg">
          Medical AI Assistant
        </div>
      </QCardSection>

      <QCardSection class="q-px-xl">
        <div class="welcome-content">
          <p class="welcome-paragraph">
            The Medical AI Assistant (MAIA) has three different privacy modes: Public, Sponsored, and Private.
          </p>

          <p class="welcome-paragraph">
            <strong>Public</strong> is the default for new users. It allows you to become familiar with privacy features such as the difference between a Private AI agent and commercial AI like ChatGPT. The private AI agent has access to complete health records and acts as a gatekeeper so you can control sharing with commercial AIs.
          </p>

          <p class="welcome-paragraph">
            <strong>Sponsored</strong> lets you use MAIA with much privacy at no cost to you. When you Sign In and the administrator agrees to sponsor your Private AI agent and records knowledge base, your records will be private to you, the administrator and people you share a chat with. As with Public, you and your agent control what commercial AI can see.
          </p>

          <p class="welcome-paragraph">
            <strong>Private</strong> puts you in complete control of your Private AI agent using an administrator you choose. You will need to pay for hosting costs at Digital Ocean or another commodity hosting service. Because MAIA is Free open source software, the maintainers of MAIA will have no access to your MAIA.
          </p>
        </div>
      </QCardSection>

      <QCardActions class="q-px-xl q-pb-xl">
        <QBtn
          color="primary"
          size="lg"
          label="I Understand"
          @click="handleUnderstand"
          class="full-width"
        />
      </QCardActions>
    </QCard>
  </QDialog>
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

const showModal = ref(false)

const handleUnderstand = () => {
  showModal.value = false
  // Store that user has seen the welcome modal
  localStorage.setItem('maia-welcome-seen', 'true')
  // Also store the timestamp for future reference
  localStorage.setItem('maia-welcome-seen-timestamp', new Date().toISOString())
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
</style>
