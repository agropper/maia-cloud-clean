<template>
  <div class="admin-panel">
    <div class="admin-header">
      <h2>🔧 MAIA2 Administration Panel</h2>
      <p class="admin-subtitle">Manage Private AI Users and Workflow Approvals</p>
      
      <!-- Test Button for Welcome Modal -->
      <div class="q-mt-md">
        <q-btn 
          color="secondary" 
          size="sm" 
          label="Reset Welcome Modal (Test)"
          @click="resetWelcomeModal"
          class="q-mr-sm"
        />
        <q-btn 
          color="info" 
          size="sm" 
          label="Go to Main App"
          @click="goToMainApp"
        />
      </div>
    </div>

          <!-- Admin Registration Section -->
      <div v-if="!isAdmin && isRegistrationRoute" class="admin-registration q-mb-lg">
      
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
                label="Register as Admin"
                icon="admin_panel_settings"
              />
            </div>
          </QForm>
          
          <div class="q-mt-md">
            <p class="text-caption">
              <strong>Note:</strong> After successful registration, you can sign in with your passkey to access the admin panel.
            </p>
            <div class="q-mt-md">
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
          </div>
        </QCardSection>
      </QCard>
      
      <!-- Passkey Registration Section -->
      <div v-if="showPasskeyRegistration" class="passkey-registration q-mt-lg">
        <QCard>
          <QCardSection>
            <h4>🔑 Create Admin Passkey</h4>
            <p>Complete your admin setup by creating a passkey for secure authentication.</p>
            
            <div v-if="passkeyStatus.message" class="q-mb-md">
              <QBanner 
                :class="passkeyStatus.isRegistering ? 'bg-info text-white' : 'bg-positive text-white'"
              >
                {{ passkeyStatus.message }}
              </QBanner>
            </div>
            
            <div class="q-mt-md">
              <QBtn
                color="primary"
                :loading="isRegisteringPasskey"
                label="Create Passkey"
                icon="fingerprint"
                @click="registerPasskey"
                class="q-mr-md"
              />
              <QBtn
                flat
                color="secondary"
                label="Skip for Now"
                @click="skipPasskeyRegistration"
              />
            </div>
          </QCardSection>
        </QCard>
      </div>
    </div>
    

    <!-- Admin Access Denied Section -->
    <div v-if="!isAdmin && !isRegistrationRoute" class="admin-access-denied q-mb-lg">
      <QCard>
        <QCardSection>
          <h4>🚫 Admin Access Denied</h4>
          
          <!-- Error Messages -->
          <div v-if="errorMessage" class="error-message q-mb-md">
            <QBanner class="bg-negative text-white">
              {{ errorMessage }}
            </QBanner>
          </div>
          
          <p>You do not have access to the admin panel. To gain access:</p>
          <ol>
            <li><strong>Option 1:</strong> Register as an administrator (if you know the admin secret)</li>
            <li><strong>Option 2:</strong> Sign in with your existing admin passkey</li>
            <li>Navigate back to <a href="/admin" class="text-primary">Admin Panel</a></li>
          </ol>
          
          <div class="q-mt-md">
            <QBtn
              color="primary"
              label="Sign In with Passkey"
              icon="login"
              @click="goToAdminSignIn"
              class="q-mr-md"
            />
            <QBtn
              color="secondary"
              label="Register as Admin"
              icon="admin_panel_settings"
              @click="goToAdminRegistration"
            />
          </div>
        </QCardSection>
      </QCard>
    </div>

    <!-- Admin Dashboard -->
    <div v-if="isAdmin" class="admin-dashboard">
      
      <!-- Admin Header with Sign Out -->
      <div class="admin-dashboard-header q-mb-lg">
        <div class="row items-center justify-between">
          <div class="text-h5">🔧 Admin Dashboard</div>
          <QBtn
            flat
            color="negative"
            label="SIGN OUT"
            icon="logout"
            @click="signOut"
            class="sign-out-btn"
          />
        </div>
      </div>
      
      <!-- Stats Overview -->
      <div class="stats-overview q-mb-lg">
        <div class="row q-gutter-md">
          <QCard class="stat-card">
            <QCardSection>
              <div class="text-h6">{{ stats.totalUsers }}</div>
              <div class="text-caption">Total Users</div>
            </QCardSection>
          </QCard>
          
          <QCard class="stat-card">
            <QCardSection>
              <div class="text-h6">{{ stats.pendingApprovals }}</div>
              <div class="text-caption">Pending Approvals</div>
            </QCardSection>
          </QCard>
          
          <QCard class="stat-card">
            <QCardSection>
              <div class="text-h6">{{ stats.approvedUsers }}</div>
              <div class="text-caption">Approved Users</div>
            </QCardSection>
          </QCard>
        </div>
      </div>

      <!-- Agents and Patients Overview -->
      <div class="agents-patients q-mb-lg">
        <QCard>
          <QCardSection>
            <div class="row items-center q-mb-md">
              <h4 class="q-ma-none">🤖 Agents and Patients</h4>
              <QSpace />
              <QBtn
                color="primary"
                icon="refresh"
                label="Refresh"
                @click="loadAgentsAndPatients"
                :loading="isLoadingAgentsPatients"
                size="sm"
              />
            </div>

            <!-- Agents and Patients List -->
            <div v-if="agentsAndPatients.length > 0" class="q-mb-md">
              <div v-for="agent in agentsAndPatients" :key="agent.id" class="agent-patient-item q-mb-sm">
                <div class="row items-center justify-between">
                  <div class="col">
                       <div class="text-body2">
                         <strong>{{ agent.name }}</strong> |
                         Patient: <strong>{{ agent.patientName }}</strong> |
                         Current User: {{ agent.owner }} |
                         
                         <!-- Chats Button - Only show for actual agents, not user flow entries -->
                         <div v-if="!agent.isUserFlow" class="tooltip-wrapper" style="display: inline-block; margin: 0 8px;">
                           <q-btn
                             flat
                             round
                             dense
                             size="sm"
                             color="primary"
                             class="group-count-btn"
                             @click="openGroupModalForAgent(agent)"
                           >
                             <div class="group-count">{{ agent.chatCount }}</div>
                           </q-btn>
                           <div class="tooltip-text">View saved chats for this agent</div>
                         </div>
                         
                         Last Activity: {{ agent.lastActivity }}
                       </div>
                  </div>
                  <div class="col-auto">
                    <!-- Flow Step -->
                    <QChip
                      :color="getFlowStepColor(agent.flowStep)"
                      text-color="white"
                      size="sm"
                      :label="`Running: step ${agent.flowStep}`"
                    />
                  </div>
                </div>
              </div>
            </div>

            <!-- No Agents -->
            <div v-if="agentsAndPatients.length === 0" class="text-center q-pa-md">
              <QIcon name="smart_toy" size="32px" color="grey" class="q-mb-md" />
              <div class="text-grey-6">No agents found</div>
            </div>
          </QCardSection>
        </QCard>
      </div>

      <!-- Users List -->
      <QCard>
        <QCardSection>
          <div class="row items-center q-mb-md">
            <h4 class="q-ma-none">👥 Private AI Users</h4>
            <QSpace />
            <QBtn
              color="primary"
              icon="refresh"
              label="Refresh"
              @click="loadUsers"
              :loading="isLoading"
            />
          </div>

          <QTable
            :rows="users"
            :columns="userColumns"
            row-key="userId"
            :loading="isLoading"
            :pagination="{ rowsPerPage: 20 }"
          >
            <template v-slot:body-cell-workflowStage="props">
              <QTd :props="props">
                <QChip
                  :color="getWorkflowStageColor(props.value)"
                  text-color="white"
                  size="sm"
                >
                  {{ formatWorkflowStage(props.value) }}
                </QChip>
              </QTd>
            </template>

            <template v-slot:body-cell-actions="props">
              <QTd :props="props">
                <QBtn
                  flat
                  dense
                  color="primary"
                  icon="visibility"
                  @click="viewUserDetails(props.row)"
                  title="View Details"
                  size="sm"
                />
              </QTd>
            </template>
          </QTable>
        </QCardSection>
      </QCard>
    </div>

    <!-- Agent Creation Summary Modal -->
    <QDialog v-model="showAgentCreationModal" persistent>
      <QCard style="min-width: 500px">
        <QCardSection class="row items-center q-pb-none">
          <div class="text-h6">
            🤖 Agent Created Successfully
          </div>
          <QSpace />
          <QBtn icon="close" flat round dense @click="showAgentCreationModal = false" />
        </QCardSection>

        <QCardSection v-if="createdAgent">
          <div class="agent-summary">
            <h5>Agent Details</h5>
            <div class="row q-gutter-md">
              <div class="col-6">
                <p><strong>Agent Name:</strong> {{ createdAgent.name }}</p>
                <p><strong>Agent UUID:</strong> {{ createdAgent.uuid }}</p>
                <p><strong>Created:</strong> {{ formatDate(createdAgent.created_at) }}</p>
              </div>
              <div class="col-6">
                <p><strong>Model:</strong> {{ createdAgent.model?.name || 'Unknown' }}</p>
                <p><strong>Region:</strong> {{ createdAgent.region || 'Unknown' }}</p>
                <p><strong>Status:</strong> 
                  <QChip
                    :color="createdAgent.deployment?.status === 'STATUS_WAITING_FOR_DEPLOYMENT' ? 'warning' : 'positive'"
                    text-color="white"
                    size="sm"
                  >
                    {{ createdAgent.deployment?.status || 'Unknown' }}
                  </QChip>
                </p>
              </div>
            </div>
            
            <div class="q-mt-md">
              <p><strong>Description:</strong> {{ createdAgent.description }}</p>
            </div>
            
            <div class="q-mt-md">
              <p><strong>API Key:</strong> 
                <span class="text-grey-6">{{ createdAgent.api_keys?.[0]?.api_key || 'Not available' }}</span>
              </p>
            </div>
          </div>
        </QCardSection>

        <QCardActions align="right">
          <QBtn
            color="primary"
            label="Close"
            @click="showAgentCreationModal = false"
          />
        </QCardActions>
      </QCard>
    </QDialog>

    <!-- User Details Modal -->
    <QDialog v-model="showUserModal" persistent>
      <QCard style="min-width: 800px; max-width: 95vw; max-height: 90vh; overflow-y: auto;">
        <QCardSection class="row items-center q-pb-none">
          <div class="text-h6">
            👤 User Details: {{ selectedUser?.displayName }}
          </div>
          <QSpace />
          <QBtn icon="close" flat round dense @click="showUserModal = false" />
        </QCardSection>

        <QCardSection v-if="selectedUser">
          <!-- Debug info for Safari -->
          <div style="background: #f0f0f0; padding: 10px; margin-bottom: 10px; border: 1px solid #ccc;">
            <strong>🔍 [SAFARI DEBUG] Modal Content Rendering:</strong><br>
            showUserModal: {{ showUserModal }}<br>
            selectedUser exists: {{ !!selectedUser }}<br>
            selectedUser.userId: {{ selectedUser?.userId }}<br>
            selectedUser.displayName: {{ selectedUser?.displayName }}<br>
            Browser: {{ navigator.userAgent.includes('Safari') && !navigator.userAgent.includes('Chrome') ? 'Safari' : 'Other' }}
          </div>
          
          <!-- User Info -->
          <div class="user-info q-mb-lg">
            <h5>User Information</h5>
            <div class="row q-gutter-md">
              <div class="col-6">
                <p><strong>User ID:</strong> {{ selectedUser.userId }}</p>
                <p><strong>Display Name:</strong> {{ selectedUser.displayName }}</p>
                <p><strong>Email:</strong> 
                  <span v-if="selectedUser.email">{{ selectedUser.email }}</span>
                  <span v-else class="text-grey-6">No email provided</span>
                </p>
                <p><strong>Created:</strong> {{ formatDate(selectedUser.createdAt) }}</p>
              </div>
              <div class="col-6">
                <p><strong>Passkey Status:</strong> 
                  <span v-if="selectedUser.hasPasskey" class="text-positive">✅ Registered</span>
                  <span v-else class="text-negative">❌ Not Registered</span>
                </p>
                <p v-if="selectedUser.passkeyResetFlag" class="text-warning">
                  <strong>Reset Status:</strong> 🔄 Passkey reset active until {{ formatDate(selectedUser.passkeyResetExpiry) }}
                </p>
                <p><strong>Workflow Stage:</strong> 
                  <QChip
                    :color="getWorkflowStageColor(selectedUser.workflowStage)"
                    text-color="white"
                    size="sm"
                  >
                    {{ formatWorkflowStage(selectedUser.workflowStage) }}
                  </QChip>
                </p>
                <p><strong>Assigned Agent:</strong> 
                  <span v-if="selectedUser.assignedAgentName">
                    {{ selectedUser.assignedAgentName }}
                    <QChip color="info" size="sm" label="Active" />
                  </span>
                  <span v-else class="text-grey-6">None assigned</span>
                </p>
                <p><strong>Bucket Status:</strong> 
                  <span v-if="selectedUser.hasBucket">
                    <QChip color="positive" size="sm" icon="folder">
                      Has Bucket with {{ selectedUser.bucketFileCount }} files
                    </QChip>
                    <span v-if="selectedUser.bucketTotalSize" class="text-caption text-grey-6 q-ml-sm">
                      ({{ formatFileSize(selectedUser.bucketTotalSize) }})
                    </span>
                  </span>
                  <span v-else class="text-grey-6">
                    <QChip color="grey" size="sm" icon="folder_off">No Bucket</QChip>
                  </span>
                </p>
              </div>
            </div>
          </div>

          <!-- Approval Requests -->
          <div v-if="selectedUser.approvalRequests?.length" class="approval-requests q-mb-lg">
            <h5>Approval Requests</h5>
            <div v-for="request in selectedUser.approvalRequests" :key="request._id" class="q-mb-md">
              <QCard flat bordered>
                <QCardSection>
                  <div class="row items-center">
                    <div class="col">
                      <p><strong>Type:</strong> {{ request.requestType }}</p>
                      <p><strong>Status:</strong> {{ request.status }}</p>
                      <p><strong>Requested:</strong> {{ formatDate(request.requestedAt) }}</p>
                      <p v-if="request.message"><strong>Message:</strong> {{ request.message }}</p>
                    </div>
                  </div>
                </QCardSection>
              </QCard>
            </div>
          </div>

          <!-- Admin Actions -->
          <div class="admin-actions q-mb-lg">
            <h5>Administrator Actions</h5>
            <div class="row q-gutter-md">
              <QBtn
                v-if="selectedUser.workflowStage === 'awaiting_approval'"
                color="positive"
                icon="smart_toy"
                label="CREATE AGENT"
                @click="createAgentForUser"
                :loading="isCreatingAgent"
              />
              
              <QBtn
                v-if="selectedUser.workflowStage === 'awaiting_approval'"
                color="negative"
                icon="cancel"
                label="Reject User"
                @click="approveUser('rejected')"
                :loading="isProcessingApproval"
              />
              
              <QBtn
                v-if="selectedUser.workflowStage === 'approved'"
                color="warning"
                icon="pause_circle"
                label="Suspend User"
                @click="approveUser('suspended')"
                :loading="isProcessingApproval"
              />
              
              <QBtn
                v-if="selectedUser.workflowStage === 'approved'"
                color="info"
                icon="smart_toy"
                label="Assign Agent"
                @click="showAssignAgentDialog = true"
                :loading="isLoadingAgents"
              />
              
              <QBtn
                v-if="selectedUser.workflowStage === 'approved'"
                color="primary"
                icon="add_circle"
                label="Create Agent"
                @click="resetUserForAgentCreation"
                :loading="isProcessingApproval"
              />
              
              <QBtn
                v-if="selectedUser.workflowStage === 'inconsistent'"
                color="purple"
                icon="sync_problem"
                label="Fix Data Inconsistency"
                @click="fixDataInconsistency"
                :loading="isProcessingApproval"
              />
              
              <QBtn
                v-if="selectedUser.hasPasskey && !selectedUser.passkeyResetFlag"
                color="warning"
                icon="key_off"
                label="Reset Passkey"
                @click="resetUserPasskey"
                :loading="isResettingPasskey"
              />
              <QBtn
                v-if="selectedUser.passkeyResetFlag"
                color="info"
                icon="schedule"
                :label="`Reset Active (${getTimeRemaining(selectedUser.passkeyResetExpiry)})`"
                disabled
              />
            </div>
          </div>

          <!-- Notes -->
          <div class="admin-notes">
            <h5>Administrator Notes</h5>
            <QInput
              v-model="adminNotes"
              type="textarea"
              outlined
              rows="3"
              placeholder="Add notes about this user or decision..."
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
        </QCardSection>

        <QCardActions align="right">
          <QBtn flat label="Close" @click="showUserModal = false" />
        </QCardActions>
      </QCard>
    </QDialog>

    <!-- Agent Assignment Dialog -->
    <QDialog v-model="showAssignAgentDialog" persistent>
      <QCard style="min-width: 600px">
        <QCardSection>
          <div class="text-h6">Assign AI Agent to {{ selectedUser?.displayName }}</div>
        </QCardSection>

        <QCardSection>
          <div v-if="isLoadingAgents" class="text-center q-pa-md">
            <QIcon name="hourglass_empty" size="32px" class="q-mb-md" />
            <div>Loading available agents...</div>
          </div>

          <div v-else-if="agents.length === 0" class="text-center q-pa-md">
            <QIcon name="warning" size="32px" class="q-mb-md" color="warning" />
            <div>No agents available</div>
          </div>

          <div v-else class="q-gutter-md">
            <div v-for="agent in agents" :key="agent.id" class="agent-option">
              <QCard outlined class="cursor-pointer" @click="selectAgent(agent)">
                <QCardSection>
                  <div class="row items-center q-gutter-md">
                    <div class="col">
                      <div class="text-h6">{{ agent.name }}</div>
                      <div class="text-caption text-grey-6">{{ agent.description || 'No description' }}</div>
                      <div class="text-caption">
                        <strong>Model:</strong> {{ agent.model }} | 
                        <strong>Status:</strong> 
                        <QChip 
                          :color="agent.status === 'running' ? 'positive' : 'warning'" 
                          size="sm" 
                          :label="agent.status"
                        />
                      </div>
                    </div>
                    <div class="col-auto">
                      <QIcon 
                        name="check_circle" 
                        color="positive" 
                        size="24px"
                        v-if="selectedUser?.assignedAgentId === agent.id"
                      />
                    </div>
                  </div>
                </QCardSection>
              </QCard>
            </div>
          </div>
        </QCardSection>

        <QCardSection v-if="selectedAgent">
          <div class="text-subtitle2 q-mb-sm">Selected Agent:</div>
          <div class="row items-center q-gutter-md">
            <div class="col">
              <div class="text-h6">{{ selectedAgent.name }}</div>
              <div class="text-caption text-grey-6">{{ selectedAgent.description || 'No description' }}</div>
            </div>
            <QBtn
              color="negative"
              icon="close"
              size="sm"
              @click="selectedAgent = null"
              label="Clear Selection"
            />
          </div>
        </QCardSection>

        <QCardActions align="right">
          <QBtn flat label="Cancel" @click="showAssignAgentDialog = false" />
          <QBtn
            color="primary"
            icon="save"
            label="Assign Agent"
            @click="assignAgent"
            :loading="isAssigningAgent"
            :disable="!selectedAgent"
          />
        </QCardActions>
      </QCard>
    </QDialog>

    <!-- Group Management Modal for Agent Chats -->
    <GroupManagementModal
      v-model="showGroupModal"
      :currentUser="selectedAgentForChats?.owner || 'Public User'"
      :onGroupDeleted="handleGroupDeleted"
      @chatLoaded="handleChatLoaded"
    />

    <!-- Database Management Buttons -->
    <div class="q-mt-lg q-pa-md text-center">
      <div class="q-gutter-md">
        <QBtn
          :href="cloudantDashboardUrl"
          target="_blank"
          color="primary"
          outline
          icon="cloud"
          label="Cloudant Dashboard"
        />
        <QBtn
          @click="runManualConsistencyCheck"
          color="warning"
          outline
          icon="database"
          label="DATABASE CONSISTENCY CHECK"
          :loading="isRunningConsistencyCheck"
        />
      </div>
    </div>
  </div>
</template>

<script>
import { defineComponent, ref, computed, onMounted, onUnmounted, watch } from 'vue';
import { useQuasar } from 'quasar';
import {
  QCard,
  QCardSection,
  QCardActions,
  QBtn,
  QForm,
  QInput,
  QTable,
  QDialog,
  QSpace,
  QChip,
  QBanner,
  QTd,
  QIcon
} from 'quasar';
import { useGroupChat } from '../composables/useGroupChat';
import GroupManagementModal from './GroupManagementModal.vue';
import { WorkflowUtils } from '../utils/workflow-utils.js';
import { getWorkflowStageConfig } from '../config/workflow-config.js';

export default defineComponent({
  name: 'AdminPanel',
  components: {
    QCard,
    QCardSection,
    QCardActions,
    QBtn,
    QForm,
    QInput,
    QTable,
    QDialog,
    QSpace,
    QChip,
    QBanner,
    QTd,
    QIcon,
    GroupManagementModal
  },
  
  props: {
    isRegistrationRoute: {
      type: Boolean,
      default: false
    }
  },
  
  setup(props) {
    const $q = useQuasar();
    
    // State
    const isAdmin = ref(false);
    const isLoading = ref(false);
    const isRegistering = ref(false);
    const isProcessingApproval = ref(false);
    const isSavingNotes = ref(false);
    const isAssigningAgent = ref(false);
    const isLoadingAgents = ref(false);
    const isResettingPasskey = ref(false);
    const isLoadingAgentsPatients = ref(false);
    const isCreatingAgent = ref(false);
    const pendingDeepLinkUserId = ref(null);
    const isRunningConsistencyCheck = ref(false);
    const users = ref([]);
    const agents = ref([]);
    const selectedAgent = ref(null);
    const showUserModal = ref(false);
    const showAssignAgentDialog = ref(false);
    const showAgentCreationModal = ref(false);
    const selectedUser = ref(null);
    const adminNotes = ref('');
    const errorMessage = ref('');
    const createdAgent = ref(null);
    const deploymentPolling = ref(new Map()); // Track deployment polling for each user
    
    // Agents and Patients
    const agentsAndPatients = ref([]);
    const showGroupModal = ref(false);
    const selectedAgentForChats = ref(null);
    
    
    // Determine current flow step for an agent/user (backward compatible)
    const getFlowStep = (agent, user) => {
      // Use the new workflow system
      const flowStep = WorkflowUtils.getFlowStep(user, agent);
      return flowStep ? flowStep.step : 0;
    };
    
    // Get color for flow step chip (backward compatible)
    const getFlowStepColor = (step) => {
      // Fallback to hardcoded colors for backward compatibility
      switch (step) {
        case 1: return 'orange'; // Create Passkey
        case 2: return 'blue'; // Request Pending
        case 3: return 'purple'; // Agent Creation
        case 4: return 'teal'; // Knowledge Base Creation
        case 5: return 'indigo'; // Agent Deployment
        case 6: return 'green'; // Complete
        case 7: return 'green'; // Complete
        default: return 'grey';
      }
    };
    
    // Admin registration form
    const adminForm = ref({
      username: '',
      adminSecret: ''
    });
    
    // Passkey registration state
    const showPasskeyRegistration = ref(false);
    const isRegisteringPasskey = ref(false);
    const passkeyStatus = ref({
      message: '',
      isRegistering: false
    });
    
    
    // Table columns
    const userColumns = [
      {
        name: 'userId',
        label: 'User ID',
        field: 'userId',
        align: 'left',
        sortable: true
      },
      {
        name: 'displayName',
        label: 'Display Name',
        field: 'displayName',
        align: 'left',
        sortable: true
      },
      {
        name: 'createdAt',
        label: 'Created',
        field: 'createdAt',
        align: 'left',
        sortable: true,
        format: (val) => formatDate(val)
      },
      {
        name: 'workflowStage',
        label: 'Workflow Stage',
        field: 'workflowStage',
        align: 'center',
        sortable: true
      },
      {
        name: 'assignedAgent',
        label: 'Assigned Agent',
        field: 'assignedAgentName',
        align: 'left',
        sortable: true,
        format: (val) => val || 'None'
      },
      {
        name: 'actions',
        label: 'Actions',
        field: 'actions',
        align: 'center',
        sortable: false
      }
    ];
    
    // Computed stats
    const stats = computed(() => {
      const totalUsers = users.value.length;
      const pendingApprovals = users.value.filter(u => u.workflowStage === 'awaiting_approval').length;
      const approvedUsers = users.value.filter(u => u.workflowStage === 'approved').length;
      
      return { totalUsers, pendingApprovals, approvedUsers };
    });
    
    // Methods

    const checkAdminStatus = async () => {
      try {
        // Use the health endpoint for admin status check
        const response = await fetch('/api/admin-management/health');
        if (response.ok) {
          const healthData = await response.json();
          // If we can access the health endpoint, the user is admin
          isAdmin.value = true;
          await loadUsers();
        } else {
          isAdmin.value = false;
        }
      } catch (error) {
        console.error('Error checking admin status:', error);
        isAdmin.value = false;
      }
    };
    
    const registerAdmin = async () => {
      if (!adminForm.value.username || !adminForm.value.adminSecret) {
        $q.notify({
          type: 'negative',
          message: 'Please fill in all fields'
        });
        return;
      }
      
      isRegistering.value = true;
      try {
        const response = await fetch('/api/admin-management/register', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(adminForm.value)
        });
        
        if (response.ok) {
          const result = await response.json();
          
          // Show appropriate message based on response type
          let message = result.message;
          if (result.existingUser) {
            message = 'Admin user verified. You can now register a new passkey (this will replace your existing one).';
          } else if (result.upgraded) {
            message = 'User upgraded to admin successfully. You can now register your passkey.';
          } else if (result.newUser) {
            message = 'New admin user created successfully. You can now register your passkey.';
          }
          
          $q.notify({
            type: 'positive',
            message: message,
            timeout: 5000
          });
          
          // Show passkey registration instead of redirecting
          showPasskeyRegistration.value = true;
          passkeyStatus.value.message = 'Admin verified. Please create your passkey to complete setup.';
          
          adminForm.value = { username: '', adminSecret: '' };
          await checkAdminStatus();
          
        } else {
          const error = await response.json();
          throw new Error(error.error || 'Registration failed');
        }
      } catch (error) {
        $q.notify({
          type: 'negative',
          message: `Registration failed: ${error.message}`
        });
      } finally {
        isRegistering.value = false;
      }
    };
    
    const registerPasskey = async () => {
      isRegisteringPasskey.value = true;
      passkeyStatus.value.isRegistering = true;
      passkeyStatus.value.message = 'Generating passkey registration options...';
      
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
        });
        
        if (!optionsResponse.ok) {
          throw new Error('Failed to generate registration options');
        }
        
        const options = await optionsResponse.json();
        passkeyStatus.value.message = 'Please complete passkey registration...';
        
        // Step 2: Create credentials using SimpleWebAuthn
        const { startRegistration } = await import('@simplewebauthn/browser');
        const credential = await startRegistration({ optionsJSON: options });
        
        passkeyStatus.value.message = 'Verifying passkey registration...';
        
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
        });
        
        const result = await verifyResponse.json();
        
        if (result.success) {
          passkeyStatus.value.message = 'Passkey registered successfully! Redirecting to admin panel...';
          passkeyStatus.value.isRegistering = false;
          
          // Hide passkey registration and refresh admin status
          setTimeout(() => {
            showPasskeyRegistration.value = false;
            checkAdminStatus();
          }, 2000);
          
        } else {
          throw new Error(result.error || 'Passkey registration failed');
        }
        
      } catch (error) {
        console.error('Passkey registration error:', error);
        passkeyStatus.value.message = `Passkey registration failed: ${error.message}`;
        passkeyStatus.value.isRegistering = false;
      } finally {
        isRegisteringPasskey.value = false;
      }
    };
    
    const skipPasskeyRegistration = () => {
      showPasskeyRegistration.value = false;
      passkeyStatus.value.message = '';
      passkeyStatus.value.isRegistering = false;
    };
    
    
    const loadUsers = async () => {
      if (!isAdmin.value) return;
      
      isLoading.value = true;
      try {
        const response = await fetch('/api/admin-management/users');
        if (response.ok) {
          const data = await response.json();
          users.value = data.users;
          
          // Check if there's a pending deep link user ID to open
          if (pendingDeepLinkUserId.value) {
            const deepLinkUser = users.value.find(u => u.userId === pendingDeepLinkUserId.value);
            if (deepLinkUser) {
              console.log(`🔗 [Admin Panel] Opening user details modal for deep link user: ${pendingDeepLinkUserId.value}`);
              await viewUserDetails(deepLinkUser);
              pendingDeepLinkUserId.value = null; // Clear after opening
            } else {
              console.warn(`⚠️ [Admin Panel] Deep link user not found: ${pendingDeepLinkUserId.value}`);
              $q.notify({
                type: 'warning',
                message: `User "${pendingDeepLinkUserId.value}" not found`,
                timeout: 3000
              });
              pendingDeepLinkUserId.value = null; // Clear even if not found
            }
          }
        } else {
          const errorData = await response.json().catch(() => ({}));
          
          // Handle rate limiting specifically
          if (response.status === 429) {
            console.warn('🚨 [Browser] Admin Panel: Cloudant Rate Limit Exceeded (429)', {
              endpoint: '/api/user-state/all',
              error: errorData.error || 'Rate limit exceeded',
              retryAfter: errorData.retryAfter || '30 seconds',
              suggestion: errorData.suggestion || 'Please wait and try again',
              timestamp: new Date().toISOString()
            });
            
            $q.notify({
              type: 'warning',
              message: errorData.error || 'Rate limit exceeded. Please wait and try again.',
              timeout: 8000,
              actions: [
                { label: 'Retry in 30s', handler: () => setTimeout(loadUsers, 30000) }
              ]
            });
          } else {
            throw new Error(errorData.error || 'Failed to load users');
          }
        }
      } catch (error) {
        $q.notify({
          type: 'negative',
          message: `Failed to load users: ${error.message}`
        });
      } finally {
        isLoading.value = false;
      }
    };
    
    const viewUserDetails = async (user) => {
      console.log('🔍 [SAFARI DEBUG] Opening user details modal for:', user);
      console.log('🔍 [SAFARI DEBUG] Browser info:', {
        userAgent: navigator.userAgent,
        isSafari: /Safari/.test(navigator.userAgent) && !/Chrome/.test(navigator.userAgent),
        platform: navigator.platform
      });
      
      selectedUser.value = user;
      adminNotes.value = '';
      showUserModal.value = true;
      
      console.log('🔍 [SAFARI DEBUG] Modal state set:', {
        showUserModal: showUserModal.value,
        selectedUser: selectedUser.value,
        hasSelectedUser: !!selectedUser.value
      });
      
      try {
        console.log('🔍 [SAFARI DEBUG] Fetching user details from API...');
        const response = await fetch(`/api/admin-management/users/${user.userId}`);
        if (response.ok) {
          const userDetails = await response.json();
          console.log('🔍 [SAFARI DEBUG] User details fetched:', userDetails);
          
          // Fetch bucket status for the user
          let bucketStatus = null;
          try {
            console.log('🔍 [SAFARI DEBUG] Fetching bucket status...');
            const bucketResponse = await fetch(`/api/bucket/user-status/${user.userId}`);
            if (bucketResponse.ok) {
              bucketStatus = await bucketResponse.json();
              console.log('🔍 [SAFARI DEBUG] Bucket status fetched:', bucketStatus);
            }
          } catch (bucketError) {
            console.warn('Could not fetch bucket status:', bucketError);
          }
          
          // Ensure userId is preserved from the original user object
          selectedUser.value = {
            ...userDetails,
            userId: user.userId, // Preserve the userId from the table row
            // Add bucket information
            hasBucket: bucketStatus?.hasFolder || false,
            bucketFileCount: bucketStatus?.fileCount || 0,
            bucketTotalSize: bucketStatus?.totalSize || 0
          };
          
          console.log('🔍 [SAFARI DEBUG] Final selectedUser set:', selectedUser.value);
          
          // Load existing admin notes if they exist
          if (userDetails.adminNotes) {
            adminNotes.value = userDetails.adminNotes;
          }
        }
      } catch (error) {
        console.error('Error loading user details:', error);
      }
      
      // Load available agents for assignment
      await loadAgents();
    };
    
    const resetUserForAgentCreation = async () => {
      if (!selectedUser.value) return;
      
      isProcessingApproval.value = true;
      try {
        // Reset the user's workflow stage to awaiting_approval
        await setUserWorkflowStage(selectedUser.value.userId, 'awaiting_approval');
        
        $q.notify({
          type: 'positive',
          message: `User ${selectedUser.value.displayName} reset to "Awaiting Approval" state for agent creation testing`
        });
        
        // Close the user details modal
        showUserModal.value = false;
        
        // Reload users to reflect the change
        await loadUsers();
        
      } catch (error) {
        console.error('Error resetting user for agent creation:', error);
        $q.notify({
          type: 'negative',
          message: 'Failed to reset user state. Please try again.'
        });
      } finally {
        isProcessingApproval.value = false;
      }
    };
    
    const setUserWorkflowStage = async (userId, stage) => {
      try {
        
        // Use the new workflow stage endpoint for direct stage updates
        const response = await fetch(`/api/admin-management/users/${userId}/workflow-stage`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            workflowStage: stage,
            notes: `Workflow stage set to: ${stage}`
          })
        });
        
        
        if (response.ok) {
          const result = await response.json();
        } else {
          const errorText = await response.text();
          console.error(`❌ Failed to set workflow stage for user ${userId}:`, response.status, errorText);
        }
      } catch (error) {
        console.error(`❌ Error setting workflow stage:`, error);
      }
    };
    
    // Frontend deployment polling removed - backend monitoring now handles this
    const startDeploymentPolling = (userId, agentUuid) => {
      // Backend deployment monitoring handles agent deployment tracking
      // No frontend polling needed
    };

    // Server-Sent Events for real-time admin notifications
    let adminEventSource = null;
    
    const connectAdminEvents = () => {
      if (adminEventSource) {
        adminEventSource.close();
      }
      
      adminEventSource = new EventSource('/api/admin/events');
      
      adminEventSource.onopen = () => {
        console.log('🔗 [SSE] Connected to admin notification stream');
      };
      
      adminEventSource.onmessage = (event) => {
        try {
          const notification = JSON.parse(event.data);
          
          if (notification.type === 'connected') {
            console.log('📡 [SSE]', notification.message);
          } else if (notification.type === 'deployment_completed') {
            console.log('🎉 [ADMIN NOTIFICATION]', notification.data.message);
            
            // Show notification to user
            $q.notify({
              type: 'positive',
              message: `✅ ${notification.data.message}`,
              timeout: 10000,
              position: 'top'
            });
            
            // Refresh users list to show updated status
            loadUsers();
          } else if (notification.type === 'heartbeat') {
            // Silent heartbeat - just keep connection alive
          }
        } catch (error) {
          console.error('❌ [SSE] Error parsing notification:', error);
        }
      };
      
      adminEventSource.onerror = (error) => {
        console.error('❌ [SSE] Connection error:', error);
        
        // Attempt to reconnect after 5 seconds
        setTimeout(() => {
          console.log('🔄 [SSE] Attempting to reconnect...');
          connectAdminEvents();
        }, 5000);
      };
    };
    
    // Clean up connection when component unmounts
    onUnmounted(() => {
      if (adminEventSource) {
        adminEventSource.close();
      }
    });
    
    const createAgentForUser = async () => {
      if (!selectedUser.value) return;
      
      isCreatingAgent.value = true;
      try {
        const response = await fetch('/api/agents', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            patientName: selectedUser.value.displayName,
            userId: selectedUser.value.userId,
            model: 'OpenAI GPT-oss-120b' // Will be dynamically resolved to UUID
          })
        });
        
        if (response.ok) {
          const agentData = await response.json();
          createdAgent.value = agentData;
          showAgentCreationModal.value = true;
          
          // Set user to waiting for deployment instead of approving immediately
          await setUserWorkflowStage(selectedUser.value.userId, 'waiting_for_deployment');
          
          // Close the user details modal
          showUserModal.value = false;
          
          // Start polling for deployment status
          startDeploymentPolling(selectedUser.value.userId, agentData.uuid);
          
          // Refresh users list to show updated status
          await loadUsers();
        } else {
          const errorData = await response.json().catch(() => ({}));
          $q.notify({
            type: 'negative',
            message: `Failed to create agent: ${errorData.message || 'Unknown error'}`
          });
        }
      } catch (error) {
        $q.notify({
          type: 'negative',
          message: `Failed to create agent: ${error.message}`
        });
      } finally {
        isCreatingAgent.value = false;
      }
    };
    
    const approveUser = async (action) => {
      if (!selectedUser.value) return;
      
      isProcessingApproval.value = true;
      try {
        const response = await fetch(`/api/admin-management/users/${selectedUser.value.userId}/approve`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            action,
            notes: adminNotes.value
          })
        });
        
        if (response.ok) {
          $q.notify({
            type: 'positive',
            message: `User ${action} successfully`
          });
          
          // Refresh users list
          await loadUsers();
          
          // Update selected user
          if (selectedUser.value) {
            selectedUser.value.workflowStage = action;
          }
          
          showUserModal.value = false;
        } else {
          throw new Error('Failed to process approval');
        }
      } catch (error) {
        $q.notify({
          type: 'negative',
          message: `Approval failed: ${error.message}`
        });
      } finally {
        isProcessingApproval.value = false;
      }
    };
    
    const resetUserPasskey = async () => {
      if (!selectedUser.value) return;
      
      // Show confirmation dialog
      const confirmed = confirm(`Are you sure you want to reset the passkey for user "${selectedUser.value.displayName}"? This will require them to register a new passkey.`);
      
      if (!confirmed) return;
      
      isResettingPasskey.value = true;
      try {
        const response = await fetch(`/api/admin-management/users/${selectedUser.value.userId}/reset-passkey`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            adminSecret: 'admin' // TODO: Get this from admin session or prompt
          })
        });
        
        if (response.ok) {
          $q.notify({
            type: 'positive',
            message: `Passkey reset successfully for user "${selectedUser.value.displayName}". They have 1 hour to register a new passkey.`
          });
          
          // Refresh user details to show updated status
          await viewUserDetails(selectedUser.value);
          
          // Refresh users list
          await loadUsers();
        } else {
          const errorData = await response.json();
          throw new Error(errorData.error || 'Failed to reset passkey');
        }
      } catch (error) {
        $q.notify({
          type: 'negative',
          message: `Failed to reset passkey: ${error.message}`
        });
      } finally {
        isResettingPasskey.value = false;
      }
    };
    
    const fixDataInconsistency = async () => {
      if (!selectedUser.value) return;
      
      // Show confirmation dialog
      const confirmed = confirm(`This will reset the workflow stage for user "${selectedUser.value.displayName}" to "awaiting_approval" to fix the data inconsistency. Continue?`);
      
      if (!confirmed) return;
      
      isProcessingApproval.value = true;
      try {
        // Reset the user's workflow stage to awaiting_approval
        const response = await fetch(`/api/admin-management/users/${selectedUser.value.userId}/workflow-stage`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            workflowStage: 'awaiting_approval',
            approvalStatus: 'pending'
          })
        });
        
        if (response.ok) {
          $q.notify({
            type: 'positive',
            message: `Data inconsistency fixed for user "${selectedUser.value.displayName}". Workflow stage reset to "awaiting_approval".`
          });
          
          // Refresh user details to show updated status
          await viewUserDetails(selectedUser.value);
          
          // Refresh users list
          await loadUsers();
        } else {
          const errorData = await response.json();
          throw new Error(errorData.error || 'Failed to fix data inconsistency');
        }
      } catch (error) {
        $q.notify({
          type: 'negative',
          message: `Failed to fix data inconsistency: ${error.message}`
        });
      } finally {
        isProcessingApproval.value = false;
      }
    };
    
    const saveNotes = async () => {
      if (!selectedUser.value || !adminNotes.value.trim()) return;
      
      isSavingNotes.value = true;
      try {
        const response = await fetch(`/api/admin-management/users/${selectedUser.value.userId}/notes`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            notes: adminNotes.value
          })
        });
        
        if (response.ok) {
          $q.notify({
            type: 'positive',
            message: 'Notes saved successfully'
          });
          
          // Update the selected user's notes in the local state
          if (selectedUser.value) {
            selectedUser.value.adminNotes = adminNotes.value;
          }
        } else {
          throw new Error('Failed to save notes');
        }
      } catch (error) {
        $q.notify({
          type: 'negative',
          message: `Failed to save notes: ${error.message}`
        });
      } finally {
        isSavingNotes.value = false;
      }
    };

    const loadAgents = async () => {
      isLoadingAgents.value = true;
      try {
        const response = await fetch('/api/agents?user=admin');
        if (response.ok) {
          const agentsData = await response.json();
          agents.value = agentsData;
        } else {
          throw new Error('Failed to load agents');
        }
      } catch (error) {
        console.error('Error loading agents:', error);
        $q.notify({
          type: 'negative',
          message: `Failed to load agents: ${error.message}`
        });
      } finally {
        isLoadingAgents.value = false;
      }
    };

    const selectAgent = (agent) => {
      selectedAgent.value = agent;
    };

    const assignAgent = async () => {
      if (!selectedUser.value || !selectedAgent.value) return;
      
      isAssigningAgent.value = true;
      try {
        const response = await fetch(`/api/admin-management/users/${selectedUser.value.userId}/assign-agent`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            agentId: selectedAgent.value.id,
            agentName: selectedAgent.value.name
          })
        });
        
        if (response.ok) {
          const result = await response.json();
          $q.notify({
            type: 'positive',
            message: `Agent ${selectedAgent.value.name} assigned successfully to ${selectedUser.value.displayName}`
          });
          
          // Update the selected user's agent information
          if (selectedUser.value) {
            selectedUser.value.assignedAgentId = selectedAgent.value.id;
            selectedUser.value.assignedAgentName = selectedAgent.value.name;
          }
          
          // Close the dialog and reset
          showAssignAgentDialog.value = false;
          selectedAgent.value = null;
          
          // Refresh users list to show updated information
          await loadUsers();
        } else {
          throw new Error('Failed to assign agent');
        }
      } catch (error) {
        $q.notify({
          type: 'negative',
          message: `Failed to assign agent: ${error.message}`
        });
      } finally {
        isAssigningAgent.value = false;
      }
    };
    
    const getWorkflowStageColor = (stage) => {
      const colors = {
        'no_passkey': 'grey',
        'no_request_yet': 'blue-grey',
        'awaiting_approval': 'warning',
        'waiting_for_deployment': 'info',
        'approved': 'positive',
        'agent_assigned': 'positive',
        'hasAgent': 'positive',
        'rejected': 'negative',
        'suspended': 'orange',
        'inconsistent': 'purple'
      };
      return colors[stage] || 'grey';
    };
    
    const formatWorkflowStage = (stage) => {
      const labels = {
        'no_passkey': 'No Passkey',
        'no_request_yet': 'No Request Yet',
        'awaiting_approval': 'Awaiting Approval',
        'waiting_for_deployment': 'Waiting for Deployment',
        'approved': 'Approved',
        'agent_assigned': 'Agent Assigned',
        'hasAgent': 'Has Agent',
        'rejected': 'Rejected',
        'suspended': 'Suspended',
        'inconsistent': 'Data Inconsistent'
      };
      return labels[stage] || stage;
    };
    
    const formatDate = (dateString) => {
      if (!dateString) return 'N/A';
      return new Date(dateString).toLocaleDateString();
    };
    
    const formatFileSize = (bytes) => {
      if (!bytes || bytes === 0) return '0 B';
      const k = 1024;
      const sizes = ['B', 'KB', 'MB', 'GB'];
      const i = Math.floor(Math.log(bytes) / Math.log(k));
      return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
    };
    
    const getTimeRemaining = (expiryTime) => {
      if (!expiryTime) return 'Unknown';
      const now = new Date();
      const expiry = new Date(expiryTime);
      const diffMs = expiry - now;
      
      if (diffMs <= 0) return 'Expired';
      
      const diffMinutes = Math.floor(diffMs / (1000 * 60));
      const diffHours = Math.floor(diffMinutes / 60);
      const remainingMinutes = diffMinutes % 60;
      
      if (diffHours > 0) {
        return `${diffHours}h ${remainingMinutes}m`;
      } else {
        return `${remainingMinutes}m`;
      }
    };
    
    const goToAdminRegistration = () => {
      window.location.href = '/admin/register';
    };
    
    const goToAdminSignIn = () => {
      window.location.href = '/admin';
    };
    
    const goToMainApp = () => {
      window.location.href = '/';
    };
    
    const signOut = async () => {
      try {
        // Call the sign out endpoint
        const response = await fetch('/api/sign-out', {
          method: 'POST'
        });
        
        if (response.ok) {
          $q.notify({
            type: 'positive',
            message: 'Signed out successfully',
            timeout: 2000
          });
          
          // Redirect to main app after a short delay
          setTimeout(() => {
            window.location.href = '/';
          }, 1000);
        } else {
          throw new Error('Sign out failed');
        }
      } catch (error) {
        console.error('Sign out error:', error);
        $q.notify({
          type: 'negative',
          message: 'Sign out failed. Please try again.'
        });
        
        // Force redirect even if sign out fails
        setTimeout(() => {
          window.location.href = '/';
        }, 2000);
      }
    };

    // Chat count loading function
    const loadChatCountsForAgents = async (agents) => {
      try {
        const { getAllGroupChats } = useGroupChat();
        const allGroups = await getAllGroupChats();
        
        // Update chat counts for each agent
        for (const agent of agents) {
          // Use the owner field that was already determined from agent name pattern
          const ownerName = agent.owner || 'Public User';
          
          // Filter groups by the owner - use same logic as patient view for consistency
          const filteredGroups = allGroups.filter(group => {
            // Use the same filtering logic as GroupManagementModal and ChatArea
            // This ensures consistency between patient and admin views
            
            // Check if this chat belongs to the owner (patient)
            const isOwner = group.currentUser === ownerName;
            
            // Also check patientOwner field for backward compatibility
            const isPatientOwner = group.patientOwner === ownerName;
            
            return isOwner || isPatientOwner;
          });
          
          agent.chatCount = filteredGroups.length;
        }
      } catch (error) {
        console.error('Error loading chat counts:', error);
        // Set all chat counts to 0 on error
        agents.forEach(agent => agent.chatCount = 0);
      }
    };
    
    // Load last activity for agents (ONLY from database - no chat data)
    const loadLastActivityForAgents = async (agents) => {
      try {
        // Get activity data from database (the only source of truth for user activity)
        const response = await fetch(`/api/admin-management/agent-activities?_t=${Date.now()}&_nocache=true`);
        if (response.ok) {
          const data = await response.json();
          const dbActivities = data.activities || [];
          
          // Set last activity for each agent based on database data
          for (const agent of agents) {
            const ownerName = agent.owner || 'Public User';
            const dbActivity = dbActivities.find(activity => activity.userId === ownerName);
            
            if (dbActivity) {
              // Use database time as the source of truth for user activity
              const dbTime = new Date(dbActivity.lastActivity);
              const now = new Date();
              const diffMs = now - dbTime;
              agent.lastActivity = formatTimeAgo(diffMs);
            } else {
              agent.lastActivity = 'Never';
            }
          }
        } else {
          // Set fallback
          agents.forEach(agent => {
            agent.lastActivity = 'Unknown';
          });
        }
        
      } catch (error) {
        console.error('Error loading last activity:', error);
        // Set fallback
        agents.forEach(agent => {
          agent.lastActivity = 'Unknown';
        });
      }
    };
    
    // Helper function to format time difference
    const formatTimeAgo = (diffMs) => {
      const diffMinutes = Math.floor(diffMs / (1000 * 60));
      const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
      const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
      
      if (diffMinutes < 60) {
        return `${diffMinutes} minute${diffMinutes !== 1 ? 's' : ''} ago`;
      } else if (diffHours < 24) {
        return `${diffHours} hour${diffHours !== 1 ? 's' : ''} ago`;
      } else {
        return `${diffDays} day${diffDays !== 1 ? 's' : ''} ago`;
      }
    };
    
    // Open group modal for specific agent
    const openGroupModalForAgent = (agent) => {
      selectedAgentForChats.value = agent;
      showGroupModal.value = true;
    };
    
    // Handle chat loaded from group modal
    const handleChatLoaded = (groupChat) => {
      // For now, just close the modal
      // In the future, we could navigate to the chat or show it in a new window
      showGroupModal.value = false;
      selectedAgentForChats.value = null;
    };
    
    // Handle group deletion
    const handleGroupDeleted = () => {
      // Refresh the agents and patients list to update chat counts
      loadAgentsAndPatients();
    };

    // Agents and Patients methods
    const loadAgentsAndPatients = async () => {
      if (!isAdmin.value) {
        return;
      }
      
      isLoadingAgentsPatients.value = true;
      
      // Add a small delay to ensure activity data is available
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      try {
        // Force fresh data from DO API - no caching, direct call
        const agentsResponse = await fetch(`/api/agents?user=admin&_t=${Date.now()}&_nocache=true`);
        if (!agentsResponse.ok) {
          throw new Error('Failed to load agents');
        }
        const agentsData = await agentsResponse.json();
        
        
        
        // Process each agent - knowledge bases are already included from DigitalOcean API
        const processedAgents = agentsData.map((agent) => {
          let patientName = 'No Knowledge Base';
          let owner = 'Public User'; // Default for agents without assigned users
          let userId = null;
          
          // Knowledge bases are already included in the agent data from DigitalOcean API
          if (agent.knowledgeBases && agent.knowledgeBases.length > 0) {
            // Use first word of first KB name as patient name
            const firstKB = agent.knowledgeBases[0];
            const firstWord = firstKB.name.split('-')[0];
            
            if (agent.knowledgeBases.length === 1) {
              patientName = firstWord;
            } else {
              patientName = `${firstWord}+${agent.knowledgeBases.length - 1}`;
            }
          }
          
          // Determine owner from agent name pattern
          if (agent.name.startsWith('public-')) {
            owner = 'Public User';
          } else if (agent.name.includes('-agent-')) {
            // Extract user ID from agent name pattern: {userId}-agent-{date}
            userId = agent.name.split('-agent-')[0];
            owner = userId;
          } else {
            owner = 'Unknown';
          }
          
          // Find matching user for flow step calculation
          const matchingUser = users.value.find(u => u.userId === userId);
          const flowStep = getFlowStep(agent, matchingUser);
          
          // Get workflow stage from user data
          const workflowStage = matchingUser?.workflowStage || 'no_passkey';
          
          return {
            id: agent.id,
            name: agent.name,
            patientName: patientName,
            owner: owner,
            userId: userId,
            chatCount: 0, // Will be updated with actual count
            lastActivity: 'Unknown', // Placeholder - will be updated later
            status: agent.status,
            knowledgeBases: agent.knowledgeBases || [],
            flowStep: flowStep,
            flowStepName: getWorkflowStageConfig(workflowStage).name
          };
        });
        
        // Load chat counts for each agent
        await loadChatCountsForAgents(processedAgents);
        
        // Load last activity for each agent
        await loadLastActivityForAgents(processedAgents);
        
        // Add users who are in the flow but don't have agents yet
        const usersInFlow = users.value.filter(user => {
          // Include users who are in the flow but don't have an agent yet
          const hasAgent = processedAgents.some(agent => agent.userId === user.userId);
          return !hasAgent && (user.workflowStage === 'awaiting_approval' || user.workflowStage === 'approved');
        });
        
        // Add flow entries for users without agents
        const userFlowEntries = usersInFlow.map(user => {
          const flowStep = getFlowStep(null, user);
          return {
            id: `user-${user.userId}`,
            name: `${user.userId}-agent-pending`,
            patientName: 'No Knowledge Base',
            owner: user.userId,
            userId: user.userId,
            chatCount: 0,
            lastActivity: 'Unknown',
            status: 'pending',
            knowledgeBases: [],
            flowStep: flowStep,
            flowStepName: getWorkflowStageConfig(user.workflowStage || 'no_passkey').name,
            isUserFlow: true // Flag to indicate this is a user flow entry, not an actual agent
          };
        });
        
        // Combine agents and user flow entries
        agentsAndPatients.value = [...processedAgents, ...userFlowEntries];
        
      } catch (error) {
        console.error('Error loading agents and patients:', error);
        $q.notify({
          type: 'negative',
          message: `Failed to load agents and patients: ${error.message}`
        });
      } finally {
        isLoadingAgentsPatients.value = false;
      }
    };
    
    // Database Consistency Check
    const runDatabaseConsistencyCheck = async () => {
      isRunningConsistencyCheck.value = true;
      
      try {
        // Get DO API data (source of truth)
        const agentsResponse = await fetch('/api/agents?user=admin');
        const agentsData = await agentsResponse.json();
        
        // Get database users
        const usersResponse = await fetch('/api/admin-management/users');
        const usersData = await usersResponse.json();
        
        // Validate response data
        if (!usersData || !usersData.users || !Array.isArray(usersData.users)) {
          throw new Error('Invalid users data received from API');
        }
        
        if (!Array.isArray(agentsData)) {
          throw new Error('Invalid agents data received from API - expected array');
        }
        
        const inconsistencies = [];
        
        // For each agent in DO API, check if it's assigned to the correct user
        for (const agent of agentsData) {
          const agentName = agent.name;
          const firstWord = agentName.split(/[-_]/)[0]; // Get first word before any separator
          
          // Determine who should own this agent based on first word
          let expectedOwner = null;
          if (firstWord === 'public') {
            expectedOwner = 'Public User';
          } else {
            expectedOwner = firstWord; // First word should be the userId
          }
          
          if (expectedOwner) {
            // Find the user in database
            const user = usersData.users.find(u => (u.userId || u._id) === expectedOwner);
            
            if (user) {
              // Check if this user has the correct agent assigned
              if (user.assignedAgentId !== agent.id) {
                inconsistencies.push({
                  type: 'agent_assignment_mismatch',
                  userId: expectedOwner,
                  agentId: agent.id,
                  agentName: agentName,
                  expectedAgentId: agent.id,
                  actualAgentId: user.assignedAgentId,
                  message: `User ${expectedOwner} should have agent ${agentName} (${agent.id}) but has ${user.assignedAgentId}`
                });
              }
            } else {
              // User doesn't exist in database
              inconsistencies.push({
                type: 'missing_user',
                userId: expectedOwner,
                agentId: agent.id,
                agentName: agentName,
                message: `Agent ${agentName} expects user ${expectedOwner} but user not found in database`
              });
            }
          }
        }
        
        // For each user in database, check if they have any invalid agent assignments
        for (const user of usersData.users) {
          const userId = user.userId || user._id;
          const assignedAgentId = user.assignedAgentId;
          const workflowStage = user.workflowStage;
          
          // Check for workflow stage inconsistencies
          if (assignedAgentId && workflowStage !== 'agent_assigned') {
            // User has an assigned agent but workflow stage is not 'agent_assigned'
            inconsistencies.push({
              type: 'workflow_stage_mismatch',
              userId: userId,
              agentId: assignedAgentId,
              agentName: user.assignedAgentName || 'Unknown',
              currentWorkflowStage: workflowStage,
              expectedWorkflowStage: 'agent_assigned',
              message: `User ${userId} has assigned agent ${user.assignedAgentName} but workflow stage is '${workflowStage}' instead of 'agent_assigned'`
            });
          } else if (!assignedAgentId && workflowStage === 'agent_assigned') {
            // User has workflow stage 'agent_assigned' but no assigned agent
            inconsistencies.push({
              type: 'workflow_stage_mismatch',
              userId: userId,
              agentId: null,
              agentName: null,
              currentWorkflowStage: workflowStage,
              expectedWorkflowStage: 'approved',
              message: `User ${userId} has workflow stage 'agent_assigned' but no assigned agent`
            });
          }
          
          if (assignedAgentId) {
            // Find the agent in DO API
            const agent = agentsData.find(a => a.id === assignedAgentId);
            
            if (!agent) {
              // Agent doesn't exist in DO API
              inconsistencies.push({
                type: 'orphaned_agent',
                userId: userId,
                agentId: assignedAgentId,
                message: `User ${userId} has agent ${assignedAgentId} that doesn't exist in DO API`
              });
            } else {
              // Check if the agent's first word matches the user
              const agentName = agent.name;
              const firstWord = agentName.split(/[-_]/)[0];
              
              let expectedFirstWord = null;
              if (userId === 'Public User') {
                expectedFirstWord = 'public';
              } else {
                expectedFirstWord = userId;
              }
              
              if (firstWord !== expectedFirstWord) {
                inconsistencies.push({
                  type: 'security_violation',
                  userId: userId,
                  agentId: assignedAgentId,
                  agentName: agentName,
                  expectedFirstWord: expectedFirstWord,
                  actualFirstWord: firstWord,
                  message: `SECURITY VIOLATION: User ${userId} has agent ${agentName} whose first word '${firstWord}' doesn't match '${expectedFirstWord}'`
                });
              }
            }
          }
        }
        
        // Show what database changes will be made
        if (inconsistencies.length > 0) {
          console.log(`🔍 [CONSISTENCY CHECK] Found ${inconsistencies.length} inconsistencies that will be fixed:`);
          inconsistencies.forEach((issue, index) => {
            console.log(`${index + 1}. ${issue.message}`);
          });
        } else {
          console.log(`✅ [CONSISTENCY CHECK] No inconsistencies found - database is consistent`);
        }
        
        return inconsistencies;
        
      } catch (error) {
        console.error('❌ [Admin Panel] Database consistency check failed:', error);
        throw error;
      } finally {
        isRunningConsistencyCheck.value = false;
      }
    };
    
    // Manual consistency check with UI notifications
    const runManualConsistencyCheck = async () => {
      try {
        const inconsistencies = await runDatabaseConsistencyCheck();
        
        if (inconsistencies.length === 0) {
          $q.notify({
            type: 'positive',
            message: '✅ Database consistency check passed - no issues found!',
            timeout: 3000
          });
        } else {
          // Show inconsistencies and offer to fix them
          const inconsistencyMessages = inconsistencies.map(issue => 
            `• ${issue.message}`
          ).join('\n');
          
          $q.notify({
            type: 'warning',
            message: `Found ${inconsistencies.length} inconsistency(ies). Check console for details.`,
            timeout: 5000,
            actions: [
              {
                label: 'FIX ISSUES',
                color: 'white',
                handler: () => {
                  fixConsistencyIssues(inconsistencies);
                }
              }
            ]
          });
        }
      } catch (error) {
        $q.notify({
          type: 'negative',
          message: `Database consistency check failed: ${error.message}`,
          timeout: 5000
        });
      }
    };
    
    // Show consistency check results dialog
    const showConsistencyCheckDialog = (inconsistencies) => {
      try {
        const message = `Found ${inconsistencies.length} inconsistency(ies). Do you want to fix them?`;
        const confirmed = confirm(message);
        
        if (confirmed) {
          fixConsistencyIssues(inconsistencies);
        } else {
          console.log('User cancelled consistency check fixes');
        }
      } catch (error) {
        console.error('❌ [Admin Panel] Error showing dialog:', error);
        $q.notify({
          type: 'negative',
          message: `Failed to show dialog: ${error.message}`,
          timeout: 5000
        });
      }
    };
    
    // Fix consistency issues
    const fixConsistencyIssues = async (inconsistencies) => {
      try {
        const response = await fetch('/api/admin-management/database/fix-consistency', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': 'Bearer admin'
          },
          body: JSON.stringify({ inconsistencies })
        });
        
        if (response.ok) {
          const result = await response.json();
          
          // Reload the data to reflect changes
          await loadUsers();
          await loadAgentsAndPatients();
          
          // Re-run consistency check to validate fixes
          try {
            const validationInconsistencies = await runDatabaseConsistencyCheck();
            
            if (validationInconsistencies && validationInconsistencies.length === 0) {
              // Show success message only after validation confirms no issues
              $q.notify({
                type: 'positive',
                message: '✅ Database consistency issues fixed successfully! All issues resolved.',
                timeout: 3000
              });
            } else if (validationInconsistencies && validationInconsistencies.length > 0) {
              // Show warning if issues still remain
              $q.notify({
                type: 'warning',
                message: `⚠️ Fixed some issues, but ${validationInconsistencies.length} inconsistencies still remain. Please try again.`,
                timeout: 5000
              });
            } else {
              // Fallback if validationInconsistencies is undefined/null
              $q.notify({
                type: 'positive',
                message: '✅ Database consistency issues fixed successfully!',
                timeout: 3000
              });
            }
          } catch (validationError) {
            console.error('❌ [Admin Panel] Failed to re-run consistency check after fix:', validationError);
            $q.notify({
              type: 'negative',
              message: `Failed to validate fixes: ${validationError.message}`,
              timeout: 5000
            });
          }
        } else {
          const errorData = await response.json();
          console.error(`❌ [Admin Panel] Failed to fix consistency issues:`, errorData.error);
          $q.notify({
            type: 'negative',
            message: `Failed to fix consistency issues: ${errorData.error}`,
            timeout: 5000
          });
        }
      } catch (error) {
        console.error('❌ [Admin Panel] Failed to fix consistency issues:', error);
        $q.notify({
          type: 'negative',
          message: `Failed to fix consistency issues: ${error.message}`,
          timeout: 5000
        });
      }
    };
    
    // Test functions for welcome modal
    const resetWelcomeModal = () => {
      localStorage.removeItem('maia-welcome-seen')
      localStorage.removeItem('maia-welcome-seen-timestamp')
      $q.notify({
        type: 'positive',
        message: 'Welcome modal reset! Refresh the main app to see it.',
        timeout: 3000
      })
    }
    
    
    // Lifecycle
    onMounted(async () => {
      // Connect to admin notification stream
      connectAdminEvents();
      
      checkUrlParameters();
      await checkAdminStatus();
      
      // Load agents and patients when admin is available
      if (isAdmin.value) {
        await loadAgentsAndPatients();
        
        // Run automatic consistency check
        try {
          const inconsistencies = await runDatabaseConsistencyCheck();
          if (inconsistencies.length === 0) {
            console.log('✅ [Admin Panel] Database consistency check passed - no issues found');
          } else {
            console.log(`⚠️ [Admin Panel] Found ${inconsistencies.length} inconsistencies on load`);
          }
        } catch (error) {
          console.error('❌ [Admin Panel] Automatic consistency check failed:', error);
        }
      }
    });
    
    // Check URL parameters for error messages and deep link user ID
    const checkUrlParameters = () => {
      const urlParams = new URLSearchParams(window.location.search);
      const error = urlParams.get('error');
      
      if (error) {
        switch (error) {
          case 'admin_auth_required':
            errorMessage.value = 'Authentication required to access admin panel. Please sign in first.';
            break;
          case 'admin_privileges_required':
            errorMessage.value = 'Admin privileges required. You do not have access to this panel.';
            break;
          case 'admin_check_failed':
            errorMessage.value = 'Failed to verify admin status. Please try again or contact support.';
            break;
          case 'admin_error':
            errorMessage.value = 'An error occurred while accessing the admin panel.';
            break;
          default:
            errorMessage.value = 'An unknown error occurred.';
        }
      }
      
      // Check for deep link user ID from server-side template or URL parameter
      const deepLinkUserId = window.ADMIN_DEEP_LINK_USER_ID || urlParams.get('userId');
      if (deepLinkUserId) {
        console.log(`🔗 [Admin Panel] Deep link detected for user: ${deepLinkUserId}`);
        // Store the user ID to open modal after users are loaded
        pendingDeepLinkUserId.value = deepLinkUserId;
      }
    };
    
    // Computed properties
    const cloudantDashboardUrl = computed(() => {
      // Get the Cloudant Dashboard URL from the server-rendered template
      // The server passes this via the EJS template
      return window.CLOUDANT_DASHBOARD_URL || '#';
    });

    // Watch for modal state changes
    watch(showUserModal, (newValue, oldValue) => {
      console.log('🔍 [SAFARI DEBUG] Modal state changed:', {
        from: oldValue,
        to: newValue,
        selectedUser: selectedUser.value,
        timestamp: new Date().toISOString()
      });
    });
    
    return {
      isAdmin,
      isLoading,
      isRegistering,
      isProcessingApproval,
      isSavingNotes,
      isAssigningAgent,
      isLoadingAgents,
      isResettingPasskey,
      isLoadingAgentsPatients,
      isCreatingAgent,
      isRunningConsistencyCheck,
      users,
      agents,
      selectedAgent,
      showUserModal,
      showAssignAgentDialog,
      showAgentCreationModal,
      selectedUser,
      adminNotes,
      adminForm,
      showPasskeyRegistration,
      isRegisteringPasskey,
      passkeyStatus,
      agentsAndPatients,
      showGroupModal,
      selectedAgentForChats,
      userColumns,
      stats,
      errorMessage,
      createdAgent,
      registerAdmin,
      registerPasskey,
      skipPasskeyRegistration,
      loadUsers,
      loadAgents,
      loadAgentsAndPatients,
      loadChatCountsForAgents,
      loadLastActivityForAgents,
      openGroupModalForAgent,
      handleChatLoaded,
      handleGroupDeleted,
      viewUserDetails,
      createAgentForUser,
      resetUserForAgentCreation,
      setUserWorkflowStage,
      startDeploymentPolling,
      approveUser,
      resetUserPasskey,
      fixDataInconsistency,
      saveNotes,
      selectAgent,
      assignAgent,
      getWorkflowStageColor,
      formatWorkflowStage,
      formatDate,
      formatFileSize,
      getTimeRemaining,
      getFlowStep,
      getFlowStepColor,
      goToAdminRegistration,
      goToAdminSignIn,
      goToMainApp,
      signOut,
      cloudantDashboardUrl,
      runDatabaseConsistencyCheck,
      runManualConsistencyCheck,
      resetWelcomeModal
    };
  }
});
</script>

<style scoped>
.admin-panel {
  max-width: 1200px;
  margin: 0 auto;
  padding: 20px;
}

.admin-header {
  text-align: center;
  margin-bottom: 30px;
}

.admin-subtitle {
  color: #666;
  font-size: 1.1rem;
}

.admin-dashboard-header {
  border-bottom: 2px solid #e0e0e0;
  padding-bottom: 15px;
}

.sign-out-btn {
  font-weight: bold;
  text-transform: uppercase;
}

.stats-overview {
  margin-bottom: 30px;
}

.stat-card {
  flex: 1;
  min-width: 150px;
}

.stat-card .text-h6 {
  color: #2c3e50;
  font-weight: bold;
}

.user-info,
.approval-requests,
.admin-actions,
.admin-notes {
  margin-bottom: 20px;
}

.user-info h5,
.approval-requests h5,
.admin-actions h5,
.admin-notes h5 {
  margin-top: 0;
  margin-bottom: 15px;
  color: #2c3e50;
  border-bottom: 2px solid #ecf0f1;
  padding-bottom: 8px;
}

.admin-actions .q-btn {
  margin-right: 10px;
}

.error-message {
  margin-bottom: 20px;
}

.error-message .q-banner {
  border-radius: 8px;
}

.agent-option {
  transition: all 0.2s ease;
}

.agent-option:hover {
  transform: translateY(-2px);
  box-shadow: 0 4px 8px rgba(0,0,0,0.1);
}

.agent-option .q-card {
  cursor: pointer;
  border: 2px solid transparent;
  transition: border-color 0.2s ease;
}

.agent-option .q-card:hover {
  border-color: #1976d2;
}

.agent-option .q-card.selected {
  border-color: #4caf50;
  background-color: #f1f8e9;
}

.agents-patients {
  margin-bottom: 30px;
}

.agent-patient-item {
  padding: 8px 12px;
  border: 1px solid #e0e0e0;
  border-radius: 4px;
  background-color: #fafafa;
  transition: all 0.2s ease;
}

.agent-patient-item:hover {
  background-color: #f0f0f0;
  border-color: #d0d0d0;
}

/* Chat count button styles - matching Bottom Toolbar */
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

/* Tooltip styles - matching Bottom Toolbar */
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
</style>
