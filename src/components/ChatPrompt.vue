<script lang="ts">
import { defineComponent, ref, watch, nextTick } from "vue";
import { QFile, QIcon, QBtnToggle } from "quasar";
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
import { useGroupChat } from "../composables/useGroupChat";
import { API_BASE_URL } from "../utils/apiBase";
import AgentManagementDialog from "./AgentManagementDialog.vue";
import PasskeyAuthDialog from "./PasskeyAuthDialog.vue";
import DeepLinkUserModal from "./DeepLinkUserModal.vue";

const AIoptions = [
  { label: "Personal Chat", value: `${API_BASE_URL}/personal-chat` },
  { label: "Anthropic", value: `${API_BASE_URL}/anthropic-chat` },
  { label: "Gemini", value: `${API_BASE_URL}/gemini-chat` },
  { label: "ChatGPT", value: `${API_BASE_URL}/chatgpt-chat` },
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
    DeepLinkUserModal,
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
    const { appState, writeMessage, clearLocalStorageKeys, setActiveQuestionName } = useChatState();
    const { logMessage, logContextSwitch, logSystemEvent, setTimelineChunks } =
      useChatLogger();
    const { generateTranscript } = useTranscript();
    const { saveChat } = useCouchDB();
    const { loadGroupChat } = useGroupChat();
    const localStorageKey = "noshuri";
    const popupRef = ref<InstanceType<typeof PopUp> | null>(null);
    const showSavedChatsDialog = ref(false);
    const showAgentManagementDialog = ref(false);
    const showPasskeyAuthDialog = ref(false);
    const showDeepLinkUserModal = ref(false);
    const currentAgent = ref<any>(null);
    const agentWarning = ref<string>("");
    const currentUser = ref<any>(null);
    const pendingShareId = ref<string | null>(null);

    // Handle deep link loading - only for actual deep link URLs
    const handleDeepLink = async () => {
      const path = window.location.pathname;
      
      // Only process if this is a deep link path (not root, not other paths)
      if (path.startsWith('/shared/')) {
        const shareIdMatch = path.match(/^\/shared\/([a-zA-Z0-9]{12})$/);
        
        if (shareIdMatch) {
          const shareId = shareIdMatch[1];
          console.log('🔗 Deep link detected:', shareId);
          
          // Store the share ID and show the user identification modal
          pendingShareId.value = shareId;
          showDeepLinkUserModal.value = true;
        } else {
          console.log('🔗 Invalid deep link format:', path);
        }
      } else {
        console.log('🔗 No deep link detected - normal server access');
      }
    };

    // Fetch current agent information on component mount
    const fetchCurrentAgent = async () => {
      try {
        const response = await fetch(`${API_BASE_URL}/current-agent`);
        const data = await response.json();

        if (data.agent) {
          currentAgent.value = data.agent;
          console.log(`🤖 Current agent loaded: ${data.agent.name}`);

          if (data.agent.knowledgeBase) {
            console.log(`📚 Current KB: ${data.agent.knowledgeBase.name}`);
          } else {
            console.log(`📚 No KB assigned`);
          }

          // Handle warnings from the API
          if (data.warning) {
            console.warn(data.warning);
            agentWarning.value = data.warning;
          } else {
            agentWarning.value = "";
          }
        } else {
          currentAgent.value = null;
          console.log("🤖 No agent configured");
        }
      } catch (error) {
        console.error("❌ Error fetching current agent:", error);
        currentAgent.value = null;
      }
    };

    // Check for existing session on component mount
    const checkExistingSession = async () => {
      try {
        console.log('🔍 [FRONTEND] Checking for existing session...');
        const response = await fetch(`${API_BASE_URL}/passkey/auth-status`);
        const data = await response.json();
        
        if (data.authenticated && data.user) {
          console.log('🔍 [FRONTEND] Found existing session for user:', data.user);
          currentUser.value = data.user;
        } else {
          console.log('🔍 [FRONTEND] No existing session found, setting to Unknown User');
          currentUser.value = { userId: 'Unknown User', displayName: 'Unknown User' };
        }
      } catch (error) {
        console.error('❌ Failed to check existing session:', error);
        // Fall back to Unknown User on error
        currentUser.value = { userId: 'Unknown User', displayName: 'Unknown User' };
      }
    };
    
    // Call checkExistingSession when component mounts
    checkExistingSession();
    
    // Call fetchCurrentAgent when component mounts
    fetchCurrentAgent();
    
    // Handle deep link loading on component mount
    handleDeepLink();

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

    // Handle deep link user identification
    const handleDeepLinkUserIdentified = async (userData: {
      name: string;
      email: string;
      userId: string;
      shareId: string;
    }) => {
      try {
        console.log('🔗 User identified for deep link:', userData);
        
        // Load the shared chat
        const { loadSharedChat } = useGroupChat();
        const groupChat = await loadSharedChat(userData.shareId);
        
        // Load the group chat data WITHOUT modifying existing user names
        // This preserves the original user labels in the chat history
        appState.chatHistory = groupChat.chatHistory;
        appState.uploadedFiles = groupChat.uploadedFiles;
        
        // Store the chat ID for future updates
        appState.currentChatId = groupChat.id;
        
        // Set current user to the identified user (this will update the Agent badge)
        currentUser.value = { 
          userId: userData.userId, 
          displayName: userData.name,
          email: userData.email,
          isDeepLinkUser: true
        };
        
        // Clear any existing query and active question (don't set active question name - it should use current user)
        appState.currentQuery = '';
        appState.activeQuestion.content = '';
        
        // Force a reactive update to ensure the Agent badge updates
        await nextTick();
        
        // Trigger agent refresh to ensure the Agent badge updates with new user
        await fetchCurrentAgent();
        
        writeMessage(`Welcome ${userData.name}! Loaded shared group chat from ${groupChat.currentUser}`, "success");
        console.log('✅ Shared chat loaded successfully for identified user:', userData.name);
        console.log('🔍 Current user set to:', currentUser.value);
        
        // Clear pending share ID
        pendingShareId.value = null;
        
      } catch (error) {
        console.error('❌ Failed to load shared chat after user identification:', error);
        writeMessage("Failed to load shared group chat", "error");
      }
    };

    const handleAgentUpdated = (agentInfo: any) => {
      if (agentInfo) {
        // Update the current agent with the new information
        currentAgent.value = agentInfo;
        console.log("🤖 Agent updated:", agentInfo.name);

        // Update the AI options to use the new agent endpoint if available
        const personalChatOption = AIoptions.find(
          (option) => option.label === "Personal Chat"
        );
        if (personalChatOption && agentInfo.endpoint) {
          personalChatOption.value = agentInfo.endpoint;
        }
      } else {
        currentAgent.value = null;
        console.log("🤖 Agent cleared");
      }
    };

    const handleManageAgent = () => {
      showAgentManagementDialog.value = true;
    };

    const handleUserAuthenticated = (userData: any) => {
      currentUser.value = userData;
      // Show clean user authentication info
      

      // Force a reactive update by triggering a re-render
      // This ensures the UI updates immediately
      setTimeout(() => {
        // Remove verbose timeout logging
      }, 100);
    };

    const handleSignIn = () => {
      // Open a dedicated sign-in dialog instead of Agent Management
      showPasskeyAuthDialog.value = true;
    };

    const handleSignOut = async () => {
      // Call backend logout endpoint to destroy session
      try {
        const response = await fetch(`${API_BASE_URL}/passkey/logout`, { method: "POST" });
        const data = await response.json();
        
        // Display backend console message if provided
        if (data.consoleMessage) {
          console.log(data.consoleMessage);
        }
      } catch (error) {
        console.error('❌ Backend logout failed:', error);
      }
      
      // Set to Unknown User instead of null (there should never be "no user")
      currentUser.value = { userId: 'Unknown User', displayName: 'Unknown User' };
    };

    const handleSignInCancelled = () => {
      showPasskeyAuthDialog.value = false;
    };

    // Refresh agent data when user changes
    watch(currentUser, async () => {
      await fetchCurrentAgent();
    });

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
        const result = await saveChat(
          appState.chatHistory,
          appState.uploadedFiles
        );
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
          appState,
          currentUser.value // Pass the current user identity
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
      appState.currentViewingFile = file;
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
      showPasskeyAuthDialog,
      showDeepLinkUserModal,
      pendingShareId,
      handleDeepLinkUserIdentified,
    };
  },
});
</script>

<template>
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

    :currentAgent="currentAgent"
    :warning="agentWarning"
    :currentUser="currentUser"
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
    :currentUser="currentUser"
  />

  <!-- Popup for displaying system messages -->
  <PopUp
    ref="popupRef"
    :appState="appState"
    :content="appState.popupContent"
    :current-file="appState.currentViewingFile"
    button-text="Close"
    :on-close="() => appState.popupContentFunction()"
  />

  <!-- Saved Chats Dialog -->
  <SavedChatsDialog
    v-model="showSavedChatsDialog"
    :patientId="'demo_patient_001'"
    @chat-selected="handleChatSelected"
  />

  <!-- Agent Management Dialog -->
  <AgentManagementDialog
    v-model="showAgentManagementDialog"
    :AIoptions="AIoptions"
    :uploadedFiles="appState.uploadedFiles"
    :currentUser="currentUser"
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

  <!-- Deep Link User Identification Modal -->
  <DeepLinkUserModal
    v-model="showDeepLinkUserModal"
    :share-id="pendingShareId || ''"
    @user-identified="handleDeepLinkUserIdentified"
  />
</template>
