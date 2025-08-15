<template>
  <q-dialog v-model="showModal" persistent>
    <q-card style="min-width: 500px">
      <q-card-section>
        <div class="text-h6">🔐 Transfer Knowledge Base Ownership</div>
      </q-card-section>

      <q-card-section>
        <div class="text-body1">
          <p><strong>Knowledge Base:</strong> {{ kbName }}</p>
          <p><strong>Current Owner:</strong> {{ currentOwner || 'Unknown' }}</p>
          <p><strong>New Owner:</strong> {{ newOwner }}</p>
          
          <div class="q-mt-md">
            <q-input
              v-model="displayName"
              label="Display Name for Agent Management"
              hint="This name will appear in the KB list"
              :rules="[val => !!val || 'Display name is required']"
              class="q-mb-md"
            />
            
            <q-input
              v-model="adminPassword"
              label="Admin Password"
              type="password"
              hint="Enter the admin password to authorize this transfer"
              :rules="[val => !!val || 'Admin password is required']"
              class="q-mb-md"
            />
          </div>
          
          <div v-if="error" class="text-negative q-mt-md">
            {{ error }}
          </div>
          
          <div v-if="success" class="text-positive q-mt-md">
            {{ success }}
          </div>
        </div>
      </q-card-section>

      <q-card-actions align="right">
        <q-btn flat label="Cancel" color="grey" @click="closeModal" />
        <q-btn 
          unelevated 
          label="Transfer Ownership" 
          color="primary" 
          @click="transferOwnership"
          :loading="isTransferring"
          :disabled="!displayName || !adminPassword"
        />
      </q-card-actions>
    </q-card>
  </q-dialog>
</template>

<script lang="ts">
import { defineComponent, ref, watch } from 'vue'
import { QDialog, QCard, QCardSection, QCardActions, QBtn, QInput } from 'quasar'

export default defineComponent({
  name: 'KBOwnershipTransferModal',
  components: {
    QDialog,
    QCard,
    QCardSection,
    QCardActions,
    QBtn,
    QInput
  },
  props: {
    modelValue: {
      type: Boolean,
      default: false
    },
    kbId: {
      type: String,
      required: true
    },
    kbName: {
      type: String,
      required: true
    },
    currentOwner: {
      type: String,
      default: 'Unknown'
    },
    newOwner: {
      type: String,
      required: true
    }
  },
  emits: ['update:modelValue', 'ownership-transferred'],
  setup(props, { emit }) {
    const showModal = ref(false)
    const displayName = ref('')
    const adminPassword = ref('')
    const error = ref('')
    const success = ref('')
    const isTransferring = ref(false)

    // Watch for modelValue changes
    watch(() => props.modelValue, (newVal) => {
      showModal.value = newVal
      if (newVal) {
        // Reset form when modal opens
        displayName.value = ''
        adminPassword.value = ''
        error.value = ''
        success.value = ''
      }
    })

    // Watch for showModal changes
    watch(showModal, (newVal) => {
      emit('update:modelValue', newVal)
    })

    const closeModal = () => {
      showModal.value = false
    }

    const transferOwnership = async () => {
      if (!displayName.value || !adminPassword.value) {
        error.value = 'Please fill in all required fields'
        return
      }

      isTransferring.value = true
      error.value = ''
      success.value = ''

      try {
        const response = await fetch('/api/admin/transfer-kb-ownership', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            kbId: props.kbId,
            newOwner: props.newOwner,
            displayName: displayName.value,
            adminPassword: adminPassword.value
          })
        })

        const data = await response.json()

        if (response.ok) {
          success.value = `Ownership transferred successfully! ${props.kbName} is now owned by ${props.newOwner}`
          
          // Emit success event
          emit('ownership-transferred', {
            kbId: props.kbId,
            newOwner: props.newOwner,
            displayName: displayName.value
          })
          
          // Close modal after a short delay
          setTimeout(() => {
            closeModal()
          }, 2000)
        } else {
          error.value = data.error || 'Failed to transfer ownership'
        }
      } catch (err) {
        error.value = 'Network error occurred while transferring ownership'
        console.error('Ownership transfer error:', err)
      } finally {
        isTransferring.value = false
      }
    }

    return {
      showModal,
      displayName,
      adminPassword,
      error,
      success,
      isTransferring,
      closeModal,
      transferOwnership
    }
  }
})
</script>

<style scoped>
.text-h6 {
  color: #1976d2;
}

.text-body1 {
  line-height: 1.6;
}
</style>
