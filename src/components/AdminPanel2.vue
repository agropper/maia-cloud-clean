<template>
  <div class="admin-panel">

    <!-- Loading State -->
    <div v-if="shouldShowLoading" class="q-pa-lg text-center">
      <QSpinner size="40px" color="primary" />
      <div class="q-mt-md">Checking admin authentication...</div>
    </div>

    <!-- Admin Registration Form (shown when on registration page) -->
    <div v-else-if="shouldShowRegistration" class="q-pa-lg">
      <div class="admin-registration">
      <QCard>
        <QCardSection>
          <h4>🔐 Admin Registration</h4>
          <p>To access admin privileges, you must register with the reserved admin username and secret.</p>
          
          <!-- Error Messages -->
          <div v-if="errorMessage" class="error-message q-mb-md">
            <QBanner class="bg-negative text-white">
              {{ errorMessage }}
            </QBanner>
          </div>
          
          <QForm @submit="registerAdmin" class="q-gutter-md">
            <QInput
              v-model="adminForm.username"
              label="Admin Username"
              outlined
              dense
              :rules="[val => !!val || 'Username is required']"
              placeholder="Enter reserved admin username"
            />
            
            <QInput
              v-model="adminForm.adminSecret"
              label="Admin Secret"
              type="password"
              outlined
              dense
              :rules="[val => !!val || 'Admin secret is required']"
              placeholder="Enter admin secret"
            />
            
            <div class="q-mt-md">
              <QBtn
                type="submit"
                color="primary"
                :loading="isRegistering"
                  label="Register Admin"
                  icon="person_add"
                  class="q-mr-md"
                />
              <QBtn
                flat
                color="secondary"
                label="Sign In Instead"
                icon="login"
                @click="goToAdminSignIn"
                class="q-mr-md"
              />
              <QBtn
                flat
                color="secondary"
                label="Return to Main App"
                icon="home"
                @click="goToMainApp"
              />
            </div>
            </QForm>
        </QCardSection>
      </QCard>
      
      <!-- Passkey Registration Section -->
      <div v-if="showPasskeyRegistration" class="passkey-registration q-mt-lg">
        <QCard>
          <QCardSection>
            <h4>🔑 Create Admin Passkey</h4>
            <p>Set up a passkey for secure admin access. This will be used for future sign-ins.</p>
            
            <div class="q-mt-md">
              <QBtn
                color="primary"
                :loading="isRegisteringPasskey"
                label="Create Admin Passkey"
                icon="fingerprint"
                @click="registerPasskey"
              />
              </div>
            </QCardSection>
          </QCard>
        </div>
      </div>
            </div>
            
    <!-- Admin Sign-In Form (shown when on sign-in page) -->
    <div v-else-if="shouldShowSignIn" class="q-pa-lg">
      <div class="admin-signin">
        <QCard>
          <QCardSection>
            <h4>🔐 Admin Sign-In</h4>
            <p>Sign in with your admin passkey to access the administration panel.</p>
            
            <!-- Error Messages -->
            <div v-if="errorMessage" class="error-message q-mb-md">
              <QBanner class="bg-negative text-white">
                {{ errorMessage }}
              </QBanner>
            </div>
            
            <div class="q-mt-lg">
              <QBtn
                color="primary"
                size="lg"
                icon="fingerprint"
                label="Sign In with Passkey"
                @click="adminSignInWithPasskey"
                :loading="isSigningIn"
                class="full-width"
              />
            </div>
            
            <div class="q-mt-md text-center">
              <QBtn
                flat
                color="secondary"
                label="Register as Admin Instead"
                @click="goToAdminRegister"
                class="q-mr-md"
              />
              <QBtn
                flat
                color="secondary"
                label="Return to Main App"
                @click="goToMainApp"
              />
            </div>
          </QCardSection>
        </QCard>
      </div>
    </div>

    <!-- Admin Access Required (shown when not authenticated and not on registration or sign-in page) -->
    <div v-else-if="shouldShowAccessRequired" class="q-pa-lg">
      <QCard>
        <QCardSection>
          <QIcon name="lock" size="64px" color="grey-6" />
          <h4 class="q-mt-md">Admin Access Required</h4>
          <p class="text-grey-6">
            You need admin privileges to access this panel. Please sign in with your admin passkey.
          </p>
            <div class="q-mt-md">
            <QBtn
              color="primary"
              icon="fingerprint"
              label="Sign In with Passkey"
              @click="goToAdminSignIn"
              class="q-mr-sm"
            />
              <QBtn
                flat
                color="secondary"
              label="Register New Admin"
              @click="goToAdminRegister"
              class="q-mr-sm"
            />
            <QBtn
              flat
              color="secondary"
              label="Return to Main App"
              @click="goToMainApp"
              />
            </div>
          </QCardSection>
        </QCard>
      </div>

    <!-- Full Admin Interface (shown when authenticated) -->
    <div v-else-if="shouldShowAdminInterface">
      <div class="admin-header">
        <div class="header-content">
          <h2>🔧 MAIA Administration Panel</h2>
          <QBtn
            color="negative"
            outline
            icon="logout"
            label="Sign Out"
            @click="adminSignOut"
            class="admin-signout-btn"
          />
    </div>

      <div class="q-mt-md">
        <!-- Polling Connection Status -->
        <QBadge
          :color="isPollingConnected ? 'positive' : 'negative'"
          :label="isPollingConnected ? 'Live Updates' : 'Offline'"
          class="polling-status-badge q-mr-md"
        />
        
        <QBtn 
          color="secondary" 
          size="sm" 
          label="Reset Welcome Modal (Test)"
          @click="resetWelcomeModal"
          class="q-mr-sm"
        />
        <QBtn 
          color="info" 
          size="sm" 
          label="Go to Main App"
          @click="goToMainApp"
        />
        <QBtn 
          color="primary" 
          size="sm" 
          label="Switch to Original Admin"
          @click="goToOriginalAdmin"
          class="q-ml-sm"
        />
        <QBtn 
          color="purple" 
          size="sm" 
          label="Test Polling"
          @click="testPolling"
          class="q-ml-sm"
        />
        <QBtn 
          color="teal" 
          size="sm" 
          label="Track Public User"
          @click="testPublicUserTracking"
          class="q-ml-sm"
        />
      </div>
    </div>


      <!-- Status Cards - Compact -->
      <div class="row q-gutter-sm q-mb-lg">
        <!-- Private AI Users Card -->
        <div class="col-auto">
          <QCard class="compact-status-card">
            <QCardSection class="q-pa-sm">
              <div class="row items-center no-wrap">
                <QIcon name="people" size="20px" color="primary" class="q-mr-xs" />
                <div class="text-caption text-grey-8">Users</div>
                <div class="text-body2 text-primary q-ml-xs">{{ userStats.totalUsers }}</div>
                <div class="text-caption text-grey-6 q-ml-xs">({{ userStats.awaitingApproval }} pending)</div>
              </div>
            </QCardSection>
          </QCard>
        </div>

        <!-- Agents Card -->
        <div class="col-auto">
          <QCard class="compact-status-card">
            <QCardSection class="q-pa-sm">
              <div class="row items-center no-wrap">
                <QIcon name="smart_toy" size="20px" color="secondary" class="q-mr-xs" />
                <div class="text-caption text-grey-8">Agents</div>
                <div class="text-body2 text-secondary q-ml-xs">{{ agentStats.totalAgents }}</div>
                <div class="text-caption text-grey-6 q-ml-xs">({{ agentStats.deployedAgents }} deployed)</div>
              </div>
            </QCardSection>
          </QCard>
        </div>

        <!-- Knowledge Bases Card -->
        <div class="col-auto">
          <QCard class="compact-status-card">
            <QCardSection class="q-pa-sm">
              <div class="row items-center no-wrap">
                <QIcon name="storage" size="20px" color="accent" class="q-mr-xs" />
                <div class="text-caption text-grey-8">KBs</div>
                <div class="text-body2 text-accent q-ml-xs">{{ kbStats.totalKBs }}</div>
                <div class="text-caption text-grey-6 q-ml-xs">({{ kbStats.protectedKBs }} protected)</div>
              </div>
            </QCardSection>
          </QCard>
        </div>

        <!-- Sessions Card -->
        <div class="col-auto">
          <QCard class="compact-status-card">
            <QCardSection class="q-pa-sm">
              <div class="row items-center no-wrap">
                <QIcon name="account_circle" size="20px" color="orange" class="q-mr-xs" />
                <div class="text-caption text-grey-8">Sessions</div>
                <div class="text-body2 text-orange q-ml-xs">{{ sessionStats.totalSessions }}</div>
                <div class="text-caption text-grey-6 q-ml-xs">({{ sessionStats.activeSessions }} active)</div>
              </div>
            </QCardSection>
          </QCard>
        </div>
      </div>

      <!-- Main Content Tabs -->
      <QTabs
        v-model="activeTab"
        dense
        class="text-grey-7"
        active-color="primary"
        indicator-color="primary"
        align="left"
      >
        <QTab name="users" label="Private AI Users" icon="people" />
        <QTab name="agents" label="Agents & Patients" icon="smart_toy" />
        <QTab name="knowledge-bases" label="Knowledge Bases" icon="storage" />
        <QTab name="models" label="AI Models" icon="psychology" />
        <QTab name="sessions" label="Active Sessions" icon="account_circle" />
        <QTab name="health" label="System Health" icon="monitor_heart" />
      </QTabs>

      <QSeparator />

      <QTabPanels v-model="activeTab" animated>
        <!-- Private AI Users Tab -->
        <QTabPanel name="users">
          <div class="q-pa-md">
            <div class="q-mb-md">
              <h4 class="q-ma-none">Private AI Users</h4>
              <p class="text-grey-6 q-ma-none">Manage user approvals and workflow status</p>
            </div>

            <!-- Users Table -->
            <QTable
              :rows="users"
              :columns="userColumns"
              row-key="userId"
              :loading="isLoadingUsers"
              :pagination="userPagination"
              :rows-per-page-options="[0, 5, 10, 25]"
              binary-state-sort
              @request="onUserRequest"
              @row-click="onUserRowClick"
              class="admin-table"
            >
              <template v-slot:body-cell-workflowStage="props">
                <QTd :props="props">
                  <QBadge
                    :color="getWorkflowStageColor(props.value)"
                    :label="props.value"
                    class="workflow-badge"
                  />
                </QTd>
              </template>

              <template v-slot:body-cell-assignedAgentName="props">
                <QTd :props="props">
                  <span v-if="props.value" class="text-primary">{{ props.value }}</span>
                  <span v-else class="text-grey-5">No agent assigned</span>
                </QTd>
              </template>

              <template v-slot:body-cell-bucketStatus="props">
                <QTd :props="props">
                  <div v-if="props.value && props.value.hasFolder" class="bucket-info">
                    <QBadge
                      color="positive"
                      :label="`${props.value.fileCount || 0} files`"
                      class="q-mr-xs"
                    />
                    <span class="text-caption text-grey-6">
                      {{ formatFileSize(props.value.totalSize || 0) }}
                    </span>
                  </div>
                  <QBadge
                    v-else
                    color="grey"
                    label="No folder"
                    class="bucket-empty"
                  />
                </QTd>
              </template>

              <template v-slot:body-cell-createdAt="props">
                <QTd :props="props">
                  <span class="text-grey-6">{{ formatRelativeTime(props.value) }}</span>
                </QTd>
              </template>

              <template v-slot:body-cell-actions="props">
                <QTd :props="props">
                  <div class="action-buttons-row">
                    <!-- Approve User Button -->
                    <QBtn
                      v-if="props.row.workflowStage === 'awaiting_approval'"
                      size="xs"
                      color="positive"
                      label="Approve"
                      @click.stop="approveUserFromList(props.row)"
                      class="q-mr-xs"
                    />
                    
                    <!-- Reject User Button -->
                    <QBtn
                      v-if="props.row.workflowStage === 'awaiting_approval'"
                      size="xs"
                      color="negative"
                      label="Reject"
                      @click.stop="rejectUserFromList(props.row)"
                      class="q-mr-xs"
                    />
                    
                    <!-- Create Agent Button -->
                    <QBtn
                      v-if="props.row.workflowStage === 'approved' && !props.row.assignedAgentId"
                      size="xs"
                      color="primary"
                      label="Create Agent"
                      @click.stop="createAgentFromList(props.row)"
                      class="q-mr-xs"
                    />
                    
                    <!-- View Agent Button -->
                    <QBtn
                      v-if="props.row.workflowStage === 'agent_assigned'"
                      size="xs"
                      color="info"
                      label="View Agent"
                      @click.stop="viewAgentFromList(props.row)"
                      class="q-mr-xs"
                    />
                    
                  </div>
                </QTd>
              </template>
            </QTable>
          </div>
        </QTabPanel>

        <!-- Agents & Patients Tab -->
        <QTabPanel name="agents">
          <div class="q-pa-md">
            <div class="q-mb-md">
              <h4 class="q-ma-none">Agents & Patients</h4>
              <p class="text-grey-6 q-ma-none">Monitor agent deployment and patient assignments</p>
            </div>

            <!-- Agents Table -->
            <QTable
              :rows="agents"
              :columns="agentColumns"
              row-key="id"
              :loading="isLoadingAgents"
              :pagination="agentPagination"
              @request="onAgentRequest"
              class="admin-table"
            >
              <template v-slot:body-cell-status="props">
                <QTd :props="props">
                  <QBadge
                    :color="getAgentStatusColor(props.value)"
                    :label="props.value"
                    class="status-badge"
                  />
                </QTd>
              </template>

              <template v-slot:body-cell-chatCount="props">
                <QTd :props="props">
                  <div class="tooltip-wrapper">
                    <QBtn
                      flat
                      round
                      dense
                      size="sm"
                      color="primary"
                      class="group-count-btn"
                      @click="openGroupModalForAgent(props.row)"
                    >
                      <div class="group-count">{{ props.value || 0 }}</div>
                    </QBtn>
                    <div class="tooltip-text">View saved chats for this agent</div>
                  </div>
                </QTd>
              </template>

              <template v-slot:body-cell-knowledgeBases="props">
                <QTd :props="props">
                  <span v-if="props.value && props.value.length > 0" class="text-positive">
                    {{ props.value.length }} KB{{ props.value.length > 1 ? 's' : '' }}
                  </span>
                  <span v-else class="text-grey-5">No KBs</span>
                </QTd>
              </template>

              <template v-slot:body-cell-created_at="props">
                <QTd :props="props">
                  <span class="text-grey-6">{{ formatRelativeTime(props.value) }}</span>
                </QTd>
              </template>

            </QTable>
          </div>
        </QTabPanel>

        <!-- Knowledge Bases Tab -->
        <QTabPanel name="knowledge-bases">
          <div class="q-pa-md">
            <div class="q-mb-md">
              <h4 class="q-ma-none">Knowledge Bases</h4>
              <p class="text-grey-6 q-ma-none">Manage knowledge bases and their protection settings</p>
            </div>

            <!-- Knowledge Bases Table -->
            <QTable
              :rows="knowledgeBases"
              :columns="kbColumns"
              row-key="id"
              :loading="isLoadingKBs"
              :pagination="kbPagination"
              @request="onKBRequest"
              class="admin-table"
            >
              <template v-slot:body-cell-isProtected="props">
                <QTd :props="props">
                  <QBadge
                    :color="props.value ? 'positive' : 'grey'"
                    :label="props.value ? 'Protected' : 'Public'"
                    class="protection-badge"
                  />
                </QTd>
              </template>

              <template v-slot:body-cell-createdAt="props">
                <QTd :props="props">
                  <span class="text-grey-6">{{ formatRelativeTime(props.value) }}</span>
                </QTd>
              </template>

            </QTable>
          </div>
        </QTabPanel>

        <!-- AI Models Tab -->
        <QTabPanel name="models">
          <div class="q-pa-md">
            <div class="q-mb-md">
              <h4 class="q-ma-none">AI Models</h4>
              <p class="text-grey-6 q-ma-none">Configure which AI model to use for new agents</p>
            </div>

            <!-- Current Model Selection -->
            <QCard class="q-mb-md">
              <QCardSection>
                <h5 class="q-ma-none q-mb-md">Current Model for New Agents</h5>
                <div v-if="currentModel" class="current-model-display">
                  <QBadge
                    color="primary"
                    :label="currentModel.name"
                    class="q-mr-sm"
                  />
                  <span class="text-grey-6">{{ currentModel.description || 'No description available' }}</span>
                </div>
                <div v-else class="text-grey-6">
                  No model selected
                </div>
              </QCardSection>
            </QCard>

            <!-- Available Models Table -->
            <QTable
              :rows="availableModels"
              :columns="modelColumns"
              row-key="uuid"
              :loading="isLoadingModels"
              class="admin-table"
            >
              <template v-slot:body-cell-selection="props">
                <QTd :props="props">
                  <QBtn
                    :color="isSelectedModel(props.row) ? 'primary' : 'grey'"
                    :icon="isSelectedModel(props.row) ? 'radio_button_checked' : 'radio_button_unchecked'"
                    :label="isSelectedModel(props.row) ? 'Selected' : 'Select'"
                    size="sm"
                    @click="selectModel(props.row)"
                    :disable="isSelectedModel(props.row)"
                  />
                </QTd>
              </template>

              <template v-slot:body-cell-status="props">
                <QTd :props="props">
                  <QBadge
                    :color="props.row.status === 'available' ? 'positive' : 'negative'"
                    :label="props.row.status || 'unknown'"
                    class="status-badge"
                  />
                </QTd>
              </template>

              <template v-slot:body-cell-description="props">
                <QTd :props="props">
                  <span class="text-grey-6">{{ props.value || 'No description available' }}</span>
                </QTd>
              </template>
            </QTable>
          </div>
        </QTabPanel>

        <!-- Active Sessions Tab -->
        <QTabPanel name="sessions">
          <div class="q-pa-md">
            <div class="q-mb-md">
              <h4 class="q-ma-none">Active Sessions</h4>
              <p class="text-grey-6 q-ma-none">Monitor user sessions and activity</p>
            </div>

            <!-- Sessions Table -->
            <QTable
              :rows="sessions"
              :columns="sessionColumns"
              row-key="sessionId"
              :loading="isLoadingSessions"
              :pagination="sessionPagination"
              @request="onSessionRequest"
              class="admin-table"
            >
              <template v-slot:body-cell-userType="props">
                <QTd :props="props">
                  <QBtn
                    :color="getUserTypeColor(props.value)"
                    size="sm"
                    dense
                    :label="props.value"
                    class="q-px-sm"
                  />
                </QTd>
              </template>

              <template v-slot:body-cell-createdAt="props">
                <QTd :props="props">
                  <span class="text-grey-6">{{ formatRelativeTime(props.value) }}</span>
                </QTd>
              </template>

              <template v-slot:body-cell-lastActivity="props">
                <QTd :props="props">
                  <span class="text-grey-6">{{ formatRelativeTime(props.value) }}</span>
                </QTd>
              </template>

              <template v-slot:body-cell-expiresAt="props">
                <QTd :props="props">
                  <span class="text-grey-6">{{ formatRelativeTime(props.value) }}</span>
                </QTd>
              </template>

              <template v-slot:body-cell-actions="props">
                <QTd :props="props">
                  <QBtn
                    color="negative"
                    size="sm"
                    icon="logout"
                    @click="destroySession(props.row.sessionId)"
                    class="q-mr-xs"
                  />
                </QTd>
              </template>
            </QTable>
          </div>
        </QTabPanel>

        <!-- System Health Tab -->
        <QTabPanel name="health">
          <div class="q-pa-md">
            <div class="q-mb-md">
              <h4 class="q-ma-none">System Health</h4>
              <p class="text-grey-6 q-ma-none">Monitor system status and performance</p>
            </div>

            <!-- Health Status Cards -->
            <div class="row q-gutter-md q-mb-lg">
              <div class="col-12 col-md-6">
                <QCard>
                  <QCardSection>
                    <div class="text-h6 q-mb-sm">Database Status</div>
                    <QBadge
                      :color="healthStatus.database ? 'positive' : 'negative'"
                      :label="healthStatus.database ? 'Connected' : 'Disconnected'"
                    />
                  </QCardSection>
                </QCard>
              </div>
              <div class="col-12 col-md-6">
                <QCard>
                  <QCardSection>
                    <div class="text-h6 q-mb-sm">DigitalOcean API</div>
                    <QBadge
                      :color="healthStatus.digitalOcean ? 'positive' : 'negative'"
                      :label="healthStatus.digitalOcean ? 'Connected' : 'Disconnected'"
                    />
                  </QCardSection>
                </QCard>
              </div>
            </div>

            <!-- Health Details -->
            <QCard>
              <QCardSection>
                <div class="text-h6 q-mb-sm">System Information</div>
                <div class="q-gutter-sm">
                  <div><strong>Uptime:</strong> {{ systemInfo.uptime }}</div>
                  <div><strong>Memory Usage:</strong> {{ systemInfo.memoryUsage }}</div>
                  <div><strong>Cache Status:</strong> {{ systemInfo.cacheStatus }}</div>
                </div>
              </QCardSection>
            </QCard>
          </div>
        </QTabPanel>
      </QTabPanels>
    </div>
    </div>

    <!-- Group Management Modal for Agent Chats -->
    <!-- TEMPORARILY COMMENTED OUT TO DEBUG -->
    <!--
    <GroupManagementModal
      v-model="showGroupModal"
      :currentUser="selectedAgentForChats?.owner || 'Public User'"
      :onGroupDeleted="handleGroupDeleted"
      @chatLoaded="handleChatLoaded"
    />
    -->
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useQuasar } from 'quasar'
import {
  QBtn,
  QBanner,
  QInput,
  QSpinner,
  QForm,
  QCard,
  QCardSection,
  QIcon,
  QTab,
  QTabs,
  QSeparator,
  QBadge,
  QTd,
  QTable,
  QTabPanel,
  QTabPanels
} from 'quasar'
import { useGroupChat } from '../composables/useGroupChat'
import GroupManagementModal from './GroupManagementModal.vue'
import { throttledFetchJson } from '../utils/ThrottledFetch.js'

// Props
const props = defineProps<{
  isRegistrationRoute?: boolean
}>()

// Quasar
const $q = useQuasar()

// State - Real data from caches
const isAdmin = ref(false)
const authCheckComplete = ref(false)
const isRegistering = ref(false)
const isRegisteringPasskey = ref(false)
const isSigningIn = ref(false)
const showPasskeyRegistration = ref(false)
const errorMessage = ref('')
const activeTab = ref('users')

// Check if we're on the registration page or sign-in page
const isRegistrationPage = ref(window.location.pathname === '/admin2/register')
const isSignInPage = ref(window.location.pathname === '/admin2/signin')

// Make route detection reactive
const updateRouteDetection = () => {
  isRegistrationPage.value = window.location.pathname === '/admin2/register'
  isSignInPage.value = window.location.pathname === '/admin2/signin'
}

// Single computed property for current state
const currentState = computed(() => {
  if (!authCheckComplete.value) {
    return 'loading'
  }
  if (isRegistrationPage.value) {
    return 'registration'
  }
  if (isSignInPage.value) {
    return 'signin'
  }
  if (isAdmin.value) {
    return 'admin'
  }
  return 'access-required'
})

// Computed properties for template rendering
const shouldShowRegistration = computed(() => currentState.value === 'registration')
const shouldShowSignIn = computed(() => currentState.value === 'signin')
const shouldShowAccessRequired = computed(() => currentState.value === 'access-required')
const shouldShowAdminInterface = computed(() => currentState.value === 'admin')
const shouldShowLoading = computed(() => currentState.value === 'loading')

// Admin registration form data
const adminForm = ref({
  username: '',
  adminSecret: ''
})

// Polling state
const pollingInterval = ref(null)
const isPollingConnected = ref(false)
const currentSessionId = ref(null)
const lastPollTimestamp = ref(null)
const pollingErrorCount = ref(0)
const maxPollingErrors = 3
const consecutiveServerErrors = ref(0)
const maxConsecutiveServerErrors = 2



// Stats - Real data from caches
const userStats = ref({
  totalUsers: 0,
  awaitingApproval: 0
})

const agentStats = ref({
  totalAgents: 0,
  deployedAgents: 0
})

const kbStats = ref({
  totalKBs: 0,
  protectedKBs: 0
})

const sessionStats = ref({
  totalSessions: 0,
  activeSessions: 0
})

// Loading states
const isLoadingUsers = ref(false)
const isLoadingAgents = ref(false)
const isLoadingKBs = ref(false)
const isLoadingSessions = ref(false)

// Group modal state
const showGroupModal = ref(false)
const selectedAgentForChats = ref(null)
const isLoadingHealth = ref(false)

// Models tab data
const availableModels = ref([])
const currentModel = ref(null)
const isLoadingModels = ref(false)

// Tables - Real data from caches
const users = ref([])
const agents = ref([])
const knowledgeBases = ref([])
const sessions = ref([])

// Pagination
const userPagination = ref({
  sortBy: 'createdAt',
  descending: true,
  page: 1,
  rowsPerPage: 0, // 0 means "All" - show all records
  rowsNumber: 0,
  rowsPerPageOptions: [0, 5, 10, 25] // 0 = All, 5, 10, 25
})

const agentPagination = ref({
  sortBy: 'createdAt',
  descending: true,
  page: 1,
  rowsPerPage: 10,
  rowsNumber: 0
})

const kbPagination = ref({
  sortBy: 'createdAt',
  descending: true,
  page: 1,
  rowsPerPage: 10,
  rowsNumber: 0
})

const sessionPagination = ref({
  sortBy: 'lastActivity',
  descending: true,
  page: 1,
  rowsPerPage: 10,
  rowsNumber: 0
})

// Health status - Static
const healthStatus = ref({
  database: true,
  digitalOcean: true
})

const systemInfo = ref({
  uptime: '0 days, 0 hours',
  memoryUsage: '0 MB',
  cacheStatus: 'Healthy'
})

// Table columns - Updated to match real API data
const userColumns = [
  { name: 'userId', label: 'User ID', field: 'userId', align: 'left', sortable: true },
  { name: 'displayName', label: 'Display Name', field: 'displayName', align: 'left', sortable: true },
  { name: 'email', label: 'Email', field: 'email', align: 'left', sortable: true },
  { name: 'workflowStage', label: 'Workflow Stage', field: 'workflowStage', align: 'center', sortable: true },
  { name: 'assignedAgentName', label: 'Assigned Agent', field: 'assignedAgentName', align: 'left', sortable: true },
  { name: 'bucketStatus', label: 'Bucket', field: 'bucketStatus', align: 'center', sortable: false },
  { name: 'createdAt', label: 'Created', field: 'createdAt', align: 'center', sortable: true },
  { name: 'actions', label: 'Actions', field: 'actions', align: 'center', sortable: false }
]

const agentColumns = [
  { name: 'name', label: 'Agent Name', field: 'name', align: 'left', sortable: true },
  { name: 'status', label: 'Status', field: 'status', align: 'center', sortable: true },
  { name: 'model', label: 'Model', field: 'model', align: 'left', sortable: true },
  { name: 'chatCount', label: 'Chats', field: 'chatCount', align: 'center', sortable: false },
  { name: 'knowledgeBases', label: 'Knowledge Bases', field: 'knowledgeBases', align: 'center', sortable: false },
  { name: 'created_at', label: 'Created', field: 'created_at', align: 'center', sortable: true }
]

const kbColumns = [
  { name: 'name', label: 'KB Name', field: 'name', align: 'left', sortable: true },
  { name: 'isProtected', label: 'Protection', field: 'isProtected', align: 'center', sortable: true },
  { name: 'owner', label: 'Owner', field: 'owner', align: 'left', sortable: true },
  { name: 'createdAt', label: 'Created', field: 'createdAt', align: 'center', sortable: true }
]

const sessionColumns = [
  { name: 'sessionId', label: 'Session ID', field: 'sessionId', align: 'left', sortable: true },
  { name: 'userType', label: 'Type', field: 'userType', align: 'center', sortable: true },
  { name: 'userId', label: 'User ID', field: 'userId', align: 'left', sortable: true },
  { name: 'username', label: 'Username', field: 'username', align: 'left', sortable: true },
  { name: 'createdAt', label: 'Created', field: 'createdAt', align: 'center', sortable: true },
  { name: 'lastActivity', label: 'Last Activity', field: 'lastActivity', align: 'center', sortable: true },
  { name: 'expiresAt', label: 'Expires', field: 'expiresAt', align: 'center', sortable: true },
  { name: 'ipAddress', label: 'IP Address', field: 'ipAddress', align: 'center', sortable: true },
  { name: 'actions', label: 'Actions', field: 'actions', align: 'center', sortable: false }
]

const modelColumns = [
  { name: 'name', label: 'Model Name', field: 'name', align: 'left', sortable: true },
  { name: 'uuid', label: 'UUID', field: 'uuid', align: 'left', sortable: false },
  { name: 'status', label: 'Status', field: 'status', align: 'center', sortable: true },
  { name: 'description', label: 'Description', field: 'description', align: 'left', sortable: false },
  { name: 'selection', label: 'Selection', field: 'selection', align: 'center', sortable: false }
]

// Methods - Static implementations (no real logic)
const resetWelcomeModal = () => {
  $q.notify({
    type: 'positive',
    message: 'Welcome modal reset (AdminPanel2 - Static)',
    position: 'top'
  })
}

const goToOriginalAdmin = () => {
  window.location.href = '/admin'
}

// Removed old admin route references - now using admin2

const registerAdmin = async () => {
  try {
    isRegistering.value = true
    errorMessage.value = ''
    
    const response = await fetch('/api/admin-management/register', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      credentials: 'include',
      body: JSON.stringify({
        username: adminForm.value.username,
        adminSecret: adminForm.value.adminSecret
      })
    })
    
    const result = await response.json()
    
    if (response.ok) {
      if (result.canProceedToPasskey) {
        // Registration successful, show passkey registration
        showPasskeyRegistration.value = true
        $q.notify({
          type: 'positive',
          message: result.message,
          position: 'top'
        })
      } else {
        // Registration completed
        $q.notify({
          type: 'positive',
          message: result.message,
          position: 'top'
        })
      }
    } else {
      errorMessage.value = result.error || 'Registration failed'
      if (result.hint) {
        errorMessage.value += `\n\nHint: ${result.hint}`
      }
      $q.notify({
        type: 'negative',
        message: result.error || 'Registration failed',
        position: 'top'
      })
    }
  } catch (error) {
    console.error('❌ [AdminPanel2] Admin registration failed:', error)
    errorMessage.value = 'Registration failed. Please try again.'
    $q.notify({
      type: 'negative',
      message: 'Registration failed. Please try again.',
      position: 'top'
    })
  } finally {
    isRegistering.value = false
  }
}

const registerPasskey = async () => {
  isRegisteringPasskey.value = true
  
  try {
    // Step 1: Generate registration options
    const optionsResponse = await fetch('/api/passkey/register', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        userId: 'admin',
        displayName: 'admin'
      })
    })
    
    if (!optionsResponse.ok) {
      throw new Error('Failed to generate registration options')
    }
    
    const options = await optionsResponse.json()
    
    // Step 2: Create credentials using SimpleWebAuthn
    const { startRegistration } = await import('@simplewebauthn/browser')
    const credential = await startRegistration({ optionsJSON: options })
    
    // Step 3: Verify registration
    const verifyResponse = await fetch('/api/passkey/register-verify', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        userId: 'admin',
        response: credential
      })
    })
    
    const result = await verifyResponse.json()
    
    if (result.success) {
  $q.notify({
        type: 'positive',
        message: 'Admin passkey registered successfully! Redirecting to admin panel...',
    position: 'top'
  })
      
      // Redirect to admin panel after successful registration
      setTimeout(() => {
        window.location.href = '/admin2'
      }, 2000)
    } else {
  $q.notify({
        type: 'negative',
        message: result.error || 'Passkey registration failed',
    position: 'top'
  })
    }
  } catch (error) {
    console.error('❌ [AdminPanel2] Passkey registration failed:', error)
    $q.notify({
      type: 'negative',
      message: 'Passkey registration failed. Please try again.',
      position: 'top'
    })
  } finally {
    isRegisteringPasskey.value = false
  }
}

const skipPasskeyRegistration = () => {
  $q.notify({
    type: 'info',
    message: 'Passkey registration skipped (AdminPanel2 - Static)',
    position: 'top'
  })
}

const adminSignOut = async () => {
  try {
    // Call the admin-specific logout endpoint
    const response = await fetch('/api/passkey/admin-logout', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      credentials: 'include'
    })
    
    const result = await response.json()
    
    if (result.success) {
      $q.notify({
        type: 'positive',
        message: 'Successfully signed out of admin panel!',
        position: 'top'
      })
      
      // Clear local admin state
      isAdmin.value = false
      
      // Redirect to main app after a short delay (admin can still access as Public User)
      setTimeout(() => {
        window.location.href = '/'
      }, 1500)
    } else {
      $q.notify({
        type: 'negative',
        message: result.error || 'Sign out failed',
        position: 'top'
      })
    }
  } catch (error) {
    console.error('❌ [AdminPanel2] Admin sign out failed:', error)
    $q.notify({
      type: 'negative',
      message: 'Sign out failed. Please try again.',
      position: 'top'
    })
  }
}

// Refresh methods removed - will handle stale data properly

// Table request handlers
const onUserRequest = async (props: any) => {
  const { page, rowsPerPage, sortBy, descending } = props.pagination
  
  // Update pagination
  userPagination.value.page = page
  userPagination.value.rowsPerPage = rowsPerPage
  userPagination.value.sortBy = sortBy
  userPagination.value.descending = descending
  
  // Reload data with new sorting and pagination parameters
  await loadUsers()
}

const onUserRowClick = (evt: any, row: any) => {
  console.log(`👤 [AdminPanel2] Row clicked for user: ${row.userId}`)
  // Navigate to user details page
  window.location.href = `/admin2/user/${row.userId}`
}

const onAgentRequest = () => {
  // Static implementation
}

const onKBRequest = () => {
  // Static implementation
}

const onSessionRequest = async () => {
  await loadSessions()
}

const loadSessions = async () => {
  try {
    isLoadingSessions.value = true
    
    const response = await fetch('/api/admin/sessions')
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`)
    }
    
    const data = await response.json()
    sessions.value = data.sessions || []
    
    // Update session stats
    sessionStats.value.totalSessions = data.total || 0
    sessionStats.value.activeSessions = data.byType?.private + data.byType?.admin + data.byType?.deepLink || 0
    
    console.log(`[ADMIN] Loaded ${data.total} sessions`)
    
  } catch (error) {
    console.error('Failed to load sessions:', error)
    
    // Fallback to mock data if API fails
    const mockSessions = [
      {
        sessionId: 'sess_001',
        userType: 'private',
        userId: 'ag30',
        username: 'ag30',
        createdAt: new Date(Date.now() - 5 * 60 * 1000).toISOString(),
        lastActivity: new Date(Date.now() - 2 * 60 * 1000).toISOString(),
        expiresAt: new Date(Date.now() + 23 * 60 * 60 * 1000).toISOString(),
        ipAddress: '192.168.1.100',
        userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)'
      }
    ]
    
    sessions.value = mockSessions
    sessionStats.value.totalSessions = mockSessions.length
    sessionStats.value.activeSessions = mockSessions.length
    
    $q.notify({
      type: 'warning',
      message: 'Using mock session data - API unavailable',
      position: 'top'
    })
  } finally {
    isLoadingSessions.value = false
  }
}

// View methods - Static
const viewUserDetails = (userId: string) => {
  console.log(`👤 [AdminPanel2] Navigating to user details: ${userId}`)
  window.location.href = `/admin2/user/${userId}`
}

// Group modal functions
const openGroupModalForAgent = (agent: any) => {
  console.log(`💬 [AdminPanel2] Opening group modal for agent: ${agent.name}`)
  
  // Determine the owner for the modal
  let ownerName = 'Public User'
  if (agent.name?.startsWith('public-')) {
    ownerName = 'Public User'
  } else if (agent.name?.includes('-agent-')) {
    const nameMatch = agent.name.match(/^([a-z0-9]+)-agent-/)
    ownerName = nameMatch ? nameMatch[1] : 'Public User'
  }
  
  selectedAgentForChats.value = {
    ...agent,
    owner: ownerName
  }
  showGroupModal.value = true
}

const handleChatLoaded = (groupChat: any) => {
  console.log(`💬 [AdminPanel2] Chat loaded from group modal: ${groupChat.id}`)
  // Close the modal
  showGroupModal.value = false
  selectedAgentForChats.value = null
}

const handleGroupDeleted = () => {
  console.log(`💬 [AdminPanel2] Group deleted, refreshing agents`)
  // Refresh agents to update chat counts
  loadAgents()
}

// User action methods - same as UserDetailsPage2
const approveUserFromList = async (user: any) => {
  try {
    console.log(`✅ [AdminPanel2] Approving user: ${user.userId}`)
    
    const response = await fetch(`/api/admin-management/users/${user.userId}/approve`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'approve' }),
      credentials: 'include'
    })
    
    if (!response.ok) {
      throw new Error(`Failed to approve user: ${response.status}`)
    }
    
    // Update the user in the local list
    const userIndex = users.value.findIndex(u => u.userId === user.userId)
    if (userIndex !== -1) {
      users.value[userIndex].workflowStage = 'approved'
      users.value[userIndex].approvalStatus = 'approved'
    }
    
    // Update stats
    userStats.value.awaitingApproval = users.value.filter(u => 
      u.workflowStage === 'awaiting_approval' || u.workflowStage === 'no_request_yet'
    ).length
    
    $q.notify({
      type: 'positive',
      message: `User ${user.userId} approved successfully`,
      position: 'top'
    })
  } catch (error) {
    console.error('❌ [AdminPanel2] Failed to approve user:', error)
    $q.notify({
      type: 'negative',
      message: 'Failed to approve user',
      position: 'top'
    })
  }
}

const rejectUserFromList = async (user: any) => {
  try {
    console.log(`❌ [AdminPanel2] Rejecting user: ${user.userId}`)
    
    const response = await fetch(`/api/admin-management/users/${user.userId}/approve`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'reject' }),
      credentials: 'include'
    })
    
    if (!response.ok) {
      throw new Error(`Failed to reject user: ${response.status}`)
    }
    
    // Update the user in the local list
    const userIndex = users.value.findIndex(u => u.userId === user.userId)
    if (userIndex !== -1) {
      users.value[userIndex].workflowStage = 'rejected'
      users.value[userIndex].approvalStatus = 'rejected'
    }
    
    // Update stats
    userStats.value.awaitingApproval = users.value.filter(u => 
      u.workflowStage === 'awaiting_approval' || u.workflowStage === 'no_request_yet'
    ).length
    
    $q.notify({
      type: 'positive',
      message: `User ${user.userId} rejected successfully`,
      position: 'top'
    })
  } catch (error) {
    console.error('❌ [AdminPanel2] Failed to reject user:', error)
    $q.notify({
      type: 'negative',
      message: 'Failed to reject user',
      position: 'top'
    })
  }
}

const createAgentFromList = async (user: any) => {
  try {
    console.log(`🤖 [AdminPanel2] Creating agent for user: ${user.userId}`)
    
    const response = await fetch(`/api/admin-management/users/${user.userId}/assign-agent`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'create' }),
      credentials: 'include'
    })
    
    if (!response.ok) {
      throw new Error(`Failed to create agent: ${response.status}`)
    }
    
    const agentData = await response.json()
    
    // Update the user in the local list
    const userIndex = users.value.findIndex(u => u.userId === user.userId)
    if (userIndex !== -1) {
      users.value[userIndex].workflowStage = 'approved'
      users.value[userIndex].assignedAgentId = agentData.agentId
      users.value[userIndex].assignedAgentName = agentData.agentName
    }
    
    // Refresh agents list to show the new agent
    await loadAgents()
    
    $q.notify({
      type: 'positive',
      message: `Agent created successfully for ${user.userId}`,
      position: 'top'
    })
  } catch (error) {
    console.error('❌ [AdminPanel2] Failed to create agent:', error)
    $q.notify({
      type: 'negative',
      message: 'Failed to create agent',
      position: 'top'
    })
  }
}

const viewAgentFromList = (user: any) => {
  console.log(`👀 [AdminPanel2] Viewing agent for user: ${user.userId}`)
  // For now, just show a notification - could be enhanced to open agent details
  $q.notify({
    type: 'info',
    message: `Viewing agent details for ${user.assignedAgentName}`,
    position: 'top'
  })
}


const signOutSession = (sessionId: string) => {
  $q.notify({
    type: 'info',
    message: `Signing out session ${sessionId} (AdminPanel2 - Static)`,
    position: 'top'
  })
}

// Utility methods
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
  
  // For older dates, show the actual date
  return date.toLocaleDateString()
}

// Session management functions
const getUserTypeColor = (userType: string) => {
  const colors = {
    'public': 'grey',
    'deep_link': 'blue',
    'private': 'green',
    'admin': 'red'
  }
  return colors[userType] || 'grey'
}

const destroySession = async (sessionId: string) => {
  try {
    const response = await fetch(`/api/admin/sessions/${sessionId}`, {
      method: 'DELETE'
    })
    
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`)
    }
    
    const data = await response.json()
    console.log(`[ADMIN] Destroyed session: ${sessionId}`)
    
    $q.notify({
      type: 'positive',
      message: data.message || `Session destroyed`,
      position: 'top'
    })
    
    // Refresh sessions list
    await loadSessions()
  } catch (error) {
    console.error('Failed to destroy session:', error)
    $q.notify({
      type: 'negative',
      message: 'Failed to destroy session',
      position: 'top'
    })
  }
}


const testPolling = async () => {
  try {
    if (!currentSessionId.value) {
      $q.notify({
        type: 'warning',
        message: 'No active session for polling test',
        position: 'top'
      })
      return
    }
    
    const response = await fetch('/api/admin/poll/test-update', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sessionId: currentSessionId.value,
        updateType: 'test_update',
        updateData: {
          message: `Test polling update at ${new Date().toLocaleTimeString()}`,
          testId: Date.now()
        }
      })
    })
    
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`)
    }
    
    const data = await response.json()
    console.log(`[ADMIN] Test update added: ${data.message}`)
    
    $q.notify({
      type: 'positive',
      message: 'Test update sent - should appear in next poll',
      position: 'top'
    })
  } catch (error) {
    console.error('Failed to test polling:', error)
    $q.notify({
      type: 'negative',
      message: 'Failed to test polling',
      position: 'top'
    })
  }
}

const testPublicUserTracking = async () => {
  try {
    const response = await fetch('/api/admin/test-public-user-tracking', {
      method: 'POST'
    })
    
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`)
    }
    
    const data = await response.json()
    console.log(`[ADMIN] Public User tracked: ${data.message}`)
    
    $q.notify({
      type: 'positive',
      message: `Public User activity tracked - Session: ${data.session.sessionId}`,
      position: 'top'
    })
    
    // Refresh sessions list to show the Public User session
    await loadSessions()
  } catch (error) {
    console.error('Failed to track Public User:', error)
    $q.notify({
      type: 'negative',
      message: 'Failed to track Public User',
      position: 'top'
    })
  }
}

// Utility function for file size formatting
const formatFileSize = (bytes: number) => {
  if (!bytes || bytes === 0) return '0 B'
  
  const sizes = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(1024))
  
  if (i === 0) return `${bytes} ${sizes[i]}`
  
  return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${sizes[i]}`
}

const getAgentStatusColor = (status: string) => {
  const colors = {
    'STATUS_RUNNING': 'positive',
    'STATUS_DEPLOYING': 'warning',
    'STATUS_STOPPED': 'negative',
    'STATUS_FAILED': 'negative',
    'running': 'positive',
    'deploying': 'warning',
    'stopped': 'negative',
    'failed': 'negative',
    'unknown': 'grey'
  }
  return colors[status] || 'grey'
}

// Chat count loading function
const loadChatCountsForAgents = async (agents: any[]) => {
  try {
    const { getAllGroupChats } = useGroupChat()
    const allGroups = await getAllGroupChats()
    
    // Update chat counts for each agent
    for (const agent of agents) {
      // Determine owner from agent name pattern - same logic as AdminPanel
      let ownerName = 'Public User'
      
      if (agent.name?.startsWith('public-')) {
        ownerName = 'Public User'
      } else if (agent.name?.includes('-agent-')) {
        // Extract user ID from agent name pattern: {userId}-agent-{date}
        const nameMatch = agent.name.match(/^([a-z0-9]+)-agent-/)
        ownerName = nameMatch ? nameMatch[1] : 'Public User'
      }
      
      // Filter groups by the owner
      const filteredGroups = allGroups.filter(group => {
        // Check if this chat belongs to the owner (patient)
        const isOwner = group.currentUser === ownerName
        
        // Also check patientOwner field for backward compatibility
        const isPatientOwner = group.patientOwner === ownerName
        
        return isOwner || isPatientOwner
      })
      
      agent.chatCount = filteredGroups.length
      
      // Debug logging for Public Agent
      if (agent.name?.startsWith('public-')) {
        console.log(`🔍 [AdminPanel2] Public Agent "${agent.name}":`, {
          ownerName,
          totalGroups: allGroups.length,
          filteredGroups: filteredGroups.length,
          sampleGroups: allGroups.slice(0, 3).map(g => ({
            currentUser: g.currentUser,
            patientOwner: g.patientOwner,
            id: g.id
          }))
        })
      }
    }
  } catch (error) {
    console.error('❌ [AdminPanel2] Error loading chat counts:', error)
    // Set all chat counts to 0 on error
    agents.forEach(agent => agent.chatCount = 0)
  }
}

// Data fetching functions
const loadUsers = async () => {
  try {
    isLoadingUsers.value = true
    
    // Add cache-busting and sorting/pagination parameters
    const cacheBuster = `?t=${Date.now()}`
    const sortParams = `&sortBy=${userPagination.value.sortBy}&descending=${userPagination.value.descending}`
    
    // Only add pagination params if rowsPerPage is not 0 (0 means "All")
    let paginationParams = ''
    if (userPagination.value.rowsPerPage > 0) {
      paginationParams = `&page=${userPagination.value.page}&rowsPerPage=${userPagination.value.rowsPerPage}`
    }
    
    const data = await throttledFetchJson(`/api/admin-management/users${cacheBuster}${sortParams}${paginationParams}`)
    users.value = data.users || []
    
    // Update total rows number for pagination
    userPagination.value.rowsNumber = data.totalCount || 0
    
    // Update stats
    userStats.value.totalUsers = data.totalCount || 0
    userStats.value.awaitingApproval = users.value.filter(user => 
      user.workflowStage === 'awaiting_approval' || user.workflowStage === 'no_request_yet'
    ).length
    
  } catch (error) {
    console.error('❌ [AdminPanel2] Failed to load users:', error)
    $q.notify({
      type: 'negative',
      message: 'Failed to load users',
      position: 'top'
    })
  } finally {
    isLoadingUsers.value = false
  }
}

const loadAgents = async () => {
  try {
    isLoadingAgents.value = true
    
    // Use admin-management endpoint with caching
    const response = await throttledFetchJson('/api/admin-management/agents')
    agents.value = response.agents || []
    
    // Load chat counts for agents
    await loadChatCountsForAgents(agents.value)
    
    // Update stats
    agentStats.value.totalAgents = agents.value.length
    agentStats.value.deployedAgents = agents.value.filter(agent => 
      agent.status === 'running' || agent.status === 'deployed'
    ).length
    
  } catch (error) {
    console.error('❌ [AdminPanel2] Failed to load agents:', error)
    $q.notify({
      type: 'negative',
      message: 'Failed to load agents',
      position: 'top'
    })
  } finally {
    isLoadingAgents.value = false
  }
}

const loadKnowledgeBases = async () => {
  try {
    isLoadingKBs.value = true
    
    // Use admin-management endpoint with caching
    const response = await throttledFetchJson('/api/admin-management/knowledge-bases')
    knowledgeBases.value = response.knowledgeBases || []
    
    // Update stats
    kbStats.value.totalKBs = knowledgeBases.value.length
    kbStats.value.protectedKBs = knowledgeBases.value.filter(kb => kb.isProtected).length
    
  } catch (error) {
    console.error('❌ [AdminPanel2] Failed to load knowledge bases:', error)
    $q.notify({
      type: 'negative',
      message: 'Failed to load knowledge bases',
      position: 'top'
    })
  } finally {
    isLoadingKBs.value = false
  }
}

const loadAllData = async () => {
  // Load data sequentially - throttling is handled by RequestThrottler
  await loadUsers()
  await loadAgents()
  await loadKnowledgeBases()
  await loadModels()
  await loadSessions()
}

// Models tab methods
const loadModels = async () => {
  try {
    isLoadingModels.value = true
    
    const data = await throttledFetchJson('/api/admin-management/models')
    availableModels.value = data.models || []
    
  } catch (error) {
    console.error('❌ [AdminPanel2] Failed to load models:', error)
    $q.notify({
      type: 'negative',
      message: `Failed to load models: ${error.message}`,
      position: 'top'
    })
  } finally {
    isLoadingModels.value = false
  }
}

const loadCurrentModel = async () => {
  try {
    
    const data = await throttledFetchJson('/api/admin-management/models/current')
    currentModel.value = data.model
  } catch (error) {
    if (error.status === 404) {
        currentModel.value = null
        return
      }
    console.error('❌ [AdminPanel2] Failed to load current model:', error)
    currentModel.value = null
  }
}

const isSelectedModel = (model) => {
  return currentModel.value && currentModel.value.uuid === model.uuid
}

const selectModel = async (model) => {
  try {
    console.log(`🤖 [AdminPanel2] Selecting model: ${model.name} (${model.uuid})`)
    
    const response = await fetch('/api/admin-management/models/current', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model_uuid: model.uuid,
        model_name: model.name,
        model_description: model.description
      }),
      credentials: 'include'
    })
    
    if (!response.ok) {
      throw new Error(`Failed to save model selection: ${response.status}`)
    }
    
    currentModel.value = model
    
    $q.notify({
      type: 'positive',
      message: `Model ${model.name} selected for new agents`,
      position: 'top'
    })
    
    console.log(`✅ [AdminPanel2] Model ${model.name} selected successfully`)
  } catch (error) {
    console.error('❌ [AdminPanel2] Failed to select model:', error)
    $q.notify({
      type: 'negative',
      message: `Failed to select model: ${error.message}`,
      position: 'top'
    })
  }
}

// Polling Connection Management
const startPolling = async () => {
  // Get or create admin session
  if (!currentSessionId.value) {
    await createAdminSession()
  }
  
  if (!currentSessionId.value) {
    console.error('[POLLING] No admin session available for polling')
    return
  }
  
  // Clear any existing polling
  stopPolling()
  
  // Start immediate poll
  await pollForUpdates()
  
  // Set up polling interval (5 seconds for admin)
  pollingInterval.value = setInterval(async () => {
    // Silent polling - no console spam
    await pollForUpdates()
  }, 5000)
  isPollingConnected.value = true
}

const stopPolling = () => {
  if (pollingInterval.value) {
    clearInterval(pollingInterval.value)
    pollingInterval.value = null
  }
  isPollingConnected.value = false
}

const pollForUpdates = async () => {
  if (!currentSessionId.value) {
    return
  }
  
  try {
    const url = new URL('/api/admin/poll/updates', window.location.origin)
    url.searchParams.set('sessionId', currentSessionId.value)
    if (lastPollTimestamp.value) {
      url.searchParams.set('lastPoll', lastPollTimestamp.value)
    }
    
    const response = await fetch(url)
    if (!response.ok) {
      if (response.status === 410) {
        // Session expired - server restarted
        const errorData = await response.json()
        console.log(`[POLLING] Session expired: ${errorData.message}`)
        stopPolling()
        // Clear the stale session ID so a new one will be created
        currentSessionId.value = null
        // Restart polling with a new session
        setTimeout(() => startPolling(), 1000)
        return
      }
      throw new Error(`HTTP ${response.status}`)
    }
    
    const data = await response.json()
    
    // Update last poll timestamp
    lastPollTimestamp.value = new Date().toISOString()
    
    // Reset error count on successful poll
    pollingErrorCount.value = 0
    consecutiveServerErrors.value = 0
    
    // Process updates
    if (data.updates && data.updates.length > 0) {
      data.updates.forEach(update => {
        handlePollingUpdate(update)
      })
    }
    
  } catch (error) {
    console.error('[POLLING] Polling error:', error)
    pollingErrorCount.value++
    consecutiveServerErrors.value++
    
    // Check if we should close the tab due to server being down
    if (consecutiveServerErrors.value >= maxConsecutiveServerErrors) {
      console.error('[POLLING] Server appears to be down - stopping polling')
      stopPolling()
      // Try to close tab, but don't rely on it due to browser restrictions
      try {
        window.close()
      } catch (closeError) {
        console.log('[POLLING] Cannot close tab due to browser restrictions')
      }
      return
    }
    
    if (pollingErrorCount.value >= maxPollingErrors) {
      console.error('[POLLING] Max errors reached, stopping polling')
      stopPolling()
      
      // Attempt to reconnect after 10 seconds
    setTimeout(() => {
        console.log('[POLLING] Attempting to reconnect...')
        startPolling()
      }, 10000)
    }
  }
}

const createAdminSession = async () => {
  try {
    // First, try to find an existing admin session
    const sessionsResponse = await fetch('/api/admin/sessions')
    if (sessionsResponse.ok) {
      const sessionsData = await sessionsResponse.json()
      const existingAdminSession = sessionsData.sessions.find(s => s.userType === 'admin')
      
      if (existingAdminSession) {
        currentSessionId.value = existingAdminSession.sessionId
        console.log(`[POLLING] Using existing admin session: ${currentSessionId.value}`)
        return
      }
    }
    
    // No existing admin session found, create a new one
    const response = await fetch('/api/admin/sessions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        userType: 'admin',
        userData: {
          userId: 'admin',
          username: 'admin',
          userEmail: 'admin@localhost'
        }
      })
    })
    
    if (response.ok) {
      const data = await response.json()
      currentSessionId.value = data.sessionId
      console.log(`[POLLING] Created new admin session: ${currentSessionId.value}`)
    } else {
      console.error('[POLLING] Failed to create admin session:', response.status)
    }
  } catch (error) {
    console.error('[POLLING] Failed to create admin session:', error)
  }
}

const handlePollingUpdate = (update) => {
  try {
    switch (update.type) {
      case 'agent_deployment_completed':
        handleAgentDeploymentCompleted(update.data)
        break
        
      case 'kb_indexing_completed':
        handleKBIndexingCompleted(update.data)
        break
        
      case 'user_registered':
        handleUserRegistered(update.data)
        break
        
      case 'test_update':
        handleTestUpdate(update.data)
        break
        
      default:
        break
    }
  } catch (error) {
    console.error('❌ [POLLING] Error processing update:', error)
  }
}

const handleAgentDeploymentCompleted = (data) => {
  // Update user in local state
  const userIndex = users.value.findIndex(u => u.userId === data.userId)
  if (userIndex !== -1) {
    users.value[userIndex].workflowStage = 'agent_assigned'
    users.value[userIndex].assignedAgentName = data.agentName
    users.value[userIndex].assignedAgentId = data.agentId
  }
  
  // Update stats
  userStats.value.awaitingApproval = users.value.filter(u => 
    u.workflowStage === 'awaiting_approval' || u.workflowStage === 'no_request_yet'
  ).length
  
  // Refresh agents list to show the new agent
  loadAgents()
  
  // Show notification
  $q.notify({
    type: 'positive',
    message: `✅ ${data.message}`,
    timeout: 10000,
    position: 'top'
  })
}

const handleKBIndexingCompleted = (data) => {
  // Refresh knowledge bases list
  loadKnowledgeBases()
  
  // Show notification
  $q.notify({
    type: 'positive',
    message: `📚 ${data.message}`,
    timeout: 10000,
    position: 'top'
  })
}

const handleUserRegistered = (data) => {
  // Refresh users list to show the new user
  loadUsers()
  
  // Update stats
  userStats.value.totalUsers = users.value.length
  userStats.value.awaitingApproval = users.value.filter(u => 
    u.workflowStage === 'awaiting_approval' || u.workflowStage === 'no_request_yet'
  ).length
  
  // Show notification
  $q.notify({
    type: 'positive',
    message: `👤 ${data.message}`,
    timeout: 10000,
    position: 'top'
  })
}

const handleTestUpdate = (data) => {
  console.log('[POLLING] Test update received:', data)
  
  $q.notify({
    type: 'info',
    message: `Test update: ${data.message}`,
    position: 'top',
    timeout: 3000
  })
}

const disconnectAdminEvents = () => {
  stopPolling()
}

// Lifecycle
// Admin authentication check
const checkAdminAuth = async () => {
  try {
    // Development bypass: Skip admin authentication on localhost
    if (window.location.hostname === 'localhost' && window.location.port === '3001') {
      console.log('🔓 [DEV] Admin authentication bypassed for localhost:3001');
      isAdmin.value = true;
      return;
    }

    console.log('🔍 [AdminPanel2] Checking admin authentication...')
    // Try to access an admin-protected endpoint
    const response = await fetch('/api/admin-management/health', {
      credentials: 'include'
    });
    
    console.log('🔍 [AdminPanel2] Auth check response:', {
      status: response.status,
      ok: response.ok
    })
    
    if (response.ok) {
      isAdmin.value = true;
      console.log('✅ [AdminPanel2] Admin authentication verified');
    } else if (response.status === 401) {
      isAdmin.value = false;
      console.log('🔒 [AdminPanel2] Admin authentication required');
    } else {
      isAdmin.value = false;
      console.log('❌ [AdminPanel2] Admin authentication failed:', response.status);
    }
  } catch (error) {
    isAdmin.value = false;
    console.error('❌ [AdminPanel2] Admin authentication check failed:', error);
  }
};

// Navigation functions
const goToAdminSignIn = () => {
  // Redirect to dedicated admin sign-in page
  window.location.href = '/admin2/signin';
  // Update route detection after navigation
  setTimeout(() => {
    updateRouteDetection();
  }, 100);
};

const goToAdminRegister = () => {
  window.location.href = '/admin2/register';
  // Update route detection after navigation
  setTimeout(() => {
    updateRouteDetection();
  }, 100);
};

const goToMainApp = () => {
  window.location.href = '/';
};

const adminSignInWithPasskey = async () => {
  // Prevent double authentication
  if (isSigningIn.value) {
    console.log('🔒 [AdminPanel2] Authentication already in progress, skipping');
    return;
  }
  
  isSigningIn.value = true
  errorMessage.value = ''
  
  try {
    console.log('🔐 [AdminPanel2] Starting admin authentication...');
    
    // Step 1: Generate authentication options for admin user
    const optionsResponse = await fetch('/api/passkey/authenticate', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        userId: 'admin'
      })
    })
    
    if (!optionsResponse.ok) {
      throw new Error('Failed to generate authentication options')
    }
    
    const options = await optionsResponse.json()
    console.log('🔐 [AdminPanel2] Authentication options received, starting WebAuthn...');
    
    // Step 2: Authenticate using SimpleWebAuthn
    const { startAuthentication } = await import('@simplewebauthn/browser')
    const credential = await startAuthentication({ optionsJSON: options })
    console.log('🔐 [AdminPanel2] WebAuthn authentication completed');
    
    // Step 3: Verify authentication using admin-specific endpoint
    const verifyResponse = await fetch('/api/passkey/admin-authenticate-verify', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        userId: 'admin',
        response: credential
      })
    })
    
    const result = await verifyResponse.json()
    
    if (result.success) {
      $q.notify({
        type: 'positive',
        message: 'Successfully signed in as admin!',
        position: 'top'
      })
      
      // Redirect to admin panel after successful sign-in
      setTimeout(() => {
        window.location.href = '/admin2'
      }, 1500)
    } else {
      errorMessage.value = result.error || 'Sign-in failed'
      $q.notify({
        type: 'negative',
        message: result.error || 'Sign-in failed',
        position: 'top'
      })
    }
  } catch (error) {
    console.error('❌ [AdminPanel2] Admin sign-in failed:', error)
    errorMessage.value = 'Sign-in failed. Please try again.'
    $q.notify({
      type: 'negative',
      message: 'Sign-in failed. Please try again.',
      position: 'top'
    })
  } finally {
    isSigningIn.value = false
  }
}


onMounted(async () => {
  // Debug route detection
  console.log('🔍 [AdminPanel2] Route detection:', {
    currentPath: window.location.pathname,
    isRegistrationPage: isRegistrationPage.value,
    isSignInPage: isSignInPage.value,
    isAdmin: isAdmin.value
  })
  
  // Skip authentication check if on registration or sign-in page
  if (isRegistrationPage.value || isSignInPage.value) {
    console.log('📝 [AdminPanel2] On registration/sign-in page - skipping authentication check')
    authCheckComplete.value = true; // Mark as complete for these pages
    return
  }
  
  // Check admin authentication first
  await checkAdminAuth();
  
  // Mark auth check as complete
  authCheckComplete.value = true;
  
  // Debug after auth check
  console.log('🔍 [AdminPanel2] After auth check:', {
    isAdmin: isAdmin.value,
    authCheckComplete: authCheckComplete.value,
    shouldShowAdminInterface: isAdmin.value && authCheckComplete.value,
    shouldShowAccessRequired: !isAdmin.value && !isRegistrationPage.value && !isSignInPage.value && authCheckComplete.value
  })
  
  // Only load data if admin is authenticated
  if (isAdmin.value) {
    try {
      // Force fresh data load on page refresh
      await loadAllData()
      await loadCurrentModel()
      
      console.log(`✅ [AdminPanel2] Loaded ${users.value.length} users, ${agents.value.length} agents, ${knowledgeBases.value.length} knowledge bases`)
    } catch (error) {
      console.error('❌ [AdminPanel2] Error during initialization:', error)
    }
    
    // Start polling for updates after data is loaded
    startPolling()
  }
})

onUnmounted(() => {
  disconnectAdminEvents()
})
</script>

<style scoped>
.admin-panel {
  max-width: 1400px;
  margin: 0 auto;
  padding: 20px;
}

.admin-header {
  margin-bottom: 30px;
  padding-bottom: 20px;
  border-bottom: 2px solid #e0e0e0;
}

.header-content {
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-wrap: wrap;
  gap: 20px;
}

.admin-header h2 {
  margin: 0;
  color: #1976d2;
  font-size: 2.5rem;
  font-weight: 600;
}

.admin-signout-btn {
  flex-shrink: 0;
}

@media (max-width: 768px) {
  .header-content {
    flex-direction: column;
    text-align: center;
  }
  
  .admin-header h2 {
    font-size: 2rem;
  }
}

.compact-status-card {
  transition: transform 0.2s ease, box-shadow 0.2s ease;
  min-width: 200px;
}

.compact-status-card:hover {
  transform: translateY(-1px);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
}

.admin-table {
  background: white;
  border-radius: 8px;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
}

.workflow-badge,
.status-badge,
.protection-badge {
  font-weight: 500;
  text-transform: uppercase;
  font-size: 0.75rem;
  padding: 4px 8px;
  border-radius: 4px;
}

.error-message {
  margin-bottom: 16px;
}

.admin-registration,
.passkey-registration {
  max-width: 600px;
  margin: 0 auto;
}

.admin-content {
  margin-top: 20px;
}

.q-tab-panel {
  padding: 0;
}

.q-table__top {
  padding: 16px;
  background: #f8f9fa;
  border-radius: 8px 8px 0 0;
}

.q-table__bottom {
  padding: 16px;
  background: #f8f9fa;
  border-radius: 0 0 8px 8px;
}

/* Chat count button styles - matching AdminPanel */
.group-count-btn {
  min-width: 24px;
  height: 24px;
  padding: 0;
  flex-shrink: 0;
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
  flex-shrink: 0;
}

/* Tooltip styles - matching AdminPanel */
.tooltip-wrapper {
  position: relative;
  display: inline-block;
  cursor: help;
}

.tooltip-text {
  visibility: hidden;
  width: 250px;
  background-color: #333;
  color: #fff;
  text-align: center;
  border-radius: 6px;
  padding: 8px 12px;
  position: absolute;
  z-index: 1000;
  bottom: 125%;
  left: 50%;
  margin-left: -125px;
  opacity: 0;
  transition: opacity 0.3s;
  font-size: 12px;
  line-height: 1.4;
  white-space: normal;
}

.tooltip-text::after {
  content: "";
  position: absolute;
  top: 100%;
  left: 50%;
  margin-left: -5px;
  border-width: 5px;
  border-style: solid;
  border-color: #333 transparent transparent transparent;
}

.tooltip-wrapper:hover .tooltip-text {
  visibility: visible;
  opacity: 1;
}

/* Action buttons row styling */
.action-buttons-row {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  align-items: center;
}

.action-buttons-row .q-btn {
  min-width: auto;
  padding: 4px 8px;
  font-size: 12px;
}

/* SSE Status Badge */
.sse-status-badge {
  font-size: 12px;
  font-weight: 500;
  padding: 6px 12px;
  border-radius: 16px;
}

/* Make table rows clickable */
.admin-table .q-table__body .q-tr {
  cursor: pointer;
  transition: background-color 0.2s ease;
}

.admin-table .q-table__body .q-tr:hover {
  background-color: #f5f5f5;
}

/* Models tab styles */
.current-model-display {
  display: flex;
  align-items: center;
  gap: 8px;
}

.current-model-display .q-badge {
  font-size: 0.9rem;
  padding: 6px 12px;
}

/* Bucket status styles */
.bucket-info {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
}

.bucket-info .q-badge {
  font-size: 0.75rem;
  padding: 2px 6px;
}

.bucket-empty {
  font-size: 0.75rem;
  padding: 2px 6px;
}
</style>
