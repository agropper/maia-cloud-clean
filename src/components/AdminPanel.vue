<template>
  <div class="admin-panel">
    <div class="admin-header">
      <h2>🔧 MAIA2 Administration Panel</h2>
      <p class="admin-subtitle">Manage Private AI Users and Workflow Approvals</p>
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
                         Owner: {{ agent.owner }} |
                         
                         <!-- Chats Button - Same style as Bottom Toolbar -->
                         <div class="tooltip-wrapper" style="display: inline-block; margin: 0 8px;">
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
                    <QChip
                      :color="agent.status === 'running' ? 'positive' : 'warning'"
                      size="sm"
                      :label="agent.status"
                    />
                  </div>
                </div>
              </div>
            </div>

            <!-- No Agents -->
            <div v-if="agentsAndPatients.length === 0" class="text-center q-pa-md">
              <QIcon name="smart_toy" size="2rem" color="grey" class="q-mb-md" />
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
                />
              </QTd>
            </template>
          </QTable>
        </QCardSection>
      </QCard>
    </div>

    <!-- User Details Modal -->
    <QDialog v-model="showUserModal" persistent maximized>
      <QCard>
        <QCardSection class="row items-center q-pb-none">
          <div class="text-h6">
            👤 User Details: {{ selectedUser?.displayName }}
          </div>
          <QSpace />
          <QBtn icon="close" flat round dense @click="showUserModal = false" />
        </QCardSection>

        <QCardSection v-if="selectedUser">
          <!-- User Info -->
          <div class="user-info q-mb-lg">
            <h5>User Information</h5>
            <div class="row q-gutter-md">
              <div class="col-6">
                <p><strong>User ID:</strong> {{ selectedUser.userId }}</p>
                <p><strong>Display Name:</strong> {{ selectedUser.displayName }}</p>
                <p><strong>Created:</strong> {{ formatDate(selectedUser.createdAt) }}</p>
              </div>
              <div class="col-6">
                <p><strong>Has Passkey:</strong> {{ selectedUser.hasPasskey ? '✅ Yes' : '❌ No' }}</p>
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
                icon="check_circle"
                label="Approve User"
                @click="approveUser('approved')"
                :loading="isProcessingApproval"
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
                v-if="selectedUser.hasPasskey"
                color="warning"
                icon="key_off"
                label="Reset Passkey"
                @click="resetUserPasskey"
                :loading="isResettingPasskey"
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
            <QIcon name="hourglass_empty" size="2rem" class="q-mb-md" />
            <div>Loading available agents...</div>
          </div>

          <div v-else-if="agents.length === 0" class="text-center q-pa-md">
            <QIcon name="warning" size="2rem" class="q-mb-md" color="warning" />
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
                        size="1.5rem"
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
      :currentUser="selectedAgentForChats?.owner || 'Unknown User'"
      :onGroupDeleted="handleGroupDeleted"
      @chatLoaded="handleChatLoaded"
    />
  </div>
</template>

<script>
import { defineComponent, ref, computed, onMounted } from 'vue';
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
    const users = ref([]);
    const agents = ref([]);
    const selectedAgent = ref(null);
    const showUserModal = ref(false);
    const showAssignAgentDialog = ref(false);
    const selectedUser = ref(null);
    const adminNotes = ref('');
    const errorMessage = ref('');
    
    // Agents and Patients
    const agentsAndPatients = ref([]);
    const showGroupModal = ref(false);
    const selectedAgentForChats = ref(null);
    
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
        align: 'center'
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
        // Use the health endpoint instead of the users endpoint for admin status check
        const response = await fetch('/api/admin-management/health');
        if (response.ok) {
          const healthData = await response.json();
          // If we can access the health endpoint, the system is ready
          // Now check if current user is admin by trying to get users
          try {
            const usersResponse = await fetch('/api/admin-management/users');
            if (usersResponse.ok) {
              isAdmin.value = true;
              await loadUsers();
            } else if (usersResponse.status === 401 || usersResponse.status === 403) {
              isAdmin.value = false;
            }
          } catch (usersError) {
            console.log('User not authenticated as admin');
            isAdmin.value = false;
          }
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
        } else {
          const errorData = await response.json().catch(() => ({}));
          
          // Handle rate limiting specifically
          if (response.status === 429) {
            console.warn('🚨 [Browser] Admin Panel: Cloudant Rate Limit Exceeded (429)', {
              endpoint: '/api/admin-management/users',
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
      selectedUser.value = user;
      adminNotes.value = '';
      showUserModal.value = true;
      
      try {
        const response = await fetch(`/api/admin-management/users/${user.userId}`);
        if (response.ok) {
          const userDetails = await response.json();
          // Ensure userId is preserved from the original user object
          selectedUser.value = {
            ...userDetails,
            userId: user.userId // Preserve the userId from the table row
          };
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
      $q.dialog({
        title: 'Reset User Passkey',
        message: `Are you sure you want to reset the passkey for user "${selectedUser.value.displayName}"? This will require them to register a new passkey.`,
        cancel: true,
        persistent: true,
        ok: {
          label: 'Reset Passkey',
          color: 'warning'
        }
      }).onOk(async () => {
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
              message: `Passkey reset successfully for user "${selectedUser.value.displayName}". They can now register a new passkey.`
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
      });
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
        const response = await fetch('/api/agents');
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
        'awaiting_approval': 'warning',
        'approved': 'positive',
        'rejected': 'negative',
        'suspended': 'orange'
      };
      return colors[stage] || 'grey';
    };
    
    const formatWorkflowStage = (stage) => {
      const labels = {
        'no_passkey': 'No Passkey',
        'awaiting_approval': 'Awaiting Approval',
        'approved': 'Approved',
        'rejected': 'Rejected',
        'suspended': 'Suspended'
      };
      return labels[stage] || stage;
    };
    
    const formatDate = (dateString) => {
      if (!dateString) return 'N/A';
      return new Date(dateString).toLocaleDateString();
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
    const loadChatCountsForAgents = async (agents, usersData) => {
      try {
        const { getAllGroupChats } = useGroupChat();
        const allGroups = await getAllGroupChats();
        
        // Update chat counts for each agent
        for (const agent of agents) {
          // Find the user who owns this agent by checking assignedAgentId/assignedAgentName
          const userWithAgent = usersData.find(user => 
            user.assignedAgentId === agent.id || 
            (user.assignedAgentName && user.assignedAgentName === agent.name)
          );
          
          if (userWithAgent) {
            // Filter groups by the owner's currentUser
            const ownerName = userWithAgent.displayName || userWithAgent.userId;
            const filteredGroups = allGroups.filter(group => group.currentUser === ownerName);
            agent.chatCount = filteredGroups.length;
          } else {
            // No owner found - this means it's a "Public Agent" (Unknown User)
            // Show all chats for Unknown User
            const filteredGroups = allGroups.filter(group => group.currentUser === 'Unknown User');
            agent.chatCount = filteredGroups.length;
          }
        }
      } catch (error) {
        console.error('Error loading chat counts:', error);
        // Set all chat counts to 0 on error
        agents.forEach(agent => agent.chatCount = 0);
      }
    };
    
    // Load last activity for agents
    const loadLastActivityForAgents = async (agents, usersData) => {
      try {
        // Get long-term activity from saved chats (this works reliably)
        const { getAllGroupChats } = useGroupChat();
        const allGroups = await getAllGroupChats();
        
        for (const agent of agents) {
          // Find the user who owns this agent
          const userWithAgent = usersData.find(user => 
            user.assignedAgentId === agent.id || 
            (user.assignedAgentName && user.assignedAgentName === agent.name)
          );
          
          let ownerName = 'Unknown User';
          if (userWithAgent) {
            ownerName = userWithAgent.displayName || userWithAgent.userId;
          }
          
          // Get chats for this owner
          const ownerChats = allGroups.filter(group => group.currentUser === ownerName);
          
          let lastActivity = null;
          
          // Check long-term activity from saved chats
          if (ownerChats.length > 0) {
            const mostRecentChat = ownerChats.reduce((latest, chat) => {
              const chatTime = new Date(chat.updatedAt || chat.createdAt);
              const latestTime = new Date(latest.updatedAt || latest.createdAt);
              return chatTime > latestTime ? chat : latest;
            });
            
            lastActivity = new Date(mostRecentChat.updatedAt || mostRecentChat.createdAt);
          }
          
          // Format the result
          if (lastActivity) {
            const now = new Date();
            const diffMs = now - lastActivity;
            agent.lastActivity = formatTimeAgo(diffMs);
          } else {
            agent.lastActivity = 'Never';
          }
        }
        
        // Try to get in-memory activity data (optional, don't fail if it doesn't work)
        try {
          const response = await fetch('/api/admin-management/agent-activities');
          if (response.ok) {
            const data = await response.json();
            const inMemoryActivities = data.activities || [];
            
            // Update with in-memory activity if more recent
            for (const agent of agents) {
              const inMemoryActivity = inMemoryActivities.find(activity => activity.agentId === agent.id);
              if (inMemoryActivity) {
                const inMemoryTime = new Date(inMemoryActivity.lastActivity);
                const currentTime = agent.lastActivity === 'Never' ? null : new Date();
                
                if (currentTime && inMemoryTime > currentTime) {
                  const now = new Date();
                  const diffMs = now - inMemoryTime;
                  agent.lastActivity = formatTimeAgo(diffMs);
                }
              }
            }
          }
        } catch (inMemoryError) {
          // Silently ignore in-memory activity errors
          console.log('In-memory activity not available, using chat data only');
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
      try {
        // Use the same API call as Agent Badge - get ALL agents without filtering
        const agentsResponse = await fetch('/api/agents?user=admin');
        if (!agentsResponse.ok) {
          throw new Error('Failed to load agents');
        }
        const agentsData = await agentsResponse.json();
        
        
        // Get user data to determine ownership
        let usersData = [];
        try {
          const usersResponse = await fetch('/api/admin-management/users');
          if (usersResponse.ok) {
            const usersResult = await usersResponse.json();
            usersData = usersResult.users || [];
          }
        } catch (error) {
          console.error('Error fetching users for ownership:', error);
        }
        
        // Process each agent - knowledge bases are already included from DigitalOcean API
        const processedAgents = agentsData.map((agent) => {
          let patientName = 'No Knowledge Base';
          let owner = 'Public Agent'; // Default for agents without assigned users
          
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
          
          // Determine owner: Use Display Name if there's an assigned agent, otherwise "Public Agent"
          const userWithAgent = usersData.find(user => 
            user.assignedAgentId === agent.id || 
            (user.assignedAgentName && user.assignedAgentName === agent.name)
          );
          
          if (userWithAgent) {
            owner = userWithAgent.displayName || userWithAgent.userId;
          } else {
            owner = 'Unknown User';
          }
          
          return {
            id: agent.id,
            name: agent.name,
            patientName: patientName,
            owner: owner,
            chatCount: 0, // Will be updated with actual count
            lastActivity: 'Unknown', // Placeholder - will be updated later
            status: agent.status,
            knowledgeBases: agent.knowledgeBases || []
          };
        });
        
        // Load chat counts for each agent
        await loadChatCountsForAgents(processedAgents, usersData);
        
        // Load last activity for each agent
        await loadLastActivityForAgents(processedAgents, usersData);
        
        agentsAndPatients.value = processedAgents;
        
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
    
    // Lifecycle
    onMounted(async () => {
      checkUrlParameters();
      await checkAdminStatus();
      
      // Load agents and patients when admin is available
      if (isAdmin.value) {
        await loadAgentsAndPatients();
      }
    });
    
    // Check URL parameters for error messages
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
    };
    
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
      users,
      agents,
      selectedAgent,
      showUserModal,
      showAssignAgentDialog,
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
      approveUser,
      resetUserPasskey,
      saveNotes,
      selectAgent,
      assignAgent,
      getWorkflowStageColor,
      formatWorkflowStage,
      formatDate,
      goToAdminRegistration,
      goToAdminSignIn,
      goToMainApp,
      signOut
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
