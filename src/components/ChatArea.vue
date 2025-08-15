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
                    :onPost="handlePostToCloudant"
                    :currentUser="currentUser"
                    :onNewChat="handleNewChat"
                    :onNewChatWithSameGroup="handleNewChatWithSameGroup"
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
      <!-- Disabled old CouchDB functionality - now handled by Group Sharing Badge -->
      <!-- <q-btn
        size="sm"
        color="secondary"
        label="Save to CouchDB"
        @click="triggerSaveToCouchDB"
      /> -->
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
import { useGroupChat } from '../composables/useGroupChat'
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
                    },
                    currentUser: {
                      handler(newUser) {
                        if (newUser) {
                          console.log('👤 User signed in, loading group count')
                          this.loadGroupCount()
                        } else {
                          console.log('👤 User signed out, resetting group count')
                          if (this.$refs.groupSharingBadgeRef) {
                            (this.$refs.groupSharingBadgeRef as any).updateGroupCount(0)
                          }
                        }
                      },
                      immediate: true
                    }
                  },
                      mounted() {
                      console.log('🚀 ChatArea mounted, initializing chat state')
                      this.initializeChatState()
                      this.loadGroupCount()
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
    async handlePostToCloudant() {
      try {
        console.log('📤 POST to Cloudant requested')
        
        // Validate chat history
        if (!this.appState.chatHistory || this.appState.chatHistory.length === 0) {
          console.error('❌ No chat history to save')
          return
        }
        
        console.log('📊 Chat history length:', this.appState.chatHistory.length)
        console.log('📁 Uploaded files count:', this.appState.uploadedFiles.length)
        
        // Get current user info
        const currentUser = this.currentUser || 'Unknown User'
        
        // Get connected KB info
        const connectedKB = this.appState.selectedAI || 'No KB connected'
        
        // Check if group sharing is enabled
        const isGroupSharingEnabled = this.$refs.groupSharingBadgeRef ? 
          (this.$refs.groupSharingBadgeRef as any).isEnabled : false
        
        let result
        const { saveGroupChat, updateGroupChat } = useGroupChat()
        
        if (isGroupSharingEnabled && this.appState.currentChatId) {
          // Update existing group chat
          console.log('🔄 Group sharing enabled - updating existing chat:', this.appState.currentChatId)
          result = await updateGroupChat(
            this.appState.currentChatId,
            this.appState.chatHistory,
            this.appState.uploadedFiles,
            currentUser,
            connectedKB
          )
        } else {
          // Create new group chat
          console.log('🆕 Creating new group chat')
          result = await saveGroupChat(
            this.appState.chatHistory,
            this.appState.uploadedFiles,
            currentUser,
            connectedKB
          )
          // Store the new chat ID for future updates
          this.appState.currentChatId = result.chatId
        }
        
                                // Create complete deep link URL with domain
                        const baseUrl = window.location.origin;
                        const deepLink = `${baseUrl}/shared/${result.shareId}`
        
        // Set the deep link in the GroupSharingBadge
        if (this.$refs.groupSharingBadgeRef) {
          this.$refs.groupSharingBadgeRef.setDeepLink(deepLink)
        }
        
        // Reset status to Current
        this.updateChatStatus('Current')
        
        console.log('✅ Chat posted successfully with deep link:', deepLink)
      } catch (error) {
        console.error('❌ Error posting to Cloudant:', error)
      }
    },
    updateChatStatus(newStatus: string) {
      console.log('🔄 Updating chat status to:', newStatus)
      if (this.$refs.groupSharingBadgeRef) {
        console.log('✅ Group sharing badge ref found, calling updateStatus')
        this.$refs.groupSharingBadgeRef.updateStatus(newStatus)
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
                      
                      // Skip change detection only for fresh starts, not for shared chat loads
                      if (this.lastChatState.historyLength === 0 && this.lastChatState.filesCount === 0 && 
                          this.appState.chatHistory.length === 0 && this.appState.uploadedFiles.length === 0) {
                        console.log('🚀 Fresh start detected, skipping change detection')
                        this.lastChatState = currentState
                        return
                      }
                      
                      // Check if this is a shared chat load by URL
                      if (window.location.pathname.includes('/shared/') && 
                          this.lastChatState.historyLength === 0 && this.lastChatState.filesCount === 0) {
                        console.log('🔄 Shared chat load detected, resetting state')
                        this.lastChatState = currentState
                        return
                      }
                      
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
                      
                      // Reset chat status to "Current" for fresh loads
                      this.updateChatStatus('Current')
                    },
                    async loadGroupCount() {
                      try {
                        const { getAllGroupChats } = useGroupChat()
                        const groups = await getAllGroupChats()
                        const currentUserName = this.currentUser?.username || this.currentUser?.displayName || this.currentUser || 'Unknown User'
                        const userGroups = groups.filter(group => group.currentUser === currentUserName)
                        
                        console.log('📊 Found groups:', groups.length, 'User groups:', userGroups.length, 'Current user:', currentUserName)
                        
                        if (this.$refs.groupSharingBadgeRef) {
                          (this.$refs.groupSharingBadgeRef as any).updateGroupCount(userGroups.length)
                          console.log('✅ Group count updated in badge')
                        } else {
                          console.log('❌ Group sharing badge ref not found')
                        }
                      } catch (error) {
                        console.error('❌ Failed to load group count:', error)
                      }
                    },
                    async handleNewChat() {
                      // Clear current chat and start fresh
                      this.appState.chatHistory = []
                      this.appState.uploadedFiles = []
                      this.appState.currentChatId = null // Clear the current chat ID
                      this.initializeChatState()
                      // Refresh group count after clearing chat
                      this.loadGroupCount()
                      console.log('🆕 Started new chat')
                    },
                    async handleNewChatWithSameGroup() {
                      // Keep group sharing ON but clear chat content
                      this.appState.chatHistory = []
                      this.appState.uploadedFiles = []
                      this.appState.currentChatId = null // Clear the current chat ID
                      this.initializeChatState()
                      // Refresh group count after clearing chat
                      this.loadGroupCount()
                      console.log('🆕 Started new chat with same group')
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
