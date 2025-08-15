<template>
  <div class="group-sharing-badge">
    <div class="badge-content">
      <div class="badge-header">
        <div class="badge-title text-body2">Group Sharing</div>
        <div class="badge-status" :class="{ 'status-on': isEnabled, 'status-off': !isEnabled }">
          {{ isEnabled ? 'On' : 'Off' }}
        </div>
      </div>
      <div class="badge-body">
        <div class="status-indicator" :class="{ 'enabled': isEnabled, 'disabled': !isEnabled }">
          <q-icon 
            :name="isEnabled ? 'group' : 'group_off'" 
            :color="isEnabled ? 'positive' : 'grey'"
            size="24px"
          />
        </div>
        <div class="status-text text-caption text-grey">
          {{ isEnabled ? 'Group sharing is active' : 'Group sharing is disabled' }}
        </div>
      </div>
      <div class="badge-actions">
        <q-btn
          :label="isEnabled ? 'Disable' : 'Enable'"
          :color="isEnabled ? 'negative' : 'positive'"
          size="sm"
          @click="toggleGroupSharing"
          class="toggle-btn"
        />
      </div>
    </div>
  </div>
</template>

<script lang="ts">
import { defineComponent, ref } from 'vue'
import { QBtn, QIcon } from 'quasar'

export default defineComponent({
  name: 'GroupSharingBadge',
  components: {
    QBtn,
    QIcon
  },
  emits: ['group-sharing-changed'],
  setup(props, { emit }) {
    const isEnabled = ref(false)

    const toggleGroupSharing = () => {
      isEnabled.value = !isEnabled.value
      emit('group-sharing-changed', isEnabled.value)
    }

    return {
      isEnabled,
      toggleGroupSharing
    }
  }
})
</script>

<style scoped>
.group-sharing-badge {
  background: linear-gradient(135deg, #f5f7fa 0%, #c3cfe2 100%);
  border-radius: 8px;
  padding: 16px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
  width: 200px; /* Fixed width */
  height: 200px; /* Fixed height - square badge */
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  margin-left: 16px; /* Space from Agent Badge */
}

.badge-content {
  height: 100%;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
}

.badge-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
}

.badge-title {
  font-size: 1rem;
  font-weight: 500;
  color: #424242;
}

.badge-status {
  font-size: 0.75rem;
  font-weight: 500;
  padding: 4px 8px;
  border-radius: 12px;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.status-on {
  background-color: rgba(76, 175, 80, 0.2);
  color: #4caf50;
  border: 1px solid rgba(76, 175, 80, 0.3);
}

.status-off {
  background-color: rgba(158, 158, 158, 0.2);
  color: #9e9e9e;
  border: 1px solid rgba(158, 158, 158, 0.3);
}

.badge-body {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  text-align: center;
  margin: 16px 0;
}

.status-indicator {
  margin-bottom: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.status-text {
  font-size: 0.875rem;
  color: #666;
  line-height: 1.4;
}

.badge-actions {
  display: flex;
  justify-content: center;
}

.toggle-btn {
  font-weight: 500;
  border-radius: 8px;
  text-transform: none;
  letter-spacing: 0.3px;
}

/* Responsive adjustments */
@media (max-width: 768px) {
  .group-sharing-badge {
    width: 180px;
    height: 180px;
    margin-left: 12px;
    padding: 12px;
  }
  
  .badge-title {
    font-size: 0.875rem;
  }
  
  .status-text {
    font-size: 0.75rem;
  }
}
</style>
