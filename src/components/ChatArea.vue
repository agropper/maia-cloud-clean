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
                    :onGroupDeleted="handleGroupDeleted"
                    :onChatLoaded="handleChatLoaded"
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
          <div class="edit-buttons">
            <q-btn
              size="sm"
              icon="save"
              color="primary"
              label="Save"
              @click="saveMessage(idx, typeof x.content === 'string' ? x.content : '')"
            />
            <q-btn
              size="sm"
              icon="delete"
              color="negative"
              label="Delete this message"
              @click="confirmDeleteMessage(idx)"
            />
          </div>
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

    <!-- Active Question - Only show when there's a current query being typed -->
    <q-chat-message :name="getCurrentUserName()" v-if="appState.currentQuery && appState.currentQuery.trim() !== ''" size="8" sent>
      <vue-markdown :source="appState.currentQuery" />

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
      <q-btn 
        v-if="getGroupBadgeStatus() === 'Modified'"
        size="sm" 
        color="primary" 
        label="Post to Group" 
        @click="saveToGroup" 
      />
      <q-btn size="sm" color="warning" label="End without Saving" @click="closeNoSave" />
    </div>
  </div>

  <!-- Delete Message Confirmation Modal -->
  <q-dialog v-model="showDeleteModal" persistent>
    <q-card style="min-width: 350px">
      <q-card-section>
        <div class="text-h6">Delete Message</div>
      </q-card-section>

      <q-card-section>
        <div class="text-body1">
          <p>You are about to delete the following message:</p>
          <div class="message-preview">
            <strong>{{ messageToDelete?.role === 'user' ? getCurrentUserName() : 'Assistant' }}:</strong>
            <div class="message-content">{{ messageToDelete?.content?.substring(0, 100) }}{{ messageToDelete?.content?.length > 100 ? '...' : '' }}</div>
          </div>
          <p v-if="precedingUserMessage" class="text-caption">
            <strong>Note:</strong> This will also delete the preceding user question that triggered this response.
          </p>
        </div>
      </q-card-section>

      <q-card-actions align="right">
        <q-btn flat label="Cancel" color="primary" @click="showDeleteModal = false" />
        <q-btn flat label="Delete" color="negative" @click="deleteMessageConfirmed" />
      </q-card-actions>
    </q-card>
  </q-dialog>

  <!-- Group Chat Security Notice Modal -->
  <q-dialog v-model="showSecurityNoticeModal" persistent>
    <q-card style="min-width: 500px">
      <q-card-section>
        <div class="text-h6">⚠️ Security Notice</div>
      </q-card-section>

      <q-card-section>
        <div class="text-body1">
          <p><strong>Chat groups are now created as 'Anyone with the link...' by default.</strong></p>
          <p>This is convenient for chat members but provides no security from unauthorized link sharing.</p>
          <p class="text-caption text-grey">
            <strong>Future versions will offer more secure group invitation mechanisms.</strong>
          </p>
        </div>
      </q-card-section>

      <q-card-actions align="right">
        <q-btn flat label="Cancel" color="grey" @click="showSecurityNoticeModal = false" />
        <q-btn unelevated label="Anyone with the link" color="primary" @click="confirmGroupChatCreation" />
      </q-card-actions>
    </q-card>
  </q-dialog>

  <!-- No Message Error Modal -->
  <q-dialog v-model="showNoMessageErrorModal" persistent>
    <q-card style="min-width: 500px">
      <q-card-section>
        <div class="text-h6">❌ Cannot Save Chat</div>
      </q-card-section>

      <q-card-section>
        <div class="text-body1">
          <p><strong>You need to add a message to establish context for the recipient.</strong></p>
          <p>Even if you've uploaded a PDF file, please add a brief message explaining:</p>
          <ul>
            <li>What the document is about</li>
            <li>What you'd like the recipient to do with it</li>
            <li>Any specific questions or context</li>
          </ul>
          <p class="text-caption text-grey">
            <strong>This helps ensure the chat is meaningful and actionable for others.</strong>
          </p>
        </div>
      </q-card-section>

      <q-card-actions align="right">
        <q-btn unelevated label="Got it" color="primary" @click="showNoMessageErrorModal = false" />
      </q-card-actions>
    </q-card>
  </q-dialog>
</template>

<script lang="ts">
import { defineComponent } from 'vue'
import type { PropType } from 'vue'
import { QBtn, QChatMessage, QCard, QCardSection, QCardActions, QDialog } from 'quasar'
import VueMarkdown from 'vue-markdown-render'
import { getSystemMessageType } from '../utils'
import { useGroupChat } from '../composables/useGroupChat'
import type { AppState, UploadedFile } from '../types'
import FileBadge from './FileBadge.vue'
import AgentStatusIndicator from './AgentStatusIndicator.vue'
import GroupSharingBadge from './GroupSharingBadge.vue'

// Type for GroupSharingBadge ref methods
interface GroupSharingBadgeRef {
  setDeepLink: (link: string) => void
  updateStatus: (status: string) => void
  updateGroupCount: (count: number) => void
  isEnabled: boolean
}

export default defineComponent({
  name: 'ChatArea',
  components: {
    QBtn,
    QChatMessage,
    QCard,
    QCardSection,
    QCardActions,
    QDialog,
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
                      handler(newUser, oldUser) {
                        console.log(`🔍 [CHATAREA] currentUser changed:`, { old: oldUser, new: newUser })
                        
                        // Always refresh group count when user changes (for sign-in/sign-out)
                        if (this.isUserReady) {
                          console.log(`🔍 [CHATAREA] User changed, refreshing group count...`)
                          this.loadGroupCount()
                        }
                      }
                    },
                    isUserReady: {
                      handler(isReady: boolean, wasReady: boolean) {
                        console.log(`🔍 [CHATAREA] isUserReady changed:`, { wasReady, isReady })
                        
                        // Only load data when user becomes ready (not when becoming unready)
                        if (isReady && !wasReady) {
                          console.log(`🔍 [CHATAREA] User is now ready, loading initial data...`)
                          this.loadInitialData()
                        }
                      },
                      immediate: true
                    }
                  },
                                                                              mounted() {
                    this.initializeChatState()
                    // Don't call loadGroupCount here - the isUserReady watcher will handle it
                    // after the user is properly determined
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
      required: true,
      default: () => ({ userId: 'Unknown User', displayName: 'Unknown User' })
    }
  },
  data() {
    return {
      lastChatState: {
        historyLength: 0,
        filesCount: 0,
        hasEdits: false
      },
      showDeleteModal: false,
      messageToDelete: null as any,
      precedingUserMessage: null as any,
      showSecurityNoticeModal: false,
      showNoMessageErrorModal: false
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
  methods: {
    editMessage(idx: number) {
      this.$emit('edit-message', idx)
      this.updateChatStatus('Modified')
    },
    saveMessage(idx: number, content: string) {
      this.$emit('save-message', idx, content)
      this.updateChatStatus('Modified')
    },
    confirmDeleteMessage(idx: number) {
      const message = this.appState.chatHistory[idx]
      this.messageToDelete = message
      
      // Check if there's a preceding user message to also delete
      if (idx > 0 && this.appState.chatHistory[idx - 1].role === 'user') {
        this.precedingUserMessage = this.appState.chatHistory[idx - 1]
      } else {
        this.precedingUserMessage = null
      }
      
      this.showDeleteModal = true
    },
    deleteMessageConfirmed() {
      if (!this.messageToDelete) return
      
      const idx = this.appState.chatHistory.findIndex(msg => msg === this.messageToDelete)
      if (idx === -1) return
      
      // Log the deletion for debugging
      console.log('🗑️ Deleting message:', {
        index: idx,
        role: this.messageToDelete.role,
        content: this.messageToDelete.content?.substring(0, 100) + '...',
        hasPrecedingUser: !!this.precedingUserMessage
      })
      
      // Remove the message
      this.appState.chatHistory.splice(idx, 1)
      
      // If there was a preceding user message, remove it too
      if (this.precedingUserMessage && idx > 0) {
        const userIdx = idx - 1
        if (this.appState.chatHistory[userIdx]?.role === 'user') {
          console.log('🗑️ Also deleting preceding user message:', {
            index: userIdx,
            content: this.precedingUserMessage.content?.substring(0, 100) + '...'
          })
          this.appState.chatHistory.splice(userIdx, 1)
        }
      }
      
      // Remove from edit box if it was being edited
      const editIndex = this.appState.editBox.indexOf(idx)
      if (editIndex > -1) {
        this.appState.editBox.splice(editIndex, 1)
      }
      
      // Update chat status
      this.updateChatStatus('Modified')
      
      // Close modal and reset
      this.showDeleteModal = false
      this.messageToDelete = null
      this.precedingUserMessage = null
      
      console.log('✅ Message deletion completed. New chat history length:', this.appState.chatHistory.length)
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
        // Validate chat history has user messages (not just system messages)
        if (!this.appState.chatHistory || this.appState.chatHistory.length === 0) {
          console.error('❌ No chat history to save')
          this.showNoMessageErrorModal = true
          return
        }
        
        // Check if there are any user messages (not just system messages)
        const hasUserMessages = this.appState.chatHistory.some(msg => msg.role === 'user')
        if (!hasUserMessages) {
          console.error('❌ No user messages in chat history')
          this.showNoMessageErrorModal = true
          return
        }
        
        // Get current user info
        const currentUser = this.currentUser || 'Unknown User'
        
        // Get connected KB info
        const connectedKB = this.appState.selectedAI || 'No KB connected'
        
        // Check if group sharing is enabled
        const isGroupSharingEnabled = this.$refs.groupSharingBadgeRef ? 
          (this.$refs.groupSharingBadgeRef as any).isEnabled : false
        
        if (!isGroupSharingEnabled) {
          console.error('❌ Group sharing is not enabled')
          return
        }
        
        let result
        const { saveGroupChat, updateGroupChat } = useGroupChat()
        
        // Check if this is a deep link user
        const isDeepLinkUser = typeof currentUser === 'object' && currentUser.isDeepLinkUser
        
        if (isDeepLinkUser && !this.appState.currentChatId) {
          // Deep link users must have an existing chat to update
          console.error('❌ Deep link user cannot create new chats - no existing chat ID found')
          console.error('❌ Deep link users can only contribute to existing conversations')
          return
        }
        
        if (this.appState.currentChatId) {
          // Update existing group chat
          // Extract user ID string for consistent filtering
          const userId = typeof currentUser === 'object' ? currentUser.userId : currentUser
          console.log('🔄 Updating existing group chat:', this.appState.currentChatId)
          result = await updateGroupChat(
            this.appState.currentChatId,
            this.appState.chatHistory,
            this.appState.uploadedFiles,
            userId,
            connectedKB
          )
        } else {
          // Create new group chat for signed-in user (not deep link users)
          // Extract user ID string for consistent filtering
          const userId = typeof currentUser === 'object' ? currentUser.userId : currentUser
          console.log('🆕 Creating new group chat for user:', userId)
          console.log('🔍 [SAVE] currentUser object:', currentUser, '-> userId string:', userId)
          result = await saveGroupChat(
            this.appState.chatHistory,
            this.appState.uploadedFiles,
            userId,
            connectedKB
          )
          
          // Store the new chat ID for future updates
          this.appState.currentChatId = result.chatId
        }
        
        // Create complete deep link URL with domain
        const baseUrl = window.location.origin;
        const deepLink = `${baseUrl}/shared/${result.shareId}`
        
        console.log('🔗 Generated deep link:', deepLink)
        console.log('📊 Result from saveGroupChat:', result)
        
        // Set the deep link in the GroupSharingBadge
        if (this.$refs.groupSharingBadgeRef) {
          console.log('🎯 Setting deep link in GroupSharingBadge')
          const badgeRef = this.$refs.groupSharingBadgeRef as any
          if (badgeRef.setDeepLink) {
            badgeRef.setDeepLink(deepLink)
          } else {
            console.error('❌ setDeepLink method not found on GroupSharingBadge')
          }
        } else {
          console.error('❌ GroupSharingBadge ref not found')
        }
        
        // Reset status to Current
        this.updateChatStatus('Current')
        console.log('✅ Chat status updated to Current')
        
        // Refresh group count after creating/updating group chat
        this.loadGroupCount()
        
        console.log('✅ Group chat saved successfully:', result)
        
      } catch (error) {
        console.error('❌ Error posting to Cloudant:', error)
        console.error('❌ Error details:', error)
      }
    },
    async confirmGroupChatCreation() {
      try {
        // Close the modal
        this.showSecurityNoticeModal = false
        
        // Check if this is a deep link user
        const isDeepLinkUser = typeof this.currentUser === 'object' && this.currentUser.isDeepLinkUser
        
        if (isDeepLinkUser) {
          // Deep link users cannot create new chats
          console.error('❌ Deep link users cannot create new chats')
          console.error('❌ Deep link users can only contribute to existing conversations')
          return
        }
        
        // This function is now a fallback for edge cases
        // Most group chat creation now happens directly in handlePostToCloudant
        console.log('🔄 Fallback group chat creation triggered')
        
        // Validate chat history has user messages (not just system messages)
        if (!this.appState.chatHistory || this.appState.chatHistory.length === 0) {
          console.error('❌ No chat history to save')
          this.showNoMessageErrorModal = true
          return
        }
        
        // Check if there are any user messages (not just system messages)
        const hasUserMessages = this.appState.chatHistory.some(msg => msg.role === 'user')
        if (!hasUserMessages) {
          console.error('❌ No user messages in chat history')
          this.showNoMessageErrorModal = true
          return
        }
        
        // Get current user info
        const currentUser = this.currentUser || 'Unknown User'
        
        // Extract user ID string for consistent filtering
        const userId = typeof currentUser === 'object' ? currentUser.userId : currentUser
        
        // Get connected KB info
        const connectedKB = this.appState.selectedAI || 'No KB connected'
        
        // Create new group chat
        const { saveGroupChat } = useGroupChat()
        const result = await saveGroupChat(
          this.appState.chatHistory,
          this.appState.uploadedFiles,
          userId,
          connectedKB
        )
        
        // Store the new chat ID for future updates
        this.appState.currentChatId = result.chatId
        
        // Create complete deep link URL with domain
        const baseUrl = window.location.origin;
        const deepLink = `${baseUrl}/shared/${result.shareId}`
        
        // Set the deep link in the GroupSharingBadge
        if (this.$refs.groupSharingBadgeRef) {
          (this.$refs.groupSharingBadgeRef as GroupSharingBadgeRef).setDeepLink(deepLink)
        }
        
        // Reset status to Current
        this.updateChatStatus('Current')
        
        // Refresh group count after creating group chat
        this.loadGroupCount()
        
        console.log('✅ Fallback group chat created successfully')
        
      } catch (error) {
        console.error('❌ Error creating fallback group chat:', error)
      }
    },
    updateChatStatus(newStatus: string) {
      if (this.$refs.groupSharingBadgeRef) {
        (this.$refs.groupSharingBadgeRef as GroupSharingBadgeRef).updateStatus(newStatus)
      }
    },
                        checkForChanges() {
                      const currentState = {
                        historyLength: this.appState.chatHistory.length,
                        filesCount: this.appState.uploadedFiles.length,
                        hasEdits: this.appState.editBox.length > 0
                      }
                      
                      // Skip change detection only for fresh starts, not for shared chat loads
                      if (this.lastChatState.historyLength === 0 && this.lastChatState.filesCount === 0 && 
                          this.appState.chatHistory.length === 0 && this.appState.uploadedFiles.length === 0) {
                        this.lastChatState = currentState
                        return
                      }
                      
                      // Check if this is a shared chat load by URL
                      if (window.location.pathname.includes('/shared/') && 
                          this.lastChatState.historyLength === 0 && this.lastChatState.filesCount === 0) {
                        this.lastChatState = currentState
                        return
                      }
                      
                      // Check if files were added
                      if (currentState.filesCount > this.lastChatState.filesCount) {
                        this.updateChatStatus('Modified')
                      }
                      
                      // Check if chat history changed
                      if (currentState.historyLength > this.lastChatState.historyLength) {
                        this.updateChatStatus('Modified')
                      }
                      
                      // Update last state
                      this.lastChatState = currentState
                    },
                        initializeChatState() {
                      this.lastChatState = {
                        historyLength: this.appState.chatHistory.length,
                        filesCount: this.appState.uploadedFiles.length,
                        hasEdits: this.appState.editBox.length > 0
                      }
                      
                      // Reset chat status to "Current" for fresh loads
                      this.updateChatStatus('Current')
                    },
                    async loadGroupCount() {
                      try {
                        // Only proceed if user is ready
                        if (!this.isUserReady) {
                          console.log(`🔍 [FRONTEND] User not ready, skipping group count load`)
                          return
                        }
                        
                        // Get all chats from backend
                        const { getAllGroupChats } = useGroupChat()
                        const allGroups = await getAllGroupChats()
                        
                        // Apply the same filtering logic as GroupManagementModal
                        // Filter groups by current user (including "Unknown User")
                        let currentUserName: string
                        let isDeepLinkUser = false
                        let deepLinkShareId = null
                        
                        if (this.currentUser && typeof this.currentUser === 'object') {
                          currentUserName = this.currentUser.userId || this.currentUser.displayName || 'Unknown User'
                          isDeepLinkUser = this.currentUser.isDeepLinkUser || false
                          deepLinkShareId = this.currentUser.shareId || null
                        } else {
                          currentUserName = this.currentUser || 'Unknown User'
                        }
                        
                        // Filter to show only chats the current user should see
                        let filteredGroups: any[]
                        
                        if (isDeepLinkUser && deepLinkShareId) {
                          // Deep link users see chats that match their shareId
                          filteredGroups = allGroups.filter(group => group.shareId === deepLinkShareId)
                          console.log(`🔍 [FRONTEND] Deep link user filtering: shareId === '${deepLinkShareId}'`)
                        } else {
                          // Regular users see chats that match their currentUser
                          filteredGroups = allGroups.filter(group => group.currentUser === currentUserName)
                          console.log(`🔍 [FRONTEND] Regular user filtering: group.currentUser === '${currentUserName}'`)
                        }
                        
                        const groupCount = filteredGroups.length
                        
                        console.log(`🔍 [FRONTEND] Loaded group count: ${groupCount} for current user (filtered from ${allGroups.length} total)`)
                        console.log(`🔍 [FRONTEND] Current user: ${currentUserName}, Filtering logic: group.currentUser === '${currentUserName}'`)
                        console.log(`🔍 [FRONTEND] Badge count updated to: ${groupCount}`)
                        
                        if (this.$refs.groupSharingBadgeRef) {
                          (this.$refs.groupSharingBadgeRef as any).updateGroupCount(groupCount)
                        }
                      } catch (error) {
                        console.error('❌ Failed to load group count:', error)
                      }
                    },
                    async handleNewChat(loadedChat?: any) {
                      if (loadedChat) {
                        // Load the specific chat data
                        console.log('📂 Loading chat data into ChatArea:', loadedChat)
                        this.appState.chatHistory = loadedChat.chatHistory || []
                        this.appState.uploadedFiles = loadedChat.uploadedFiles || []
                        this.appState.currentChatId = loadedChat.id
                        console.log('✅ Chat loaded successfully in ChatArea')
                      } else {
                        // Clear current chat and start fresh
                        this.appState.chatHistory = []
                        this.appState.uploadedFiles = []
                        this.appState.currentChatId = null // Clear the current chat ID
                        this.initializeChatState()
                        // Refresh group count after clearing chat (only if user is valid)
                        if (this.isUserReady) {
                          this.loadGroupCount()
                        }
                        // Navigate to home URL
                        window.location.href = window.location.origin
                      }
                    },
                    async handleNewChatWithSameGroup() {
                      // Keep group sharing ON but clear chat content
                      this.appState.chatHistory = []
                      this.appState.uploadedFiles = []
                      this.appState.currentChatId = null // Clear the current chat ID
                      this.initializeChatState()
                                                                      // Refresh group count after clearing chat (only if user is valid)
                        if (this.isUserReady) {
                          this.loadGroupCount()
                        }
                        // Navigate to home URL
                        window.location.href = window.location.origin

                    },
                    handleGroupDeleted() {
                      // Only refresh group count if user is valid
                      if (this.isUserReady) {
                        this.loadGroupCount()
                      }
                    },
                    // Method to manually trigger data loading when user becomes ready
                    async loadInitialData() {
                      if (this.isUserReady) {
                        console.log(`🔍 [CHATAREA] Loading initial data for ready user...`)
                        await this.loadGroupCount()
                        // Note: loadCurrentAgent and loadCurrentKB are handled by the parent ChatPrompt component
                      } else {
                        console.log(`🔍 [CHATAREA] User not ready, skipping initial data load`)
                      }
                    },
                    handleChatLoaded(loadedChat: any) {
                      console.log('📂 Chat loaded in ChatArea:', loadedChat)
                      
                      // Load the chat data into the main chat state
                      this.appState.chatHistory = loadedChat.chatHistory || []
                      this.appState.uploadedFiles = loadedChat.uploadedFiles || []
                      this.appState.currentChatId = loadedChat.id
                      
                      console.log('✅ Chat loaded successfully in ChatArea')
                    },
                    getGroupBadgeStatus(): string {
                      // Get the current status from the Group Sharing Badge
                      if (this.$refs.groupSharingBadgeRef) {
                        return (this.$refs.groupSharingBadgeRef as any).chatStatus || 'Current'
                      }
                      return 'Current'
                    },
                    saveToGroup() {
                      // Trigger the same action as clicking POST on the Group Badge
                      if (this.$refs.groupSharingBadgeRef) {
                        (this.$refs.groupSharingBadgeRef as any).handlePost()
                      }
                    },
                    isUserReady(): boolean {
                      // Check if currentUser is properly initialized and valid
                      return this.currentUser && (
                        typeof this.currentUser === 'string' || 
                        (typeof this.currentUser === 'object' && this.currentUser.userId)
                      )
                    },
                    getCurrentUserName(): string {
      // Return the current user name for new messages
      const currentUser = this.currentUser
      if (currentUser && typeof currentUser === 'object') {
        return currentUser.displayName || currentUser.userId || 'Unknown User'
      } else if (currentUser) {
        return currentUser
      }
      return 'Unknown User'
    },
    getSystemMessageType,
    getModelLabel(
      x: { role: string; name?: string },
      appState: AppState,
      AIoptions?: { label: string; value: string }[]
    ): string {
      if (x.role === 'user') {
        // First, check if the message has a stored name field (preserves user name at time of creation)
        if (x.name && typeof x.name === 'string') {
          return x.name
        }
        // Fallback to current user if no stored name
        const currentUser = this.currentUser
        if (currentUser) {
          if (typeof currentUser === 'object') {
            return currentUser.displayName || currentUser.userId || 'Unknown User'
          }
          return currentUser
        }
        return 'Unknown User'
      }
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

.edit-buttons {
  display: flex;
  gap: 10px;
  margin-top: 10px;
}

.message-preview {
  background: #f8f9fa;
  border: 1px solid #dee2e6;
  border-radius: 4px;
  padding: 10px;
  margin: 10px 0;
}

.message-content {
  margin-top: 5px;
  font-family: monospace;
  white-space: pre-wrap;
  word-break: break-word;
}
</style>
