<template>
  <div class="bottom-toolbar">
    <div class="prompt">
      <div class="inner">
        <!-- Main input row -->
        <div class="input-row">
          <!-- AI Model Dropdown -->
          <q-select
            outlined
            dense
            v-model="selectedModel"
            :options="AIoptions"
            class="ai-select"
            option-label="label"
            option-value="value"
          >
            <template v-slot:selected>
              <div class="row items-center">
                                <div
                  v-if="selectedModel.icon" 
                  class="icon-container q-mr-sm"
                  @click.stop.prevent="handleIconClick(selectedModel)"
                  @mousedown.stop.prevent
                  @mouseup.stop.prevent
                >
                  <div class="tooltip-wrapper">
                    <q-icon 
                      :name="selectedModel.icon" 
                      class="clickable-icon"
                      size="1.2em"
                    />
                    <div class="tooltip-text">Choose your prefered AI agent and the health records that it uses.</div>
                  </div>
                </div>
                <span>{{ selectedModel.label }}</span>
              </div>
            </template>
            <template v-slot:option="scope">
              <q-item v-bind="scope.itemProps">
                <q-item-section avatar v-if="scope.opt.icon">
                  <q-icon 
                    :name="scope.opt.icon" 
                    class="clickable-icon"
                    @click.stop="handleIconClick(scope.opt)"
                    style="cursor: pointer !important;"
                  />
                </q-item-section>
                <q-item-section>
                  <q-item-label>{{ scope.opt.label }}</q-item-label>
                </q-item-section>
              </q-item>
            </template>
          </q-select>
          
          <!-- Text Input -->
          <q-input
            outlined
            :placeholder="placeholderText"
            v-model="appState.currentQuery"
            @keyup.enter="triggerSendQuery"
            class="text-input"
          >
            <template v-slot:append>
              <q-btn
                v-if="isSpeechSupported"
                flat
                dense
                :icon="isListening ? 'mic' : 'mic_none'"
                :color="isListening ? 'primary' : 'grey'"
                @click="toggleSpeechRecognition"
              />

            </template>
          </q-input>
          
          <!-- Send Button -->
          <div class="tooltip-wrapper">
            <q-btn 
              color="primary" 
              label="Send" 
              @click="triggerSendQuery" 
              size="sm"
              class="send-btn"
            />
            <div class="tooltip-text">Send a message to the chosen AI. Chats shared with people as a deep link will not be updated unless you also click POST TO GROUP. You are responsible for sharing the deep link and notifying members of the group of changes. You can use, texts, emails, or patient portal messages to introduce your consultants to the shared chat link.</div>
          </div>
        </div>
        
        <!-- Secondary action row -->
        <div class="action-row">
                  <!-- File Upload Button -->
        <div class="tooltip-wrapper">
          <q-btn
            @click="pickFiles"
            flat
            icon="attach_file"
            class="file-btn"
          />
          <div class="tooltip-text">Upload a PDF or other file for the AIs to process.</div>
        </div>
        
        <!-- Hidden File Input -->
        <input
          ref="fileInput"
          type="file"
          multiple
          accept=".pdf,.txt,.md,.rtf"
          style="display: none"
          @change="handleFileUpload"
        />
          
          <!-- Status Line - Centered on same line as paper clip button -->
          <div class="status-line">
            <!-- SIGN IN/SIGN OUT Toggle -->
            <q-btn
              v-if="!currentUser || !currentUser.isAuthenticated"
              flat
              dense
              size="sm"
              color="primary"
              label="SIGN IN"
              @click="$emit('sign-in')"
              class="q-mr-sm"
            />
            <q-btn
              v-else
              flat
              dense
              size="sm"
              color="grey"
              label="SIGN OUT"
              @click="$emit('sign-out')"
              class="q-mr-sm"
            />
            
            <!-- User Display -->
            <div class="tooltip-wrapper">
              <span class="status-text">User</span>
              <div class="tooltip-text">Create and use passkeys to keep your chats more private.</div>
            </div>
            <span class="user-name">{{ getCurrentUserName() }}</span>
            <span class="status-text">has</span>
            
            <!-- Shared Chats Button -->
            <div class="tooltip-wrapper">
              <q-btn
                flat
                round
                dense
                size="sm"
                color="primary"
                class="group-count-btn q-mr-sm"
                @click="triggerLoadSavedChats"
              >
                <div class="group-count">{{ groupCount }}</div>
              </q-btn>
              <div class="tooltip-text">Choose a saved and shared chat.</div>
            </div>
            
            <div class="tooltip-wrapper">
              <span class="status-text">saved chats</span>
              <div class="tooltip-text">Choose a saved and shared chat.</div>
            </div>
            
            <!-- Deep Link Icon - Right end of status line -->
            <div v-if="deepLink" class="tooltip-wrapper">
              <q-btn
                flat
                round
                dense
                icon="link"
                color="secondary"
                @click="copyDeepLink"
                size="sm"
                class="q-ml-sm"
              />
              <div class="tooltip-text">Copy deep link to clipboard</div>
            </div>
            
            <!-- Info and Mail Icons - Bottom right -->
            <div class="tooltip-wrapper mail-icon-right">
              <q-btn
                flat
                round
                dense
                icon="info"
                color="primary"
                @click="handleInfoClick"
                size="sm"
                class="q-mr-sm"
              />
              <div class="tooltip-text">Show help guide</div>
            </div>
            
            <div class="tooltip-wrapper">
              <q-btn
                flat
                round
                dense
                icon="mail"
                color="primary"
                @click="handleMailClick"
                size="sm"
                class="q-ml-sm"
              />
              <div class="tooltip-text">Contact support</div>
            </div>
          </div>
          
          <!-- Load Saved Chats Button - Disabled for Group Chat functionality -->
          <!-- <q-btn
            v-if="!appState.isAuthorized"
            color="primary"
            label="Load Saved Chats"
            @click="triggerLoadSavedChats"
            size="sm"
            class="load-btn"
          /> -->
        </div>
      </div>
    </div>

    <div :class="'message ' + appState.messageType" v-if="appState.isMessage">
      <div class="message-content">
        <p>{{ appState.message }}</p>
        <q-btn
          flat
          round
          dense
          size="sm"
          icon="close"
          color="white"
          @click="appState.isMessage = false"
          class="q-ml-sm"
        />
      </div>
    </div>

    <!-- Group Management Modal -->
    <GroupManagementModal
      v-model="showGroupModal"
      :currentUser="currentUser"
      :onGroupDeleted="handleGroupDeleted"
      @chatLoaded="handleChatLoaded"
    />

    <!-- Help Welcome Modal -->
    <HelpWelcomeModal 
      v-model="showHelpWelcomeModal"
    />

    <!-- New User Welcome Modal -->
    <NewUserWelcomeModal 
      v-model="showNewUserWelcomeModal"
      :currentUser="currentUser"
      @support-requested="handleSupportRequested"
    />

    <!-- Help Page Modal -->
    <HelpPage 
      v-if="showHelpModal" 
      :is-visible="showHelpModal"
      @close="handleHelpClose"
    />

    <!-- Contact Support Modal -->
    <q-dialog v-model="showContactModal" persistent>
      <q-card style="min-width: 500px; max-width: 600px;">
        <q-card-section class="row items-center q-pb-none">
          <div class="text-h6">Contact Support</div>
          <q-space />
          <q-btn icon="close" flat round dense v-close-popup />
        </q-card-section>

        <q-card-section>
          <q-form @submit="sendContactMessage" class="q-gutter-md">
            <q-input
              v-model="contactForm.email"
              label="Your Email (optional if you expect an answer)"
              type="email"
              hint="We'll use this to respond to your message"
            />
            
            <q-select
              v-model="contactForm.messageType"
              :options="contactMessageTypes"
              label="Message Type"
              emit-value
              map-options
            />
            
            <q-input
              v-model="contactForm.subject"
              label="Subject *"
              :rules="[val => !!val || 'Subject is required']"
              required
            />
            
            <q-input
              v-model="contactForm.message"
              label="Message *"
              type="textarea"
              rows="4"
              :rules="[val => !!val || 'Message is required']"
              required
            />
          </q-form>
        </q-card-section>

        <q-card-actions align="right" class="q-pa-md">
          <q-btn flat label="Cancel" color="primary" v-close-popup />
          <q-btn 
            label="Send Message" 
            color="primary" 
            @click="sendContactMessage"
            :loading="isSendingContact"
            :disable="!contactForm.subject || !contactForm.message"
          />
        </q-card-actions>
      </q-card>
    </q-dialog>

    <!-- AI Loading Indicator -->
    <div v-if="appState.isLoading" class="ai-loading-indicator">
      <div class="loading-content">
        <q-icon name="hourglass_empty" size="24px" color="primary" class="loading-spinner hourglass-animation" />
        <span class="loading-text">AI responses typically take 5 to 30 seconds...</span>
      </div>
    </div>
  </div>
</template>

<script lang="ts">
import { defineComponent, ref, computed, watch } from 'vue'
import { uploadFile } from '../composables/useAuthHandling'
import type { PropType } from 'vue'
import { QBtn, QInput, QCircularProgress, QSelect, QItem, QItemSection, QItemLabel, QIcon, QTooltip, QDialog, QCard, QCardSection, QCardActions, QForm, QSpace, useQuasar } from 'quasar'
import { GNAP } from 'vue3-gnap'
import type { AppState } from '../types'
import GroupManagementModal from './GroupManagementModal.vue'
import HelpPage from './HelpPage.vue'
import HelpWelcomeModal from './HelpWelcomeModal.vue'
import NewUserWelcomeModal from './NewUserWelcomeModal.vue'
import {
  initSpeechRecognition,
  PAUSE_THRESHOLD
} from '../utils'

export default defineComponent({
  name: 'BottomToolbar',
  
  emits: ['sign-in', 'sign-out', 'chat-loaded', 'group-deleted', 'support-requested'],

  components: {
    QBtn,
    QInput,
    QCircularProgress,
    QSelect,
    QItem,
    QItemSection,
    QItemLabel,
    QIcon,
    QTooltip,
    QDialog,
    QCard,
    QCardSection,
    QCardActions,
    QForm,
    QSpace,
    GNAP,
    GroupManagementModal,
    HelpPage,
    HelpWelcomeModal,
    NewUserWelcomeModal
  },

  props: {
    appState: {
      type: Object as PropType<AppState>,
      required: true
    },

    triggerSendQuery: {
      type: Function as PropType<() => void>,
      required: true
    },
    triggerAuth: {
      type: Function as PropType<() => void>,
      required: true
    },
    triggerJWT: {
      type: Function as PropType<(...args: any[]) => any>,
      required: true
    },
    triggerLoadSavedChats: {
      type: Function as PropType<() => void>,
      required: true
    },
    triggerAgentManagement: {
      type: Function as PropType<() => void>,
      required: true
    },
    placeholderText: {
      type: String,
      default: 'Message Anthropic',
      required: false
    },
    clearLocalStorageKeys: {
      type: Function as PropType<() => void>,
      required: true
    },
    AIoptions: {
      type: Array as PropType<{ label: string; value: string; icon?: string }[]>,
      required: true
    },

    currentUser: {
      type: Object as PropType<any>,
      default: null
    },
    groupCount: {
      type: Number,
      default: 0
    },
    deepLink: {
      type: String,
      default: null as string | null
    }
  },

  setup(props, { emit }) {
    const $q = useQuasar()
    const isListening = ref(false)
    const recognition = ref<SpeechRecognition | null>(null)
    const isSpeechSupported = ref(false)
    const pauseTimer = ref<number | null>(null)
    const finalTranscript = ref('')
    const interimTranscript = ref('')

    const showGroupModal = ref(false)
    const showContactModal = ref(false)
    const showHelpModal = ref(false)
    const showHelpWelcomeModal = ref(false)
    const showNewUserWelcomeModal = ref(false)
    const isSendingContact = ref(false)
    const fileInput = ref<HTMLInputElement | null>(null)

    const contactForm = ref({
      email: '',
      subject: '',
      message: '',
      messageType: 'general_question'
    })

    const contactMessageTypes = [
      { label: 'General Question', value: 'general_question' },
      { label: 'Bug Report', value: 'bug_report' },
      { label: 'Feature Request', value: 'feature_request' },
      { label: 'Technical Support', value: 'technical_support' },
      { label: 'Account Issue', value: 'account_issue' },
      { label: 'Other', value: 'other' }
    ]

    const selectedModel = computed({
      get: () => {
        return props.AIoptions.find(opt => opt.value === props.appState.selectedAI) || props.AIoptions[0]
      },
      set: (val) => {
        if (val && typeof val === 'object' && 'value' in val) {
          props.appState.selectedAI = val.value
        }
      }
    })



    const handleSubmitAfterPause = () => {
      if (finalTranscript.value.trim()) {
        props.appState.currentQuery = finalTranscript.value.trim()
        props.triggerSendQuery()
        finalTranscript.value = ''
        interimTranscript.value = ''
        if (recognition.value) {
          recognition.value.stop()
        }
      }
    }

    const resetPauseTimer = () => {
      if (pauseTimer.value) {
        clearTimeout(pauseTimer.value)
      }
      pauseTimer.value = window.setTimeout(handleSubmitAfterPause, PAUSE_THRESHOLD)
    }

    recognition.value = initSpeechRecognition(
      (transcript) => {
        finalTranscript.value += transcript
        props.appState.currentQuery = finalTranscript.value
        resetPauseTimer()
      },
      (transcript) => {
        interimTranscript.value = transcript
        props.appState.currentQuery = finalTranscript.value + interimTranscript.value
      },
      () => {
        isListening.value = false
        handleSubmitAfterPause()
      },
      (error) => {
        console.error('Speech recognition error:', error)
        isListening.value = false
        if (pauseTimer.value) {
          clearTimeout(pauseTimer.value)
        }
      }
    )

    isSpeechSupported.value = recognition.value !== null



    const toggleSpeechRecognition = () => {
      if (!recognition.value) return

      if (isListening.value) {
        recognition.value.stop()
        isListening.value = false
        if (pauseTimer.value) {
          clearTimeout(pauseTimer.value)
        }
      } else {
        finalTranscript.value = ''
        interimTranscript.value = ''
        recognition.value.start()
        isListening.value = true
      }
    }

    const getCurrentUserName = () => {
      if (!props.currentUser) return 'Unknown User'
      if (typeof props.currentUser === 'string') return props.currentUser
      return props.currentUser.displayName || props.currentUser.userId || 'Unknown User'
    }

    const isUserUnknown = computed(() => {
      if (!props.currentUser) return true
      if (typeof props.currentUser === 'string') return props.currentUser === 'Unknown User'
      return props.currentUser.userId === 'Unknown User' || props.currentUser.displayName === 'Unknown User'
    })

    const openGroupModal = () => {
      showGroupModal.value = true
    }

    const handleGroupDeleted = () => {
      // This function will be called when a group is deleted
      // Emit the event to parent component so it can update the group count
      emit('group-deleted')
    }
    
    const handleFileUpload = async (event: Event) => {
      const files = (event.target as HTMLInputElement).files
      if (files && files.length > 0) {
        const file = files[0] // Take the first file for now
        if (file) {
          try {
            
            // Process file through the proper upload pipeline (which handles bucket upload)
            await uploadFile(file, props.appState, (message: string, type: string) => {
              console.log(`${type}: ${message}`)
            })
            
            // Show success notification
            $q.notify({
              type: 'positive',
              message: `File "${file.name}" processed and uploaded successfully!`,
              timeout: 3000
            })
            
          } catch (error: any) {
            console.error('File upload failed:', error)
            $q.notify({
              type: 'negative',
              message: `Failed to upload "${file.name}": ${error.message || 'Unknown error'}`,
              timeout: 5000
            })
          }
        }
      }
      // Reset the input so the same file can be selected again
      if (fileInput.value) {
        fileInput.value.value = ''
      }
    }
    
    const pickFiles = () => {
      if (fileInput.value) {
        fileInput.value.click()
      }
    }

    const handleChatLoaded = (groupChat: any) => {
      // Emit the loaded chat to the parent component
      emit('chat-loaded', groupChat)
    }

    const handleIconClick = (option: any) => {
      // Prevent any default behavior and event bubbling
      event?.preventDefault()
      event?.stopPropagation()
      
      // If this is the Private AI option with the manage_accounts icon, trigger agent management
      if (option.label === 'Private AI' && option.icon === 'manage_accounts') {
        props.triggerAgentManagement()
      }
    }

    const copyDeepLink = async () => {
      if (!props.deepLink) return
      
      try {
        await navigator.clipboard.writeText(props.deepLink)
        showCopyNotification()
      } catch (err) {
        console.error('❌ Failed to copy deep link:', err)
      }
    }

    const showCopyNotification = () => {
      // Create a simple toast notification
      const notification = document.createElement('div')
      notification.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        background-color: #4CAF50;
        color: white;
        padding: 12px 24px;
        border-radius: 4px;
        box-shadow: 0 2px 10px rgba(0,0,0,0.2);
        z-index: 10000;
        font-family: Arial, sans-serif;
        font-size: 14px;
        font-weight: 500;
      `
      notification.textContent = 'Link copied to clipboard!'
      document.body.appendChild(notification)
      
      // Remove after 1 second
      setTimeout(() => {
        if (document.body.contains(notification)) {
          document.body.removeChild(notification)
        }
      }, 1000)
    }

    const handleMailClick = () => {
      // Handle mail icon click - show contact form
      console.log('[*] Mail icon clicked - Opening contact form')
      showContactModal.value = true
    }

    const handleInfoClick = () => {
      // Handle info icon click - show help welcome modal first
      showHelpWelcomeModal.value = true
    }

    const handleHelpClose = () => {
      // Handle help page close
      showHelpModal.value = false
    }

    // Watch for new user sign-ins to show welcome modal
    const previousUser = ref(props.currentUser)
    watch(() => props.currentUser, (newUser, oldUser) => {
      // Check if this is a new user signing in (was null/undefined, now has a user)
      if (newUser && newUser.userId && newUser.userId !== 'Public User' && 
          (!oldUser || !oldUser.userId || oldUser.userId === 'Public User')) {
        // Show welcome modal for new authenticated users
        setTimeout(() => {
          showNewUserWelcomeModal.value = true
        }, 1000) // Small delay to let UI settle
      }
      previousUser.value = newUser
    }, { immediate: false })

    const handleSupportRequested = (data) => {
      console.log('Support requested for user:', data)
      // Emit event to parent component to refresh user data
      emit('support-requested', data)
    }

    const sendContactMessage = async () => {
      if (!contactForm.value.subject || !contactForm.value.message) {
        $q.notify({
          type: 'negative',
          message: 'Please fill in all required fields',
          timeout: 3000
        })
        return
      }

      isSendingContact.value = true
      try {
        const response = await fetch('/api/admin/contact-support', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            username: getCurrentUserName(),
            email: contactForm.value.email,
            subject: contactForm.value.subject,
            message: contactForm.value.message,
            messageType: contactForm.value.messageType
          }),
        })

        if (response.ok) {
          $q.notify({
            type: 'positive',
            message: 'Message sent successfully to administrator!',
            timeout: 3000
          })
          showContactModal.value = false
          
          // Reset form
          contactForm.value = {
            email: '',
            subject: '',
            message: '',
            messageType: 'general_question'
          }
        } else {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`)
        }
      } catch (error: any) {
        console.error('Error sending contact message:', error)
        $q.notify({
          type: 'negative',
          message: `Failed to send message: ${error.message}`,
          timeout: 5000
        })
      } finally {
        isSendingContact.value = false
      }
    }

    return {
      isListening,
      isSpeechSupported,
      toggleSpeechRecognition,
      selectedModel,
      getCurrentUserName,
      openGroupModal,
      showGroupModal,
      showContactModal,
      showHelpModal,
      showHelpWelcomeModal,
      showNewUserWelcomeModal,
      isSendingContact,
      contactForm,
      contactMessageTypes,
      handleGroupDeleted,
      handleChatLoaded,
      handleIconClick,
      copyDeepLink,
      isUserUnknown,
      handleFileUpload,
      pickFiles,
      fileInput,
      handleMailClick,
      handleInfoClick,
      handleHelpClose,
      handleSupportRequested,
      sendContactMessage
    }
  }
})
</script>

<style scoped>
.bottom-toolbar {
  position: fixed;
  bottom: 0;
  left: 0;
  right: 0;
  background: white;
  border-top: 1px solid #e0e0e0;
  z-index: 1000;
}

.status-line {
  display: flex;
  justify-content: center;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap; /* Allow elements to wrap to new lines */
  max-width: 100%; /* Ensure it never exceeds container width */
  padding: 2px 6px; /* Reduced padding for less height */
  min-height: 24px; /* Reduced minimum height */
  flex: 1; /* Take remaining space */
  justify-content: center; /* Center the content */
}

.status-text {
  font-weight: 500;
  color: #666;
  white-space: nowrap; /* Prevent text from breaking */
}

.user-name {
  font-weight: 600;
  color: #333;
  margin: 0 8px;
  white-space: nowrap; /* Prevent text from breaking */
}

.group-count-btn {
  min-width: 24px;
  height: 24px;
  padding: 0;
  flex-shrink: 0; /* Prevent button from shrinking */
}

.group-count {
  font-size: 12px;
  font-weight: bold;
  color: white;
  background-color: #1976d2;
  border-radius: 50%;
  width: 20px;
  height: 20px;
  display: flex;
  align-items: center;
  justify-content: center;
  line-height: 1;
  flex-shrink: 0; /* Prevent count from shrinking */
}

.prompt {
  padding: 16px;
}

.inner {
  max-width: 1200px;
  margin: 0 auto;
}

.input-row {
  display: flex;
  gap: 12px;
  align-items: center;
  flex-wrap: wrap; /* Allow wrapping on narrow screens */
  min-height: 32px; /* Reduced minimum height */
}

.ai-select {
  min-width: 150px;
  flex-shrink: 0; /* Prevent from shrinking too much */
}

.text-input {
  flex: 1;
  min-width: 200px; /* Ensure minimum usable width */
}

.send-btn {

.clickable-icon {
  transition: all 0.2s ease;
}

.clickable-icon:hover {
  color: #1976d2;
  transform: scale(1.1);
}

.icon-container {
  cursor: pointer;
  padding: 2px;
  border-radius: 4px;
  transition: background-color 0.2s ease;
}

.icon-container:hover {
  background-color: rgba(25, 118, 210, 0.1);
}
  min-width: 80px;
  flex-shrink: 0; /* Prevent from shrinking */
}

.action-row {
  display: flex;
  gap: 12px;
  align-items: center;
  flex-wrap: wrap; /* Allow wrapping on narrow screens */
  min-height: 32px; /* Reduced minimum height */
  justify-content: space-between; /* Distribute space between elements */
  width: 100%; /* Use full width */
}



.file-btn {
  min-width: 40px;
  flex-shrink: 0; /* Prevent from shrinking */
}



.message {
  padding: 8px 16px;
  text-align: center;
  font-size: 14px;
}

.message-content {
  display: flex;
  align-items: center;
  justify-content: center;
}

.message.info {
  background-color: #e3f2fd;
  color: #1976d2;
}

.message.success {
  background-color: #e8f5e8;
  color: #2e7d32;
}

.message.warning {
  background-color: #fff3e0;
  color: #f57c00;
}

.message.error {
  background-color: #ffebee;
  color: #d32f2f;
}

.ai-loading-indicator {
  position: fixed;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  z-index: 999;
  background: rgba(255, 255, 255, 0.95);
  border: 1px solid #e0e0e0;
  border-radius: 12px;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.15);
  backdrop-filter: blur(8px);
}

.loading-content {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 16px 20px;
}

.loading-spinner {
  flex-shrink: 0;
}

.hourglass-animation {
  animation: hourglass-spin 2s ease-in-out infinite;
}

@keyframes hourglass-spin {
  0% { transform: rotate(0deg); }
  25% { transform: rotate(90deg); }
  50% { transform: rotate(180deg); }
  75% { transform: rotate(270deg); }
  100% { transform: rotate(360deg); }
}

.loading-text {
  font-size: 14px;
  color: #666;
  white-space: nowrap;
  font-weight: 500;
}

.tooltip-wrapper {
  position: relative;
  display: inline-block;
  cursor: help;
}

.tooltip-text {
  visibility: hidden;
  width: 250px;
  background-color: #333;
  color: #fff;
  text-align: center;
  border-radius: 6px;
  padding: 8px 12px;
  position: absolute;
  z-index: 1000;
  bottom: 125%;
  left: 50%;
  margin-left: -125px;
  opacity: 0;
  transition: opacity 0.3s;
  font-size: 12px;
  line-height: 1.4;
  white-space: normal;
}

.tooltip-text::after {
  content: "";
  position: absolute;
  top: 100%;
  left: 50%;
  margin-left: -5px;
  border-width: 5px;
  border-style: solid;
  border-color: #333 transparent transparent transparent;
}

.tooltip-wrapper:hover .tooltip-text {
  visibility: visible;
  opacity: 1;
}

/* Ensure clickable icons show pointer cursor */
.clickable-icon {
  cursor: pointer !important;
}

/* Right-justify the mail icon */
.mail-icon-right {
  margin-left: auto;
}

</style>
