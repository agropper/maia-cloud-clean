<template>
  <q-dialog v-model="showDialog" persistent>
    <q-card style="min-width: 500px">
      <q-card-section class="row items-center q-pb-none">
        <div class="text-h6">🔐 Passkey Authentication</div>
        <q-space />
        <q-btn icon="close" flat round dense v-close-popup />
      </q-card-section>

      <q-card-section>
        <!-- Step 1: Choose Authentication Method -->
        <div v-if="currentStep === 'choose'" class="q-gutter-md">
          <div class="text-subtitle2 q-mb-md">
            Choose your authentication method:
          </div>

          <q-btn
            label="Sign in with Passkey"
            color="primary"
            icon="login"
            class="full-width q-mb-md"
            @click="startSignIn"
          />

          <q-btn
            label="Create New Passkey"
            color="secondary"
            icon="person_add"
            class="full-width"
            @click="startRegistration"
          />
        </div>

        <!-- Step 2: User ID Input -->
        <div v-if="currentStep === 'userId'" class="q-gutter-md">
          <div class="text-subtitle2 q-mb-md">Enter your User ID:</div>

          <q-input
            v-model="userId"
            label="User ID"
            outlined
            :rules="[
              (val) => !!val || 'User ID is required',
              (val) =>
                val.length >= 3 || 'User ID must be at least 3 characters',
            ]"
            hint="Choose a unique user ID (minimum 3 characters) - checking availability automatically..."
            :error="userIdError"
            :error-message="userIdErrorMessage"
            @update:model-value="onUserIdChange"
            @input="onUserIdInput"
          />

          <div class="row q-gutter-sm q-mt-md">
            <q-btn
              label="Continue"
              color="primary"
              :loading="checkingUserId"
              :disable="userIdError || !userId || userId.length < 3"
              @click="checkUserIdAvailability()"
            />
            <q-btn
              label="Back"
              flat
              @click="
                () => {
                  currentStep = 'choose';
                  userId = '';
                  userIdError = false;
                  userIdErrorMessage = '';
                }
              "
            />
          </div>

          <!-- Error message display -->
          <div v-if="userIdError" class="q-mt-md">
            <div class="bg-red-1 text-red-8 q-pa-md rounded-borders">
              {{ userIdErrorMessage }}
            </div>
            <q-btn
              label="Clear Error"
              flat
              color="red"
              size="sm"
              class="q-mt-sm"
              @click="
                () => {
                  userIdError = false;
                  userIdErrorMessage = '';
                }
              "
            />
          </div>
        </div>

        <!-- Step 3: Passkey Registration -->
        <div v-if="currentStep === 'register'" class="q-gutter-md">
          <div class="text-subtitle2 q-mb-md">Create your passkey:</div>

          <div class="text-body2 q-mb-md">
            <strong>User ID:</strong> {{ userId }}<br />
            <strong>Domain:</strong> HIEofOne.org
          </div>

          <q-btn
            label="Create Passkey"
            color="primary"
            icon="fingerprint"
            class="full-width q-mb-md"
            :loading="isRegistering"
            @click="registerPasskey"
          />

          <q-btn label="Back" flat @click="currentStep = 'userId'" />
        </div>

        <!-- Step 4: Passkey Authentication -->
        <div v-if="currentStep === 'authenticate'" class="q-gutter-md">
          <div class="text-subtitle2 q-mb-md">Sign in with your passkey:</div>

          <div class="text-body2 q-mb-md">
            <strong>User ID:</strong> {{ userId }}
          </div>

          <q-btn
            label="Sign in with Passkey"
            color="primary"
            icon="fingerprint"
            class="full-width q-mb-md"
            :loading="isAuthenticating"
            @click="authenticatePasskey"
          />

          <q-btn label="Back" flat @click="currentStep = 'choose'" />
        </div>

        <!-- Step 5: Success -->
        <div v-if="currentStep === 'success'" class="q-gutter-md">
          <div class="text-center q-pa-md">
            <q-icon
              name="check_circle"
              size="3rem"
              color="positive"
              class="q-mb-md"
            />
            <div class="text-h6">Authentication Successful!</div>
            <div class="text-body2 q-mt-sm">
              Welcome, <strong>{{ userId }}</strong
              >!<br />
              You can now create knowledge bases when needed.
            </div>
          </div>

          <q-btn
            label="Done"
            color="primary"
            class="full-width"
            @click="onSuccess"
            :loading="false"
          />
          <div class="text-caption text-grey q-mt-xs">
            You can now close this dialog and return to the main interface
          </div>
        </div>

        <!-- Error Step -->
        <div v-if="currentStep === 'error'" class="q-gutter-md">
          <div class="text-subtitle2 q-mb-md text-red-8">
            ❌ Authentication Error
          </div>
          
          <div class="bg-red-1 text-red-8 q-pa-md rounded-borders">
            {{ errorMessage }}
          </div>

          <div class="row q-gutter-sm q-mt-md">
            <q-btn
              label="Try Again"
              color="primary"
              @click="
                () => {
                  currentStep = 'choose';
                  userId = '';
                  userIdError = false;
                  userIdErrorMessage = '';
                  errorMessage = '';
                  registrationUserData = null;
                }
              "
            />
            <q-btn
              label="Cancel"
              flat
              @click="
                () => {
                  showDialog = false;
                  currentStep = 'choose';
                  userId = '';
                  userIdError = false;
                  userIdErrorMessage = '';
                  errorMessage = '';
                  registrationUserData = null;
                }
              "
            />
          </div>
        </div>
      </q-card-section>
    </q-card>
  </q-dialog>
</template>

<script lang="ts">
import { defineComponent, ref, computed, watch } from "vue";
import {
  QDialog,
  QCard,
  QCardSection,
  QBtn,
  QInput,
  QIcon,
  QSpace,
} from "quasar";
import { startRegistration as startRegistrationWebAuthn, startAuthentication } from "@simplewebauthn/browser";
import { API_BASE_URL } from "../utils/apiBase";

export default defineComponent({
  name: "PasskeyAuthDialog",
  components: {
    QDialog,
    QCard,
    QCardSection,
    QBtn,
    QInput,
    QIcon,
    QSpace,
  },
  props: {
    modelValue: {
      type: Boolean,
      default: false,
    },
  },
  emits: ["update:modelValue", "authenticated", "cancelled"],
  setup(props, { emit }) {
    const showDialog = computed({
      get: () => {
        return props.modelValue;
      },
      set: (value) => {
        emit("update:modelValue", value);
      },
    });

    const currentStep = ref<
      "choose" | "userId" | "register" | "authenticate" | "success" | "error"
    >("choose");

    // Remove verbose step change logging
    const userId = ref("");
    const userIdError = ref(false);
    const userIdErrorMessage = ref("");
    const checkingUserId = ref(false);
    const isRegistering = ref(false);
    const isAuthenticating = ref(false);
    const errorMessage = ref("");
    const isCreatingNewUser = ref(false);
    const registrationUserData = ref(null);

    const startSignIn = () => {
      isCreatingNewUser.value = false;
      currentStep.value = "userId";
    };

    const startRegistration = () => {
      isCreatingNewUser.value = true;
      currentStep.value = "userId";
    };

    const checkUserIdAvailability = async () => {
      if (!userId.value || userId.value.length < 3) {
        userIdError.value = true;
        userIdErrorMessage.value = "User ID must be at least 3 characters";
        return;
      }

      // Prevent multiple simultaneous checks
      if (checkingUserId.value) {
        return;
      }

      checkingUserId.value = true;
      try {
        const response = await fetch(`${API_BASE_URL}/passkey/check-user`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ userId: userId.value }),
        });

        const result = await response.json();
        // Remove verbose logging - keep only essential info

        if (isCreatingNewUser.value) {
          // Creating new user - user ID should be available
          if (result.available) {
            userIdError.value = false;
            userIdErrorMessage.value = "";
            currentStep.value = "register";
          } else {
            userIdError.value = true;
            userIdErrorMessage.value =
              "User ID already exists. Please choose a different one.";
            // Stay on the same step, don't close dialog
          }
        } else {
          // Signing in - user ID should exist
          if (!result.available) {
            userIdError.value = false;
            userIdErrorMessage.value = "";
            currentStep.value = "authenticate";
          } else {
            userIdError.value = true;
            userIdErrorMessage.value =
              "User ID not found. Please create a new account or check your spelling.";
            // Stay on the same step, don't close dialog
            // Don't clear the user ID field - let user edit it
          }
        }
      } catch (error) {
        userIdError.value = true;
        userIdErrorMessage.value = "Failed to check user ID availability";
        // Stay on the same step, don't close dialog
      } finally {
        checkingUserId.value = false;
      }
    };

    // Check availability without proceeding to next step
    const checkUserIdAvailabilityOnly = async () => {
      if (!userId.value || userId.value.length < 3) {
        return;
      }

      // Prevent multiple simultaneous checks
      if (checkingUserId.value) {
        return;
      }

      checkingUserId.value = true;
      try {
        const response = await fetch(`${API_BASE_URL}/passkey/check-user`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ userId: userId.value }),
        });

        const result = await response.json();

        // Don't show errors in this function - just check availability
        // Errors will be shown in the main checkUserIdAvailability function
      } catch (error) {
        // Silent error handling for availability check
        // Remove verbose error logging
      } finally {
        checkingUserId.value = false;
      }
    };

    // Auto-check availability when user ID changes
    const onUserIdChange = async () => {
      if (userId.value && userId.value.length >= 3) {
        // Clear any existing errors when user starts typing
        userIdError.value = false;
        userIdErrorMessage.value = "";
        
        // Debounce the check
        setTimeout(async () => {
          if (userId.value && userId.value.length >= 3) {
            await checkUserIdAvailabilityOnly();
          }
        }, 500);
      } else {
        // Clear errors if user ID is too short
        userIdError.value = false;
        userIdErrorMessage.value = "";
      }
    };

    // Update the flag when user starts typing
    const onUserIdInput = () => {
      // Clear errors when user starts typing
      if (userIdError.value) {
        userIdError.value = false;
        userIdErrorMessage.value = "";
      }
    };

    const registerPasskey = async () => {
      isRegistering.value = true;
      try {
        // Step 1: Generate registration options
        const optionsResponse = await fetch(
          `${API_BASE_URL}/passkey/register`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              userId: userId.value,
              displayName: userId.value,
              domain: "HIEofOne.org",
            }),
          }
        );

        if (!optionsResponse.ok) {
          throw new Error("Failed to generate registration options");
        }

        const options = await optionsResponse.json();

        // Step 2: Create credentials using SimpleWebAuthn v13
        const credential = await startRegistrationWebAuthn({ optionsJSON: options });

        // Step 3: Verify registration
        const verifyResponse = await fetch(
          `${API_BASE_URL}/passkey/register-verify`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              userId: userId.value,
              response: credential,
            }),
          }
        );

        const result = await verifyResponse.json();

        if (result.success) {
          // Store the user data for later use
          registrationUserData.value = result.user;
          currentStep.value = "success";
        } else {
          currentStep.value = "error";
          errorMessage.value = result.error || "Registration failed";
        }
      } catch (error) {
        currentStep.value = "error";
        errorMessage.value = "Registration failed. Please try again.";
      } finally {
        isRegistering.value = false;
      }
    };

    const authenticatePasskey = async () => {
      isAuthenticating.value = true;
      try {
        // Step 1: Generate authentication options
        const optionsResponse = await fetch(
          `${API_BASE_URL}/passkey/authenticate`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({ userId: userId.value }),
          }
        );

        if (!optionsResponse.ok) {
          const errorText = await optionsResponse.text();
          throw new Error(
            `Failed to generate authentication options: ${optionsResponse.status}`
          );
        }

        const options = await optionsResponse.json();

        // Step 2: Use SimpleWebAuthn v13 for authentication
        const credential = await startAuthentication({ optionsJSON: options });

        // Step 3: Verify authentication
        const verifyResponse = await fetch(
          `${API_BASE_URL}/passkey/authenticate-verify`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              userId: userId.value,
              response: credential,
            }),
          }
        );

        const result = await verifyResponse.json();

        if (result.success) {
          // Store the user data for later use
          registrationUserData.value = result.user;
          currentStep.value = "success";
        } else {
          currentStep.value = "error";
          errorMessage.value = result.error || "Authentication failed";
        }
      } catch (error: unknown) {
        if (error instanceof Error) {
          // Check if it's a WebAuthn-specific error
          if (error.name === 'NotAllowedError') {
            errorMessage.value = "TouchID/FaceID not available. Please check your device settings or try a different authentication method.";
          } else {
            errorMessage.value = `Authentication failed: ${error.message}`;
          }
        } else {
          errorMessage.value = `Authentication failed: ${String(error)}`;
        }
        
        currentStep.value = "error";
      } finally {
        isAuthenticating.value = false;
      }
    };

    const onSuccess = () => {
      // Use the stored user data if available, otherwise fall back to just userId
      const userData = registrationUserData.value || { userId: userId.value };
      emit("authenticated", userData);

      showDialog.value = false;
      // Reset for next use
      currentStep.value = "choose";
      userId.value = "";
      userIdError.value = false;
      userIdErrorMessage.value = "";
      errorMessage.value = "";
      registrationUserData.value = null;
    };

    return {
      showDialog,
      currentStep,
      userId,
      userIdError,
      userIdErrorMessage,
      checkingUserId,
      isRegistering,
      isAuthenticating,
      errorMessage,
      startSignIn,
      startRegistration,
      checkUserIdAvailability,
      checkUserIdAvailabilityOnly,
      onUserIdChange,
      onUserIdInput,
      registerPasskey,
      authenticatePasskey,
      onSuccess,
      isCreatingNewUser,
      registrationUserData,
    };
  },
});
</script>
