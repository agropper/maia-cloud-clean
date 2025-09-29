<script setup lang="ts">
import ChatPrompt from '../components/ChatPromptRefactored.vue'
import TooltipTest from '../components/TooltipTest.vue'
import AdminPanel from '../components/AdminPanel.vue'
import AdminPanel2 from '../components/AdminPanel2.vue'
import UserDetailsPage from '../components/UserDetailsPage.vue'
import UserDetailsPage2 from '../components/UserDetailsPage2.vue'
import WelcomeModal from '../components/WelcomeModal.vue'
import AppLoadingState from '../components/AppLoadingState.vue'
import { computed, watch, ref, onMounted, onUnmounted } from 'vue'
import { appInitializer } from '../utils/AppInitializer.js'
import { appStateManager } from '../utils/AppStateManager.js'
import { useDialogAccessibility } from '../composables/useDialogAccessibility.ts'

// Application state
const isInitialized = ref(false)
const isLoading = ref(true)
const initializationError = ref(null)
const currentUser = ref(null)
const currentAgent = ref(null)
const userType = ref('public')

// Loading state
const loadingSteps = ref([
  { text: 'Detecting user type...', completed: false, current: true, error: false },
  { text: 'Loading user session...', completed: false, current: false, error: false },
  { text: 'Initializing agent...', completed: false, current: false, error: false },
  { text: 'Setting up interface...', completed: false, current: false, error: false }
])

// Check if we're on the tooltip test route
const isTooltipTest = computed(() => {
  return window.location.pathname === '/vue-tooltip-test'
})

// Check if we're on an admin route
const isAdminRoute = computed(() => {
  return window.location.pathname === '/admin' || window.location.pathname === '/admin/register'
})

// Check if we're on the new admin2 route
const isAdmin2Route = computed(() => {
  return window.location.pathname === '/admin2' || window.location.pathname === '/admin2/register'
})

// Check if we're on a user details route
const isUserDetailsRoute = computed(() => {
  return window.location.pathname.startsWith('/admin/user/')
})

// Check if we're on the new admin2 user details route
const isAdmin2UserDetailsRoute = computed(() => {
  return window.location.pathname.startsWith('/admin2/user/')
})

// Check if we're on the admin registration route specifically
const isAdminRegisterRoute = computed(() => {
  return window.location.pathname === '/admin/register'
})

// Check if we're on the admin2 registration route specifically
const isAdmin2RegisterRoute = computed(() => {
  return window.location.pathname === '/admin2/register'
})

// Check if we have admin-related error parameters (redirected from admin routes)
const hasAdminError = computed(() => {
  const urlParams = new URLSearchParams(window.location.search);
  const error = urlParams.get('error');
  return error && error.startsWith('admin_');
})

// Check if we should show a blank page (admin errors)
const shouldShowBlankPage = computed(() => {
  return hasAdminError.value;
})

// Get human-readable admin error message
const getAdminErrorMessage = () => {
  const urlParams = new URLSearchParams(window.location.search);
  const error = urlParams.get('error');
  
  if (!error) return '';
  
  switch (error) {
    case 'admin_auth_required':
      return 'Authentication required. Please sign in first.';
    case 'admin_privileges_required':
      return 'Admin privileges required. You do not have access to this panel.';
    case 'admin_check_failed':
      return 'Failed to verify admin status. Please try again or contact support.';
    case 'admin_error':
      return 'An error occurred while accessing the admin panel.';
    default:
      return 'Access denied for administrative reasons.';
  }
}

// Initialize dialog accessibility fixes
const { fixDialogAccessibility } = useDialogAccessibility()

// Initialize application
const initializeApp = async () => {
  try {
    // console.log('🚀 [App] Starting application initialization...')
    
    // Update loading step
    updateLoadingStep(0, true)
    updateLoadingStep(1, false, true)
    
    // Initialize the application
    const result = await appInitializer.initialize()
    
    // Update state from initialization result
    currentUser.value = result.user
    currentAgent.value = result.agent
    userType.value = result.userType
    
    // Update app state manager
    appStateManager.setUser(result.user)
    if (result.agent) {
      appStateManager.setAgent(result.agent)
    }
    
    // Handle agent selection requirement
    if (result.requiresAgentSelection) {
      appStateManager.setModal('showAgentSelectionModal', true)
    }
    
    // Handle no private agent modal for authenticated users
    if (result.showNoPrivateAgentModal) {
      appStateManager.setModal('showNoPrivateAgentModal', true)
    }
    
    // Update loading steps
    updateLoadingStep(1, true)
    updateLoadingStep(2, true)
    updateLoadingStep(3, false, true)
    
    // Mark as initialized
    isInitialized.value = true
    isLoading.value = false
    
    // console.log('✅ [App] Application initialized successfully:', {
    //   userType: result.userType,
    //   user: result.user?.userId || 'None',
    //   agent: result.agent?.name || 'None'
    // })
    
  } catch (error: any) {
    console.error('❌ [App] Initialization failed:', error)
    initializationError.value = error.message || 'Initialization failed'
    isLoading.value = false
    
    // Mark all steps as failed
    loadingSteps.value.forEach(step => {
      step.completed = false
      step.current = false
      step.error = true
    })
  }
}

// Update loading step
const updateLoadingStep = (index: number, completed: boolean, current: boolean = false) => {
  if (loadingSteps.value[index]) {
    loadingSteps.value[index].completed = completed
    loadingSteps.value[index].current = current
    loadingSteps.value[index].error = false
  }
}

// Handle retry
const handleRetry = async () => {
  initializationError.value = null
  isLoading.value = true
  
  // Reset loading steps
  loadingSteps.value.forEach((step, index) => {
    step.completed = false
    step.current = index === 0
    step.error = false
  })
  
  await initializeApp()
}

// Listen to state changes
const stateListenerId = appStateManager.addListener((newState: any, oldState: any) => {
  // Update local state when app state changes
  if (newState.currentUser !== oldState.currentUser) {
    currentUser.value = newState.currentUser
  }
  if (newState.currentAgent !== oldState.currentAgent) {
    currentAgent.value = newState.currentAgent
  }
})

// Initialize on mount
onMounted(() => {
  initializeApp()
})

// Cleanup on unmount
onUnmounted(() => {
  appStateManager.removeListener(stateListenerId)
})

// Loading state helpers
const getLoadingTitle = () => {
  if (initializationError.value) {
    return 'Initialization Failed'
  }
  return 'Loading Application'
}

const getLoadingMessage = () => {
  if (initializationError.value) {
    return 'An error occurred while initializing the application. Please try again.'
  }
  return 'Please wait while we initialize your session...'
}

const getLoadingProgress = () => {
  const completedSteps = loadingSteps.value.filter(step => step.completed).length
  return Math.round((completedSteps / loadingSteps.value.length) * 100)
}
</script>

<template>
  <div class="wrapper">
    <!-- Loading State -->
    <AppLoadingState
      :isLoading="isLoading"
      :loadingTitle="getLoadingTitle()"
      :loadingMessage="getLoadingMessage()"
      :showProgress="true"
      :progress="getLoadingProgress()"
      :loadingSteps="loadingSteps"
      :error="initializationError"
      @retry="handleRetry"
    />
    
    <!-- Main Application Content -->
    <div v-if="isInitialized && !isLoading" class="app-content">
      <TooltipTest v-if="isTooltipTest" />
      <UserDetailsPage v-else-if="isUserDetailsRoute" />
      <UserDetailsPage2 v-else-if="isAdmin2UserDetailsRoute" />
      <AdminPanel v-else-if="isAdminRoute" :isRegistrationRoute="isAdminRegisterRoute" />
      <AdminPanel2 v-else-if="isAdmin2Route" :isRegistrationRoute="isAdmin2RegisterRoute" />
      <div v-else-if="shouldShowBlankPage" class="admin-error-page">
        <div class="error-content">
          <h2>🚫 Admin Access Denied</h2>
          <p>You do not have permission to access the admin panel.</p>
          
          <div v-if="hasAdminError" class="error-details">
            <p><strong>Reason:</strong> 
              <span v-if="getAdminErrorMessage()" class="error-message">{{ getAdminErrorMessage() }}</span>
            </p>
          </div>
          
          <div class="action-buttons">
            <a href="/admin/register" class="btn btn-primary">Register as Admin</a>
            <a href="/" class="btn btn-secondary">Return to Main App</a>
          </div>
        </div>
      </div>
      <ChatPrompt v-else />
      
      <!-- Welcome Modal - shown to all users on first visit -->
      <WelcomeModal />
    </div>
  </div>
</template>

<style scoped>
.admin-error-page {
  display: flex;
  justify-content: center;
  align-items: center;
  min-height: 100vh;
  background-color: #f8f9fa;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
}

.error-content {
  text-align: center;
  max-width: 500px;
  padding: 40px;
  background: white;
  border-radius: 12px;
  box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
}

.error-content h2 {
  color: #dc3545;
  margin-bottom: 20px;
  font-size: 2rem;
}

.error-content p {
  color: #6c757d;
  margin-bottom: 20px;
  font-size: 1.1rem;
  line-height: 1.6;
}

.error-details {
  background-color: #f8f9fa;
  padding: 20px;
  border-radius: 8px;
  margin: 20px 0;
  border-left: 4px solid #dc3545;
}

.error-message {
  color: #dc3545;
  font-weight: 500;
}

.action-buttons {
  margin-top: 30px;
  display: flex;
  gap: 15px;
  justify-content: center;
  flex-wrap: wrap;
}

.btn {
  display: inline-block;
  padding: 12px 24px;
  text-decoration: none;
  border-radius: 6px;
  font-weight: 500;
  transition: all 0.2s ease;
}

.btn-primary {
  background-color: #007bff;
  color: white;
}

.btn-primary:hover {
  background-color: #0056b3;
  transform: translateY(-1px);
}

.btn-secondary {
  background-color: #6c757d;
  color: white;
}

.btn-secondary:hover {
  background-color: #545b62;
  transform: translateY(-1px);
}
</style>
