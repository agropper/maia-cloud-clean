<template>
  <div class="group-sharing-badge" ref="badgeRef">
    <q-card flat bordered class="status-card" :style="{ height: badgeHeight + 'px', background: getStatusBackground() }">
      <q-card-section class="q-pa-sm">
        <div class="badge-header">
          <div class="badge-title text-body2">Group Sharing</div>
          <q-btn
            flat
            dense
            size="sm"
            color="primary"
            :label="isEnabled ? 'PAUSE' : 'ENABLE'"
            @click="toggleGroupSharing"
            class="q-ml-sm"
          />
        </div>
                                <div class="status-row">
                          <span class="chat-status text-caption text-grey">
                            Chat Status: {{ chatStatus }}
                          </span>
                          <q-btn
                            v-if="chatStatus === 'Modified'"
                            flat
                            dense
                            size="sm"
                            color="primary"
                            label="POST"
                            @click="handlePost"
                            class="post-button"
                          />
                          <q-btn
                            v-if="deepLink"
                            flat
                            dense
                            size="sm"
                            color="secondary"
                            icon="link"
                            @click="copyDeepLink"
                            class="link-button"
                            title="Copy deep link to clipboard"
                          />
                        </div>
      </q-card-section>
    </q-card>
  </div>
</template>

<script lang="ts">
import { defineComponent, ref, onMounted, nextTick } from 'vue'
import { QCard, QCardSection, QBtn } from 'quasar'

export default defineComponent({
  name: 'GroupSharingBadge',
  components: {
    QCard,
    QCardSection,
    QBtn
  },
  props: {
    onStatusChange: {
      type: Function as () => (status: string) => void,
      required: false
    },
    onPost: {
      type: Function as () => void,
      required: false
    }
  },
  setup(props) {
    const badgeRef = ref<HTMLElement>()
    const badgeHeight = ref(0)
    const isEnabled = ref(false)
    const chatStatus = ref('Current')
    const deepLink = ref('')

    const toggleGroupSharing = () => {
      isEnabled.value = !isEnabled.value
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
      console.log('🎯 GroupSharingBadge updateStatus called with:', newStatus)
      if (['Current', 'Modified', 'Saved'].includes(newStatus)) {
        console.log('✅ Status updated from', chatStatus.value, 'to', newStatus)
        chatStatus.value = newStatus
      } else {
        console.log('❌ Invalid status:', newStatus)
      }
    }

    const handlePost = async () => {
      console.log('📤 POST button clicked, triggering post event')
      // Emit event to parent component to handle the actual posting
      if (props.onPost) {
        props.onPost()
      }
    }

    const copyDeepLink = async () => {
      try {
        await navigator.clipboard.writeText(deepLink.value)
        console.log('✅ Deep link copied to clipboard:', deepLink.value)
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
      console.log('🔗 Deep link set:', link)
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
      deepLink
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
}

.badge-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  width: 100%;
}

.badge-title {
  margin: 0;
}

.chat-status {
  margin: 0;
}

.status-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-top: 8px;
  margin-bottom: 8px;
  gap: 8px;
}

.post-button {
  min-width: 60px;
}

.link-button {
  min-width: 32px;
}
</style>
