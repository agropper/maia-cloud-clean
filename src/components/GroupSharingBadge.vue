<template>
  <div class="group-sharing-badge" ref="badgeRef">
    <q-card flat bordered class="status-card" :style="{ height: badgeHeight + 'px' }">
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
        <div class="chat-status text-caption text-grey" @click="toggleChatStatus" style="cursor: pointer;">
          Chat Status: {{ chatStatus }}
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
  setup() {
    const badgeRef = ref<HTMLElement>()
    const badgeHeight = ref(0)
    const isEnabled = ref(false)
    const chatStatus = ref('Current')

    const toggleGroupSharing = () => {
      isEnabled.value = !isEnabled.value
    }

    const toggleChatStatus = () => {
      const statuses = ['Current', 'Modified', 'Saved']
      const currentIndex = statuses.indexOf(chatStatus.value)
      const nextIndex = (currentIndex + 1) % statuses.length
      chatStatus.value = statuses[nextIndex]
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
      toggleChatStatus
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
  background: linear-gradient(135deg, #f5f7fa 0%, #c3cfe2 100%);
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
</style>
