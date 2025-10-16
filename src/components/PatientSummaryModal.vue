<template>
  <q-dialog v-model="showModal" @hide="handleClose">
    <q-card style="min-width: 400px; max-width: 500px;">
      <q-card-section class="row items-center q-pb-none">
        <div class="text-h6">Patient Summary</div>
        <q-space />
        <q-btn icon="close" flat round dense v-close-popup />
      </q-card-section>

      <q-card-section class="q-pt-md">
        <div class="text-body1">Would you like to:</div>
      </q-card-section>

      <q-card-actions align="center" class="q-px-md q-pb-md">
        <q-btn
          label="VIEW PATIENT SUMMARY"
          color="primary"
          unelevated
          @click="handleView"
          class="q-px-lg"
          autofocus
        />
        <q-btn
          label="REDO PATIENT SUMMARY"
          color="secondary"
          outline
          @click="handleRedo"
          class="q-px-lg"
        />
      </q-card-actions>
    </q-card>
  </q-dialog>
</template>

<script setup>
import { ref, watch } from 'vue';

const props = defineProps({
  modelValue: {
    type: Boolean,
    required: true
  }
});

const emit = defineEmits(['update:modelValue', 'view', 'redo']);

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

const handleView = () => {
  emit('view');
  showModal.value = false;
};

const handleRedo = () => {
  emit('redo');
  showModal.value = false;
};
</script>

<style scoped>
.q-card {
  border-radius: 8px;
}

.text-h6 {
  font-weight: 500;
}

.text-body1 {
  font-size: 16px;
  margin-bottom: 8px;
}

.q-btn {
  min-width: 180px;
}
</style>

