<template>
  <div class="group-sharing-badge" ref="badgeRef">
    <q-card flat bordered class="status-card" :style="{ height: badgeHeight + 'px', background: getStatusBackground() }">
      <q-card-section class="q-pa-sm">
        <div class="row items-center">
          <div class="status-text">
            <div class="text-body2">
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
              Group Sharing
                                            <q-btn
                                flat
                                dense
                                size="sm"
                                color="primary"
                                :label="isEnabled ? 'ON' : 'ENABLE'"
                                @click="handleGroupSharingToggle"
                                class="q-ml-sm"
                              />
            </div>
            <div class="text-caption text-grey">
              Chat Status: {{ chatStatus }}
              <q-btn
                v-if="chatStatus === 'Modified'"
                flat
                dense
                size="sm"
                color="primary"
                label="POST"
                @click="handlePost"
                class="q-ml-sm"
              />
            </div>
          </div>
          <q-btn
            v-if="deepLink"
            flat
            round
            dense
            icon="link"
            color="secondary"
            @click="copyDeepLink"
            size="sm"
            class="q-ml-sm"
            title="Copy deep link to clipboard"
          />
        </div>
      </q-card-section>
    </q-card>
    
                        <!-- Group Management Modal -->
                    <GroupManagementModal
                      v-model="showGroupModal"
                      :currentUser="currentUser"
                      :onGroupDeleted="handleGroupDeleted"
                      @chatLoaded="handleChatLoaded"
                    />

    <!-- Group Sharing Options Modal -->
    <q-dialog :model-value="showGroupOptionsModal" @update:model-value="showGroupOptionsModal = $event" persistent>
      <q-card style="min-width: 400px;">
        <q-card-section>
          <div class="text-h6">Group Chat Options</div>
        </q-card-section>

        <q-card-section>
          <p>Group chats enable multiple participants to the same chat thread. Turn off this feature if you want to start a new thread in a separate group.</p>
        </q-card-section>

        <q-card-actions align="right">
          <q-btn flat label="Cancel" v-close-popup />
          <q-btn flat label="New Chat" color="primary" @click="startNewChat" v-close-popup />
          <q-btn flat label="New Chat with Same Group Members" color="secondary" @click="startNewChatWithSameGroup" v-close-popup />
        </q-card-actions>
      </q-card>
    </q-dialog>
  </div>
</template>

<script lang="ts">
                import { defineComponent, ref, onMounted, nextTick } from 'vue'
                import type { PropType } from 'vue'
                import { QCard, QCardSection, QBtn, QDialog, QCardActions } from 'quasar'
                import GroupManagementModal from './GroupManagementModal.vue'

export default defineComponent({
  name: 'GroupSharingBadge',
                    components: {
                    QCard,
                    QCardSection,
                    QBtn,
                    QDialog,
                    QCardActions,
                    GroupManagementModal
                  },
                    props: {
                    onStatusChange: {
                      type: Function as (status: string) => void,
                      required: false
                    },
                    onPost: {
                      type: Function as () => void | Promise<void>,
                      required: false
                    },
                    currentUser: {
                      type: [String, Object] as PropType<string | { userId: string; displayName: string }>,
                      default: ''
                    },
                    onNewChat: {
                      type: Function as () => () => void | Promise<void>,
                      required: false
                    },
                    onNewChatWithSameGroup: {
                      type: Function as () => () => void | Promise<void>,
                      required: false
                    },
                    onGroupDeleted: {
                      type: Function as () => () => void | Promise<void>,
                      required: false
                    },
                    onChatLoaded: {
                      type: Function as (chat: any) => void | Promise<void>,
                      required: false
                    }
                  },
  setup(props) {
                        const badgeRef = ref<HTMLElement>()
                    const badgeHeight = ref(0)
                    const isEnabled = ref(true) // Default to ON for group chats
                    const chatStatus = ref('Current')
                    const deepLink = ref('')
                    const groupCount = ref(0)
                    const showGroupModal = ref(false)
                    const showGroupOptionsModal = ref(false) // Hidden by default

                        const toggleGroupSharing = () => {
                      isEnabled.value = !isEnabled.value
                    }

                    const handleGroupSharingToggle = () => {
                      if (isEnabled.value) {
                        // If currently ON, show options modal
                        showGroupOptionsModal.value = true
                      } else {
                        // If currently ENABLE, just turn it on
                        isEnabled.value = true
                      }
                    }

                    const startNewChat = () => {
                      isEnabled.value = false
                      // Clear any existing deep link
                      deepLink.value = ''
                      // Emit event to parent to start new chat
                      if (props.onNewChat) {
                        props.onNewChat()
                      }
                    }

                    const startNewChatWithSameGroup = () => {
                      isEnabled.value = true
                      // Clear any existing deep link
                      deepLink.value = ''
                      // Emit event to parent to start new chat with same group
                      if (props.onNewChatWithSameGroup) {
                        props.onNewChatWithSameGroup()
                      }
                    }

    const toggleChatStatus = () => {
      const statuses = ['Current', 'Modified', 'Saved']
      const currentIndex = statuses.indexOf(chatStatus.value)
      const nextIndex = (currentIndex + 1) % statuses.length
      chatStatus.value = statuses[nextIndex]
      // Notify parent component of status change
      if (props.onStatusChange) {
        props.onStatusChange(chatStatus.value)
      }
    }

    const updateStatus = (newStatus: string) => {
      if (['Current', 'Modified', 'Saved'].includes(newStatus)) {
        chatStatus.value = newStatus
      }
    }

    const handlePost = async () => {
      // Emit event to parent component to handle the actual posting
      if (props.onPost) {
        props.onPost()
      }
    }

    const copyDeepLink = async () => {
      try {
        await navigator.clipboard.writeText(deepLink.value)
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

                            const setDeepLink = (link: string) => {
      deepLink.value = link
    }

                    const openGroupModal = () => {
                      showGroupModal.value = true
                    }

                        const updateGroupCount = (count: number) => {
      groupCount.value = count
    }

    const handleGroupDeleted = () => {
      // Emit event to parent to refresh group count
      if (props.onGroupDeleted) {
        props.onGroupDeleted()
      }
    }

    const getStatusBackground = () => {
      switch (chatStatus.value) {
        case 'Current':
          return 'linear-gradient(135deg, #f5f7fa 0%, #c3cfe2 100%)' // Original blue-gray
        case 'Modified':
          return 'linear-gradient(135deg, #fff3cd 0%, #ffeaa7 100%)' // Yellow/warning
        case 'Saved':
          return 'linear-gradient(135deg, #d4edda 0%, #c3e6cb 100%)' // Green/success
        default:
          return 'linear-gradient(135deg, #f5f7fa 0%, #c3cfe2 100%)' // Fallback
      }
    }

    const matchHeight = () => {
      nextTick(() => {
        // Find the agent badge in the same row
        if (badgeRef.value) {
          const badgeRow = badgeRef.value.closest('.badge-row')
          if (badgeRow) {
            const agentBadge = badgeRow.querySelector('.agent-status-indicator .status-card')
            if (agentBadge) {
              const agentHeight = agentBadge.getBoundingClientRect().height
              badgeHeight.value = agentHeight
            }
          }
        }
      })
    }

    onMounted(() => {
      // Initial height matching
      matchHeight()
      
      // Set up a resize observer to watch for height changes
      if (badgeRef.value) {
        const resizeObserver = new ResizeObserver(() => {
          matchHeight()
        })
        
        // Observe the agent badge for size changes
        const badgeRow = badgeRef.value.closest('.badge-row')
        if (badgeRow) {
          const agentBadge = badgeRow.querySelector('.agent-status-indicator .status-card')
          if (agentBadge) {
            resizeObserver.observe(agentBadge)
          }
        }
      }
    })

    const handleChatLoaded = (groupChat: any) => {
      console.log('📂 Group chat loaded in badge:', groupChat)
      
      // Emit the loaded chat to the parent component using the dedicated prop
      if (props.onChatLoaded) {
        props.onChatLoaded(groupChat)
      }
    }

                        return {
                      badgeRef,
                      badgeHeight,
                      isEnabled,
                      toggleGroupSharing,
                      chatStatus,
                      toggleChatStatus,
                      getStatusBackground,
                      updateStatus,
                      handlePost,
                      copyDeepLink,
                      setDeepLink,
                      deepLink,
                      groupCount,
                      showGroupModal,
                      showGroupOptionsModal,
                      openGroupModal,
                      updateGroupCount,
                      handleGroupSharingToggle,
                      startNewChat,
                      startNewChatWithSameGroup,
                      handleGroupDeleted,
                      handleChatLoaded
                    }
  }
})
</script>

<style scoped>
.group-sharing-badge {
  display: flex;
  height: 100%;
}

.status-card {
  border-radius: 8px;
  flex: 1;
  display: flex;
  flex-direction: column;
  justify-content: flex-start;
  align-items: flex-start;
  box-sizing: border-box;
}

                .status-text {
                  flex: 1;
                }

                .group-count-btn {
                  min-width: 24px;
                  height: 24px;
                  padding: 0;
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
                }
</style>
