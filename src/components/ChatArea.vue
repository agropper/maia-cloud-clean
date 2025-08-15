<template>
  <div class="chat-area">
    <!-- Badge Row: Agent Status and Group Sharing -->
    <div class="badge-row">
      <!-- Agent Status Indicator -->
      <AgentStatusIndicator
        :agent="currentAgent"
        :warning="warning"
        :currentUser="currentUser"
        @manage="$emit('manage-agent')"
        @sign-in="$emit('sign-in')"
        @sign-out="$emit('sign-out')"
      />
      
      <!-- Group Sharing Badge -->
      <GroupSharingBadge 
        ref="groupSharingBadgeRef"
        :onStatusChange="handleStatusChange"
      />
    </div>
    
    <!-- File Badges -->
    <div v-if="appState.uploadedFiles.length > 0" class="file-badges">
      <FileBadge
        :files="appState.uploadedFiles"
        @view-file="$emit('view-file', $event)"
      />
    </div>
    
    <div v-for="(x, idx) in appState.chatHistory" :key="idx">
      
      <!-- Normal Chat Message -->
      <q-chat-message
        :name="getModelLabel(x, appState, AIoptions)"
        v-if="x.role !== 'system' && !appState.editBox.includes(idx)"
        size="8"
        :sent="x.role === 'user'"
      >
        <div>
          <q-btn
            dense
            flat
            size="sm"
            icon="edit"
            :class="['edit-button', x.role.toString()]"
            v-if="!appState.editBox.includes(idx)"
            @click="editMessage(idx)"
          />
          <vue-markdown :source="typeof x.content === 'string' ? x.content : '[Non-string content]'" />
        </div>
      </q-chat-message>

      <!-- Editable Chat Message -->
      <q-chat-message
        size="8"
        class="edit-chat"
        :name="getModelLabel(x, appState, AIoptions)"
        :sent="x.role === 'user'"
        v-if="appState.editBox.includes(idx)"
      >
        <div>
          <textarea v-model="x.content" rows="10" v-if="typeof x.content === 'string'" />
          <div v-else>[Non-string content]</div>
          <q-btn
            size="sm"
            icon="save"
            color="primary"
            label="Save"
            @click="saveMessage(idx, typeof x.content === 'string' ? x.content : '')"
          />
        </div>
      </q-chat-message>

      <!-- System Message -->
      <q-chat-message :name="x.role" v-if="x.role === 'system'" size="8" sent>
        <q-card color="secondary">
          <q-card-section>
            <vue-markdown :source="typeof x.content === 'string' ? getSystemMessageType(x.content) : '[Non-string content]'" class="attachment-message" />
          </q-card-section>
          <q-card-actions>
            <q-btn label="View" @click="viewSystemMessage(typeof x.content === 'string' ? x.content : '')" />
          </q-card-actions>
        </q-card>
      </q-chat-message>
    </div>

    <!-- Active Question -->
    <q-chat-message name="user" v-if="appState.activeQuestion.content !== ''" size="8" sent>
      <vue-markdown :source="appState.activeQuestion.content" />
    </q-chat-message>

    <!-- Signature Buttons -->
    <div class="signature-buttons" v-if="appState.chatHistory.length">
      <q-btn size="sm" color="secondary" label="Save Locally" @click="saveToFile" />
      <q-btn
        size="sm"
        color="secondary"
        label="Save to CouchDB"
        @click="triggerSaveToCouchDB"
      />
      <q-btn size="sm" color="warning" label="End without Saving" @click="closeNoSave" />
    </div>
  </div>
</template>

<script lang="ts">
import { defineComponent } from 'vue'
import type { PropType } from 'vue'
import { QBtn, QChatMessage, QCard, QCardSection, QCardActions } from 'quasar'
import VueMarkdown from 'vue-markdown-render'
import { getSystemMessageType } from '../utils'
import type { AppState, UploadedFile } from '../types'
import FileBadge from './FileBadge.vue'
import AgentStatusIndicator from './AgentStatusIndicator.vue'
import GroupSharingBadge from './GroupSharingBadge.vue'

export default defineComponent({
  name: 'ChatArea',
  components: {
    QBtn,
    QChatMessage,
    QCard,
    QCardSection,
    QCardActions,
    VueMarkdown,
    FileBadge,
    AgentStatusIndicator,
    GroupSharingBadge
  },
  watch: {
    'appState.chatHistory': {
      handler() {
        this.checkForChanges()
      },
      deep: true
    },
    'appState.uploadedFiles': {
      handler() {
        this.checkForChanges()
      },
      deep: true
    },
    'appState.editBox': {
      handler() {
        this.checkForChanges()
      },
      deep: true
    }
  },
  mounted() {
    console.log('🚀 ChatArea mounted, initializing chat state')
    this.initializeChatState()
    console.log('✅ Chat state initialized:', this.lastChatState)
  },
  props: {
    appState: {
      type: Object as PropType<AppState>,
      required: true
    },
    AIoptions: {
      type: Array as PropType<{ label: string; value: string }[]>,
      required: true
    },
    currentAgent: {
      type: Object as PropType<any>,
      default: null
    },
    warning: {
      type: String,
      default: ''
    },
    currentUser: {
      type: Object as PropType<any>,
      default: null
    }
  },
  emits: [
    'triggerSaveToCouchDB', 
    'manage-agent',
    'edit-message',
    'save-message',
    'view-system-message',
    'view-file',
    'save-to-file',
    'trigger-save-to-couchdb',
    'close-no-save',
    'sign-in',
    'sign-out'
  ],
  data() {
    return {
      groupSharingBadgeRef: null as any,
      lastChatState: {
        historyLength: 0,
        filesCount: 0,
        hasEdits: false
      }
    }
  },
  methods: {
    editMessage(idx: number) {
      this.$emit('edit-message', idx)
      this.updateChatStatus('Modified')
    },
    saveMessage(idx: number, content: string) {
      this.$emit('save-message', idx, content)
      this.updateChatStatus('Modified')
    },
    viewSystemMessage(content: string) {
      if (typeof content === 'string') {
        const systemContent = content.split('\n').splice(1).join('\n')
        this.$emit('view-system-message', systemContent)
      } else {
        this.$emit('view-system-message', '[Non-string content]')
      }
    },
    viewFile(file: UploadedFile) {
      this.$emit('view-file', file)
    },
    saveToFile() {
      this.$emit('save-to-file')
    },
    triggerSaveToCouchDB() {
      this.$emit('trigger-save-to-couchdb')
    },
    closeNoSave() {
      this.$emit('close-no-save')
    },
    handleStatusChange(newStatus: string) {
      console.log('Chat Status changed to:', newStatus)
    },
    updateChatStatus(newStatus: string) {
      console.log('🔄 Updating chat status to:', newStatus)
      if (this.groupSharingBadgeRef) {
        console.log('✅ Group sharing badge ref found, calling updateStatus')
        this.groupSharingBadgeRef.updateStatus(newStatus)
      } else {
        console.log('❌ Group sharing badge ref not found')
      }
    },
    checkForChanges() {
      const currentState = {
        historyLength: this.appState.chatHistory.length,
        filesCount: this.appState.uploadedFiles.length,
        hasEdits: this.appState.editBox.length > 0
      }
      
      console.log('🔍 Checking for changes:', {
        current: currentState,
        last: this.lastChatState
      })
      
      // Check if files were added
      if (currentState.filesCount > this.lastChatState.filesCount) {
        console.log('📁 Files added, updating status to Modified')
        this.updateChatStatus('Modified')
      }
      
      // Check if chat history changed
      if (currentState.historyLength > this.lastChatState.historyLength) {
        console.log('💬 Chat history changed, updating status to Modified')
        this.updateChatStatus('Modified')
      }
      
      // Update last state
      this.lastChatState = currentState
    },
    initializeChatState() {
      console.log('🔧 Initializing chat state with appState:', {
        historyLength: this.appState.chatHistory.length,
        filesCount: this.appState.uploadedFiles.length,
        hasEdits: this.appState.editBox.length > 0
      })
      this.lastChatState = {
        historyLength: this.appState.chatHistory.length,
        filesCount: this.appState.uploadedFiles.length,
        hasEdits: this.appState.editBox.length > 0
      }
      console.log('✅ Last chat state set to:', this.lastChatState)
    },
    getSystemMessageType,
    getModelLabel(
      x: { role: string; name?: string },
      appState: AppState,
      AIoptions?: { label: string; value: string }[]
    ): string {
      if (x.role === 'user') return 'User'
      if (x.role === 'assistant') {
        // First, check if the message has a name field from the backend
        if (x.name && typeof x.name === 'string') {
          return x.name
        }
        // Fallback to AIoptions if no name field
        const aiOption = (AIoptions || (appState as any).AIoptions || []).find((opt: { value: string }) => opt.value === appState.selectedAI)
        return aiOption ? aiOption.label : 'Assistant'
      }
      return x.role
    }
  }
})
</script>

<style lang="scss" scoped>
.badge-row {
  display: flex;
  gap: 16px;
  margin-bottom: 16px;
}

.badge-row .agent-status-indicator {
  width: 70%;
}

.badge-row .group-sharing-badge {
  width: 30%;
}

/* Remove height constraints - now handled dynamically by JavaScript */

/* Responsive adjustments */
@media (max-width: 768px) {
  .badge-row {
    flex-direction: column;
    gap: 12px;
  }
  
  .badge-row .agent-status-indicator,
  .badge-row .group-sharing-badge {
    width: 100%;
  }
}
</style>
