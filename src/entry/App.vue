<script setup lang="ts">
import ChatPrompt from '../components/ChatPrompt.vue'
import TooltipTest from '../components/TooltipTest.vue'
import AdminPanel from '../components/AdminPanel.vue'
import { computed } from 'vue'

// Check if we're on the tooltip test route
const isTooltipTest = computed(() => {
  return window.location.pathname === '/vue-tooltip-test'
})

// Check if we're on an admin route
const isAdminRoute = computed(() => {
  return window.location.pathname === '/admin' || window.location.pathname === '/admin/register'
})

// Check if we're on the admin registration route specifically
const isAdminRegisterRoute = computed(() => {
  return window.location.pathname === '/admin/register'
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
</script>

<template>
  <div class="wrapper">
    <TooltipTest v-if="isTooltipTest" />
    <AdminPanel v-else-if="isAdminRoute" :isRegistrationRoute="isAdminRegisterRoute" />
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
