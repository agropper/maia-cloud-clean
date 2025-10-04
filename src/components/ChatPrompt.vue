<script lang="ts">
import { defineComponent, ref, watch, nextTick, onMounted, onUnmounted } from "vue";
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


const AIoptions = [
  { label: "Private AI", value: `${API_BASE_URL}/personal-chat`, icon: "manage_accounts" },
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
    const showAgentSelectionModal = ref(false);
    const showNoPrivateAgentModal = ref(false);
    const noPrivateAgentModalRef = ref<any>(null);
    const currentAgent = ref<any>(null);
    const currentKnowledgeBase = ref<any>(null);
    const assignedAgent = ref<any>(null);
    const agentWarning = ref<string>("");
    const currentUser = ref<any>(UserService.createPublicUser());
    const pendingShareId = ref<string | null>(null);
    const groupCount = ref<number>(0);
    const chatAreaRef = ref<any>(null);
    const currentDeepLink = ref<string | null>(null);
    


    // Update group count when it changes in ChatArea
    const updateGroupCount = (count: number) => {
      
      groupCount.value = count;
      
    };

    // Handle chat loaded from status line
    const handleChatLoaded = (groupChat: any) => {
      // Pass the loaded chat to ChatArea
      if (chatAreaRef.value) {
        chatAreaRef.value.handleChatLoaded(groupChat);
      }
    };

    // Handle deep link updates from ChatArea
    const handleDeepLinkUpdated = (deepLink: string) => {
      
      currentDeepLink.value = deepLink;
      
    };

    // Handle group deletion from BottomToolbar
    const handleGroupDeleted = () => {
      
      // Refresh the group count after deletion
      if (chatAreaRef.value) {
        chatAreaRef.value.loadGroupCount();
      }
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

    // API call deduplication
    const apiCallCache = new Map();
    
    // Fetch current agent information on component mount
    const fetchCurrentAgent = async () => {
      // Check if we already have a pending request for this endpoint
      const userId = currentUser.value?.userId || 'Public User';
      const cacheKey = `current-agent-${userId}`;
      if (apiCallCache.has(cacheKey)) {
        return await apiCallCache.get(cacheKey);
      }
      
      // Create a promise and cache it
      const promise = (async () => {
        try {
          const response = await fetch(`${API_BASE_URL}/current-agent`);
          const data = await response.json();

          if (data.agent) {
            currentAgent.value = data.agent;
            assignedAgent.value = data.agent; // Set assigned agent for dialog display
            if (data.agent.knowledgeBase) {
              currentKnowledgeBase.value = data.agent.knowledgeBase;
            } else {
              currentKnowledgeBase.value = null;
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
            currentKnowledgeBase.value = null;
            assignedAgent.value = null; // Clear assigned agent
            
            // Track activity for users without agents
            trackUserActivity('no_agent_detected');
            
            // Check if user should see the "No Private Agent" modal using new workflow system
            if (WorkflowUtils.shouldShowNoAgentModal(currentUser.value, null)) {
              // Show modal for workflow users without private agents
              if (noPrivateAgentModalRef.value) {
                noPrivateAgentModalRef.value.show();
              }
            } else if (data.requiresAgentSelection && !WorkflowUtils.isWorkflowUser(currentUser.value)) {
              // Only show agent selection modal for non-workflow users (like Public User)
              showAgentSelectionModal.value = true;
            }
          }
        } catch (error) {
          console.error("❌ Error fetching current agent:", error);
          currentAgent.value = null;
        } finally {
          // Remove from cache when done
          apiCallCache.delete(cacheKey);
        }
      })();
      
      // Cache the promise
      apiCallCache.set(cacheKey, promise);
      return await promise;
    };

    // Check for existing session on component mount
    const checkExistingSession = async () => {
      try {
        // console.log(`🔍 [ChatPrompt] Checking existing session...`);
        // console.log(`🔍 [ChatPrompt] Making request to: ${API_BASE_URL}/passkey/auth-status`);
        
        const response = await fetch(`${API_BASE_URL}/passkey/auth-status`);
        // console.log(`🔍 [ChatPrompt] Response status:`, response.status);
        // console.log(`🔍 [ChatPrompt] Response headers:`, Object.fromEntries(response.headers.entries()));
        
        if (!response.ok) {
          console.error(`❌ [ChatPrompt] HTTP error! status: ${response.status}`);
          const errorText = await response.text();
          console.error(`❌ [ChatPrompt] Error response body:`, errorText);
          throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const data = await response.json();
        
        if (data.authenticated && data.user) {
          currentUser.value = data.user;
          
          // Now that user is authenticated, get session verification
          try {
            const verificationResponse = await fetch(`${API_BASE_URL}/passkey/session-verification`);
            // The fetch interceptor will handle the session verification headers
          } catch (error) {
            console.error('❌ [ChatPrompt] Failed to get session verification:', error);
          }
        } else if (data.redirectTo) {
          // Deep link user detected on main app - redirect them to their deep link page
          window.location.href = data.redirectTo;
          return;
        } else {
          // console.log(`❌ [ChatPrompt] No authenticated user found`);
          // currentUser.value is already set to Public User by default
        }
      } catch (error) {
        console.error('❌ [ChatPrompt] Failed to check existing session:', error);
        console.error('❌ [ChatPrompt] Error details:', {
          name: error.name,
          message: error.message,
          stack: error.stack
        });
        // currentUser.value is already set to Public User by default
        // No need to change it - it's already valid
      }
    };
    
    // Initialize components sequentially to avoid 429 errors
    const initializeApp = async () => {
      try {
        // Step 1: Check if this is a deep link page first
        const path = window.location.pathname;
        if (path.startsWith('/shared/')) {
          console.log('🔗 [ChatPrompt] Deep link page detected, skipping authentication');
          // Skip authentication for deep link pages
          await handleDeepLink();
          return;
        }
        
        // Step 2: Check existing session for main app pages
        await checkExistingSession();
        
        // Step 3: Wait a moment to avoid rate limiting
        await new Promise(resolve => setTimeout(resolve, 100));
        
        // Step 4: Fetch current agent
        await fetchCurrentAgent();
        
        // Step 5: Wait a moment to avoid rate limiting
        await new Promise(resolve => setTimeout(resolve, 100));
        
        // Step 6: Handle deep link loading (for main app pages)
        await handleDeepLink();
      } catch (error) {
        console.error('❌ [ChatPrompt] Error during app initialization:', error);
      }
    };
    
    // Initialize the app
    initializeApp();
    
    // Track user activity for Admin Panel analytics
    const trackUserActivity = async (action = 'user_interaction') => {
      try {
        const userId = currentUser.value?.userId || currentUser.value?.displayName || 'Public User';

        // High-frequency activities should only update in-memory (no API calls)
        const highFrequencyActions = ['mouse_click', 'keyboard_input', 'window_focus', 'scroll'];
        
        if (highFrequencyActions.includes(action)) {
          // For high-frequency activities, just update in-memory activity tracker
          // This will be synced to database by the existing 30-second/60-second sync mechanism
          // NO API CALLS for high-frequency activities to prevent 429 errors
          return;
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
      // Always refresh agent data from DO API to get latest KB attachments
      console.log('🔄 Refreshing agent data from DO API...');
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
        currentUser.value = UserService.createDeepLinkUser(
          userData.userId, 
          userData.name, 
          userData.email, 
          userData.shareId
        );
        
        // Clear any existing query and active question (don't set active question name - it should use current user)
        appState.currentQuery = '';
        appState.activeQuestion.content = '';
        
        // Force a reactive update to ensure the Agent badge updates
        await nextTick();
        
        // Trigger agent refresh to ensure the Agent badge updates with new user
        // Always fetch for deep link users to get the patient's assigned agent
        await fetchCurrentAgent();
        
        writeMessage(`Welcome ${userData.name}! Loaded shared group chat from ${groupChat.currentUser}`, "success");
        
        // Clear pending share ID
        pendingShareId.value = null;
        
      } catch (error) {
        console.error('❌ Failed to load shared chat after user identification:', error);
        writeMessage("Failed to load shared group chat", "error");
      }
    };

    const handleAgentUpdated = async (agentInfo: any) => {
      
      if (agentInfo) {
        // Update the current agent with the new information
        currentAgent.value = agentInfo;

        // Update the AI options to use the new agent endpoint if available
        const personalChatOption = AIoptions.find(
          (option) => option.label === "Personal Chat"
        );
        if (personalChatOption && agentInfo.endpoint) {
          personalChatOption.value = agentInfo.endpoint;
        }

        console.log("✅ Agent updated in ChatPrompt:", agentInfo.name);
        
        // Fetch current agent data to get updated warning information
        try {
          // Clear the API call cache to force a fresh request
          apiCallCache.delete('current-agent');
          await fetchCurrentAgent();
          // fetchCurrentAgent() already handles updating currentAgent, currentKnowledgeBase, and agentWarning
        } catch (error) {
          console.error("❌ Failed to fetch updated agent data:", error);
          // Clear warning if fetch fails
          agentWarning.value = "";
        }
      } else {
        currentAgent.value = null;
      }
    };

    const handleManageAgent = () => {
      showAgentManagementDialog.value = true;
    };

    const handleUserAuthenticated = async (userData: any) => {
      console.log('[*] [SIGN IN] handleUserAuthenticated called with userData:', userData)
      // INVALIDATE ALL CACHE FIRST - this prevents cross-user contamination
      apiCallCache.clear();
      
      // Clear chat area when user signs in (prevents stale data from previous user)
      appState.chatHistory = [];
      appState.uploadedFiles = [];
      appState.currentViewingFile = null;
      appState.popupContent = '';
      
      console.log('[*] [SIGN IN] Setting currentUser to:', UserService.normalizeUserObject(userData))
      currentUser.value = UserService.normalizeUserObject(userData);
      
      // Fetch the user's current agent and KB from API to update Agent Badge
      await fetchCurrentAgent();
      
      // Check if user should see the "No Private Agent" modal after authentication
      if (WorkflowUtils.shouldShowNoAgentModal(currentUser.value, currentAgent.value)) {
        // Show modal for workflow users without private agents
        if (noPrivateAgentModalRef.value) {
          noPrivateAgentModalRef.value.show();
        }
      }
      
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
        
        // Backend console messages removed - not essential for user experience
      } catch (error) {
        console.error('❌ Backend logout failed:', error);
      }
      
      // INVALIDATE ALL CACHE FIRST - this prevents cross-user contamination
      apiCallCache.clear();
      
      // Clear all agent data before switching to Public User
      currentAgent.value = null;
      currentKnowledgeBase.value = null;
      assignedAgent.value = null;
      agentWarning.value = "";
      
      // Set to Public User instead of null (there should never be "no user")
      currentUser.value = UserService.createPublicUser();
      
      // Clear the backend cache for Public User to prevent contamination
      try {
        await fetch(`${API_BASE_URL}/api/admin/clear-public-user-agent`, { method: "POST" });
      } catch (error) {
        console.error('❌ Failed to clear Public User cache:', error);
      }
      
      // Fetch the Public User's agent to update the UI
      await fetchCurrentAgent();
    };

    const handleRequestPrivateAgent = () => {
      // For now, just show a notification
      // In the future, this could open a form or redirect to admin panel
      console.log("User requested private agent");
      // You could implement a request system here
    };

    const handleSignInCancelled = () => {
      showPasskeyAuthDialog.value = false;
    };

    // Note: Agent data is fetched on component mount and when explicitly updated
    // No need to watch user changes as this causes duplicate API calls

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
      // Prevent multiple simultaneous calls
      if (appState.isLoading) {
        // Prevent multiple simultaneous calls
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
        // Prevent sending empty messages
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

    const triggerUploadFile = async (file: File) => {
      await uploadFile(file, appState, writeMessage);
      logSystemEvent("File uploaded", { fileName: file.name }, appState);
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
      try {
        // Ensure userName is set from currentUser for transcript generation
        const userName = currentUser.value?.displayName || currentUser.value?.userId || 'Public User';
        appState.userName = userName;
        
        const transcriptContent = generateTranscript(appState, true);
        const blob = new Blob([transcriptContent], { type: "text/markdown" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = "transcript.md";
        a.click();
        URL.revokeObjectURL(url);
        logSystemEvent("Transcript saved to file", {}, appState);
        
      } catch (error) {
        console.error('Error in saveToFile:', error);
        writeMessage("Failed to save transcript: " + error.message, "error");
      }
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
          }
        }
      }
    };

    // Navigation guard functions
    const checkForUnsavedChanges = (): boolean => {
      // Check if there are unsaved changes
      return appState.chatHistory.length > 0 && 
             (appState.currentQuery.trim() !== '' || 
              appState.uploadedFiles.length > 0 ||
              appState.editBox.length > 0);
    };

    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      if (checkForUnsavedChanges()) {
        event.preventDefault();
        event.returnValue = 'You have unsaved changes. Are you sure you want to leave?';
        return 'You have unsaved changes. Are you sure you want to leave?';
      }
    };

    const handlePopState = (event: PopStateEvent) => {
      // Navigation warning feature removed
    };

    // Call on mount and window resize
    onMounted(async () => {
      await nextTick();
      updateChatAreaMargin();
      window.addEventListener('resize', updateChatAreaMargin);
      
      // Add navigation guards
      window.addEventListener('beforeunload', handleBeforeUnload);
      window.addEventListener('popstate', handlePopState);
      
      // Push initial state to enable popstate detection
      window.history.pushState(null, '', window.location.href);
    });

    onUnmounted(() => {
      window.removeEventListener('resize', updateChatAreaMargin);
      window.removeEventListener('beforeunload', handleBeforeUnload);
      window.removeEventListener('popstate', handlePopState);
    });

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
      showAgentSelectionModal,
      currentAgent,
      currentKnowledgeBase,
      assignedAgent,
      agentWarning,
      currentUser,
      groupCount,
      updateGroupCount,
      handleManageAgent,
      handleUserAuthenticated,
      refreshAgentData,
      handleSignIn,
      handleSignOut,
      handleSignInCancelled,
      handleRequestPrivateAgent,
      showPasskeyAuthDialog,
      showDeepLinkUserModal,
      pendingShareId,
      handleDeepLinkUserIdentified,
      handleChatLoaded,
      handleDeepLinkUpdated,
      handleGroupDeleted,
      currentDeepLink,
      chatAreaRef,

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



  <!-- Chat Area Component -->
  <ChatArea
    ref="chatAreaRef"
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
    @clear-warning="agentWarning = ''"

    :currentAgent="currentAgent"
    :warning="agentWarning"
    :currentUser="currentUser"
    @manage-agent="handleManageAgent"
    @sign-in="handleSignIn"
    @sign-out="handleSignOut"
    @group-count-updated="updateGroupCount"
    @deep-link-updated="handleDeepLinkUpdated"
  />



  <!-- Bottom Toolbar -->
  <BottomToolbar
    :appState="appState"
    
    :triggerSendQuery="triggerSendQuery"
    :triggerAuth="triggerAuth"
    :triggerJWT="triggerJWT"
    :triggerLoadSavedChats="triggerLoadSavedChats"
    :triggerAgentManagement="triggerAgentManagement"
    :placeholderText="placeholderText"
    :clearLocalStorageKeys="clearLocalStorageKeys"
    :AIoptions="AIoptions"
    :currentUser="currentUser"
    :groupCount="groupCount"
    :deepLink="currentDeepLink || undefined"
    @sign-in="handleSignIn"
    @sign-out="handleSignOut"
    @chat-loaded="handleChatLoaded"
    @group-deleted="handleGroupDeleted"
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
    :currentAgent="currentAgent"
    :currentKnowledgeBase="currentKnowledgeBase"
    :assignedAgent="assignedAgent"
    :warning="agentWarning"
    @agent-updated="handleAgentUpdated"
    @refresh-agent-data="refreshAgentData"
    @user-authenticated="handleUserAuthenticated"
  />

  <!-- No Private Agent Modal -->
  <NoPrivateAgentModal
    ref="noPrivateAgentModalRef"
    @sign-out="handleSignOut"
    @request="handleRequestPrivateAgent"
  />

  <!-- Agent Selection Required Modal -->
  <q-dialog v-model="showAgentSelectionModal" persistent>
    <q-card style="min-width: 400px">
      <q-card-section class="row items-center">
        <q-avatar icon="psychology" color="primary" text-color="white" />
        <span class="q-ml-sm text-h6">Agent Selection Required</span>
      </q-card-section>

      <q-card-section>
        <p>You need to select an AI agent before you can start chatting. Please choose an agent from the Agent Management dialog.</p>
      </q-card-section>

      <q-card-actions align="right">
        <q-btn flat label="Cancel" color="primary" @click="showAgentSelectionModal = false" />
        <q-btn 
          label="Select Agent" 
          color="primary" 
          @click="() => { showAgentSelectionModal = false; showAgentManagementDialog = true; }"
        />
      </q-card-actions>
    </q-card>
  </q-dialog>

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
