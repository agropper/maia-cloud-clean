<template>
  <q-dialog v-model="showModal" persistent>
    <q-card style="min-width: 400px; max-width: 500px;">
      <q-card-section class="row items-center q-pb-none">
        <div class="text-h6">Waiting for administrator support approval</div>
        <q-space />
      </q-card-section>

      <q-card-section class="q-pt-md">
        <div class="text-body1 q-mb-md">
          The administrator has been emailed. You should receive a response within hours.
        </div>
        
        <div class="text-body2 text-grey-7">
          Once approved, your personal AI agent will be deployed and you can start using MAIA.
        </div>
      </q-card-section>

      <q-card-actions align="right">
        <q-btn
          label="OK"
          color="primary"
          @click="handleDismiss"
          unelevated
        />
      </q-card-actions>
    </q-card>
  </q-dialog>
</template>

<script setup>
import { ref, watch } from 'vue'
import { QDialog, QCard, QCardSection, QCardActions, QBtn, QSpace } from 'quasar'

// Props for v-model support
const props = defineProps({
  modelValue: {
    type: Boolean,
    default: false
  }
})

const emit = defineEmits(['update:modelValue'])

const showModal = ref(props.modelValue)

// Watch for external changes to modelValue
watch(() => props.modelValue, (newVal) => {
  showModal.value = newVal
})

// Watch for internal changes to showModal
watch(showModal, (newVal) => {
  emit('update:modelValue', newVal)
})

const handleDismiss = () => {
  showModal.value = false
}
</script>

<style scoped>
/* Optional: Add any custom styling here */
</style>

