<template>
  <!-- Welcome Modal - Page 1: Privacy Options -->
  <QDialog v-model="showModal" persistent>
    <QCard class="welcome-modal">
      <QCardSection v-if="currentPage === 1" class="text-center">
        <div class="text-h4 q-mb-md">Welcome to MAIA</div>
        <div class="text-subtitle1 text-grey-7 q-mb-lg">
          Your Medical AI Assistant
        </div>
      </QCardSection>

      <!-- Page 1: Privacy Options (existing) -->
      <QCardSection v-if="currentPage === 1" class="q-px-xl">
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

      <!-- Page 2: Three Steps to Sponsored Personal AI (new) -->
      <QCardSection v-if="currentPage === 2">
           <div class="text-h5 q-mb-lg text-center">Three Steps to a Supported Private AI</div>
        <div class="welcome-content">
          <div class="step-section">
            <div class="step-number">1</div>
            <div class="step-content">
              <strong>Get your complete health records</strong> using your patient portal. This can take 48 hours or more. You can expect a PDF file that could be more than 500 pages long. <a href="https://www.youtube.com/watch?v=oSwgTSbIhAw" target="_blank" rel="noopener noreferrer">Here's how.</a>
            </div>
          </div>

          <div class="step-section">
            <div class="step-number">2</div>
            <div class="step-content">
              <strong>Click SIGN-IN, CREATE NEW PASSKEY and REQUEST SUPPORT.</strong> Expect a personal email when your Private AI agent is ready.
            </div>
          </div>

          <div class="step-section">
            <div class="step-number">3</div>
            <div class="step-content">
              <strong>Import your downloaded health record</strong> using the paperclip icon. Click CREATE KNOWLEDGE BASE to have it indexed. This can take a minute.
            </div>
          </div>

          <p class="welcome-paragraph q-mt-lg">
            You should now be able to get patient summaries and otherwise chat with your Private AI. You can edit the chats for privacy, consult the large commercial AIs, and share links to your saved chats with physicians and others.
          </p>
        </div>
      </QCardSection>

      <QCardActions class="q-px-xl q-pb-xl">
        <QBtn
          v-if="currentPage === 1"
          color="primary"
          label="I understand and agree"
          @click="goToPage2"
          class="full-width welcome-button"
        />
        <QBtn
          v-if="currentPage === 2"
          color="primary"
          label="OK"
          @click="goToPage3"
          class="full-width welcome-button"
        />
      </QCardActions>
    </QCard>
  </QDialog>

  <!-- Help Page (Page 3) -->
  <HelpPage 
    v-if="showHelpPage" 
    :is-visible="showHelpPage"
    @close="handleHelpClose"
  />
</template>

<script setup>
import { ref, onMounted, watch } from 'vue'
import {
  QDialog,
  QCard,
  QCardSection,
  QCardActions,
  QBtn
} from 'quasar'
import HelpPage from './HelpPage.vue'

// Props for v-model support
const props = defineProps({
  modelValue: {
    type: Boolean,
    default: false
  }
})

// Emits for v-model support
const emit = defineEmits(['update:modelValue'])

const showModal = ref(false)
const showHelpPage = ref(false)
const currentPage = ref(1)
const hasChecked = ref(false) // Prevent double-mount issues

// Watch for external modelValue changes
watch(() => props.modelValue, (newValue) => {
  showModal.value = newValue
})

// Watch for internal showModal changes and emit to parent
watch(showModal, (newValue) => {
  emit('update:modelValue', newValue)
})

// Initialize showModal with prop value
showModal.value = props.modelValue

// Cookie helper functions
const setCookie = (name, value, days) => {
  const date = new Date()
  date.setTime(date.getTime() + (days * 24 * 60 * 60 * 1000))
  const expires = `expires=${date.toUTCString()}`
  document.cookie = `${name}=${value};${expires};path=/;SameSite=Lax`
}

const getCookie = (name) => {
  const nameEQ = name + "="
  const ca = document.cookie.split(';')
  for (let i = 0; i < ca.length; i++) {
    let c = ca[i]
    while (c.charAt(0) === ' ') c = c.substring(1, c.length)
    if (c.indexOf(nameEQ) === 0) return c.substring(nameEQ.length, c.length)
  }
  return null
}

const goToPage2 = () => {
  currentPage.value = 2
}

const goToPage3 = () => {
  showModal.value = false
  // Store that user has seen the welcome modal (cookie expires in 7 days)
  setCookie('maia-welcome-seen', 'true', 7)
  console.log(`[WM] Cookie 'maia-welcome-seen' SET: expires in 7 days`)
  
  // Show help page (PDF UI legend)
  showHelpPage.value = true
}

const handleHelpClose = () => {
  showHelpPage.value = false
  // Reset to page 1 for next time
  currentPage.value = 1
}

onMounted(() => {
  // Prevent double-mount from showing modal twice
  if (hasChecked.value) {
    console.log(`[WM] WelcomeModal (3-page) skipped: already checked in this session`)
    return
  }
  hasChecked.value = true
  
  // Check cookie (expires in 7 days)
  const welcomeCookie = getCookie('maia-welcome-seen')
  const isAdminRoute = window.location.pathname === '/admin' || window.location.pathname === '/admin/register'
  
  console.log(`[WM] WelcomeModal (3-page) cookie check:`)
  console.log(`[WM]   - Cookie 'maia-welcome-seen': ${welcomeCookie ? `'${welcomeCookie}' (valid for 7 days from when set)` : 'not found'}`)
  console.log(`[WM]   - isAdminRoute: ${isAdminRoute}`)
  console.log(`[WM]   - pathname: ${window.location.pathname}`)
  
  if (!welcomeCookie && !isAdminRoute) {
    console.log(`[WM] WelcomeModal (3-page) TRIGGERED: no cookie found, showing modal`)
    showModal.value = true
  } else if (welcomeCookie) {
    console.log(`[WM] WelcomeModal (3-page) SKIPPED: cookie exists (modal was seen within last 7 days)`)
  } else if (isAdminRoute) {
    console.log(`[WM] WelcomeModal (3-page) SKIPPED: admin route`)
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

.step-section {
  display: flex;
  align-items: flex-start;
  margin-bottom: 2rem;
  gap: 1rem;
}

.step-number {
  flex-shrink: 0;
  width: 40px;
  height: 40px;
  border-radius: 50%;
  background-color: #1976d2;
  color: white;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 1.25rem;
  font-weight: 600;
}

.step-content {
  flex: 1;
  font-size: 1rem;
  color: #333;
  line-height: 1.6;
}

.step-content a {
  color: #1976d2;
  text-decoration: none;
  font-weight: 500;
}

.step-content a:hover {
  text-decoration: underline;
}
</style>
