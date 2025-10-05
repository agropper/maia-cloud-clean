<template>
  <q-dialog v-model="isOpen" persistent>
    <q-card style="min-width: 500px; max-width: 600px">
      <q-card-section class="text-center">
        <div class="text-h4 q-mb-md">🎉 Welcome to MAIA!</div>
        <div class="text-subtitle1 text-grey-7 q-mb-lg">
          As a new user, you can request support and your own private AI agent.
        </div>
      </q-card-section>

      <q-card-section class="q-px-xl">
        <div class="welcome-content">
          <p class="welcome-paragraph">
            You now have access to MAIA's medical AI assistant. You can:
          </p>
          
          <ul class="feature-list">
            <li>✅ Use the public AI for general medical questions</li>
            <li>✅ Request your own private AI agent for personal health records</li>
            <li>✅ Get administrator support for setup and assistance</li>
            <li>✅ Create knowledge bases from your health documents</li>
          </ul>

          <p class="welcome-paragraph">
            Would you like to request support to get started with your own private AI agent?
          </p>
        </div>
      </q-card-section>

      <q-card-actions class="q-px-xl q-pb-xl">
        <q-space />
        <q-btn
          flat
          label="Cancel"
          @click="handleCancel"
          class="q-mr-sm"
        />
        <q-btn
          color="primary"
          label="Request Support"
          @click="handleRequestSupport"
          icon="support_agent"
          class="q-px-lg"
        />
      </q-card-actions>
    </q-card>
  </q-dialog>

  <!-- Email Request Modal -->
  <q-dialog v-model="showEmailModal" persistent>
    <q-card style="min-width: 400px">
      <q-card-section class="row items-center q-pb-none">
        <div class="text-h6">📧 Request Administrator Support</div>
        <q-space />
        <q-btn icon="close" flat round dense v-close-popup />
      </q-card-section>

      <q-card-section>
        <p class="q-mb-md">
          Please provide your email address so the administrator can contact you about setting up your private AI agent.
        </p>
        
        <q-input
          v-model="userEmail"
          label="Your Email Address"
          outlined
          dense
          type="email"
          :rules="[
            (val) => !!val || 'Email is required',
            (val) => /.+@.+\..+/.test(val) || 'Please enter a valid email'
          ]"
          class="q-mb-md"
          placeholder="your.email@example.com"
        />
      </q-card-section>

      <q-card-actions align="right">
        <q-btn flat label="Cancel" @click="showEmailModal = false" />
        <q-btn
          color="primary"
          label="Send Request"
          @click="sendSupportRequest"
          :loading="isSendingRequest"
          icon="send"
        />
      </q-card-actions>
    </q-card>
  </q-dialog>
</template>

<script setup>
import { ref, watch } from 'vue'
import {
  QDialog,
  QCard,
  QCardSection,
  QCardActions,
  QBtn,
  QInput,
  QSpace
} from 'quasar'

// Props
const props = defineProps({
  modelValue: {
    type: Boolean,
    default: false
  },
  currentUser: {
    type: Object,
    default: null
  }
})

// Emits
const emit = defineEmits(['update:modelValue', 'support-requested'])

// Reactive state
const isOpen = ref(props.modelValue)
const showEmailModal = ref(false)
const userEmail = ref('')
const isSendingRequest = ref(false)

// Watch for prop changes
watch(() => props.modelValue, (newValue) => {
  isOpen.value = newValue
})

// Watch for internal changes
watch(isOpen, (newValue) => {
  emit('update:modelValue', newValue)
})

const handleCancel = () => {
  isOpen.value = false
  
  // Save that user has dismissed the welcome modal to prevent it from showing again
  if (props.currentUser && props.currentUser.userId) {
    localStorage.setItem(`maia-welcome-dismissed-${props.currentUser.userId}`, 'true')
    localStorage.setItem(`maia-welcome-dismissed-timestamp-${props.currentUser.userId}`, new Date().toISOString())
    console.log(`✅ [NewUserWelcomeModal] User ${props.currentUser.userId} dismissed welcome modal`)
  }
}

const handleRequestSupport = () => {
  showEmailModal.value = true
}

const sendSupportRequest = async () => {
  if (!userEmail.value || !props.currentUser) {
    return
  }

  isSendingRequest.value = true
  try {
    // Send email notification to admin using the existing API
    const response = await fetch('/api/admin/request-approval', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        username: props.currentUser.userId,
        email: userEmail.value,
        requestType: 'new_user_support_request',
        message: `New user ${props.currentUser.userId} (${userEmail.value}) is requesting support to set up their private AI agent and knowledge base access.`
      }),
    })

    if (response.ok) {
      // Notify parent component that support was requested
      emit('support-requested', {
        userId: props.currentUser.userId,
        email: userEmail.value
      })
      
      // Close both modals
      showEmailModal.value = false
      isOpen.value = false
      
      // Show success message (you might want to use a notification system here)
      console.log('Support request sent successfully!')
    } else {
      throw new Error('Failed to send support request')
    }
  } catch (error) {
    console.error('Error sending support request:', error)
    // You might want to show an error notification here
  } finally {
    isSendingRequest.value = false
  }
}
</script>

<style scoped>
.welcome-content {
  line-height: 1.6;
}

.welcome-paragraph {
  margin-bottom: 1rem;
  font-size: 1rem;
  color: #333;
}

.feature-list {
  margin: 1rem 0;
  padding-left: 1rem;
}

.feature-list li {
  margin-bottom: 0.5rem;
  font-size: 1rem;
  color: #555;
}
</style>
