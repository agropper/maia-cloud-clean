<script lang="ts">
import { defineComponent, ref, watch, nextTick, onMounted, onUnmounted, computed } from "vue";
import { QFile, QIcon, QBtnToggle, QDialog, QCard, QCardSection, QAvatar, QBtn, QCardActions } from "quasar";
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
import { UserService } from "../utils/UserService";
import AgentManagementDialog from "./AgentManagementDialog.vue";
import PasskeyAuthDialog from "./PasskeyAuthDialog.vue";
import DeepLinkUserModal from "./DeepLinkUserModal.vue";
import NoPrivateAgentModal from "./NoPrivateAgentModal.vue";
import { WorkflowUtils } from "../utils/workflow-utils.js";
import { appStateManager } from "../utils/AppStateManager.js";

const AIoptions = [
  { label: "Private AI", value: `${API_BASE_URL}/personal-chat`, icon: "manage_accounts" },
  { label: "Anthropic", value: `${API_BASE_URL}/anthropic-chat` },
  { label: "Gemini", value: `${API_BASE_URL}/gemini-chat` },
  { label: "ChatGPT", value: `${API_BASE_URL}/chatgpt-chat` },
  { label: "DeepSeek R1", value: `${API_BASE_URL}/deepseek-r1-chat` },
];

export default defineComponent({
  name: "ChatPromptRefactored",
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
    NoPrivateAgentModal,
    QDialog,
    QCard,
    QCardSection,
    QAvatar,
    QBtn,
    QCardActions,
  },
  computed: {
    placeholderText() {
      const privateAIValue = this.AIoptions.find(
        (option) => option.label === "Private AI"
      )?.value;
      if (
        this.appState.chatHistory.length === 0 &&
        this.appState.selectedAI === privateAIValue
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
    const { logMessage, logContextSwitch, logSystemEvent, setTimelineChunks } = useChatLogger();
    const { generateTranscript } = useTranscript();
    const { saveChat } = useCouchDB();
    const { loadGroupChat } = useGroupChat();
    const localStorageKey = "noshuri";
    const popupRef = ref<InstanceType<typeof PopUp> | null>(null);
    const showSavedChatsDialog = ref(false);
    const showAgentManagementDialog = ref(false);
    const showPasskeyAuthDialog = ref(false);
    const showDeepLinkUserModal = ref(false);
    const showAgentSelectionModal = ref(false);
    const showNoPrivateAgentModal = ref(false);
    const noPrivateAgentModalRef = ref<any>(null);

    // Get state from centralized state manager - use refs for reactivity
    const currentUser = ref(appStateManager.getStateProperty('currentUser'));
    const currentAgent = ref(appStateManager.getStateProperty('currentAgent'));
    const currentKnowledgeBase = ref(appStateManager.getStateProperty('currentKnowledgeBase'));
    const assignedAgent = ref(appStateManager.getStateProperty('assignedAgent'));
    const userType = ref(appStateManager.getStateProperty('userType'));
    const workflowStage = ref(appStateManager.getStateProperty('workflowStage'));
    const workflowStep = ref(appStateManager.getStateProperty('workflowStep'));

    // Local state for UI
    const agentWarning = ref("");
    const apiCallCache = new Map();

    // Track user activity for Admin Panel analytics
    const trackUserActivity = async (action = 'user_interaction') => {
      try {
        const userId = currentUser.value?.userId || currentUser.value?.displayName || 'Public User';

        // High-frequency activities should only update in-memory (no API calls)
        const highFrequencyActions = ['mouse_click', 'keyboard_input', 'window_focus', 'scroll'];
        
        if (highFrequencyActions.includes(action)) {
          // For high-frequency activities, just update in-memory activity tracker
          // This will be synced to database by the existing 30-second/60-second sync mechanism
          const response = await fetch('/api/admin-management/update-activity', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userId, action })
          });

          if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
          }
        } else {
          // Important activities (app_loaded, query_attempt, no_agent_detected) make immediate API calls
          const response = await fetch('/api/admin-management/agent-activities', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userId, action })
          });

          if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
          }
        }
      } catch (activityError) {
        console.error('❌ [Frontend] Activity tracking failed:', activityError.message);
      }
    };

    // Track app usage when component mounts
    trackUserActivity('app_loaded');

    // Track activity on any user interaction
    const setupActivityTracking = () => {
      // Track mouse clicks
      document.addEventListener('click', () => trackUserActivity('mouse_click'));
      
      // Track keyboard input
      document.addEventListener('keydown', () => trackUserActivity('keyboard_input'));
      
      // Track window focus (user returned to tab)
      window.addEventListener('focus', () => trackUserActivity('window_focus'));
      
      // Track scroll events
      window.addEventListener('scroll', () => trackUserActivity('scroll'));
    };

    setupActivityTracking();

    // Method to refresh agent data (called from AgentManagementDialog)
    const refreshAgentData = async () => {
      // This is now handled by the centralized state manager
      console.log('🔄 [ChatPrompt] Agent data refresh requested - handled by state manager');
    };

    const showPopup = () => {
      if (popupRef.value && popupRef.value.openPopup) {
        popupRef.value.openPopup();
      }
    };

    const triggerAgentManagement = () => {
      showAgentManagementDialog.value = true;
    };

    // Handle deep link loading - only for actual deep link URLs
    const handleDeepLink = async () => {
      const path = window.location.pathname;
      
      // Only process if this is a deep link path (not root, not other paths)
      if (path.startsWith('/shared/')) {
        const shareIdMatch = path.match(/^\/shared\/([a-zA-Z0-9]{12})$/);
        
        if (shareIdMatch) {
          const shareId = shareIdMatch[1];
          
          // Store the share ID and show the user identification modal
          pendingShareId.value = shareId;
          showDeepLinkUserModal.value = true;
        }
      }
    };

    // Handle deep link user identification
    const handleDeepLinkUserIdentified = async (userData: {
      name: string;
      email: string;
      userId: string;
      shareId: string;
    }) => {
      try {
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
        const deepLinkUser = UserService.createDeepLinkUser(
          userData.name,
          userData.email,
          userData.userId,
          userData.shareId
        );
        
        // Update centralized state
        appStateManager.setUser(deepLinkUser);
        
        // Hide the deep link user modal
        showDeepLinkUserModal.value = false;
        
        console.log('✅ [ChatPrompt] Deep link user identified and chat loaded');
      } catch (error) {
        console.error('❌ [ChatPrompt] Failed to load shared chat:', error);
      }
    };

    // Fetch current agent information
    const fetchCurrentAgent = async () => {
      try {
        const response = await fetch(`${API_BASE_URL}/current-agent`);
        const data = await response.json();

        if (data.agent) {
          appStateManager.setAgent(data.agent);
          if (data.agent.knowledgeBase) {
            appStateManager.setState({ currentKnowledgeBase: data.agent.knowledgeBase });
          }
        } else {
          appStateManager.clearAgent();
        }
      } catch (error) {
        console.error("❌ Error fetching current agent:", error);
        appStateManager.clearAgent();
      }
    };

    // Handle user authentication
    const handleUserAuthenticated = async (userData: any) => {
      
      // Clear chat data upon sign-in
      appState.chatHistory = [];
      appState.uploadedFiles = [];
      appState.currentViewingFile = null;
      appState.popupContent = '';
      
      // Clear all caches to prevent cross-user contamination
      if (window.apiCallCache) {
        window.apiCallCache.clear();
      }
      
      // Force a page reload to ensure complete re-initialization
      window.location.reload();
    };

    // Handle sign out
    const handleSignOut = async () => {
      console.log('🚪 [FRONTEND] handleSignOut called - starting logout process');
      try {
        console.log('🚪 [FRONTEND] Making API call to /passkey/logout');
        const response = await fetch(`${API_BASE_URL}/passkey/logout`, { method: "POST" });
        const data = await response.json();
        console.log('✅ [FRONTEND] Logout API call successful:', data);
      } catch (error) {
        console.error('❌ [FRONTEND] Backend logout failed:', error);
      }
      
      // Clear all caches to prevent cross-user contamination
      if (window.apiCallCache) {
        window.apiCallCache.clear();
      }
      
      // Force a page reload to ensure complete re-initialization as Public User
      window.location.reload();
    };

    // Handle request for private agent
    const handleRequestPrivateAgent = () => {
      console.log("User requested private agent");
      // TODO: Implement agent request logic
    };

    // Watch for state changes and update UI accordingly
    watch([currentUser, currentAgent], ([newUser, newAgent], [oldUser, oldAgent]) => {
      if (newUser !== oldUser) {
        console.log('👤 [ChatPrompt] User changed:', newUser?.userId || 'None');
      }
      if (newAgent !== oldAgent) {
        console.log('🤖 [ChatPrompt] Agent changed:', newAgent?.name || 'None');
      }
    });

    // Update chat area bottom margin to account for fixed toolbar
    const updateChatAreaMargin = () => {
      if (chatAreaRef.value) {
        let chatAreaElement = null;
        
        if (chatAreaRef.value.$el && chatAreaRef.value.$el.nodeType === Node.ELEMENT_NODE) {
          chatAreaElement = chatAreaRef.value.$el;
        } else if (chatAreaRef.value.$el && chatAreaRef.value.$el.parentElement) {
          chatAreaElement = chatAreaRef.value.$el.parentElement;
        } else if (chatAreaRef.value.$el && chatAreaRef.value.$el.parentNode) {
          chatAreaElement = chatAreaRef.value.$el.parentNode;
        }
        
        if (chatAreaElement && chatAreaElement.nodeType === Node.ELEMENT_NODE) {
          const toolbar = document.querySelector('.bottom-toolbar');
          if (toolbar) {
            const toolbarRect = toolbar.getBoundingClientRect();
            const toolbarTop = toolbarRect.top;
            
            // Set the chat area height to stop at the toolbar boundary
            chatAreaElement.style.height = `${toolbarTop}px`;
            chatAreaElement.style.maxHeight = `${toolbarTop}px`;
            chatAreaElement.style.overflowY = 'auto';
            
            // Auto-scroll to bottom to show action buttons
            setTimeout(() => {
              chatAreaElement.scrollTop = chatAreaElement.scrollHeight;
            }, 100); // Small delay to ensure content is rendered
          }
        }
      }
    };

    // Watch for chat history changes to update chat area height
    watch(() => appState.chatHistory, (newHistory, oldHistory) => {
      // Use nextTick to ensure DOM is updated before calculating height
      nextTick(() => {
        updateChatAreaMargin();
        
        // Additional scroll to bottom after AI responses
        if (newHistory && newHistory.length > 0) {
          const lastMessage = newHistory[newHistory.length - 1];
          if (lastMessage.role === 'assistant') {
            setTimeout(() => {
              if (chatAreaRef.value && chatAreaRef.value.$el) {
                const chatAreaElement = chatAreaRef.value.$el;
                if (chatAreaElement.scrollTo) {
                  chatAreaElement.scrollTo({ top: chatAreaElement.scrollHeight, behavior: 'smooth' });
                } else {
                  chatAreaElement.scrollTop = chatAreaElement.scrollHeight;
                }
              }
            }, 200); // Longer delay for AI responses to ensure content is fully rendered
          }
        }
      });
    }, { deep: true });

    // Watch for current user changes to update group count
    watch(() => currentUser.value, () => {
      updateGroupCount();
    });

    // Watch for modal state changes
    watch(() => appStateManager.getStateProperty('showNoPrivateAgentModal'), (show) => {
      if (show && noPrivateAgentModalRef.value) {
        noPrivateAgentModalRef.value.show();
      }
    });

    watch(() => appStateManager.getStateProperty('showAgentSelectionModal'), (show) => {
      showAgentSelectionModal.value = show;
    });

    // Additional methods needed by components
    const editMessage = () => {};
    const triggerAuth = showAuth;
    const triggerJWT = showJWT;
    const triggerSaveToNosh = saveToNosh;
    const triggerSaveToCouchDB = saveChat;
    const triggerSendQuery = async () => {
      // Prevent multiple simultaneous calls
      if (appState.isLoading) {
        return;
      }
      
      // Process query
      
      // If Private AI is selected and chatHistory is empty, only use the default if the input is empty or matches the default
      const privateAIValue = AIoptions.find(
        (option) => option.label === "Private AI"
      )?.value;
      const defaultPrompt = "Show patient summary";
      if (
        appState.selectedAI === privateAIValue &&
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
      
      // Prevent sending empty messages (after default prompt logic)
      if (!appState.currentQuery || appState.currentQuery.trim() === '') {
        return;
      }

      // Track user activity for Admin Panel (any query attempt)
      trackUserActivity('query_attempt');

      try {
        appState.isLoading = true;
        const newChatHistory = await sendQuery(
          appState.selectedAI,
          appState.chatHistory,
          appState,
          currentUser.value, // Pass the current user identity
          () => { showAgentSelectionModal.value = true; }, // Callback for agent selection required
          currentAgent.value, // Pass current agent
          assignedAgent.value // Pass assigned agent
        );
        
        appState.chatHistory = newChatHistory;
        appState.currentQuery = "";
        appState.isLoading = false;
      } catch (error: any) {
        console.error("Query failed:", error);
        
        // Show specific error messages based on error type
        let errorMessage = "Failed to send query";
        let warningMessage = "Query failed. Please try again.";
        
        if (error.message) {
          errorMessage = error.message;
          warningMessage = error.message;
        }
        
        // Add specific handling for rate limits and size limits
        if (error.status === 429 || (error.errorType === 'RATE_LIMIT')) {
          // Extract token count from error message if available
          const tokenMatch = error.message?.match(/\((\d+) tokens sent\)/);
          const tokenCount = tokenMatch ? tokenMatch[1] : (error.tokenCount || 'unknown');
          errorMessage = `Rate limit exceeded (${tokenCount} tokens sent). Please try again in a minute or use Personal AI for large documents.`;
          warningMessage = `Rate limit exceeded (${tokenCount} tokens). Try Personal AI for large documents.`;
        } else if (error.status === 413 || (error.errorType === 'TOO_LARGE')) {
          // Extract token count from error message if available
          const tokenMatch = error.message?.match(/\((\d+) tokens sent\)/);
          const tokenCount = tokenMatch ? tokenMatch[1] : (error.tokenCount || 'unknown');
          errorMessage = `Document too large (${tokenCount} tokens sent). Please use Personal AI for large documents.`;
          warningMessage = `Document too large (${tokenCount} tokens). Use Personal AI instead.`;
        }
        
        writeMessage(errorMessage, "error");
        // Also set agent warning to show error in AgentStatusIndicator
        agentWarning.value = warningMessage;
        appState.isLoading = false;
      }

      logMessage({
        role: "user",
        content: `Sent query to ${appState.selectedAI}`,
      });
    };
    const triggerUploadFile = uploadFile;
    const saveMessage = () => {};
    const saveToFile = () => {};
    const closeNoSave = () => {};
    const closeSession = () => {};
    const viewFile = (file: UploadedFile) => {
      appState.popupContent = file.content;
      appState.popupContentFunction = () => {
        appState.popupContent = "";
        appState.popupContentFunction = () => {};
      };
      appState.currentViewingFile = file;
      showPopup();
    };
    const triggerLoadSavedChats = () => { showSavedChatsDialog.value = true; };
    const handleChatSelected = () => {};
    const handleAgentUpdated = () => {};
    const handleManageAgent = () => {};
    const handleSignIn = () => {
      // Open the passkey authentication dialog
      showPasskeyAuthDialog.value = true;
    };
    
    const handleSignInCancelled = () => {
      // Close the passkey authentication dialog
      showPasskeyAuthDialog.value = false;
    };
    const groupCount = ref(0);
    const updateGroupCount = async () => {
      try {
        const { getAllGroupChats } = useGroupChat();
        const allGroups = await getAllGroupChats();
        
        // Get current user name for filtering (same logic as Admin Panel)
        const currentUserName = currentUser.value?.userId || currentUser.value?.displayName || 'Unknown User';
        
        // Filter groups by current user (same logic as Admin Panel)
        const filteredGroups = allGroups.filter(group => {
          const isOwner = group.currentUser === currentUserName;
          const isPatientOwner = group.patientOwner === currentUserName;
          return isOwner || isPatientOwner;
        });
        
        groupCount.value = filteredGroups.length;
      } catch (error) {
        console.error('Error loading chat counts for Bottom Toolbar:', error);
        groupCount.value = 0;
      }
    };
    const handleChatLoaded = (chat: any) => {
      // Update appState directly like the original handleChatSelected
      appState.chatHistory = chat.chatHistory || [];
      
      // Handle different data formats based on the source
      let filesToUse = chat.uploadedFiles || [];
      
      // Check if this is a legacy CouchDB chat (has legacy_ prefix in shareId)
      const isLegacyChat = chat.shareId && chat.shareId.startsWith('legacy_');
      
      console.log('🔍 [CHAT DEBUG] Loading chat:', {
        chatId: chat.id,
        shareId: chat.shareId,
        isLegacyChat,
        filesCount: filesToUse.length,
        firstFileStructure: filesToUse[0] ? {
          name: filesToUse[0].name,
          type: filesToUse[0].type,
          hasOriginalFile: !!filesToUse[0].originalFile,
          originalFileType: typeof filesToUse[0].originalFile,
          originalFileKeys: filesToUse[0].originalFile ? Object.keys(filesToUse[0].originalFile) : 'none'
        } : 'no files'
      });
      
      if (isLegacyChat) {
        // Legacy CouchDB chats already have proper UploadedFile format
        // No reconstruction needed - they were saved with the correct structure
        console.log('🔍 [CHAT DEBUG] Using legacy chat files as-is');
        appState.uploadedFiles = filesToUse;
      } else {
        // New GroupChat format - reconstruct UploadedFile objects
        console.log('🔍 [CHAT DEBUG] Reconstructing GroupChat files');
        const reconstructedFiles = filesToUse.map((file: any) => {
          // If it's already a proper UploadedFile, return as-is
          if (file.originalFile instanceof File) {
            console.log('🔍 [CHAT DEBUG] File already has File object');
            return file;
          }
          
          // If it's a database-loaded file, reconstruct the proper structure
          if (file.originalFile && typeof file.originalFile === 'object' && file.originalFile.base64) {
            console.log('🔍 [CHAT DEBUG] Reconstructing file with base64 data');
            return {
              ...file,
              originalFile: {
                name: file.originalFile.name,
                size: file.originalFile.size,
                type: file.originalFile.type,
                base64: file.originalFile.base64
              }
            };
          }
          
          // For files without originalFile data, return as-is (they'll show as text)
          console.log('🔍 [CHAT DEBUG] File has no originalFile data');
          return file;
        });
        
        appState.uploadedFiles = reconstructedFiles;
      }
      
      // Show success message
      writeMessage(
        `Loaded chat from ${new Date(chat.createdAt).toLocaleDateString()}`,
        "success"
      );
    };
    const handleDeepLinkUpdated = () => {};
    const handleGroupDeleted = () => {};
    const currentDeepLink = ref(null);
    const chatAreaRef = ref(null);
    const pendingShareId = ref(null);
    const stateListenerId = ref(null);

    // Call on mount and window resize
    onMounted(async () => {
      await nextTick();
      updateChatAreaMargin();
      updateGroupCount(); // Load initial group count
      window.addEventListener('resize', updateChatAreaMargin);
      
      // Add state listener for reactive updates
      stateListenerId.value = appStateManager.addListener((newState: any, oldState: any) => {
        if (newState.currentUser !== oldState.currentUser) {
          currentUser.value = newState.currentUser;
        }
        if (newState.currentAgent !== oldState.currentAgent) {
          currentAgent.value = newState.currentAgent;
        }
        if (newState.currentKnowledgeBase !== oldState.currentKnowledgeBase) {
          currentKnowledgeBase.value = newState.currentKnowledgeBase;
        }
        if (newState.assignedAgent !== oldState.assignedAgent) {
          assignedAgent.value = newState.assignedAgent;
        }
        if (newState.userType !== oldState.userType) {
          userType.value = newState.userType;
        }
        if (newState.workflowStage !== oldState.workflowStage) {
          workflowStage.value = newState.workflowStage;
        }
        if (newState.workflowStep !== oldState.workflowStep) {
          workflowStep.value = newState.workflowStep;
        }
      });
      
      // Handle deep link URLs
      await handleDeepLink();
    });

    onUnmounted(() => {
      window.removeEventListener('resize', updateChatAreaMargin);
      if (stateListenerId.value) {
        appStateManager.removeListener(stateListenerId.value);
      }
    });

    return {
      // State
      appState,
      currentUser,
      currentAgent,
      currentKnowledgeBase,
      assignedAgent,
      userType,
      workflowStage,
      workflowStep,
      agentWarning,
      
      // UI State
      showSavedChatsDialog,
      showAgentManagementDialog,
      showPasskeyAuthDialog,
      showDeepLinkUserModal,
      showAgentSelectionModal,
      showNoPrivateAgentModal,
      noPrivateAgentModalRef,
      
      // Methods
      writeMessage,
      clearLocalStorageKeys,
      setActiveQuestionName,
      logMessage,
      logContextSwitch,
      logSystemEvent,
      setTimelineChunks,
      generateTranscript,
      saveChat,
      loadGroupChat,
      showAuth,
      showJWT,
      saveToNosh,
      uploadFile,
      sendQuery,
      pickFiles,
      getSystemMessageType,
      refreshAgentData,
      showPopup,
      triggerAgentManagement,
      handleDeepLink,
      handleDeepLinkUserIdentified,
      handleUserAuthenticated,
      handleSignOut,
      handleRequestPrivateAgent,
      trackUserActivity,
      
      // Additional methods for compatibility
      editMessage,
      triggerAuth,
      triggerJWT,
      triggerSaveToNosh,
      triggerSaveToCouchDB,
      triggerSendQuery,
      triggerUploadFile,
      saveMessage,
      saveToFile,
      closeNoSave,
      closeSession,
      viewFile,
      triggerLoadSavedChats,
      handleChatSelected,
      handleAgentUpdated,
      handleManageAgent,
      handleSignIn,
      handleSignInCancelled,
      groupCount,
      updateGroupCount,
      handleChatLoaded,
      handleDeepLinkUpdated,
      handleGroupDeleted,
      currentDeepLink,
      chatAreaRef,
      pendingShareId,
      
      // Refs
      popupRef,
      localStorageKey,
      AIoptions,
    };
  },
});
</script>

<template>
  <div class="chat-prompt-container">
    <!-- Chat Area -->
    <ChatArea
      ref="chatAreaRef"
      :appState="appState"
      :currentUser="currentUser"
      :currentAgent="currentAgent"
      :warning="agentWarning"
      :AIoptions="AIoptions"
      @manage-agent="triggerAgentManagement"
      @sign-in="handleSignIn"
      @sign-out="handleSignOut"
      @clear-warning="agentWarning = ''"
      @view-file="viewFile"
    />

    <!-- Bottom Toolbar -->
    <BottomToolbar
      :appState="appState"
      :currentUser="currentUser"
      :currentAgent="currentAgent"
      :groupCount="groupCount"
      :placeholderText="placeholderText"
      :aiOption="aiOption"
      :AIoptions="AIoptions"
      :triggerSendQuery="triggerSendQuery"
      :triggerAuth="showAuth"
      :triggerJWT="showJWT"
      :triggerLoadSavedChats="() => { showSavedChatsDialog = true; }"
      :triggerAgentManagement="triggerAgentManagement"
      :clearLocalStorageKeys="clearLocalStorageKeys"
      @write-message="writeMessage"
      @show-saved-chats="showSavedChatsDialog = true"
      @trigger-agent-management="triggerAgentManagement"
      @show-popup="showPopup"
      @sign-in="handleSignIn"
      @sign-out="handleSignOut"
    />

    <!-- Modals and Dialogs -->
    <SavedChatsDialog
      v-model="showSavedChatsDialog"
      :currentUser="currentUser"
      @chat-selected="handleChatLoaded"
      v-if="showSavedChatsDialog"
    />

    <AgentManagementDialog
      v-model="showAgentManagementDialog"
      :currentUser="currentUser"
      :currentAgent="currentAgent"
      :assignedAgent="assignedAgent"
      :currentKnowledgeBase="currentKnowledgeBase"
      :warning="agentWarning"
      :uploadedFiles="appState.uploadedFiles"
      :AIoptions="AIoptions"
      @refresh-agent-data="refreshAgentData"
    />

    <PasskeyAuthDialog
      v-model="showPasskeyAuthDialog"
      :currentUser="currentUser"
      @authenticated="handleUserAuthenticated"
    />

    <DeepLinkUserModal
      v-model="showDeepLinkUserModal"
      :shareId="pendingShareId || ''"
      @user-identified="handleDeepLinkUserIdentified"
    />

    <NoPrivateAgentModal
      ref="noPrivateAgentModalRef"
      @sign-out="handleSignOut"
      @request="handleRequestPrivateAgent"
    />

    <!-- Agent Selection Modal -->
    <QDialog v-model="showAgentSelectionModal" persistent>
      <QCard style="min-width: 400px">
        <QCardSection class="row items-center">
          <QAvatar icon="psychology" color="primary" text-color="white" />
          <span class="q-ml-sm text-h6">Agent Selection Required</span>
        </QCardSection>

        <QCardSection class="q-pt-none">
          <p>Please select an agent to continue using the application.</p>
        </QCardSection>

        <QCardActions align="right">
          <QBtn flat label="Cancel" color="primary" @click="showAgentSelectionModal = false" />
          <QBtn label="Select Agent" color="primary" @click="triggerAgentManagement" />
        </QCardActions>
      </QCard>
    </QDialog>

    <!-- Popup Component -->
    <PopUp 
      ref="popupRef" 
      :appState="appState"
      :content="appState.popupContent"
      :currentFile="appState.currentViewingFile"
      button-text="Close"
      :on-close="() => appState.popupContentFunction()"
    />
  </div>
</template>

<style scoped>
.chat-prompt-container {
  display: flex;
  flex-direction: column;
  height: 100vh;
  width: 100%;
}
</style>
