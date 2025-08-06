<template>
  <div class="agent-status-indicator">
    <q-card flat bordered class="status-card">
      <q-card-section class="q-pa-sm">
        <div class="row items-center">
          <q-icon 
            :name="isLoading ? 'hourglass_empty' : statusIcon" 
            :color="isLoading ? 'grey' : statusColor" 
            size="1.5rem"
            class="q-mr-sm"
          />
          <div class="status-text">
            <div class="text-body2">
              <span v-if="isLoading">Loading agent...</span>
              <span v-else>{{ agentName }}</span>
              <!-- Sign-in/Sign-out buttons -->
              <q-btn
                v-if="!isLoading && !currentUser"
                flat
                dense
                size="sm"
                color="primary"
                label="Sign-in"
                @click="$emit('sign-in')"
                class="q-ml-sm"
              />
              <q-btn
                v-if="!isLoading && currentUser"
                flat
                dense
                size="sm"
                color="grey"
                label="Sign-out"
                @click="$emit('sign-out')"
                class="q-ml-sm"
              />
            </div>
            <div class="text-caption text-grey">
              <span v-if="isLoading">Checking agent status...</span>
              <span v-else>{{ statusText }}</span>
            </div>
            <!-- Show warning prominently if present -->
            <div v-if="!isLoading && warning" :class="warningClass" class="text-caption q-mt-xs warning-text">
              <q-icon :name="warningIcon" size="1rem" class="q-mr-xs" />
              {{ warning }}
            </div>
          </div>
          <q-btn
            v-if="!isLoading && showManageButton"
            flat
            round
            dense
            icon="manage_accounts"
            color="primary"
            @click="$emit('manage')"
            size="sm"
            class="q-ml-sm"
            title="Manage Agent & Knowledge Bases"
          />
        </div>
      </q-card-section>
    </q-card>
  </div>
</template>

<script lang="ts">
import { defineComponent, computed, watch } from 'vue'
import { QIcon, QBtn, QCard, QCardSection, QSpace } from 'quasar'

export interface DigitalOceanAgent {
  id: string
  name: string
  description: string
  model: string
  status: string
  instructions: string
  knowledgeBase?: {
    uuid: string
    name: string
    created_at: string
    updated_at: string
    region: string
  }
  knowledgeBases?: {
    uuid: string
    name: string
    created_at: string
    updated_at: string
    region: string
  }[]
}

export default defineComponent({
  name: 'AgentStatusIndicator',
  components: {
    QIcon,
    QBtn,
    QCard,
    QCardSection,
    QSpace
  },
  props: {
    agent: {
      type: Object as () => DigitalOceanAgent | null,
      default: null
    },
    showManageButton: {
      type: Boolean,
      default: true
    },
    warning: {
      type: String,
      default: ''
    },
    currentUser: {
      type: Object as () => any,
      default: null
    },
    isLoading: {
      type: Boolean,
      default: false
    }
  },
  emits: ['manage', 'sign-in', 'sign-out'],
  setup(props) {
    const agentName = computed(() => {
      if (!props.agent) {
        return 'No Agent Configured'
      }
      
      // Get current user from props or use default
      const userName = props.currentUser?.userId || props.currentUser?.displayName || props.currentUser?.username || 'Unknown User'
      
      // Debug logging removed for cleaner console output
      
      return `Personal AI ${props.agent.name} for User: ${userName}`
    })

    const statusText = computed(() => {
      if (!props.agent) {
        return 'Create an agent to get started'
      }
      
      let text = `Status: ${props.agent.status} • Model: ${props.agent.model}`
      
      // Add knowledge base information if available
      if (props.agent.knowledgeBases && props.agent.knowledgeBases.length > 0) {
        const kbCount = props.agent.knowledgeBases.length
        const primaryKB = props.agent.knowledgeBases[0]
        const updatedDate = new Date(primaryKB.updated_at).toLocaleDateString()
        
        if (kbCount === 1) {
          text += ` • Knowledge Base: ${primaryKB.name} (Updated: ${updatedDate})`
        } else {
          text += ` • Knowledge Bases: ${kbCount} attached (Primary: ${primaryKB.name})`
        }
      } else if (props.agent.knowledgeBase) {
        const updatedDate = new Date(props.agent.knowledgeBase.updated_at).toLocaleDateString()
        text += ` • Knowledge Base: ${props.agent.knowledgeBase.name} (Updated: ${updatedDate})`
      }
      
      return text
    })

    const statusIcon = computed(() => {
      if (!props.agent) {
        return 'smart_toy'
      }
      switch (props.agent.status) {
        case 'active':
          return 'check_circle'
        case 'creating':
          return 'hourglass_empty'
        case 'error':
          return 'error'
        default:
          return 'smart_toy'
      }
    })

    const statusColor = computed(() => {
      if (!props.agent) {
        return 'grey'
      }
      switch (props.agent.status) {
        case 'active':
          return 'positive'
        case 'creating':
          return 'warning'
        case 'error':
          return 'negative'
        default:
          return 'grey'
      }
    })

    // Warning styling based on content
    const warningClass = computed(() => {
      if (!props.warning) return '';
      
      // Check if it's a purple note (same-owner multiple KBs)
      if (props.warning.includes('💜 NOTE:')) {
        return 'text-purple q-mt-xs warning-text';
      }
      
      // Default warning styling
      return 'text-warning q-mt-xs warning-text';
    })

    const warningIcon = computed(() => {
      if (!props.warning) return 'warning';
      
      // Check if it's a purple note (same-owner multiple KBs)
      if (props.warning.includes('💜 NOTE:')) {
        return 'info';
      }
      
      // Default warning icon
      return 'warning';
    })

    // Debug currentUser prop changes
    watch(() => props.currentUser, (newUser) => {
      // Debug logging removed for cleaner console output
    })

    // Debug warning prop changes
    watch(() => props.warning, (newWarning) => {
      // Debug logging removed for cleaner console output
    })

    return {
      agentName,
      statusText,
      statusIcon,
      statusColor,
      warningClass,
      warningIcon
    }
  }
})
</script>

<style scoped>
.agent-status-indicator {
  margin-bottom: 1rem;
}

.status-card {
  background: linear-gradient(135deg, #f5f7fa 0%, #c3cfe2 100%);
  border-radius: 8px;
}

.status-text {
  flex: 1;
  min-width: 0; /* Allow text to shrink */
  word-wrap: break-word;
  overflow-wrap: break-word;
  max-width: calc(100% - 3rem); /* Reserve space for icon and button */
}

.status-text .text-caption {
  white-space: normal;
  line-height: 1.3;
  word-break: break-word;
}

.warning-text {
  border-radius: 4px;
  padding: 4px 8px;
  margin-top: 4px;
  font-weight: 500;
}

/* Default warning styling (yellow) */
.text-warning.warning-text {
  background-color: #ffebee;
  border: 1px solid #f44336;
}

/* Purple note styling for same-owner multiple KBs */
.text-purple.warning-text {
  background-color: #f3e5f5;
  border: 1px solid #9c27b0;
}
</style> 