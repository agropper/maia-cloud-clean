<template>
  <div class="group-sharing-badge">
    <q-card flat bordered class="status-card">
      <q-card-section class="q-pa-sm">
        <div class="badge-title text-body2">Group Sharing</div>
      </q-card-section>
    </q-card>
  </div>
</template>

<script lang="ts">
import { defineComponent } from 'vue'
import { QCard, QCardSection } from 'quasar'

export default defineComponent({
  name: 'GroupSharingBadge',
  components: {
    QCard,
    QCardSection
  }
})
</script>

<style scoped>
.group-sharing-badge {
  width: 30%;
}

.status-card {
  background: linear-gradient(135deg, #f5f7fa 0%, #c3cfe2 100%);
  border-radius: 8px;
}

.badge-title {
  color: #424242;
  margin: 0;
}
</style>
