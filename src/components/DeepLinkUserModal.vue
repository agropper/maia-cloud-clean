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

  <!-- Email Choice Modal -->
  <q-dialog v-model="showEmailChoiceModal" persistent>
    <q-card class="email-choice-modal">
      <q-card-section class="text-center">
        <q-icon name="email" size="3rem" color="warning" />
        <h4 class="q-mt-md q-mb-sm">Email Address Mismatch</h4>
        <p class="text-body1 q-mb-md">
          A user with the name "{{ emailChoiceData?.existingUser?.name }}" already exists with a different email address.
        </p>
        <p class="text-caption text-grey-6 q-mb-lg">
          Please choose which email address you'd like to use:
        </p>
      </q-card-section>

      <q-card-section>
        <div class="q-gutter-md">
          <!-- Existing Email Option -->
          <q-card 
            class="email-option-card cursor-pointer"
            @click="handleEmailChoice('existing')"
            :class="{ 'selected': false }"
          >
            <q-card-section class="q-pa-md">
              <div class="row items-center">
                <q-icon name="person" size="2rem" color="primary" class="q-mr-md" />
                <div class="col">
                  <div class="text-h6">Use Existing Email</div>
                  <div class="text-body2 text-grey-6">{{ emailChoiceData?.existingUser?.email }}</div>
                </div>
                <q-icon name="check_circle" color="primary" size="1.5rem" />
              </div>
            </q-card-section>
          </q-card>

          <!-- New Email Option -->
          <q-card 
            class="email-option-card cursor-pointer"
            @click="handleEmailChoice('new')"
            :class="{ 'selected': false }"
          >
            <q-card-section class="q-pa-md">
              <div class="row items-center">
                <q-icon name="email" size="2rem" color="secondary" class="q-mr-md" />
                <div class="col">
                  <div class="text-h6">Use New Email</div>
                  <div class="text-body2 text-grey-6">{{ emailChoiceData?.newUser?.email }}</div>
                </div>
                <q-icon name="check_circle" color="secondary" size="1.5rem" />
              </div>
            </q-card-section>
          </q-card>
        </div>
      </q-card-section>

      <q-card-actions align="center" class="q-pb-lg">
        <q-btn
          flat
          color="grey"
          label="Cancel"
          @click="showEmailChoiceModal = false"
          :disable="isSubmitting"
        />
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
    const showEmailChoiceModal = ref(false)
    const emailChoiceData = ref(null)

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

        // Check if email choice is required
        if (result.requiresEmailChoice) {
          showEmailChoiceModal.value = true
          emailChoiceData.value = {
            existingUser: result.existingUser,
            newUser: result.newUser,
            shareId: props.shareId
          }
          isSubmitting.value = false
          return
        }

        // Proceed with normal flow
        await proceedWithUser(result)

      } catch (error) {
        console.error('❌ Error saving deep link user:', error)
        $q.notify({
          type: 'negative',
          message: `Failed to save user information: ${error.message}`,
          timeout: 5000
        })
        isSubmitting.value = false
      }
    }

    const proceedWithUser = async (result) => {
      try {
        // Create actual session now that user has identified themselves
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

        if (!sessionResponse.ok) {
          const errorText = await sessionResponse.text()
          throw new Error(`Session creation failed: ${sessionResponse.status} ${sessionResponse.statusText}`)
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
        console.error('❌ Error creating session:', error)
        $q.notify({
          type: 'negative',
          message: `Failed to create session: ${error.message}`,
          timeout: 5000
        })
      } finally {
        isSubmitting.value = false
      }
    }

    const handleEmailChoice = async (choice) => {
      if (!emailChoiceData.value) return

      isSubmitting.value = true

      try {
        const response = await fetch(`${API_BASE_URL}/deep-link-users/choose-email`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            choice,
            existingUserId: emailChoiceData.value.existingUser.userId,
            newEmail: emailChoiceData.value.newUser.email,
            shareId: emailChoiceData.value.shareId,
            accessTime: new Date().toISOString(),
            userAgent: navigator.userAgent,
            ipAddress: 'client-side'
          })
        })

        if (!response.ok) {
          throw new Error(`Failed to process email choice: ${response.statusText}`)
        }

        const result = await response.json()

        // Update the form with the chosen email
        if (choice === 'existing') {
          userEmail.value = emailChoiceData.value.existingUser.email
        } else {
          userEmail.value = emailChoiceData.value.newUser.email
        }

        // Close email choice modal
        showEmailChoiceModal.value = false
        emailChoiceData.value = null

        // Proceed with the chosen user
        await proceedWithUser(result)

      } catch (error) {
        console.error('❌ Error processing email choice:', error)
        $q.notify({
          type: 'negative',
          message: `Failed to process email choice: ${error.message}`,
          timeout: 5000
        })
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
      showEmailChoiceModal,
      emailChoiceData,
      isValidEmail,
      handleSubmit,
      handleEmailChoice,
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

.email-choice-modal {
  min-width: 500px;
  max-width: 600px;
}

.email-choice-modal .q-card-section {
  padding: 24px;
}

.email-option-card {
  border: 2px solid #e0e0e0;
  transition: all 0.3s ease;
}

.email-option-card:hover {
  border-color: #1976d2;
  box-shadow: 0 4px 8px rgba(0, 0, 0, 0.1);
}

.email-option-card.selected {
  border-color: #1976d2;
  background-color: #e3f2fd;
}
</style>
