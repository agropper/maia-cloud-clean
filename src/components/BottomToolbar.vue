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
            :disable="appState.isLoading"
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
                  <q-icon 
                    :name="selectedModel.icon" 
                    class="clickable-icon"
                    size="1.2em"
                  />
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
                    style="cursor: pointer;"
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
            :disable="appState.isLoading"
          >
            <template v-slot:append>
              <q-btn
                v-if="isSpeechSupported"
                flat
                dense
                :icon="isListening ? 'mic' : 'mic_none'"
                :color="isListening ? 'primary' : 'grey'"
                @click="toggleSpeechRecognition"
                :disable="appState.isLoading"
              />
              <q-spinner
                v-if="appState.isLoading"
                color="primary"
                size="1.2em"
                class="q-ml-sm"
              />
            </template>
          </q-input>
          
          <!-- Send Button -->
          <q-btn 
            color="primary" 
            :label="appState.isLoading ? '' : 'Send'"
            @click="triggerSendQuery" 
            size="sm"
            class="send-btn"
            :loading="appState.isLoading"
            :disable="appState.isLoading"
          />
        </div>
        
        <!-- Secondary action row -->
        <div class="action-row">
          <!-- File Upload Button -->
          <q-btn
            @click="pickFiles"
            flat
            icon="attach_file"
            class="file-btn"
          />
          
          <!-- Status Line - Centered on same line as paper clip button -->
          <div class="status-line">
            <!-- SIGN IN/SIGN OUT Toggle -->
            <q-btn
              v-if="!currentUser || (currentUser && (currentUser.userId === 'Unknown User' || currentUser.displayName === 'Unknown User'))"
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
            <span class="status-text">User</span>
            <span class="user-name">{{ getCurrentUserName() }}</span>
            <span class="status-text">has</span>
            
            <!-- Shared Chats Button -->
            <q-btn
              flat
              round
              dense
              size="sm"
              color="primary"
              class="group-count-btn q-mr-sm"
              @click="openGroupModal"
              title="View shared groups"
            >
              <div class="group-count">{{ groupCount }}</div>
            </q-btn>
            
            <span class="status-text">saved chats</span>
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

    <div :class="'message ' + appState.messageType">
      <p v-if="appState.isMessage">{{ appState.message }}</p>
    </div>

    <!-- Group Management Modal -->
    <GroupManagementModal
      v-model="showGroupModal"
      :currentUser="currentUser"
      :onGroupDeleted="handleGroupDeleted"
      @chatLoaded="handleChatLoaded"
    />

    <!-- Loading Pane - Only show when actually loading, not when user is unknown -->
    <div v-if="appState.isLoading && !isUserUnknown" :class="'loading-pane ' + appState.isLoading">
      <q-circular-progress indeterminate rounded size="30px" color="primary" class="q-ma-md" />
    </div>
  </div>
</template>

<script lang="ts">
import { defineComponent, ref, computed, watch } from 'vue'
import type { PropType } from 'vue'
import { QBtn, QInput, QCircularProgress, QSelect, QItem, QItemSection, QItemLabel, QIcon } from 'quasar'
import { GNAP } from 'vue3-gnap'
import type { AppState } from '../types'
import GroupManagementModal from './GroupManagementModal.vue'
import {
  initSpeechRecognition,
  PAUSE_THRESHOLD
} from '../utils'

export default defineComponent({
  name: 'BottomToolbar',
  
  emits: ['sign-in', 'sign-out', 'chat-loaded'],

  components: {
    QBtn,
    QInput,
    QCircularProgress,
    QSelect,
    QItem,
    QItemSection,
    QItemLabel,
    QIcon,
    GNAP,
    GroupManagementModal
  },

  props: {
    appState: {
      type: Object as PropType<AppState>,
      required: true
    },
    pickFiles: {
      type: Function as PropType<(evt: Event) => void>,
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
    }
  },

  setup(props, { emit }) {
    const isListening = ref(false)
    const recognition = ref<SpeechRecognition | null>(null)
    const isSpeechSupported = ref(false)
    const pauseTimer = ref<number | null>(null)
    const finalTranscript = ref('')
    const interimTranscript = ref('')

    const showGroupModal = ref(false)

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
      // We can add logic here if needed
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

    return {
      isListening,
      isSpeechSupported,
      toggleSpeechRecognition,
      selectedModel,
      getCurrentUserName,
      openGroupModal,
      showGroupModal,
      handleGroupDeleted,
      handleChatLoaded,
      handleIconClick,
      isUserUnknown
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

.loading-pane {
  display: flex;
  justify-content: center;
  align-items: center;
  padding: 16px;
  background: rgba(255, 255, 255, 0.9);
}

.loading-pane.true {
  background: rgba(255, 255, 255, 0.95);
}
</style>
