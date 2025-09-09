<template>
  <q-dialog v-model="showModal" persistent>
    <q-card class="deep-link-user-modal">
      <q-card-section class="text-center">
        <q-icon name="link" size="3rem" color="primary" />
        <h4 class="q-mt-md q-mb-sm">Welcome to MAIA!</h4>
        <p class="text-body1 q-mb-md">
          You're accessing a shared conversation. To continue, please provide your information.
        </p>
        <p class="text-caption text-grey-6 q-mb-lg">
          Your email address will not be revealed to others and is only used for identification purposes.
        </p>
      </q-card-section>

      <q-card-section>
        <q-form @submit="handleSubmit" class="q-gutter-md">
          <q-input
            v-model="userName"
            label="Your Name"
            placeholder="Enter your full name"
            :rules="[val => !!val || 'Name is required']"
            outlined
            dense
            autofocus
          >
            <template v-slot:prepend>
              <q-icon name="person" />
            </template>
          </q-input>

          <q-input
            v-model="userEmail"
            label="Email Address"
            placeholder="Enter your email address"
            type="email"
            :rules="[
              val => !!val || 'Email is required',
              val => isValidEmail(val) || 'Please enter a valid email address'
            ]"
            outlined
            dense
          >
            <template v-slot:prepend>
              <q-icon name="email" />
            </template>
          </q-input>

          <div class="text-center q-mt-lg">
            <q-btn
              type="submit"
              color="primary"
              :loading="isSubmitting"
              :disable="!userName || !userEmail || !isValidEmail(userEmail)"
              size="lg"
              class="full-width"
            >
              <q-icon name="check" class="q-mr-sm" />
              Continue to Conversation
            </q-btn>
          </div>
        </q-form>
      </q-card-section>

      <q-card-actions align="center" class="q-pb-md">
        <q-btn
          flat
          color="grey"
          @click="handleCancel"
          :disable="isSubmitting"
        >
          Cancel
        </q-btn>
      </q-card-actions>
    </q-card>
  </q-dialog>
</template>

<script lang="ts">
import { defineComponent, ref, computed } from 'vue'
import { useQuasar } from 'quasar'
import { API_BASE_URL } from '../utils/apiBase'
import {
  QDialog,
  QCard,
  QCardSection,
  QCardActions,
  QIcon,
  QForm,
  QInput,
  QBtn
} from 'quasar'

export default defineComponent({
  name: 'DeepLinkUserModal',
  components: {
    QDialog,
    QCard,
    QCardSection,
    QCardActions,
    QIcon,
    QForm,
    QInput,
    QBtn
  },
  props: {
    modelValue: {
      type: Boolean,
      required: true
    },
    shareId: {
      type: String,
      required: true
    }
  },
  emits: ['update:modelValue', 'user-identified'],
  setup(props, { emit }) {
    const $q = useQuasar()
    
    const userName = ref('')
    const userEmail = ref('')
    const isSubmitting = ref(false)

    const showModal = computed({
      get: () => props.modelValue,
      set: (value) => emit('update:modelValue', value)
    })

    const isValidEmail = (email: string): boolean => {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
      return emailRegex.test(email)
    }

    const handleSubmit = async () => {
      if (!userName.value || !userEmail.value || !isValidEmail(userEmail.value)) {
        return
      }

      isSubmitting.value = true

      try {
        // Create a deep link user record
        const userData = {
          name: userName.value,
          email: userEmail.value,
          shareId: props.shareId,
          accessTime: new Date().toISOString(),
          userAgent: navigator.userAgent,
          ipAddress: 'client-side', // Will be set by server
          isDeepLinkUser: true
        }

        // Save user to database via API
        const response = await fetch(`${API_BASE_URL}/deep-link-users`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(userData)
        })

        if (!response.ok) {
          throw new Error(`Failed to save user: ${response.statusText}`)
        }

        const result = await response.json()

        // Create actual session now that user has identified themselves
        try {
          const sessionResponse = await fetch(`${API_BASE_URL}/deep-link-session`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              shareId: props.shareId,
              userId: result.userId,
              userName: userName.value,
              userEmail: userEmail.value
            })
          })

          if (sessionResponse.ok) {
            console.log('✅ [Deep Link] Session created for identified user:', userName.value)
          }
        } catch (sessionError) {
          console.error('❌ [Deep Link] Error creating session for identified user:', sessionError)
        }

        // Emit user identified event with user data
        emit('user-identified', {
          name: userName.value,
          email: userEmail.value,
          userId: result.userId,
          shareId: props.shareId
        })

        // Show success notification
        $q.notify({
          type: 'positive',
          message: `Welcome, ${userName.value}! Loading your conversation...`,
          timeout: 3000
        })

        // Close modal
        showModal.value = false

      } catch (error) {
        console.error('❌ Error saving deep link user:', error)
        $q.notify({
          type: 'negative',
          message: `Failed to save user information: ${error.message}`,
          timeout: 5000
        })
      } finally {
        isSubmitting.value = false
      }
    }

    const handleCancel = () => {
      if (!isSubmitting.value) {
        showModal.value = false
        // Redirect to home page or show message
        window.location.href = '/'
      }
    }

    return {
      userName,
      userEmail,
      isSubmitting,
      showModal,
      isValidEmail,
      handleSubmit,
      handleCancel
    }
  }
})
</script>

<style scoped>
.deep-link-user-modal {
  min-width: 400px;
  max-width: 500px;
}

.deep-link-user-modal .q-card-section {
  padding: 24px;
}

.deep-link-user-modal h4 {
  margin: 0;
  color: var(--q-primary);
  font-weight: 600;
}

.deep-link-user-modal .text-caption {
  line-height: 1.4;
}

.deep-link-user-modal .q-btn {
  padding: 12px 24px;
  font-weight: 500;
}
</style>
