<template>
  <div v-if="isLoading" class="app-loading-overlay">
    <div class="loading-container">
      <div class="loading-spinner">
        <q-spinner-dots
          size="48px"
          color="primary"
        />
      </div>
      
      <div class="loading-content">
        <h3 class="loading-title">{{ loadingTitle }}</h3>
        <p class="loading-message">{{ loadingMessage }}</p>
        
        <!-- Progress indicator -->
        <div v-if="showProgress" class="progress-container">
          <div class="progress-bar">
            <div 
              class="progress-fill" 
              :style="{ width: `${progress}%` }"
            ></div>
          </div>
          <span class="progress-text">{{ progress }}%</span>
        </div>
        
        <!-- Loading steps -->
        <div v-if="loadingSteps.length > 0" class="loading-steps">
          <div 
            v-for="(step, index) in loadingSteps" 
            :key="index"
            class="loading-step"
            :class="{ 
              'completed': step.completed, 
              'current': step.current,
              'error': step.error 
            }"
          >
            <q-icon 
              :name="step.completed ? 'check_circle' : step.error ? 'error' : 'radio_button_unchecked'"
              :color="step.completed ? 'positive' : step.error ? 'negative' : 'grey'"
              size="19px"
            />
            <span class="step-text">{{ step.text }}</span>
          </div>
        </div>
      </div>
      
      <!-- Error state -->
      <div v-if="error" class="error-container">
        <q-icon name="error" color="negative" size="32px" />
        <h4 class="error-title">Loading Failed</h4>
        <p class="error-message">{{ error }}</p>
        <q-btn 
          color="primary" 
          label="Retry" 
          @click="handleRetry"
          :loading="isRetrying"
        />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue';
import { QSpinnerDots, QIcon, QBtn } from 'quasar';

interface LoadingStep {
  text: string;
  completed: boolean;
  current: boolean;
  error: boolean;
}

interface Props {
  isLoading: boolean;
  loadingTitle?: string;
  loadingMessage?: string;
  showProgress?: boolean;
  progress?: number;
  loadingSteps?: LoadingStep[];
  error?: string | null;
  onRetry?: () => void;
}

const props = withDefaults(defineProps<Props>(), {
  loadingTitle: 'Loading Application',
  loadingMessage: 'Please wait while we initialize your session...',
  showProgress: false,
  progress: 0,
  loadingSteps: () => [],
  error: null
});

const emit = defineEmits<{
  retry: [];
}>();

const isRetrying = ref(false);

const handleRetry = async () => {
  isRetrying.value = true;
  emit('retry');
  
  // Reset retry state after a delay
  setTimeout(() => {
    isRetrying.value = false;
  }, 2000);
};

// Auto-hide loading after timeout (safety measure)
let timeoutId: number | null = null;

onMounted(() => {
  // Set a maximum loading time of 30 seconds
  timeoutId = window.setTimeout(() => {
    if (props.isLoading) {
      console.warn('⚠️ [AppLoadingState] Loading timeout reached');
    }
  }, 30000);
});

onUnmounted(() => {
  if (timeoutId) {
    clearTimeout(timeoutId);
  }
});
</script>

<style scoped>
.app-loading-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(255, 255, 255, 0.95);
  backdrop-filter: blur(4px);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 9999;
}

.loading-container {
  text-align: center;
  max-width: 400px;
  padding: 2rem;
  background: white;
  border-radius: 12px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.1);
}

.loading-spinner {
  margin-bottom: 1.5rem;
}

.loading-content {
  margin-bottom: 1.5rem;
}

.loading-title {
  margin: 0 0 0.5rem 0;
  color: #1976d2;
  font-size: 1.5rem;
  font-weight: 600;
}

.loading-message {
  margin: 0 0 1rem 0;
  color: #666;
  font-size: 1rem;
  line-height: 1.5;
}

.progress-container {
  display: flex;
  align-items: center;
  gap: 1rem;
  margin: 1rem 0;
}

.progress-bar {
  flex: 1;
  height: 8px;
  background: #e0e0e0;
  border-radius: 4px;
  overflow: hidden;
}

.progress-fill {
  height: 100%;
  background: linear-gradient(90deg, #1976d2, #42a5f5);
  border-radius: 4px;
  transition: width 0.3s ease;
}

.progress-text {
  font-size: 0.9rem;
  font-weight: 600;
  color: #1976d2;
  min-width: 3rem;
}

.loading-steps {
  text-align: left;
  margin-top: 1rem;
}

.loading-step {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0.5rem 0;
  transition: all 0.3s ease;
}

.loading-step.completed {
  opacity: 0.7;
}

.loading-step.current {
  font-weight: 600;
  color: #1976d2;
}

.loading-step.error {
  color: #d32f2f;
}

.step-text {
  font-size: 0.9rem;
}

.error-container {
  text-align: center;
  padding: 1rem;
  background: #ffebee;
  border-radius: 8px;
  border: 1px solid #ffcdd2;
}

.error-title {
  margin: 0.5rem 0;
  color: #d32f2f;
  font-size: 1.2rem;
}

.error-message {
  margin: 0.5rem 0 1rem 0;
  color: #666;
  font-size: 0.9rem;
}

/* Dark mode support */
@media (prefers-color-scheme: dark) {
  .app-loading-overlay {
    background: rgba(18, 18, 18, 0.95);
  }
  
  .loading-container {
    background: #2d2d2d;
    color: #ffffff;
  }
  
  .loading-title {
    color: #64b5f6;
  }
  
  .loading-message {
    color: #b0b0b0;
  }
  
  .progress-bar {
    background: #404040;
  }
  
  .progress-fill {
    background: linear-gradient(90deg, #64b5f6, #90caf9);
  }
  
  .progress-text {
    color: #64b5f6;
  }
  
  .loading-step.current {
    color: #64b5f6;
  }
  
  .error-container {
    background: #2d1b1b;
    border-color: #5d2a2a;
  }
  
  .error-title {
    color: #f48fb1;
  }
  
  .error-message {
    color: #b0b0b0;
  }
}
</style>
