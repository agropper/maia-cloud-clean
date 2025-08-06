<script lang="ts">
import { defineComponent, ref, watch } from "vue";
import { QFile, QIcon, QBtnToggle, QDialog, QCard, QCardSection, QCardActions, QBtn } from "quasar";
import { getSystemMessageType, pickFiles } from "../utils";
import { useChatState } from "../composables/useChatState";
import { useChatLogger } from "../composables/useChatLogger";
import { useTranscript } from "../composables/useTranscript";
import ChatArea from "./ChatArea.vue";
import BottomToolbar from "./BottomToolbar.vue";
import {
  showAuth,
  showJWT,
  saveToNosh,
  uploadFile,
} from "../composables/useAuthHandling";
import type { UploadedFile } from "../types";
import { sendQuery } from "../composables/useQuery";
import PopUp from "./PopUp.vue";
import SavedChatsDialog from "./SavedChatsDialog.vue";
import { useCouchDB, type SavedChat } from "../composables/useCouchDB";
import { API_BASE_URL } from "../utils/apiBase";
import AgentManagementDialog from "./AgentManagementDialog.vue";
import PasskeyAuthDialog from "./PasskeyAuthDialog.vue";

const AIoptions = [
  { label: "Personal Chat", value: `${API_BASE_URL}/personal-chat` },
  { label: "Anthropic", value: `${API_BASE_URL}/anthropic-chat` },
  { label: "Gemini", value: `${API_BASE_URL}/gemini-chat` },
  { label: "DeepSeek R1", value: `${API_BASE_URL}/deepseek-r1-chat` },
];

export default defineComponent({
  name: "ChatPrompt",
  components: {
    BottomToolbar,
    QFile,
    QIcon,
    PopUp,
    ChatArea,
    QBtnToggle,
    SavedChatsDialog,
    AgentManagementDialog,
    PasskeyAuthDialog,
    QDialog,
    QCard,
    QCardSection,
    QCardActions,
    QBtn,
  },
  computed: {
    placeholderText() {
      const personalChatValue = this.AIoptions.find(
        (option) => option.label === "Personal Chat"
      )?.value;
      if (
        this.appState.chatHistory.length === 0 &&
        this.appState.selectedAI === personalChatValue
      ) {
        return "Click Send for patient summary";
      }
      return `Message ${this.AIoptions.find((option) => option.value === this.appState.selectedAI)?.label}`;
    },
    aiOption() {
      return this.AIoptions.filter(
        (option) => option.value === this.appState.selectedAI
      )
        ? this.AIoptions.filter(
            (option) => option.value === this.appState.selectedAI
          )
        : [this.AIoptions[0]];
    },
  },
  setup() {
    const { appState, writeMessage, clearLocalStorageKeys, clearChat } = useChatState();
    const { logMessage, logContextSwitch, logSystemEvent, setTimelineChunks } =
      useChatLogger();
    const { generateTranscript } = useTranscript();
    const { saveChat } = useCouchDB();
    const localStorageKey = "noshuri";
    const popupRef = ref<InstanceType<typeof PopUp> | null>(null);
    const showSavedChatsDialog = ref(false);
    const showAgentManagementDialog = ref(false);
    const showPasskeyAuthDialog = ref(false);
    const currentAgent = ref<any>(null);
    const agentWarning = ref<string>("");
    const currentUser = ref<any>(null);
    const inactivityTimer = ref<NodeJS.Timeout | null>(null);
    const lastActivity = ref<number>(Date.now());
    // Removed unused lastUnprotectedKB variable
    // Removed unused isInitialLoad variable
    const isAgentLoading = ref<boolean>(true); // New: Track agent loading state
    const isCleaningUp = ref<boolean>(false); // New: Track cleanup state to prevent auto-connect
    const showNoKBWarning = ref<boolean>(false); // New: Show warning when no KB is connected

    // Auto sign-out after 5 minutes of inactivity
    const resetInactivityTimer = () => {
      lastActivity.value = Date.now();
      
      if (inactivityTimer.value) {
        clearTimeout(inactivityTimer.value);
      }
      
      if (currentUser.value) {
        inactivityTimer.value = setTimeout(() => {
          // Auto sign-out due to inactivity
          handleSignOut();
        }, 5 * 60 * 1000); // 5 minutes
      }
    };

    // Track user activity
    const trackActivity = () => {
      resetInactivityTimer();
    };

    // Clear KB connections for expired sessions
    const clearExpiredSessionKBs = async () => {
      try {
        console.log("🔍 Clearing KB connections for expired session");
        
        // Use the current agent data instead of fetching again
        if (currentAgent.value && currentAgent.value.knowledgeBases && currentAgent.value.knowledgeBases.length > 0) {
          console.log(`🔍 Found ${currentAgent.value.knowledgeBases.length} KBs connected to expired session`);
          
          // Disconnect all KBs from the agent
          for (const kb of currentAgent.value.knowledgeBases as any[]) {
            console.log(`🔍 Disconnecting KB: ${kb.name} (${kb.uuid})`);
            
            const disconnectResponse = await fetch(`${API_BASE_URL}/user-session/disconnect-kb`, {
              method: 'DELETE',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                userId: 'expired',
                kbUuid: kb.uuid
              })
            });
            
            if (disconnectResponse.ok) {
              console.log(`✅ Disconnected KB: ${kb.name}`);
            } else {
              console.warn(`⚠️ Failed to disconnect KB: ${kb.name}`);
            }
          }
          
          console.log("✅ Cleared all KB connections for expired session");
        } else {
          console.log("🔍 No KBs found to disconnect");
        }
      } catch (error) {
        console.error("❌ Error clearing expired session KBs:", error);
      }
    };

    // Auto-connect appropriate KB for unknown users
    const autoConnectAppropriateKB = async (agentId: string) => {
      try {
        // Get available knowledge bases
        const kbResponse = await fetch(`${API_BASE_URL}/knowledge-bases`);
        if (!kbResponse.ok) {
          console.warn("⚠️ Failed to get available KBs for auto-connect");
          return;
        }
        
        const kbData = await kbResponse.json();
        const availableKBs = kbData.knowledge_bases || [];
        
        // Get last connected unprotected KB from session storage
        const lastConnectedKB = sessionStorage.getItem('maia_last_unprotected_kb');
        
        let kbToConnect = null;
        
        // First, try to find the last connected unprotected KB
        if (lastConnectedKB) {
          kbToConnect = availableKBs.find((kb: any) => kb.id === lastConnectedKB && !kb.isProtected);
          if (kbToConnect) {
            console.log(`✅ Auto-connected last used unprotected KB: ${kbToConnect.name} (${kbToConnect.id})`);
          }
        }
        
        // If no last connected KB or it's not available, pick the first unprotected KB
        if (!kbToConnect) {
          kbToConnect = availableKBs.find((kb: any) => !kb.isProtected);
          if (kbToConnect) {
            console.log(`✅ Auto-connected first available unprotected KB: ${kbToConnect.name} (${kbToConnect.id})`);
          }
        }
        
        if (kbToConnect) {
          // Store this as the last connected unprotected KB
          sessionStorage.setItem('maia_last_unprotected_kb', kbToConnect.id);
          
          // Connect the KB to the agent
          const connectResponse = await fetch(`${API_BASE_URL}/user-session/connect-kb`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              userId: 'unknown',
              kbUuid: kbToConnect.id,
              kbName: kbToConnect.name,
              isProtected: false,
              owner: null
            })
          });
          
          if (connectResponse.ok) {
            console.log("✅ Successfully auto-connected KB for unknown user");
            // Refresh agent data to show the connected KB
            await fetchCurrentAgent();
          } else {
            console.warn("⚠️ Failed to auto-connect KB");
          }
        } else {
          console.warn("⚠️ No unprotected KBs available for auto-connect");
        }
      } catch (error) {
        console.error("❌ Error auto-connecting KB:", error);
      }
    };

    // Simple access control - check if user can access current KBs
    const checkAccessControl = () => {
      const connectedKBs = currentAgent.value?.knowledgeBases || [];
      
      // Check if any connected KB is protected and user is not authenticated
      const protectedKB = connectedKBs.find((kb: any) => kb.isProtected);
      if (protectedKB && !currentUser.value) {
        // Protected KB detected, user not signed in
        showPasskeyAuthDialog.value = true;
        return false;
      }
      
      return true;
    };

    // Check for existing user session on component mount
    const checkExistingSession = async () => {
      const sessionData = sessionStorage.getItem('maia_user_session');
      if (sessionData) {
        try {
          const userData = JSON.parse(sessionData);
          const sessionTime = userData.sessionTime || 0;
          const now = Date.now();
          
          // Check if session is still valid (within 5 minutes)
          if (now - sessionTime < 5 * 60 * 1000) {
            // Restoring user session
            currentUser.value = userData;
            resetInactivityTimer();
          } else {
            // Session expired, clearing
            console.log("🔍 Session expired, clearing user session and chat history");
            sessionStorage.removeItem('maia_user_session');
            currentUser.value = null;
            clearChat(); // Clear chat history for expired session
          }
        } catch (error) {
          console.warn("⚠️ Failed to parse session data:", error);
          sessionStorage.removeItem('maia_user_session');
          currentUser.value = null;
        }
      }
    };

    // Fetch current agent information from DO API (single source of truth)
    const fetchCurrentAgent = async () => {
      try {
        isAgentLoading.value = true; // Start loading
        
        const response = await fetch(`${API_BASE_URL}/current-agent`);
        const data = await response.json();

        if (data.agent) {
          currentAgent.value = data.agent;
          // Agent loaded successfully

          // Handle warnings from the API
          if (data.warning) {
            agentWarning.value = data.warning;
          } else {
            agentWarning.value = "";
          }
          
          // Check access control after agent data is loaded
          checkAccessControl();
        } else {
          currentAgent.value = null;
          // No agent configured
        }
      } catch (error) {
        console.error("❌ Error fetching current agent:", error);
        currentAgent.value = null;
      } finally {
        isAgentLoading.value = false; // End loading
      }
    };

    // Stable initialization - wait for user state to settle before loading agent
    const initializeStableState = async () => {
      // Start with loading state
      isAgentLoading.value = true;
      
      // First, check for existing session
      await checkExistingSession();
      
      // Wait a moment for user state to settle
      await new Promise(resolve => setTimeout(resolve, 100));
      
      // Now fetch agent data with stable user state
      await fetchCurrentAgent();
      
      // After agent is loaded, check if we need to clear expired session KBs
      if (!currentUser.value && currentAgent.value?.knowledgeBases?.length > 0) {
        console.log("🔍 No authenticated user but KBs are connected - clearing expired session KBs");
        isCleaningUp.value = true; // Prevent auto-connect during cleanup
        await clearExpiredSessionKBs();
        // Refresh agent data after cleanup
        await fetchCurrentAgent();
        isCleaningUp.value = false; // Re-enable auto-connect
      }
      
      // After cleanup (if any), check if we need to auto-connect for unknown users
      if (!currentUser.value && currentAgent.value?.knowledgeBases?.length === 0 && !showPasskeyAuthDialog.value && !isCleaningUp.value) {
        console.log("🔍 Agent has no KBs and user is unknown - auto-connecting appropriate KB");
        await autoConnectAppropriateKB(currentAgent.value.id);
        // Refresh agent data after auto-connect
        await fetchCurrentAgent();
      }
    };
    
    // Initialize with stable state
    initializeStableState();

    // Method to refresh agent data (called from AgentManagementDialog)
    const refreshAgentData = async () => {
      await fetchCurrentAgent();
    };

    const showPopup = () => {
      if (popupRef.value && popupRef.value.openPopup) {
        popupRef.value.openPopup();
      }
    };

    const triggerAgentManagement = () => {
      showAgentManagementDialog.value = true;
    };

    const handleAgentUpdated = (agentInfo: any) => {
      if (agentInfo) {
        // Update the current agent with the new information
        currentAgent.value = agentInfo;
        // Agent updated

        // Update the AI options to use the new agent endpoint if available
        const personalChatOption = AIoptions.find(
          (option) => option.label === "Personal Chat"
        );
        if (personalChatOption && agentInfo.endpoint) {
          personalChatOption.value = agentInfo.endpoint;
        }
      } else {
        currentAgent.value = null;
        // Agent cleared
      }
    };

    const handleManageAgent = () => {
      showAgentManagementDialog.value = true;
    };

    const handleUserAuthenticated = async (userData: any) => {
      // Clear chat history when user changes to prevent data mixing
      console.log("🔍 User authenticated - clearing chat history to prevent data mixing");
      clearChat();
      
      currentUser.value = userData;
      // User authenticated

      // Save user session to sessionStorage
      const sessionData = {
        ...userData,
        sessionTime: Date.now()
      };
      sessionStorage.setItem('maia_user_session', JSON.stringify(sessionData));

      // Start inactivity timer for authenticated user
      resetInactivityTimer();

      // Set the current agent for authenticated users if not already set
      if (userData?.userId) {
        try {
          const response = await fetch(`${API_BASE_URL}/current-agent`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              agentId: "16c9edf6-2dee-11f0-bf8f-4e013e2ddde4", // Default agent
              userId: userData.userId
            }),
          });
          
          if (response.ok) {
            // Auto-set current agent for authenticated user
          }
        } catch (error) {
          console.error("Failed to auto-set current agent:", error);
        }
      }

      // Refresh agent data to get user-specific state
      await fetchCurrentAgent();

      // Force a reactive update by triggering a re-render
      // This ensures the UI updates immediately
    };

    const handleSignIn = () => {
      // Sign-in requested
      // Open a dedicated sign-in dialog instead of Agent Management
      showPasskeyAuthDialog.value = true;
    };

    const handleSignOut = async () => {
      // Sign-out requested
      
      // Clear chat history when user changes to prevent data mixing
      console.log("🔍 User signed out - clearing chat history to prevent data mixing");
      clearChat();
      
      currentUser.value = null;
      
      // Clear session storage
      sessionStorage.removeItem('maia_user_session');
      
      // Clear inactivity timer
      if (inactivityTimer.value) {
        clearTimeout(inactivityTimer.value);
        inactivityTimer.value = null;
      }
      
      // Clear KB connections for signed-out user
      await clearExpiredSessionKBs();
      
      // Refresh agent data to get global state
      await fetchCurrentAgent();

      // Check if no KBs are connected after sign-out
      if (currentAgent.value?.knowledgeBases?.length === 0) {
        showNoKBWarning.value = true;
        setTimeout(() => {
          showNoKBWarning.value = false;
        }, 5000); // Hide after 5 seconds
      }
    };

    const handleSignInCancelled = async () => {
      // Sign-in cancelled
      showPasskeyAuthDialog.value = false;
      
      // Refresh agent data to get current state
      await fetchCurrentAgent();
    };

    // Debug logging removed for cleaner console output

    const editMessage = (idx: number) => {
      appState.editBox.push(idx);
      logSystemEvent("Message edit initiated", { messageIndex: idx }, appState);
    };

    const triggerAuth = () => {
      showAuth(appState, writeMessage);
      logSystemEvent("Authentication triggered", {}, appState);
    };

    const triggerJWT = (jwt: string) => {
      showJWT(jwt, writeMessage, appState, closeSession, showPopup);
      logSystemEvent("JWT provided", { jwt }, appState);
    };

    const triggerSaveToNosh = async () => {
      await saveToNosh(appState, writeMessage, showPopup, closeSession);
      logSystemEvent("Saved to NOSH", {}, appState);
    };

    const triggerSaveToCouchDB = async () => {
      try {
        const userId = currentUser.value?.userId;
        const result = await saveChat(
          appState.chatHistory,
          appState.uploadedFiles,
          'demo_patient_001',
          userId
        );
        console.log("🔍 saveChat result:", result);
        writeMessage(result.message, "success");
        logSystemEvent("Saved to CouchDB", { chatId: result.chatId }, appState);
      } catch (error) {
        console.error("🔍 Save to CouchDB error:", error);
        writeMessage("Failed to save chat to CouchDB", "error");
        logSystemEvent(
          "Save to CouchDB failed",
          { error: error instanceof Error ? error.message : "Unknown error" },
          appState
        );
      }
    };

    const triggerLoadSavedChats = () => {
      console.log("🔍 triggerLoadSavedChats called");
      showSavedChatsDialog.value = true;
      logSystemEvent("Load saved chats dialog opened", {}, appState);
    };

    const handleChatSelected = (chat: SavedChat) => {
      appState.chatHistory = chat.chatHistory;
      appState.uploadedFiles = chat.uploadedFiles;
      writeMessage(
        `Loaded chat from ${new Date(chat.createdAt).toLocaleDateString()}`,
        "success"
      );
      logSystemEvent("Chat loaded from CouchDB", { chatId: chat.id }, appState);
    };

    const triggerSendQuery = async () => {
      // If Personal Chat is selected and chatHistory is empty, only use the default if the input is empty or matches the default
      const personalChatValue = AIoptions.find(
        (option) => option.label === "Personal Chat"
      )?.value;
      const defaultPrompt = "Show patient summary";
      if (
        appState.selectedAI === personalChatValue &&
        appState.chatHistory.length === 0
      ) {
        // If the user has typed something, use that instead of the default
        if (
          !appState.currentQuery ||
          appState.currentQuery.trim() === "" ||
          appState.currentQuery.trim() === defaultPrompt
        ) {
          appState.currentQuery = defaultPrompt;
        }
        // Otherwise, use what the user typed (do nothing)
      }

      try {
        appState.isLoading = true;
        const newChatHistory = await sendQuery(
          appState.selectedAI,
          appState.chatHistory,
          appState
        );
        appState.chatHistory = newChatHistory;
        appState.currentQuery = "";
        appState.isLoading = false;
      } catch (error) {
        console.error("Query failed:", error);
        writeMessage("Failed to send query", "error");
        appState.isLoading = false;
      }

      logMessage({
        role: "user",
        content: `Sent query to ${appState.selectedAI}`,
      });
    };

    const triggerUploadFile = async (file: File) => {
      await uploadFile(file, appState, writeMessage);
      logSystemEvent("File uploaded", { fileName: file.name }, appState);
    };

    const handleFileUpload = (event: Event) => {
      const files = (event.target as HTMLInputElement).files;
      if (files && files.length > 0) {
        triggerUploadFile(files[0]);
      }
    };

    const saveMessage = (idx: number, content: string) => {
      appState.chatHistory[idx].content = content;
      const index = appState.editBox.indexOf(idx);
      if (index > -1) {
        appState.editBox.splice(index, 1);
      }
      logMessage({
        role: "user",
        content: `Saved message at index ${idx}`,
      });
    };

    const saveToFile = () => {
      const transcriptContent = generateTranscript(appState, true);
      const blob = new Blob([transcriptContent], { type: "text/markdown" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "transcript.md";
      a.click();
      URL.revokeObjectURL(url);
      logSystemEvent("Transcript saved to file", {}, appState);
    };

    const closeNoSave = () => {
      appState.chatHistory = [];
      appState.isModal = false;
      closeSession();
      logSystemEvent("Session closed without saving", {}, appState);
    };

    const closeSession = () => {
      appState.isAuthorized = false;
      localStorage.removeItem("gnap");
      sessionStorage.removeItem(localStorageKey);
      window.close();
      logSystemEvent("Session closed", {}, appState);
    };

    const viewFile = (file: UploadedFile) => {
      appState.popupContent = file.content;
      appState.popupContentFunction = () => {
        appState.popupContent = "";
        appState.popupContentFunction = () => {};
      };
      showPopup();
      logSystemEvent("File viewed", { fileName: file.name }, appState);
    };

    // Call this to initialize timeline chunks, assuming you have them in `appState.timelineChunks`
    setTimelineChunks(appState.timelineChunks, appState);

    return {
      appState,
      writeMessage,
      localStorageKey,
      popupRef,
      showPopup,
      editMessage,
      triggerAuth,
      triggerJWT,
      triggerSaveToNosh,
      triggerSaveToCouchDB,
      triggerSendQuery,
      triggerUploadFile,
      handleFileUpload,
      saveMessage,
      saveToFile,
      closeNoSave,
      closeSession,
      clearLocalStorageKeys,
      getSystemMessageType,
      pickFiles,
      viewFile,
      triggerLoadSavedChats,
      handleChatSelected,
      showSavedChatsDialog,
      AIoptions,
      triggerAgentManagement,
      handleAgentUpdated,
      showAgentManagementDialog,
      currentAgent,
      agentWarning,
      currentUser,
      handleManageAgent,
      handleUserAuthenticated,
      refreshAgentData,
      handleSignIn,
      handleSignOut,
      handleSignInCancelled,
      trackActivity,
      resetInactivityTimer,
      checkExistingSession,
      clearExpiredSessionKBs,
      autoConnectAppropriateKB,
      clearChat,
      showPasskeyAuthDialog,
      showNoKBWarning,
    };
  },
});
</script>

<template @mousemove="trackActivity" @keydown="trackActivity" @click="trackActivity">
  <!-- AI Selection Toggle -->
  <!--
  <q-btn-toggle
    v-if="appState.chatHistory.length === 0"
    v-model="appState.selectedAI"
    toggle-color="primary"
    :options="AIoptions"
  >
  </q-btn-toggle>
  <q-btn-toggle
    v-if="appState.chatHistory.length > 0"
    v-model="appState.selectedAI"
    color="primary"
    :options="aiOption"
  >
  </q-btn-toggle>
  -->

  <!-- File Upload -->
  <q-file
    v-model="appState.currentFile"
    filled
    counter
    multiple
    append
    @input="handleFileUpload"
  >
    <template v-slot:prepend>
      <q-icon name="attach_file"></q-icon>
    </template>
  </q-file>

  <!-- Chat Area Component -->
  <ChatArea
    :appState="appState"
    :AIoptions="AIoptions"
    @edit-message="editMessage"
    @save-message="saveMessage"
    @view-system-message="
      (content: string) => {
        appState.popupContent = content;
        showPopup();
      }
    "
    @view-file="viewFile"
    @save-to-file="saveToFile"
    @trigger-save-to-couchdb="triggerSaveToCouchDB"
    @close-no-save="closeNoSave"
    @get-system-message-type="getSystemMessageType"
    :currentAgent="currentAgent"
    :warning="agentWarning"
    :currentUser="currentUser"
    :isAgentLoading="isAgentLoading"
    @manage-agent="handleManageAgent"
    @sign-in="handleSignIn"
    @sign-out="handleSignOut"
  />

  <!-- Bottom Toolbar -->
  <BottomToolbar
    :appState="appState"
    :pickFiles="pickFiles"
    :triggerSendQuery="triggerSendQuery"
    :triggerAuth="triggerAuth"
    :triggerJWT="triggerJWT"
    :triggerLoadSavedChats="triggerLoadSavedChats"
    :placeholderText="placeholderText"
    :clearLocalStorageKeys="clearLocalStorageKeys"
    :AIoptions="AIoptions"
    :triggerAgentManagement="triggerAgentManagement"
  />

  <!-- Popup for displaying system messages -->
  <PopUp
    ref="popupRef"
    :appState="appState"
    :content="appState.popupContent"
    button-text="Close"
    :on-close="() => appState.popupContentFunction()"
  />

  <!-- Saved Chats Dialog -->
  <SavedChatsDialog
    v-model="showSavedChatsDialog"
    :patientId="'demo_patient_001'"
    :currentUser="currentUser"
    @chat-selected="handleChatSelected"
  />

  <!-- Agent Management Dialog -->
  <AgentManagementDialog
    v-model="showAgentManagementDialog"
    :AIoptions="AIoptions"
    :uploadedFiles="appState.uploadedFiles"
    :currentUser="currentUser"
    :currentAgent="currentAgent"
    @agent-updated="handleAgentUpdated"
    @refresh-agent-data="refreshAgentData"
    @user-authenticated="handleUserAuthenticated"
  />

  <!-- Sign In Dialog -->
  <PasskeyAuthDialog
    v-model="showPasskeyAuthDialog"
    @authenticated="handleUserAuthenticated"
    @cancelled="handleSignInCancelled"
  />

  <!-- No KB Warning Modal -->
  <q-dialog v-model="showNoKBWarning" persistent>
    <q-card>
      <q-card-section>
        <div class="text-h6">No Knowledge Base Connected</div>
      </q-card-section>
      <q-card-section>
        <p>You have signed out and no knowledge base is currently connected. Please sign in again to access your data.</p>
      </q-card-section>
      <q-card-actions align="right">
        <q-btn flat label="OK" color="primary" v-close-popup />
      </q-card-actions>
    </q-card>
  </q-dialog>
</template>
