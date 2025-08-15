<template>
  <div class="group-sharing-badge">
    <div class="badge-title text-body2">Group Sharing</div>
  </div>
</template>

<script lang="ts">
import { defineComponent } from 'vue'

export default defineComponent({
  name: 'GroupSharingBadge'
})
</script>

<style scoped>
.group-sharing-badge {
  background: linear-gradient(135deg, #f5f7fa 0%, #c3cfe2 100%);
  border-radius: 8px;
  padding: 16px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
  width: 30%;
  display: flex;
  align-items: center;
  justify-content: center;
}

.badge-title {
  color: #424242;
  margin: 0;
}
</style>
