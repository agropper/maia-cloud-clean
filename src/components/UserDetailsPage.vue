<template>
  <div class="user-details-page">
    <div class="page-header">
      <QBtn 
        icon="arrow_back" 
        flat 
        @click="goBack"
        class="back-button"
      >
        Back to Admin Panel
      </QBtn>
      <h2 class="page-title">
        👤 User Details: {{ user?.displayName || 'Loading...' }}
      </h2>
    </div>

    <div v-if="loading" class="loading-container">
      <QSpinner size="2em" />
      <div class="q-mt-sm">Loading user details...</div>
    </div>

    <div v-else-if="error" class="error-container">
      <QIcon name="error" color="negative" size="40px" />
      <div class="text-negative q-mt-sm">{{ error }}</div>
      <QBtn
        label="Retry"
        color="primary"
        @click="loadUserDetails"
        class="q-mt-md"
      />
    </div>

    <div v-else-if="user" class="user-details-content">
      <!-- Basic Information -->
      <QCard class="info-card">
        <QCardSection>
          <h5 class="card-title">Basic Information</h5>
          <div class="info-grid">
            <div class="info-item">
              <strong>User ID:</strong> {{ user.userId }}
            </div>
            <div class="info-item">
              <strong>Display Name:</strong> {{ user.displayName }}
            </div>
            <div class="info-item">
              <strong>Email:</strong> {{ user.email || 'No email provided' }}
            </div>
            <div class="info-item">
              <strong>Created:</strong> {{ formatDate(user.createdAt) }}
            </div>
            <div class="info-item">
              <strong>Last Updated:</strong> {{ formatDate(user.updatedAt) }}
            </div>
          </div>
        </QCardSection>
      </QCard>

      <!-- Workflow Information -->
      <QCard class="info-card">
        <QCardSection>
          <h5 class="card-title">Workflow Information</h5>
          <div class="info-grid">
            <div class="info-item">
              <strong>Workflow Stage:</strong> 
              <QChip 
                :color="getWorkflowStageColor(user.workflowStage)" 
                text-color="white"
                :label="formatWorkflowStage(user.workflowStage)"
              />
            </div>
            <div class="info-item">
              <strong>Approval Status:</strong> 
              <QChip 
                :color="getApprovalStatusColor(user.approvalStatus)" 
                text-color="white"
                :label="formatApprovalStatus(user.approvalStatus)"
              />
            </div>
            <div class="info-item" v-if="user.assignedAgentId">
              <strong>Assigned Agent:</strong> {{ user.assignedAgentName || user.assignedAgentId }}
            </div>
            <div class="info-item" v-if="user.agentAssignedAt">
              <strong>Agent Assigned:</strong> {{ formatDate(user.agentAssignedAt) }}
            </div>
          </div>
        </QCardSection>
      </QCard>

      <!-- Bucket Information -->
      <QCard class="info-card">
        <QCardSection>
          <h5 class="card-title">Bucket Status</h5>
          <div class="info-grid">
            <div class="info-item">
              <strong>Has Bucket:</strong> 
              <QChip 
                :color="user.hasBucket ? 'positive' : 'negative'" 
                text-color="white"
                :label="user.hasBucket ? 'Yes' : 'No'"
              />
            </div>
            <div class="info-item" v-if="user.hasBucket">
              <strong>File Count:</strong> {{ user.bucketFileCount || 0 }} files
            </div>
            <div class="info-item" v-if="user.hasBucket">
              <strong>Total Size:</strong> {{ formatFileSize(user.bucketTotalSize) }}
            </div>
          </div>
        </QCardSection>
      </QCard>

      <!-- Passkey Information -->
      <QCard class="info-card">
        <QCardSection>
          <h5 class="card-title">Passkey Information</h5>
          <div class="info-grid">
            <div class="info-item">
              <strong>Has Passkey:</strong> 
              <QChip 
                :color="user.hasPasskey ? 'positive' : 'negative'" 
                text-color="white"
                :label="user.hasPasskey ? 'Yes' : 'No'"
              />
            </div>
            <div class="info-item">
              <strong>Valid Passkey:</strong> 
              <QChip 
                :color="user.hasValidPasskey ? 'positive' : 'negative'" 
                text-color="white"
                :label="user.hasValidPasskey ? 'Yes' : 'No'"
              />
            </div>
          </div>
        </QCardSection>
      </QCard>

      <!-- Admin Actions -->
      <QCard class="info-card">
        <QCardSection>
          <h5 class="card-title">Admin Actions</h5>
          <div class="action-buttons">
            <!-- Debug info -->
            <div v-if="user" class="q-mb-md text-caption">
              Debug: workflowStage = "{{ user.workflowStage }}", awaiting_approval check = {{ user.workflowStage === 'awaiting_approval' }}
            </div>
            <QBtn
              v-if="user.workflowStage === 'request_email_sent'"
              color="primary"
              label="Create Agent"
              @click="createAgent"
              :loading="creatingAgent"
            />
            <QBtn
              v-if="user.workflowStage === 'awaiting_approval'"
              color="positive"
              label="Approve User"
              @click="approveUser"
              :loading="approving"
            />
            <QBtn
              v-if="user.workflowStage === 'awaiting_approval'"
              color="negative"
              label="Reject User"
              @click="rejectUser"
              :loading="rejecting"
            />
            <QBtn
              v-if="user.workflowStage === 'approved' && !user.assignedAgentId"
              color="primary"
              label="Create Agent"
              @click="createAgent"
              :loading="creatingAgent"
            />
            <QBtn
              v-if="user.workflowStage === 'agent_assigned'"
              color="info"
              label="View Agent Status"
              @click="viewAgentStatus"
            />
            <QBtn
              v-if="!user.hasBucket && isPrivateAIUser(user)"
              color="primary"
              label="Create Bucket Folder"
              @click="createBucketFolder"
              :loading="creatingBucket"
            />
          </div>
        </QCardSection>
      </QCard>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import { useQuasar } from 'quasar'
import {
  QCard,
  QCardSection,
  QBtn,
  QSpinner,
  QIcon,
  QChip,
  QInput
} from 'quasar'
import { WORKFLOW_CONFIG } from '../config/workflow-config'

const $q = useQuasar()

// Reactive data
const user = ref(null)
const loading = ref(true)
const error = ref(null)
const approving = ref(false)
const rejecting = ref(false)
const creatingAgent = ref(false)
const creatingBucket = ref(false)

// Get userId from URL pathname
const userId = computed(() => {
  const path = window.location.pathname
  const match = path.match(/\/admin\/user\/(.+)$/)
  return match ? match[1] : null
})

// Load user details
const loadUserDetails = async () => {
  if (!userId.value) {
    error.value = 'No user ID provided'
    loading.value = false
    return
  }

  try {
    loading.value = true
    error.value = null

    // Fetch user details
    const userResponse = await fetch(`/api/admin-management/users/${userId.value}`)
    if (!userResponse.ok) {
      throw new Error(`Failed to load user details: ${userResponse.status}`)
    }
    const userData = await userResponse.json()
    user.value = userData

    // Fetch bucket status
    try {
      const bucketResponse = await fetch(`/api/bucket/user-status/${userId.value}`)
      if (bucketResponse.ok) {
        const bucketData = await bucketResponse.json()
        user.value = {
          ...user.value,
          hasBucket: bucketData.hasFolder,
          bucketFileCount: bucketData.fileCount,
          bucketTotalSize: bucketData.totalSize
        }
      }
    } catch (bucketError) {
      console.warn('Failed to load bucket status:', bucketError)
    }

  } catch (err) {
    console.error('Error loading user details:', err)
    error.value = err.message
  } finally {
    loading.value = false
  }
}

// Navigation
const goBack = () => {
  window.location.href = '/admin'
}

// Admin actions
const approveUser = async () => {
  try {
    approving.value = true
    const response = await fetch(`/api/admin-management/users/${userId.value}/approve`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'approve' })
    })
    if (!response.ok) {
      throw new Error(`Failed to approve user: ${response.status}`)
    }
    
    // Update local state instead of reloading to prevent infinite loop
    if (user.value) {
      user.value.workflowStage = 'approved'
      user.value.approvalStatus = 'approved'
    }
    
    $q.notify({
      type: 'positive',
      message: 'User approved successfully'
    })
  } catch (err) {
    console.error('Error approving user:', err)
    error.value = err.message
    $q.notify({
      type: 'negative',
      message: 'Failed to approve user'
    })
  } finally {
    approving.value = false
  }
}

const rejectUser = async () => {
  try {
    rejecting.value = true
    const response = await fetch(`/api/admin-management/users/${userId.value}/approve`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'reject' })
    })
    if (!response.ok) {
      throw new Error(`Failed to reject user: ${response.status}`)
    }
    
    // Update local state instead of reloading to prevent infinite loop
    if (user.value) {
      user.value.workflowStage = 'rejected'
      user.value.approvalStatus = 'rejected'
    }
    
    $q.notify({
      type: 'negative',
      message: 'User rejected'
    })
  } catch (err) {
    console.error('Error rejecting user:', err)
    error.value = err.message
  } finally {
    rejecting.value = false
  }
}

const createAgent = async () => {
  try {
    creatingAgent.value = true
    const response = await fetch('/api/agents', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        userId: userId.value,
        patientName: user.value.displayName || user.value.userId,
        model: 'OpenAI GPT-oss-120b'
      })
    })
    if (!response.ok) {
      throw new Error(`Failed to create agent: ${response.status}`)
    }
    
    const agentData = await response.json()
    
    // Update local state instead of reloading to prevent infinite loop
    if (user.value) {
      user.value.workflowStage = 'approved'
      user.value.assignedAgentId = agentData.agentId
      user.value.assignedAgentName = agentData.agentName
    }
    
    $q.notify({
      type: 'positive',
      message: 'Agent created successfully'
    })
  } catch (err) {
    console.error('Error creating agent:', err)
    error.value = err.message
  } finally {
    creatingAgent.value = false
  }
}

const viewAgentStatus = () => {
  // Navigate to agent management or show agent status
  console.log('View agent status for:', user.value.assignedAgentId)
}

const isPrivateAIUser = (user: any) => {
  // Check if user is a private AI user (not Public User or deep_link user)
  return user.userId !== 'Public User' && !user.userId?.startsWith('deep_link_')
}

const createBucketFolder = async () => {
  try {
    creatingBucket.value = true
    console.log(`🪣 [BUCKET] Creating bucket folder for user: ${user.value.userId}`)
    
    const response = await fetch('/api/bucket/ensure-user-folder', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: user.value.userId }),
      credentials: 'include'
    })
    
    if (!response.ok) {
      throw new Error(`Failed to create bucket folder: ${response.statusText}`)
    }
    
    // Update local state to show bucket was created
    if (user.value) {
      user.value.hasBucket = true
      user.value.bucketFileCount = 0
      user.value.bucketTotalSize = 0
    }
    
    $q.notify({
      type: 'positive',
      message: `Bucket folder created successfully for ${user.value.displayName || user.value.userId}`,
      position: 'top'
    })
    
  } catch (error) {
    console.error('❌ [UserDetailsPage] Failed to create bucket folder:', error)
    $q.notify({
      type: 'negative',
      message: 'Failed to create bucket folder',
      position: 'top'
    })
  } finally {
    creatingBucket.value = false
  }
}

// Utility functions
const formatDate = (dateString: string) => {
  if (!dateString) return 'N/A'
  const date = new Date(dateString)
  const now = new Date()
  const diffInSeconds = Math.floor((now - date) / 1000)
  
  let timeAgo = ''
  if (diffInSeconds < 60) {
    timeAgo = 'just now'
  } else if (diffInSeconds < 3600) {
    const minutes = Math.floor(diffInSeconds / 60)
    timeAgo = `${minutes} minute${minutes !== 1 ? 's' : ''} ago`
  } else if (diffInSeconds < 86400) {
    const hours = Math.floor(diffInSeconds / 3600)
    timeAgo = `${hours} hour${hours !== 1 ? 's' : ''} ago`
  } else {
    const days = Math.floor(diffInSeconds / 86400)
    timeAgo = `${days} day${days !== 1 ? 's' : ''} ago`
  }
  
  return `${timeAgo} (${date.toLocaleString()})`
}

const formatFileSize = (bytes: number) => {
  if (!bytes) return '0 B'
  const sizes = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(1024))
  return Math.round(bytes / Math.pow(1024, i) * 100) / 100 + ' ' + sizes[i]
}

const getWorkflowStageColor = (stage: string) => {
  const colors = {
    'no_passkey': 'grey',
    'no_request_yet': 'orange',
    'awaiting_approval': 'blue',
    'waiting_for_deployment': 'purple',
    'approved': 'positive',
    'rejected': 'negative',
    'suspended': 'negative',
    'agent_assigned': 'positive'
  }
  return colors[stage] || 'grey'
}

const formatWorkflowStage = (stage: string) => {
  const stages = {
    'no_passkey': 'No Passkey',
    'no_request_yet': 'No Request Yet',
    'awaiting_approval': 'Awaiting Approval',
    'waiting_for_deployment': 'Waiting for Deployment',
    'approved': 'Approved',
    'rejected': 'Rejected',
    'suspended': 'Suspended',
    'agent_assigned': 'Agent Assigned'
  }
  return stages[stage] || stage
}

const getApprovalStatusColor = (status: string) => {
  const colors = {
    'approved': 'positive',
    'rejected': 'negative',
    'pending': 'orange'
  }
  return colors[status] || 'grey'
}

const formatApprovalStatus = (status: string) => {
  if (!status) return 'N/A'
  return status.charAt(0).toUpperCase() + status.slice(1)
}

// Load data on mount
onMounted(() => {
  loadUserDetails()
})
</script>

<style scoped>
.user-details-page {
  max-width: 1200px;
  margin: 0 auto;
  padding: 20px;
  min-height: calc(100vh - 40px); /* Account for padding */
  overflow-y: visible; /* Allow natural scrolling */
  box-sizing: border-box;
  position: relative; /* Ensure proper stacking context */
}

/* Override any global height constraints that might interfere with scrolling */
.user-details-page {
  height: auto !important;
}

.page-header {
  display: flex;
  align-items: center;
  margin-bottom: 30px;
  gap: 20px;
}

.back-button {
  margin-right: 10px;
}

.page-title {
  margin: 0;
  color: #2c3e50;
}

.loading-container,
.error-container {
  text-align: center;
  padding: 40px;
}

.user-details-content {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.info-card {
  box-shadow: 0 2px 8px rgba(0,0,0,0.1);
}

.card-title {
  margin: 0 0 15px 0;
  color: #2c3e50;
  font-size: 1.2em;
  font-weight: bold;
}

.info-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
  gap: 15px;
}

.info-item {
  display: flex;
  flex-direction: column;
  gap: 5px;
}

.info-item strong {
  color: #34495e;
  font-size: 0.9em;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.action-buttons {
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
}

@media (max-width: 768px) {
  .user-details-page {
    padding: 10px;
  }
  
  .page-header {
    flex-direction: column;
    align-items: flex-start;
    gap: 10px;
  }
  
  .info-grid {
    grid-template-columns: 1fr;
  }
  
  .action-buttons {
    flex-direction: column;
  }
}
</style>
