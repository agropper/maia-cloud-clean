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
    QIcon
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
    const users = ref([]);
    const agents = ref([]);
    const selectedAgent = ref(null);
    const showUserModal = ref(false);
    const showAssignAgentDialog = ref(false);
    const selectedUser = ref(null);
    const adminNotes = ref('');
    const errorMessage = ref('');
    
    // Admin registration form
    const adminForm = ref({
      username: '',
      adminSecret: ''
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
          
          // Redirect to main app for passkey registration with admin context
          // The canProceedToPasskey flag indicates the admin is verified
          setTimeout(() => {
            window.location.href = '/?admin=1';
          }, 2000);
          
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
    
    // Lifecycle
    onMounted(async () => {
      checkUrlParameters();
      checkAdminStatus();
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
      users,
      agents,
      selectedAgent,
      showUserModal,
      showAssignAgentDialog,
      selectedUser,
      adminNotes,
      adminForm,
      userColumns,
      stats,
      errorMessage,
      registerAdmin,
      loadUsers,
      loadAgents,
      viewUserDetails,
      approveUser,
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
</style>
