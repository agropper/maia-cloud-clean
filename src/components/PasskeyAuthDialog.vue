<template>
  <q-dialog v-model="showDialog" persistent>
    <q-card style="min-width: 500px">
      <q-card-section class="row items-center q-pb-none">
        <div class="text-h6">🔐 Passkey Authentication</div>
        <q-space />
        <q-btn icon="close" flat round dense @click="handleClose" />
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
            ref="userIdInputRef"
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

        <!-- Error State -->
        <div v-if="currentStep === 'error'" class="q-gutter-md">
          <div class="text-center q-pa-md">
            <q-icon name="error" size="3rem" color="negative" class="q-mb-md" />
            <div class="text-h6">Authentication Failed</div>
            <div class="text-body2 q-mt-sm">{{ errorMessage }}</div>
          </div>

          <q-btn
            label="Try Again"
            color="primary"
            class="full-width"
            @click="
              () => {
                currentStep = 'userId';
                userId = '';
                userIdError = false;
                userIdErrorMessage = '';
                errorMessage = '';
              }
            "
          />
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
        console.log("🔍 PasskeyAuthDialog showDialog get:", props.modelValue);
        return props.modelValue;
      },
      set: (value) => {
        console.log("🔍 PasskeyAuthDialog showDialog set:", value);
        emit("update:modelValue", value);
      },
    });

    const currentStep = ref<
      "choose" | "userId" | "register" | "authenticate" | "success" | "error"
    >("choose");

    // Debug current step changes and set focus
    watch(currentStep, (newStep) => {
      console.log("🔍 currentStep changed to:", newStep);
      if (newStep === 'userId') {
        // Set focus to user ID input after a short delay to ensure DOM is ready
        setTimeout(() => {
          if (userIdInputRef.value) {
            userIdInputRef.value.focus();
          }
        }, 100);
      }
    });
    const userId = ref("");
    const userIdError = ref(false);
    const userIdErrorMessage = ref("");
    const checkingUserId = ref(false);
    const isRegistering = ref(false);
    const isAuthenticating = ref(false);
    const errorMessage = ref("");
    const isCreatingNewUser = ref(false);
    const registrationUserData = ref(null);
    const userIdInputRef = ref(null);

    const startSignIn = () => {
      console.log("🔍 startSignIn called");
      isCreatingNewUser.value = false;
      currentStep.value = "userId";
      console.log("🔍 isCreatingNewUser set to:", isCreatingNewUser.value);
    };

    const startRegistration = () => {
      console.log("🔍 startRegistration called");
      isCreatingNewUser.value = true;
      currentStep.value = "userId";
      console.log("🔍 isCreatingNewUser set to:", isCreatingNewUser.value);
    };

    const checkUserIdAvailability = async () => {
      console.log("🔍 checkUserIdAvailability called");
      console.log("🔍 currentStep:", currentStep.value);
      console.log("🔍 isCreatingNewUser:", isCreatingNewUser.value);

      if (!userId.value || userId.value.length < 3) {
        userIdError.value = true;
        userIdErrorMessage.value = "User ID must be at least 3 characters";
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
        console.log("🔍 Availability check result:", result);

        if (isCreatingNewUser.value) {
          // Creating new user - user ID should be available
          if (result.available) {
            userIdError.value = false;
            userIdErrorMessage.value = "";
            console.log("🔍 Going to registration step");
            currentStep.value = "register";
          } else {
            userIdError.value = true;
            userIdErrorMessage.value =
              "User ID already exists. Please choose a different one.";
          }
        } else {
          // Signing in - user ID should exist
          if (!result.available) {
            userIdError.value = false;
            userIdErrorMessage.value = "";
            console.log("🔍 Going to authentication step");
            currentStep.value = "authenticate";
          } else {
            userIdError.value = true;
            userIdErrorMessage.value =
              "User ID not found. Please create a new account or check your spelling.";
            // Don't clear the user ID field - let user edit it
          }
        }
      } catch (error) {
        userIdError.value = true;
        userIdErrorMessage.value = "Failed to check user ID availability";
      } finally {
        checkingUserId.value = false;
      }
    };

    // Auto-check availability when user ID changes
    const onUserIdChange = async () => {
      if (userId.value && userId.value.length >= 3) {
        // Debounce the check
        setTimeout(async () => {
          if (userId.value && userId.value.length >= 3) {
            await checkUserIdAvailabilityOnly();
          }
        }, 500);
      }
    };

    // Update the flag when user starts typing
    const onUserIdInput = () => {
      // Don't change the flag when user starts typing
      // The flag should only be set by the button clicks (startSignIn/startRegistration)
      console.log(
        "🔍 onUserIdInput - isCreatingNewUser remains:",
        isCreatingNewUser.value
      );
    };

    // Check availability without proceeding to next step
    const checkUserIdAvailabilityOnly = async () => {
      if (!userId.value || userId.value.length < 3) {
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
        console.log("🔍 checkUserIdAvailabilityOnly result:", result);

        // Don't show errors in this function - just check availability
        // Errors will be shown in the main checkUserIdAvailability function
      } catch (error) {
        console.error("🔍 checkUserIdAvailabilityOnly error:", error);
      } finally {
        checkingUserId.value = false;
      }
    };

    const registerPasskey = async () => {
      console.log("🔍 registerPasskey called");
      isRegistering.value = true;
      try {
        // Step 1: Generate registration options
        console.log("🔍 Step 1: Generating registration options");
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
          console.log(
            "🔍 Registration options failed:",
            optionsResponse.status
          );
          throw new Error("Failed to generate registration options");
        }

        const options = await optionsResponse.json();
        console.log("🔍 Registration options received:", options);

        // Step 2: Create credentials using WebAuthn API
        console.log("🔍 Step 2: Creating WebAuthn credentials");

        // Convert challenge from base64url to ArrayBuffer
        // First convert base64url to base64, then decode with proper padding
        let base64Challenge = options.challenge
          .replace(/-/g, "+")
          .replace(/_/g, "/");
        // Add padding if needed
        while (base64Challenge.length % 4 !== 0) {
          base64Challenge += "=";
        }
        const challengeArrayBuffer = Uint8Array.from(
          atob(base64Challenge),
          (c) => c.charCodeAt(0)
        ).buffer;

        const webAuthnOptions = {
          ...options,
          challenge: challengeArrayBuffer,
          user: {
            ...options.user,
            id: (() => {
              // Convert user ID string to ArrayBuffer
              const encoder = new TextEncoder();
              return encoder.encode(options.user.id).buffer;
            })(),
          },
        };

        console.log(
          "🔍 WebAuthn options with converted buffers:",
          webAuthnOptions
        );

        const credential = await navigator.credentials.create({
          publicKey: webAuthnOptions,
        });
        console.log("🔍 WebAuthn credentials created:", credential);

        // Step 3: Verify registration
        console.log("🔍 Step 3: Verifying registration");
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
        console.log("🔍 Verification result:", result);

        if (result.success) {
          console.log("🔍 Registration successful, going to success step");
          // Store the user data for later use
          registrationUserData.value = result.user;
          currentStep.value = "success";
        } else {
          console.log("🔍 Registration failed, going to error step");
          currentStep.value = "error";
          errorMessage.value = result.error || "Registration failed";
        }
      } catch (error) {
        console.log("🔍 Registration error:", error);
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
        console.log("🔍 Step 1: Generating authentication options");
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
          console.error(
            "🔍 Authentication options failed:",
            optionsResponse.status,
            errorText
          );
          throw new Error(
            `Failed to generate authentication options: ${optionsResponse.status}`
          );
        }

        const options = await optionsResponse.json();
        console.log("🔍 Authentication options received:", options);

        // Step 2: Convert base64 credential IDs and challenge to ArrayBuffer
        const convertedOptions = {
          ...options,
          challenge: Uint8Array.from(
            atob(options.challenge.replace(/-/g, "+").replace(/_/g, "/")),
            (c: string) => c.charCodeAt(0)
          ).buffer,
          allowCredentials: options.allowCredentials.map((cred: any) => ({
            ...cred,
            id: Uint8Array.from(
              atob(cred.id.replace(/-/g, "+").replace(/_/g, "/")),
              (c: string) => c.charCodeAt(0)
            ).buffer,
          })),
        };

        console.log("🔍 Converted options:", convertedOptions);

        // Step 3: Get credentials using WebAuthn API
        console.log("🔍 Step 2: Getting WebAuthn credentials");
        const credential = await navigator.credentials.get({
          publicKey: convertedOptions,
        });
        console.log("🔍 WebAuthn credentials retrieved:", credential);

        // Step 3: Verify authentication
        console.log("🔍 Step 3: Verifying authentication");
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
        console.log("🔍 Verification result:", result);

        if (result.success) {
          // Store the user data for later use
          registrationUserData.value = result.user;
          currentStep.value = "success";
        } else {
          currentStep.value = "error";
          errorMessage.value = result.error || "Authentication failed";
        }
      } catch (error) {
        console.error("🔍 Authentication error:", error);
        currentStep.value = "error";
        errorMessage.value = `Authentication failed: ${error instanceof Error ? error.message : String(error)}`;
      } finally {
        isAuthenticating.value = false;
      }
    };

    const onSuccess = () => {
      console.log("🔍 onSuccess called with userId:", userId.value);

      // Use the stored user data if available, otherwise fall back to just userId
      const userData = registrationUserData.value || { userId: userId.value };
      emit("authenticated", userData);
      console.log("🔍 authenticated event emitted with data:", userData);

      showDialog.value = false;
      // Reset for next use
      currentStep.value = "choose";
      userId.value = "";
      userIdError.value = false;
      userIdErrorMessage.value = "";
      errorMessage.value = "";
      registrationUserData.value = null;
    };

    const handleClose = () => {
      console.log("🔍 PasskeyAuthDialog close button clicked");
      emit("cancelled");
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
      handleClose,
      isCreatingNewUser,
      userIdInputRef,
    };
  },
});
</script>
