<template>
  <q-dialog v-model="showModal" @hide="handleClose">
    <q-card style="min-width: 600px; max-width: 800px; max-height: 80vh;">
      <q-card-section class="row items-center q-pb-none">
        <div class="text-h6">Patient Summary</div>
        <q-space />
        <q-btn icon="close" flat round dense v-close-popup />
      </q-card-section>

      <q-card-section class="q-pt-md" style="max-height: 60vh; overflow-y: auto;">
        <div v-if="summary" class="summary-content">
          <VueMarkdown :source="summary.content" />
          
          <div class="summary-metadata q-mt-md q-pt-md" style="border-top: 1px solid #e0e0e0;">
            <div class="text-caption text-grey-7">
              <div><strong>Created:</strong> {{ formatDate(summary.createdAt) }}</div>
              <div v-if="summary.kbUsed"><strong>Knowledge Base:</strong> {{ summary.kbUsed }}</div>
              <div v-if="summary.tokens"><strong>Tokens:</strong> {{ summary.tokens.toLocaleString() }}</div>
            </div>
          </div>
        </div>
        <div v-else class="text-body1 text-grey-7">
          No patient summary available.
        </div>
      </q-card-section>

      <q-card-actions align="right" class="q-px-md q-pb-md">
        <q-btn
          label="Close"
          color="primary"
          flat
          @click="handleClose"
        />
      </q-card-actions>
    </q-card>
  </q-dialog>
</template>

<script setup>
import { ref, watch } from 'vue';
import { QDialog, QCard, QCardSection, QCardActions, QBtn, QSpace } from 'quasar';
import VueMarkdown from 'vue-markdown-render';

const props = defineProps({
  modelValue: {
    type: Boolean,
    required: true
  },
  summary: {
    type: Object,
    default: null
  }
});

const emit = defineEmits(['update:modelValue']);

const showModal = ref(props.modelValue);

// Watch for external changes to modelValue
watch(() => props.modelValue, (newValue) => {
  showModal.value = newValue;
});

// Watch for internal changes to showModal
watch(showModal, (newValue) => {
  emit('update:modelValue', newValue);
});

const handleClose = () => {
  showModal.value = false;
};

const formatDate = (dateString) => {
  if (!dateString) return 'Unknown';
  const date = new Date(dateString);
  return date.toLocaleString();
};
</script>

<style scoped>
.summary-content {
  line-height: 1.6;
}

.summary-metadata {
  font-size: 12px;
}
</style>

