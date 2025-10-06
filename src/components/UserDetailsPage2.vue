<template>
  <div class="user-details-page2">
    <!-- Header -->
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

    <!-- Loading State -->
    <div v-if="loading" class="loading-container">
      <QSpinner size="2em" />
      <div class="q-mt-sm">Loading user details...</div>
    </div>

    <!-- Error State -->
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

    <!-- User Details -->
    <div v-else-if="user" class="user-details-content">
      <!-- Summary Cards -->
      <div class="summary-cards">
        <QCard flat bordered class="summary-card">
          <QCardSection class="text-center">
            <div class="summary-number">{{ user.userId }}</div>
            <div class="summary-label">User ID</div>
          </QCardSection>
        </QCard>

        <QCard flat bordered class="summary-card">
          <QCardSection class="text-center">
            <div class="summary-number">{{ user.email || 'No Email' }}</div>
            <div class="summary-label">Email</div>
          </QCardSection>
        </QCard>

        <QCard flat bordered class="summary-card">
          <QCardSection class="text-center">
            <div class="summary-number">{{ formatRelativeTime(user.createdAt) }}</div>
            <div class="summary-label">Created</div>
          </QCardSection>
        </QCard>
      </div>

      <!-- Status Badges -->
      <div class="status-section">
        <h4 class="section-title">Status</h4>
        <div class="badges-row">
          <QBadge
            :color="getWorkflowStageColor(user.workflowStage)"
            :label="formatWorkflowStage(user.workflowStage)"
            class="status-badge"
          />
          
          <QBadge
            v-if="user.assignedAgentName"
            color="primary"
            :label="`Agent: ${user.assignedAgentName}`"
            class="status-badge"
          />
          
          <QBadge
            :color="user.hasPasskey ? 'positive' : 'negative'"
            :label="user.hasPasskey ? 'Has Passkey' : 'No Passkey'"
            class="status-badge"
          />
          
          <QBadge
            :color="user.hasBucket ? 'positive' : 'negative'"
            :label="user.hasBucket ? 'Has Bucket' : 'No Bucket'"
            class="status-badge"
          />
          
          <QBadge
            :color="user.hasApiKey ? 'positive' : 'negative'"
            :label="user.hasApiKey ? 'Has API Key' : 'No API Key'"
            class="status-badge"
          />
        </div>
      </div>

      <!-- Admin Actions -->
      <div class="actions-section">
        <!-- Generate API Key Button -->
        <div v-if="user && user.assignedAgentId && !user.hasApiKey" class="q-mb-md">
          <QBtn
            color="primary"
            icon="key"
            label="GET API KEY"
            @click="generateApiKey"
            :loading="isGeneratingApiKey"
            class="generate-api-key-btn"
          />
          <div class="text-caption text-grey-6 q-mt-xs">
            Generate an API key for this user's assigned agent
          </div>
        </div>
        <h4 class="section-title">Admin Actions</h4>
        <div class="action-buttons">
          <QBtn
            v-if="user.workflowStage === 'request_email_sent' || user.workflowStage === 'awaiting_approval'"
            color="positive"
            label="Approve User"
            @click="approveUser"
            class="action-btn"
          />
          
          <QBtn
            v-if="user.workflowStage === 'request_email_sent' || user.workflowStage === 'awaiting_approval'"
            color="negative"
            label="Reject User"
            @click="rejectUser"
            class="action-btn"
          />
          
          <QBtn
            v-if="user.workflowStage === 'approved' && !user.assignedAgentId"
            color="primary"
            label="Create Agent"
            @click="createAgent"
            class="action-btn"
          />
          
          <QBtn
            v-if="user.workflowStage === 'agent_assigned'"
            color="info"
            label="View Agent"
            @click="viewAgent"
            class="action-btn"
          />
        </div>
      </div>

      <!-- Admin Notes -->
      <div class="notes-section">
        <h4 class="section-title">Administrator Notes</h4>
        <QInput
          v-model="adminNotes"
          type="textarea"
          outlined
          rows="3"
          placeholder="Add notes about this user or decision..."
          class="notes-input"
        />
        <div class="q-mt-sm">
          <QBtn
            color="primary"
            icon="save"
            label="Save Notes"
            @click="saveNotes"
            :loading="isSavingNotes"
            size="sm"
          />
        </div>
      </div>

      <!-- User Files -->
      <div class="files-section" v-if="user.files && user.files.length > 0">
        <h4 class="section-title">📁 User Files</h4>
        <div class="files-table">
          <div class="file-header">
            <div class="file-name" data-label="File Name">File Name</div>
            <div class="file-size" data-label="Size">Size</div>
            <div class="file-type" data-label="Type">Type</div>
            <div class="file-kbs" data-label="Knowledge Bases">Knowledge Bases</div>
            <div class="file-date" data-label="Uploaded">Uploaded</div>
          </div>
          <div 
            v-for="file in user.files" 
            :key="file.bucketKey" 
            class="file-row"
          >
            <div class="file-name" data-label="File Name">
              <QIcon :name="getFileIcon(file.fileType)" class="file-icon" />
              {{ file.fileName }}
            </div>
            <div class="file-size" data-label="Size">{{ formatFileSize(file.fileSize) }}</div>
            <div class="file-type" data-label="Type">{{ file.fileType }}</div>
            <div class="file-kbs" data-label="Knowledge Bases">
              <div v-if="file.knowledgeBases && file.knowledgeBases.length > 0" class="kb-chips">
                <QChip
                  v-for="kb in file.knowledgeBases"
                  :key="kb.id"
                  :label="kb.name"
                  size="sm"
                  color="primary"
                  outline
                  class="kb-chip"
                />
              </div>
              <div v-else class="no-kbs">Not in any KB</div>
            </div>
            <div class="file-date" data-label="Uploaded">{{ formatRelativeTime(file.uploadedAt) }}</div>
          </div>
        </div>
      </div>

      <!-- Additional Info -->
      <div class="info-section">
        <h4 class="section-title">Additional Information</h4>
        <div class="info-grid">
          <div class="info-item" v-if="user.assignedAgentId">
            <strong>Assigned Agent ID:</strong> {{ user.assignedAgentId }}
          </div>
          <div class="info-item" v-if="user.agentAssignedAt">
            <strong>Agent Assigned:</strong> {{ formatRelativeTime(user.agentAssignedAt) }}
          </div>
          <div class="info-item">
            <strong>API Key Status:</strong> {{ user.agentApiKey || 'Not Available' }}
          </div>
          <div class="info-item" v-if="user.bucketFileCount !== undefined">
            <strong>Bucket Files:</strong> {{ user.bucketFileCount }} files
          </div>
          <div class="info-item" v-if="user.bucketTotalSize">
            <strong>Bucket Size:</strong> {{ formatFileSize(user.bucketTotalSize) }}
          </div>
          <div class="info-item">
            <strong>Last Updated:</strong> {{ formatRelativeTime(user.updatedAt) }}
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useQuasar } from 'quasar'
import { QBtn, QCard, QCardSection, QBadge, QSpinner, QIcon, QInput, QChip } from 'quasar'

const $q = useQuasar()

// Reactive data
const user = ref(null)
const loading = ref(true)
const error = ref(null)
const adminNotes = ref('')
const isSavingNotes = ref(false)
const isGeneratingApiKey = ref(false)

// Extract userId from pathname
const getUserIdFromPath = () => {
  const pathname = window.location.pathname
  const match = pathname.match(/\/admin2\/user\/(.+)/)
  return match ? match[1] : null
}

// Load user details
const loadUserDetails = async () => {
  try {
    loading.value = true
    error.value = null
    
    const userId = getUserIdFromPath()
    if (!userId) {
      throw new Error('User ID not found in URL')
    }
    
    const response = await fetch(`/api/admin-management/users/${userId}`, {
      credentials: 'include'
    })
    
    if (!response.ok) {
      throw new Error(`Failed to fetch user details: ${response.status}`)
    }
    
    const userData = await response.json()
    user.value = userData
    
    // Load existing admin notes
    adminNotes.value = userData.adminNotes || ''
    
    
    console.log(`✅ [UserDetailsPage2] Loaded user details for ${userId}`)
  } catch (err) {
    console.error('❌ [UserDetailsPage2] Failed to load user details:', err)
    error.value = err.message
    $q.notify({
      type: 'negative',
      message: 'Failed to load user details',
      position: 'top'
    })
  } finally {
    loading.value = false
  }
}

// Generate API key for user's agent
const generateApiKey = async () => {
  try {
    isGeneratingApiKey.value = true
    
    const userId = getUserIdFromPath()
    if (!userId) {
      throw new Error('User ID not found in URL')
    }
    
    const response = await fetch(`/api/admin-management/users/${userId}/generate-api-key`, {
      method: 'POST',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json'
      }
    })
    
    if (!response.ok) {
      const errorData = await response.json()
      throw new Error(errorData.error || `Failed to generate API key: ${response.status}`)
    }
    
    const result = await response.json()
    
    $q.notify({
      type: 'positive',
      message: 'API key generated successfully!',
      position: 'top'
    })
    
    // Reload user details to show updated information
    await loadUserDetails()
    
    console.log(`✅ [UserDetailsPage2] API key generated for user ${userId}`)
  } catch (err) {
    console.error('❌ [UserDetailsPage2] Failed to generate API key:', err)
    $q.notify({
      type: 'negative',
      message: err.message || 'Failed to generate API key',
      position: 'top'
    })
  } finally {
    isGeneratingApiKey.value = false
  }
}

// Navigation
const goBack = () => {
  window.location.href = '/admin2'
}

// Utility functions
const formatRelativeTime = (dateString: string) => {
  if (!dateString) return 'Unknown'
  
  const date = new Date(dateString)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  
  const diffMinutes = Math.floor(diffMs / (1000 * 60))
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60))
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24))
  
  if (diffMinutes < 1) return 'Just now'
  if (diffMinutes < 60) return `${diffMinutes} minute${diffMinutes > 1 ? 's' : ''} ago`
  if (diffHours < 24) return `${diffHours} hour${diffHours > 1 ? 's' : ''} ago`
  if (diffDays < 30) return `${diffDays} day${diffDays > 1 ? 's' : ''} ago`
  
  return date.toLocaleDateString()
}

const formatFileSize = (bytes: number) => {
  if (!bytes) return '0 B'
  const sizes = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(1024))
  return `${Math.round(bytes / Math.pow(1024, i) * 100) / 100} ${sizes[i]}`
}

const getFileIcon = (fileType: string) => {
  const icons = {
    'pdf': 'picture_as_pdf',
    'text': 'description',
    'transcript': 'chat',
    'markdown': 'description',
    'rtf': 'description'
  }
  return icons[fileType] || 'insert_drive_file'
}

const getWorkflowStageColor = (stage: string) => {
  const colors = {
    'no_passkey': 'orange',
    'no_request_yet': 'grey',
    'awaiting_approval': 'warning',
    'waiting_for_deployment': 'info',
    'approved': 'positive',
    'rejected': 'negative',
    'suspended': 'negative',
    'agent_assigned': 'positive'
  }
  return colors[stage] || 'grey'
}

const formatWorkflowStage = (stage: string) => {
  if (!stage) return 'Unknown'
  return stage.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())
}

// Admin actions
const approveUser = async () => {
  try {
    const response = await fetch(`/api/admin-management/users/${user.value.userId}/approve`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'approve' }),
      credentials: 'include'
    })
    
    if (!response.ok) {
      throw new Error(`Failed to approve user: ${response.status}`)
    }
    
    user.value.workflowStage = 'approved'
    user.value.approvalStatus = 'approved'
    
    $q.notify({
      type: 'positive',
      message: 'User approved successfully',
      position: 'top'
    })
  } catch (error) {
    console.error('❌ Failed to approve user:', error)
    $q.notify({
      type: 'negative',
      message: 'Failed to approve user',
      position: 'top'
    })
  }
}

const rejectUser = async () => {
  try {
    const response = await fetch(`/api/admin-management/users/${user.value.userId}/approve`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'reject' }),
      credentials: 'include'
    })
    
    if (!response.ok) {
      throw new Error(`Failed to reject user: ${response.status}`)
    }
    
    user.value.workflowStage = 'rejected'
    user.value.approvalStatus = 'rejected'
    
    $q.notify({
      type: 'positive',
      message: 'User rejected successfully',
      position: 'top'
    })
  } catch (error) {
    console.error('❌ Failed to reject user:', error)
    $q.notify({
      type: 'negative',
      message: 'Failed to reject user',
      position: 'top'
    })
  }
}

const createAgent = async () => {
  try {
    // Check if user already has an agent
    if (user.value.assignedAgentId) {
      $q.notify({
        type: 'warning',
        message: `User ${user.value.userId} already has an assigned agent: ${user.value.assignedAgentName}`,
        position: 'top'
      })
      return
    }
    
    const response = await fetch(`/api/admin-management/users/${user.value.userId}/assign-agent`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'create' }),
      credentials: 'include'
    })
    
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}))
      
      // Handle specific error cases
      if (response.status === 400 && errorData.error === 'User already has an assigned agent') {
        $q.notify({
          type: 'warning',
          message: `User ${user.value.userId} already has an assigned agent: ${errorData.existingAgentName}`,
          position: 'top'
        })
        
        // Refresh user data to get the latest state
        await loadUserDetails()
        return
      }
      
      throw new Error(`Failed to create agent: ${response.status} - ${errorData.error || 'Unknown error'}`)
    }
    
    const agentData = await response.json()
    user.value.workflowStage = 'approved'
    user.value.assignedAgentId = agentData.agentId
    user.value.assignedAgentName = agentData.agentName
    
    $q.notify({
      type: 'positive',
      message: 'Agent created successfully',
      position: 'top'
    })
  } catch (error) {
    console.error('❌ Failed to create agent:', error)
    $q.notify({
      type: 'negative',
      message: `Failed to create agent: ${error.message}`,
      position: 'top'
    })
  }
}

const viewAgent = () => {
  // Navigate to agent details or open agent management
  $q.notify({
    type: 'info',
    message: 'Agent details view - to be implemented',
    position: 'top'
  })
}

const saveNotes = async () => {
  if (!user.value || !adminNotes.value.trim()) {
    $q.notify({
      type: 'warning',
      message: 'Please enter some notes to save',
      position: 'top'
    })
    return
  }
  
  isSavingNotes.value = true
  try {
    const response = await fetch(`/api/admin-management/users/${user.value.userId}/notes`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        notes: adminNotes.value
      }),
      credentials: 'include'
    })
    
    if (!response.ok) {
      throw new Error(`Failed to save notes: ${response.status}`)
    }
    
    // Update the user's notes in the local state
    if (user.value) {
      user.value.adminNotes = adminNotes.value
    }
    
    $q.notify({
      type: 'positive',
      message: 'Notes saved successfully',
      position: 'top'
    })
  } catch (error) {
    console.error('❌ [UserDetailsPage2] Failed to save notes:', error)
    $q.notify({
      type: 'negative',
      message: `Failed to save notes: ${error.message}`,
      position: 'top'
    })
  } finally {
    isSavingNotes.value = false
  }
}

// Lifecycle
onMounted(() => {
  loadUserDetails()
})
</script>

<style scoped>
.user-details-page2 {
  max-width: 1200px;
  margin: 0 auto;
  padding: 20px;
  min-height: calc(100vh - 40px);
  overflow-y: visible;
  box-sizing: border-box;
  position: relative;
  height: auto !important;
}

.page-header {
  display: flex;
  align-items: center;
  margin-bottom: 24px;
  gap: 16px;
}

.back-button {
  min-width: auto;
}

.page-title {
  margin: 0;
  font-size: 24px;
  font-weight: 600;
  color: #1976d2;
}

.loading-container,
.error-container {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 60px 20px;
  text-align: center;
}

.user-details-content {
  display: flex;
  flex-direction: column;
  gap: 24px;
}

/* Summary Cards */
.summary-cards {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 16px;
  margin-bottom: 24px;
}

.summary-card {
  border-radius: 8px;
  transition: all 0.2s ease;
}

.summary-card:hover {
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
}

.summary-number {
  font-size: 18px;
  font-weight: 600;
  color: #1976d2;
  margin-bottom: 4px;
  word-break: break-all;
}

.summary-label {
  font-size: 14px;
  color: #666;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

/* Status Section */
.status-section,
.actions-section,
.notes-section,
.info-section {
  background: #f8f9fa;
  border-radius: 8px;
  padding: 20px;
}

.section-title {
  margin: 0 0 16px 0;
  font-size: 18px;
  font-weight: 600;
  color: #333;
}

.badges-row {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.status-badge {
  font-size: 14px;
  padding: 8px 12px;
  border-radius: 6px;
  font-weight: 500;
}

/* Action Buttons */
.action-buttons {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
}

.action-btn {
  min-width: 140px;
  font-weight: 500;
}

/* Notes Section */
.notes-input {
  margin-bottom: 12px;
}

/* Info Grid */
.info-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
  gap: 12px;
}

.info-item {
  display: flex;
  align-items: center;
  padding: 8px 0;
  font-size: 14px;
}

.info-item strong {
  margin-right: 8px;
  color: #333;
  min-width: 140px;
}

/* Files Section */
.files-section {
  background: #f8f9fa;
  border-radius: 8px;
  padding: 20px;
}

.files-table {
  background: white;
  border-radius: 6px;
  overflow: hidden;
  border: 1px solid #e0e0e0;
}

.file-header {
  display: grid;
  grid-template-columns: 2fr 1fr 1fr 2fr 1fr;
  gap: 16px;
  padding: 12px 16px;
  background: #f5f5f5;
  font-weight: 600;
  font-size: 14px;
  color: #666;
  border-bottom: 1px solid #e0e0e0;
}

.file-row {
  display: grid;
  grid-template-columns: 2fr 1fr 1fr 2fr 1fr;
  gap: 16px;
  padding: 12px 16px;
  border-bottom: 1px solid #f0f0f0;
  align-items: center;
  font-size: 14px;
}

.file-row:last-child {
  border-bottom: none;
}

.file-row:hover {
  background: #f9f9f9;
}

.file-name {
  display: flex;
  align-items: center;
  gap: 8px;
  font-weight: 500;
  color: #333;
}

.file-icon {
  color: #666;
  font-size: 18px;
}

.file-size {
  color: #666;
  font-family: monospace;
}

.file-type {
  color: #666;
  text-transform: uppercase;
  font-size: 12px;
  font-weight: 500;
}

.file-kbs {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}

.kb-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}

.kb-chip {
  font-size: 11px;
}

.no-kbs {
  color: #999;
  font-style: italic;
  font-size: 12px;
}

.file-date {
  color: #666;
  font-size: 12px;
}

/* Responsive */
@media (max-width: 768px) {
  .user-details-page2 {
    padding: 16px;
  }
  
  .page-header {
    flex-direction: column;
    align-items: flex-start;
    gap: 12px;
  }
  
  .summary-cards {
    grid-template-columns: 1fr;
  }
  
  .action-buttons {
    flex-direction: column;
  }
  
  .action-btn {
    width: 100%;
  }
  
  .info-grid {
    grid-template-columns: 1fr;
  }
  
  .info-item {
    flex-direction: column;
    align-items: flex-start;
  }
  
  .info-item strong {
    min-width: auto;
    margin-bottom: 4px;
  }
  
  .files-table {
    overflow-x: auto;
  }
  
  .file-header,
  .file-row {
    grid-template-columns: 1fr;
    gap: 8px;
  }
  
  .file-header > div,
  .file-row > div {
    padding: 4px 0;
  }
  
  .file-header > div::before,
  .file-row > div::before {
    content: attr(data-label) ': ';
    font-weight: 600;
    color: #666;
    display: inline-block;
    min-width: 120px;
  }
  
  .file-row > div[data-label="File Name"]::before {
    display: none;
  }
  
  .file-row > div[data-label="File Name"] {
    font-weight: 600;
    margin-bottom: 8px;
    border-bottom: 1px solid #f0f0f0;
    padding-bottom: 8px;
  }
}
</style>
