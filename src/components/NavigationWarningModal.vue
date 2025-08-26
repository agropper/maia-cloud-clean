<template>
  <q-dialog v-model="showModal" persistent>
    <q-card style="min-width: 400px">
      <q-card-section class="row items-center q-pb-none">
        <div class="text-h6">⚠️ Navigation Warning</div>
        <q-space />
        <q-btn icon="close" flat round dense @click="handleCancel" />
      </q-card-section>

      <q-card-section>
        <div class="text-body2 q-mb-md">
          You're about to leave this chat. Any unsaved changes may be lost.
        </div>
        
        <div class="text-caption text-grey">
          <q-icon name="info" size="sm" class="q-mr-xs" />
          If you want to save your chat first, use the "POST TO GROUP" button.
        </div>
      </q-card-section>

      <q-card-actions align="right">
        <q-btn flat label="Cancel" @click="handleCancel" />
        <q-btn 
          color="warning" 
          label="Leave Anyway" 
          @click="handleConfirm"
        />
      </q-card-actions>
    </q-card>
  </q-dialog>
</template>

<script lang="ts">
import { defineComponent, ref, watch } from 'vue'

export default defineComponent({
  name: 'NavigationWarningModal',
  props: {
    modelValue: {
      type: Boolean,
      default: false
    },
    hasUnsavedChanges: {
      type: Boolean,
      default: false
    }
  },
  emits: ['update:modelValue', 'confirm-navigation', 'cancel-navigation'],
  setup(props, { emit }) {
    const showModal = ref(false)

    // Watch for prop changes
    watch(() => props.modelValue, (newValue) => {
      showModal.value = newValue
    })

    // Watch for local changes
    watch(showModal, (newValue) => {
      emit('update:modelValue', newValue)
    })

    const handleConfirm = () => {
      showModal.value = false
      emit('confirm-navigation')
    }

    const handleCancel = () => {
      showModal.value = false
      emit('cancel-navigation')
    }

    return {
      showModal,
      handleConfirm,
      handleCancel
    }
  }
})
</script>

<style scoped>
.q-card {
  border-radius: 12px;
}
</style>
