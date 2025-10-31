<script lang="ts">
import { defineComponent, ref, watch, nextTick, onMounted, onUnmounted, computed } from "vue";
import { QFile, QIcon, QBtnToggle, QDialog, QCard, QCardSection, QAvatar, QBtn, QCardActions, QSpinner, QChip, QTable, QCheckbox, QSpace, useQuasar } from "quasar";
import { getSystemMessageType, pickFiles } from "../utils";
import { useChatState } from "../composables/useChatState";
import { useChatLogger } from "../composables/useChatLogger";
import { useTranscript } from "../composables/useTranscript";
import html2pdf from 'html2pdf.js';
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
import NewUserWelcomeModal from "./NewUserWelcomeModal.vue";
import WaitingForApprovalModal from "./WaitingForApprovalModal.vue";
import KnowledgeBaseWelcomeModal from "./KnowledgeBaseWelcomeModal.vue";
import PublicUserKBWelcomeModal from "./PublicUserKBWelcomeModal.vue";
import PublicUserNoKBModal from "./PublicUserNoKBModal.vue";
import SafariWarningModal from "./SafariWarningModal.vue";
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
    NewUserWelcomeModal,
    WaitingForApprovalModal,
    KnowledgeBaseWelcomeModal,
    PublicUserKBWelcomeModal,
    PublicUserNoKBModal,
    SafariWarningModal,
    QDialog,
    QCard,
    QCardSection,
    QAvatar,
    QBtn,
    QCardActions,
    QSpinner,
    QChip,
    QTable,
    QCheckbox,
    QSpace,
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
    const $q = useQuasar();
    const { appState, writeMessage, clearLocalStorageKeys, setActiveQuestionName } = useChatState();
    const { logMessage, logContextSwitch, logSystemEvent, setTimelineChunks } = useChatLogger();
    const { generateTranscript } = useTranscript();
    const { saveChat } = useCouchDB();
    const { loadGroupChat } = useGroupChat();
    const localStorageKey = "noshuri";
    const popupRef = ref<InstanceType<typeof PopUp> | null>(null);
    const showSavedChatsDialog = ref(false);
    const triggerFileImport = ref(0); // Increment to trigger file import
    const showAgentManagementDialog = ref(false);
    const showPasskeyAuthDialog = ref(false);
    const showDeepLinkUserModal = ref(false);
    const showAgentSelectionModal = ref(false);
    const showNewUserWelcomeModal = ref(false);
    const showWaitingForApprovalModal = ref(false);
    const showKnowledgeBaseWelcomeModal = ref(false);
    const showPublicUserKBWelcomeModal = ref(false);
    const showSafariWarningModal = ref(false);
    const showPublicUserNoKBModal = ref(false);

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
      // Refresh agent data from DO API and update centralized state
      console.log('🔄 Refreshing agent data from DO API...');
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
        console.error("❌ Error refreshing agent data:", error);
      }
    };

    const showPopup = () => {
      if (popupRef.value && popupRef.value.openPopup) {
        popupRef.value.openPopup();
      }
    };

    const triggerAgentManagement = () => {
      showAgentManagementDialog.value = true;
    };

    const triggerKBWelcome = async () => {
      // If user has a KB, open the KB Management modal directly
      if (currentKnowledgeBase.value) {
        // User has KB - open KB Management dialog
        filesOrganized.value = false;
        organizedKBs.value = [];
        showCreateKBActionModal.value = true;
        await fetchUserKBs();
      } else {
        // User has no KB - open the Welcome modal
        showKnowledgeBaseWelcomeModal.value = true;
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

    // Handle deep link user identification
    const handleDeepLinkUserIdentified = async (userData: {
      name: string;
      email: string;
      userId: string;
      shareId: string;
    }) => {
      try {
        // First, let the backend handle user lookup/creation
        const response = await fetch('/api/deep-link-users', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            name: userData.name,
            email: userData.email,
            shareId: userData.shareId,
            accessTime: new Date().toISOString(),
            userAgent: navigator.userAgent,
            ipAddress: 'unknown', // Will be set by server
            isDeepLinkUser: true
          })
        });

        if (!response.ok) {
          throw new Error(`Failed to create/find user: ${response.statusText}`);
        }

        const userResult = await response.json();
        
        if (userResult.requiresEmailChoice) {
          // Handle email mismatch - this should be handled by the modal
          console.warn('⚠️ [ChatPrompt] Email mismatch detected, but modal should handle this');
          return;
        }

        if (!userResult.success) {
          throw new Error(userResult.message || 'Failed to create/find user');
        }

        // Load the shared chat
        const { loadSharedChat } = useGroupChat();
        const groupChat = await loadSharedChat(userData.shareId);
        
        
        // Load the group chat data WITHOUT modifying existing user names
        // This preserves the original user labels in the chat history
        appState.chatHistory = groupChat.chatHistory;
        appState.uploadedFiles = groupChat.uploadedFiles;
        
        
        // Store the chat ID for future updates
        appState.currentChatId = groupChat.id;
        
        // Create user object from backend response (ensures proper database data)
        const deepLinkUser = UserService.createDeepLinkUser(
          userResult.userId,
          userResult.user.name, // Use name from backend response
          userResult.user.email, // Use email from backend response
          userResult.user.shareId
        );
        
        // Update centralized state
        appStateManager.setUser(deepLinkUser);
        
        // Hide the deep link user modal
        showDeepLinkUserModal.value = false;
        
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
      
      const normalizedUser = UserService.normalizeUserObject(userData);
      currentUser.value = normalizedUser;
      
      // Fetch the user's current agent and KB from API to update Agent Badge
      await fetchCurrentAgent();
    };

    // Handle sign out
    const handleSignOut = async () => {
      try {
        const response = await fetch(`${API_BASE_URL}/passkey/logout`, { method: "POST" });
        const data = await response.json();
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

    // Handle opening Private AI Manager from KB Welcome Modal
    const handleOpenKBManager = () => {
      showKnowledgeBaseWelcomeModal.value = false;
      showAgentManagementDialog.value = true;
    };

    // Handle import file from KB Welcome Modal
    const handleImportFile = () => {
      showKnowledgeBaseWelcomeModal.value = false;
      // Trigger file import by incrementing the trigger value
      triggerFileImport.value++;
    };

    // Handle continue from KB Welcome Modal - opens KB management modal
    const handleContinueFromWelcome = () => {
      // Reset state when opening modal
      filesOrganized.value = false;
      organizedKBs.value = [];
      showCreateKBActionModal.value = true;
      fetchUserKBs();
    };

    // Handle opening Agent Manager from Public User KB Welcome Modal
    const handleOpenPublicKBManager = () => {
      showPublicUserKBWelcomeModal.value = false;
      showAgentManagementDialog.value = true;
    };

    // Handle opening Agent Manager from Public User No-KB Modal
    const handleOpenAgentManagementFromNoKB = () => {
      showPublicUserNoKBModal.value = false;
      showAgentManagementDialog.value = true;
    };

    // New KB Management Modal State
    const userKBsFromAPI = ref([]);
    const userKBsFromDB = ref([]);
    const kbValidationError = ref('');
    const filesOrganized = ref(false);
    const isPreparingFolder = ref(false);
    const isLoadingKBData = ref(false);
    const availableFiles = ref([]);
    const organizedKBs = ref([]); // Array of { kbName, files: [], exists: boolean, subfolderPath }
    
    // Table-based file location state
    const kbFileLocations = ref([]); // Array of files with location checkboxes
    const kbInfo = ref([]); // Array of { kbName, exists, label }
    const previewKB = ref<{ kbName: string; label: string } | null>(null);

    // Fetch user's KBs from both DO API and database
    const fetchUserKBs = async () => {
      if (!currentUser.value?.userId || currentUser.value.userId === 'Public User') {
        return;
      }

      isLoadingKBData.value = true;
      kbValidationError.value = '';
      
      try {
        const userId = currentUser.value.userId;
        
        // Fetch from DO API (authoritative): prefer agent-attached KB IDs if available
        console.log(`🔍 [KB STEP] Fetching user KBs from DO API`);
        let userAPIKBs = [] as any[];
        try {
          // Attempt 1: get list (may fail due to upstream/cache issues)
          const apiResponse = await fetch('/api/knowledge-bases');
          if (apiResponse.ok) {
            const allKBs = await apiResponse.json();
            if (Array.isArray(allKBs)) {
              userAPIKBs = allKBs.filter((kb: any) => kb.name && kb.name.startsWith(userId));
            }
          } else {
            console.warn(`⚠️ [KB STEP] KB list API failed: ${apiResponse.status}`);
          }
        } catch (e: any) {
          console.warn(`⚠️ [KB STEP] KB list API error: ${e?.message || e}`);
        }

        // Fallback: verify KBs attached to the agent (single-KB lookups)
        if ((!userAPIKBs || userAPIKBs.length === 0) && currentAgent.value) {
          const attached = ([] as any[])
            .concat(currentAgent.value.knowledgeBases || [])
            .concat(currentAgent.value.knowledgeBase ? [currentAgent.value.knowledgeBase] : []);
          const uniqueIds = Array.from(new Set(attached.map((k: any) => k.uuid || k.id).filter(Boolean)));
          const verified: any[] = [];
          for (const id of uniqueIds) {
            try {
              const kbResp = await fetch(`/api/knowledge-bases/${encodeURIComponent(id)}`);
              if (kbResp.ok) {
                const kb = await kbResp.json();
                verified.push(kb);
              }
            } catch (e: any) {
              console.warn(`⚠️ [KB STEP] Single-KB verify failed for ${id}: ${e?.message || e}`);
            }
          }
          userAPIKBs = verified;
        }

        userKBsFromAPI.value = userAPIKBs;
        console.log(`📚 [KB STEP] Found ${userAPIKBs.length} KBs in DO API (final):`, userAPIKBs.map((kb: any) => kb.name || kb.uuid));

        // Fetch from database
        console.log(`🔍 [KB STEP] Fetching user KBs from database`);
        const dbResponse = await fetch(`/api/users/${userId}/knowledge-bases`);
        if (!dbResponse.ok) {
          throw new Error(`Failed to fetch KBs from database: ${dbResponse.status}`);
        }
        const dbKBs = await dbResponse.json();
        userKBsFromDB.value = dbKBs;
        console.log(`📚 [KB STEP] Found ${dbKBs.length} KBs in database:`, dbKBs.map(kb => kb.kbName));

        // Validate consistency (DO is source of truth)
        const apiKBNames = userAPIKBs.map((kb: any) => kb.name).filter(Boolean).sort();
        const dbKBNames = dbKBs.map(kb => kb.kbName).sort();
        
        if (JSON.stringify(apiKBNames) !== JSON.stringify(dbKBNames)) {
          const errorMsg = `[*] KB Database Inconsistency Detected!\nDO API KBs: [${apiKBNames.join(', ')}]\nDatabase KBs: [${dbKBNames.join(', ')}]`;
          kbValidationError.value = errorMsg;
          console.warn(errorMsg);
          console.log(`⚠️ [KB STEP] Proceeding with DO as source of truth`);
        } else {
          console.log(`✅ [KB STEP] KB validation passed - API and database are consistent`);
        }

        // Reconcile maia_kb from DO API truth, then fetch file locations
        console.log(`🔍 [KB STEP] Fetching file locations for user: ${userId}`);
        try {
          const recon = await fetch(`/api/admin/reconcile-kb-indexed-files/${encodeURIComponent(userId)}`, { method: 'POST' });
          if (recon.ok) {
            const r = await recon.json();
            console.log(`🔁 [KBM STEP] Reconciled maia_kb from DO API truth: ${r.reconciled} KBs`);
          } else {
            console.warn(`⚠️ [KBM STEP] Reconcile call failed: ${recon.status}`);
          }
        } catch (e:any) {
          console.warn(`⚠️ [KBM STEP] Reconcile call error: ${e?.message || e}`);
        }

        const locationResponse = await fetch(`/api/users/${userId}/kb-file-locations`);
        if (locationResponse.ok) {
          const locationData = await locationResponse.json();
          console.log(`📦 [KBM STEP] Raw file locations payload:`, JSON.stringify(locationData, null, 2));
          kbInfo.value = locationData.kbs || [];
          kbFileLocations.value = (locationData.files || []).map(file => ({
            ...file,
            selectedLocations: {
              available: file.locations?.available || false,
              // Initialize checkbox state: default available files to preKB A
              preKBA: file.locations?.available || file.locations?.preKBA || false,
              inKBA: file.locations?.inKBA || false,
              preKBB: file.locations?.preKBB || false,
              inKBB: file.locations?.inKBB || false,
              ...Object.keys(file.locations || {}).reduce((acc, key) => {
                if (key.startsWith('preKB') || key.startsWith('inKB')) {
                  acc[key] = file.locations[key] || false;
                }
                return acc;
              }, {})
            }
          }));
          
          // No defaulting to Pre KB in new design

          // If there are available files, add a Preview KB (new KB) column as the next label
          const hasAvailable = kbFileLocations.value.some(f => f.locations?.available);
          const existingLabels = kbInfo.value.map((k: any) => k.label);
          const nextLabel = (() => {
            // Determine next label after existing ones (A,B,C...)
            if (existingLabels.length === 0) return 'A';
            const last = existingLabels[existingLabels.length - 1];
            const code = last.charCodeAt(0);
            return String.fromCharCode(code + 1);
          })();
          if (hasAvailable) {
            const newName = `${userId}-kb-${Date.now()}`;
            previewKB.value = { kbName: newName, label: nextLabel };
            // Append preview KB to kbInfo for table rendering if not already present
            if (!kbInfo.value.some((k: any) => !k.exists && k.kbName === newName)) {
              kbInfo.value.push({ kbName: newName, exists: false, label: nextLabel });
              console.log(`🆕 [KBM STEP] Preview KB added: ${newName} as label ${nextLabel}`);
            }
          } else {
            previewKB.value = null;
          }
          
          console.log(`📚 [KB STEP] Found ${kbFileLocations.value.length} files across ${kbInfo.value.length} KB folders`);
        } else {
          console.log(`⚠️ [KB STEP] Could not fetch file locations: ${locationResponse.status}`);
        }

      } catch (error) {
        const errorMsg = `[*] Failed to fetch file locations: ${error.message}`;
        kbValidationError.value = errorMsg;
        console.error(errorMsg);
        console.log(`❌ [KB STEP] Failed to fetch file locations`);
      } finally {
        isLoadingKBData.value = false;
      }
    };

    // Prepare folder by organizing files into KB subfolder
    const prepareFolder = async () => {
      if (!currentUser.value?.userId) return;

      isPreparingFolder.value = true;
      
      try {
        const userId = currentUser.value.userId;
        console.log(`📁 [KB STEP] Starting file organization for user: ${userId}`);
        
        // Get files from chat area (uploadedFiles) - these are the files available for viewing
        const chatFiles = appState.uploadedFiles || [];
        console.log(`📄 [KB STEP] Found ${chatFiles.length} files in chat area`);
        
        // Get user's uploaded files from database
        const userResponse = await fetch(`/api/users/${userId}`);
        if (!userResponse.ok) {
          throw new Error(`Failed to fetch user document: ${userResponse.status}`);
        }
        
        const userData = await userResponse.json();
        if (!userData.files || userData.files.length === 0) {
          throw new Error('No files found to organize');
        }

        console.log(`📄 [KB STEP] Found ${userData.files.length} files in user document`);
        
        // Map chat files to have bucketKey format for backend comparison
        const chatFileKeys = chatFiles.map(f => f.bucketKey || f.fileUrl).filter(Boolean);
        
        // Call backend to organize files into subfolder (with cleanup)
        const organizeResponse = await fetch('/api/organize-files-for-kb', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            userId: userId,
            files: userData.files,
            chatFileKeys: chatFileKeys // Files that should be kept (in chat area)
          })
        });

        if (!organizeResponse.ok) {
          const error = await organizeResponse.json();
          throw new Error(error.message || `File organization failed: ${organizeResponse.status}`);
        }

        const result = await organizeResponse.json();
        console.log(`✅ [KB STEP] Files organized successfully:`, result);
        
        // Store organized KB info
        organizedKBs.value = [{
          kbName: result.kbName,
          files: result.organizedFiles || [],
          exists: false, // Will be updated after refresh
          subfolderPath: result.subfolderPath
        }];
        
        filesOrganized.value = true;
        
        // Refresh KB list
        await fetchUserKBs();
        
        // Update organized KB existence status after refresh
        const kbExists = userKBsFromAPI.value.some(kb => kb.name === result.kbName);
        if (organizedKBs.value.length > 0) {
          organizedKBs.value[0].exists = kbExists;
        }
        
        $q.notify({
          type: 'positive',
          message: `Files organized into KB folder: ${result.kbName}`,
          timeout: 3000
        });

      } catch (error) {
        console.error(`❌ [KB STEP] File organization failed:`, error);
        $q.notify({
          type: 'negative',
          message: `Failed to organize files: ${error.message}`,
          timeout: 5000
        });
      } finally {
        isPreparingFolder.value = false;
      }
    };

    // Handle Create KB button (after files are organized)
    const handleCreateKB = async () => {
      showCreateKBActionModal.value = false;
      
      try {
        console.log(`🚀 [KB STEP] Starting KB creation with organized files`);
        
        // Get the organized file information from the prepare folder result
        // We'll use the subfolder structure for KB creation
        const userId = currentUser.value.userId;
        
        // Call the automation with organized file structure
        await automateKBCreationWithOrganizedFiles(userId);
        
      } catch (error) {
        console.error('[AUTO PS] ❌ Automation failed:', error);
        $q.notify({
          type: 'negative',
          message: `Automation failed: ${error.message}`,
          timeout: 5000
        });
      }
    };

    // New automation function that works with organized files
    const automateKBCreationWithOrganizedFiles = async (userId) => {
      const startTime = Date.now();
      console.log('[AUTO PS] 🚀 Starting automated KB creation with organized files');
      console.log('🚀 [KB STEP] Frontend automation started with subfolder structure');
      
      // Step 1: Post "Requesting patient summary" message to chat
      console.log('[AUTO PS] Step 1: Posting request message to chat');
      console.log('💬 [KB STEP] Adding request message to chat history');
      const requestMessage = {
        role: 'assistant',
        content: 'Creating knowledge base from organized files...',
        name: 'System'
      };
      appState.chatHistory.push(requestMessage);
      console.log('[AUTO PS] ✅ Step 1 complete: Request message posted');
      console.log('✅ [KB STEP] Request message posted to chat');
      
      // Show loading indicator with KB indexing message
      appStateManager.setLoading(true, 'Creating knowledge base from organized files...');
      
      try {
        // Step 2: Call backend automation with organized files flag
        console.log(`[AUTO PS] Step 2: Calling backend automation for organized files`);
        console.log(`🔄 [KB STEP] Calling backend automation API with organized files`);
        
        const response = await fetch('/api/automate-kb-with-organized-files', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            userId: userId,
            useOrganizedFiles: true
          })
        });
        
        console.log(`📥 [KB STEP] Backend response status: ${response.status}`);
        
        if (!response.ok) {
          const error = await response.json();
          console.error(`[AUTO PS] ❌ Backend error: ${error.message || 'Unknown error'}`);
          throw new Error(error.message || `HTTP ${response.status}`);
        }
        
        const result = await response.json();
        console.log('[AUTO PS] ✅ Backend automation finished');
        console.log(`✅ [KB STEP] Backend automation completed successfully`);
        console.log(`🆔 [KB STEP] KB ID: ${result.kbId || 'N/A'}`);
        console.log(`📊 [KB STEP] Tokens indexed: ${result.tokensIndexed || 0}`);
        console.log(`📝 [KB STEP] Summary generated: ${result.summary ? 'Yes' : 'No'}`);
        console.log(`📥 [KB STEP] Full backend response:`, JSON.stringify(result, null, 2));
        
        // Step 3: Add patient summary to chat if available
        if (result.summary) {
          console.log('[AUTO PS] Step 3: Adding patient summary to chat');
          
          appState.chatHistory.push({
            role: 'assistant',
            content: result.summary,
            name: 'AI Assistant'
          });
          
          console.log('[AUTO PS] ✅ Patient summary added to chat');
        }
        
        // Clear loading state
        appStateManager.setLoading(false);
        
        // Show success notification
        $q.notify({
          type: 'positive',
          message: 'Knowledge base created and patient summary generated successfully!',
          timeout: 5000
        });
        
        // Refresh agent data to show new KB
        await refreshAgentData();
        
      } catch (error) {
        console.error('[AUTO PS] ❌ Automation failed:', error);
        appStateManager.setLoading(false);
        throw error;
      }
    };

    // Handle modal cancellation
    const handleCancelKBCreation = () => {
      showCreateKBActionModal.value = false;
      filesOrganized.value = false;
      kbValidationError.value = '';
      userKBsFromAPI.value = [];
      userKBsFromDB.value = [];
      
      // Enable KB status icon with yellow warning to indicate files available for indexing
      // This would need to be implemented in BottomToolbar or wherever the KB status icon is
      console.log('[*] KB Management cancelled - files available for indexing');
    };
    
    // Automated KB Creation and Patient Summary Process
    const automateKBCreationAndSummary = async () => {
      const startTime = Date.now();
      console.log('[AUTO PS] 🚀 Starting automated KB creation and patient summary process');
      console.log('🚀 [KB STEP] Frontend automation started');
      
      // Step 1: Post "Requesting patient summary" message to chat
      console.log('[AUTO PS] Step 1: Posting request message to chat');
      console.log('💬 [KB STEP] Adding request message to chat history');
      const requestMessage = {
        role: 'assistant',
        content: 'Requesting a new patient summary...',
        name: 'System'
      };
      appState.chatHistory.push(requestMessage);
      console.log('[AUTO PS] ✅ Step 1 complete: Request message posted');
      console.log('✅ [KB STEP] Request message posted to chat');
      
      // Show loading indicator with KB indexing message
      appStateManager.setLoading(true, 'Knowledge base indexing takes about 200 PDF pages per minute...');
      
      try {
        // Step 2: Get user info from backend
        const userId = currentUser.value?.userId || currentUser.value?.displayName;
        console.log(`[AUTO PS] Step 2: Checking user authentication (userId: ${userId})`);
        console.log(`👤 [KB STEP] Current user: ${userId}`);
        console.log(`📁 [KB STEP] Expected user folder: ${userId}/archived/`);
        
        if (!userId || userId === 'Public User') {
          console.log('❌ [KB STEP] Authentication failed - Public User cannot create KBs');
          throw new Error('User must be authenticated');
        }
        console.log(`[AUTO PS] ✅ User authenticated: ${userId}`);
        console.log(`✅ [KB STEP] User authentication verified: ${userId}`);
        
        // Check user's existing KBs before proceeding
        console.log(`🔍 [KB STEP] Checking user's existing knowledge bases`);
        try {
          const kbResponse = await fetch(`/api/knowledge-bases`);
          if (kbResponse.ok) {
            const kbData = await kbResponse.json();
            const userKBs = kbData.filter(kb => kb.name && kb.name.startsWith(userId));
            const kbNames = userKBs.map(kb => kb.name);
            console.log(`📚 [KB STEP] User KBs: ${kbNames.length > 0 ? kbNames.join(', ') : 'None'}`);
          }
        } catch (kbError) {
          console.log(`⚠️ [KB STEP] Could not fetch user KBs: ${kbError.message}`);
        }
        
        console.log(`[AUTO PS] Step 3: Fetching user document from /api/users/${userId}`);
        console.log(`🔍 [KB STEP] Fetching user document to find uploaded files`);
        
        // Get user document from backend to find files
        const userResponse = await fetch(`/api/users/${userId}`);
        if (!userResponse.ok) {
          throw new Error(`Failed to fetch user document: ${userResponse.status}`);
        }
        
        const userData = await userResponse.json();
        console.log(`[AUTO PS] ✅ User document fetched, files count: ${userData.files?.length || 0}`);
        console.log(`📋 [KB STEP] User document files:`, JSON.stringify(userData.files || [], null, 2));
        
        if (!userData.files || userData.files.length === 0) {
          console.log('❌ [KB STEP] No files found in user document - automation cannot proceed');
          throw new Error('No files found in user document');
        }
        
        // Get the most recent file (last in array)
        const recentFile = userData.files[userData.files.length - 1];
        console.log(`[AUTO PS] Step 4: Using most recent file "${recentFile.fileName}"`);
        console.log(`[AUTO PS]   - bucketKey: ${recentFile.bucketKey}`);
        console.log(`[AUTO PS]   - fileSize: ${recentFile.fileSize} bytes`);
        console.log(`📄 [KB STEP] Selected file for KB creation: ${recentFile.fileName}`);
        console.log(`🔗 [KB STEP] File bucket key: ${recentFile.bucketKey}`);
        console.log(`📏 [KB STEP] File size: ${recentFile.fileSize} bytes`);
        
        // Step 5: Call backend automation endpoint
        console.log(`[AUTO PS] Step 5: Calling backend automation endpoint`);
        console.log(`🔄 [KB STEP] Calling backend automation API`);
        console.log(`📤 [KB STEP] Sending to backend:`, JSON.stringify({
          userId: userId,
          fileName: recentFile.fileName,
          bucketKey: recentFile.bucketKey
        }, null, 2));
        
        const response = await fetch('/api/automate-kb-and-summary', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            userId: userId,
            fileName: recentFile.fileName,
            bucketKey: recentFile.bucketKey
          })
        });
        
        console.log(`[AUTO PS] Step 6: Backend responded with status ${response.status}`);
        console.log(`📥 [KB STEP] Backend response status: ${response.status}`);
        
        if (!response.ok) {
          const error = await response.json();
          console.error(`[AUTO PS] ❌ Backend error: ${error.message || 'Unknown error'}`);
          throw new Error(error.message || `HTTP ${response.status}`);
        }
        
        const result = await response.json();
        console.log('[AUTO PS] ✅ Step 6 complete: Backend automation finished');
        console.log(`[AUTO PS]   - KB created: ${result.kbId || 'N/A'}`);
        console.log(`[AUTO PS]   - Tokens indexed: ${result.tokensIndexed || 0}`);
        console.log(`[AUTO PS]   - Summary generated: ${result.summary ? 'Yes' : 'No'}`);
        console.log(`✅ [KB STEP] Backend automation completed successfully`);
        console.log(`🆔 [KB STEP] KB ID: ${result.kbId || 'N/A'}`);
        console.log(`📊 [KB STEP] Tokens indexed: ${result.tokensIndexed || 0}`);
        console.log(`📝 [KB STEP] Summary generated: ${result.summary ? 'Yes' : 'No'}`);
        console.log(`📥 [KB STEP] Full backend response:`, JSON.stringify(result, null, 2));
        
        // Step 7: Add patient summary to chat
        console.log('[PS SAVE2] 🖥️ Frontend received backend response');
        console.log('[PS SAVE2]   - Has summary: ', !!result.summary);
        if (result.summary) {
          console.log('[PS SAVE2]   - Summary length from backend: ', result.summary.length);
          console.log('[PS SAVE2]   - Summary preview: ', result.summary.substring(0, 100));
        }
        
        if (result.summary) {
          console.log('[AUTO PS] Step 7: Adding patient summary to chat');
          console.log('[PS SAVE2] 📝 Adding summary to appState.chatHistory');
          console.log('[PS SAVE2]   - Current chat history length: ', appState.chatHistory.length);
          
          appState.chatHistory.push({
            role: 'assistant',
            content: result.summary,
            name: 'Personal AI'
          });
          
          console.log('[PS SAVE2]   - New chat history length: ', appState.chatHistory.length);
          console.log('[AUTO PS] ✅ Step 7 complete: Summary added to chat');
          console.log('[PS SAVE2] ✅ Summary should now be visible in chat area');
        } else {
          console.warn('[PS SAVE2] ⚠️ No summary in backend response - chat will not show summary');
        }
        
        // Step 8: Refresh agent data to update KB status
        console.log('[AUTO PS] Step 8: Refreshing agent data to update UI');
        await refreshAgentData();
        console.log('[AUTO PS] ✅ Step 8 complete: Agent data refreshed');
        
        const totalTime = ((Date.now() - startTime) / 1000).toFixed(1);
        console.log(`[AUTO PS] ✅ AUTOMATION COMPLETE - Total time: ${totalTime}s`);
        
        $q.notify({
          type: 'positive',
          message: 'Knowledge base created and patient summary generated!',
          timeout: 5000
        });
        
      } catch (error) {
        console.error('[AUTO PS] ❌ AUTOMATION FAILED:', error);
        console.error(`[AUTO PS] ❌ Error message: ${error.message}`);
        console.error(`[AUTO PS] ❌ Error stack: ${error.stack}`);
        appState.chatHistory.push({
          role: 'assistant',
          content: `❌ **Error**: ${error.message}`,
          name: 'System Error'
        });
        throw error;
      } finally {
        appStateManager.setLoading(false);
        console.log('[AUTO PS] Loading indicator cleared');
      }
    };

    // Handle support request from New User Welcome Modal
    const handleSupportRequested = (data) => {
      console.log('✅ Support requested for new user:', data);
      showNewUserWelcomeModal.value = false;
      // Show the waiting for approval modal immediately
      showWaitingForApprovalModal.value = true;
    };


    // Watch for state changes and update UI accordingly
    watch([currentUser, currentAgent], ([newUser, newAgent], [oldUser, oldAgent]) => {
      if (newUser !== oldUser) {
        // User changed
      }
      if (newAgent !== oldAgent) {
        // Agent changed
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

    // Watch for chat history changes to update chat area height and detect PDF viewer commands
    watch(() => appState.chatHistory, (newHistory, oldHistory) => {
      // Check if a new PDF viewer command was added
      if (newHistory && newHistory.length > 0) {
        const lastMessage = newHistory[newHistory.length - 1];
        
        // Check for PDF viewer metadata
        if (lastMessage.metadata && lastMessage.metadata.type === 'pdf_viewer') {
          // Create a file object for the popup
          const pdfFile = {
            id: `pdf-link-${Date.now()}`,
            name: lastMessage.metadata.fileName,
            bucketKey: lastMessage.metadata.bucketKey,
            fileSize: lastMessage.metadata.fileSize,
            type: 'pdf',
            content: '', // Will be loaded by PopUp component
            startPage: lastMessage.metadata.page // Pass the requested page
          };
          
          // Set current viewing file and open popup
          appState.currentViewingFile = pdfFile;
          setTimeout(() => {
            showPopup();
          }, 100);
        }
      }
      
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

    // Check if No Agent Welcome Modal should be shown
    const checkForNoAgentWelcome = () => {
      // Simple logic: Show appropriate modal based on workflow stage
      
      // Must have a current user (not null/undefined)
      if (!currentUser.value) {
        return;
      }
      
      // Skip for Public User
      if (currentUser.value.userId === 'Public User') {
        return;
      }
      
      // Skip for deep link users
      if (currentUser.value.userId?.startsWith('deep_link_')) {
        return;
      }
      
      // Check if user has an agent
      if (currentAgent.value) {
        return; // User already has agent
      }

      // User has no agent - check workflow stage to determine which modal to show
      const workflowStage = currentUser.value.workflowStage;
      
      if (workflowStage === 'request_email_sent' || workflowStage === 'awaiting_approval' || workflowStage === 'approved') {
        // User has requested support - show waiting modal
        showWaitingForApprovalModal.value = true;
      } else {
        // User hasn't requested support yet - show new user welcome modal
        showNewUserWelcomeModal.value = true;
      }
    };

    // New modal state for KB creation action after file upload
    const showCreateKBActionModal = ref(false);

    // Check if Knowledge Base Welcome Modal should be shown
    const checkForKnowledgeBaseWelcome = () => {
      // After file upload, show the action modal instead of welcome modal
      // Must have a current user (not null/undefined)
      if (!currentUser.value) {
        return;
      }
      
      // Skip for deep link users
      if (currentUser.value.userId?.startsWith('deep_link_')) {
        return;
      }
      
      // Skip for Public User
      if (currentUser.value.userId === 'Public User') {
        return;
      }
      
      // Must have an agent (shown in Agent Badge)
      if (!currentAgent.value) {
        return;
      }
      
      // Must NOT have a KB attached (from Agent Badge)
      if (currentKnowledgeBase.value) {
        return; // User already has KB attached
      }

      // ✅ User has agent but no KB and just uploaded a file
      // Show the Create KB Action modal and fetch KB data
      // Reset state when opening modal
      filesOrganized.value = false;
      organizedKBs.value = [];
      showCreateKBActionModal.value = true;
      fetchUserKBs();
    };

    // Watch for user and agent changes to check if No Agent modal should be shown
    // Modal appears when user signs in without agent, disappears when agent is assigned
    watch([currentUser, currentAgent], () => {
      checkForNoAgentWelcome();
    }, { immediate: true });

    // NOTE: checkForKnowledgeBaseWelcome() is ONLY called by @file-uploaded event
    // NOT by a watcher, because we only want to show CreateKBActionModal AFTER
    // a file is actually uploaded, not just because user has agent but no KB

    // Check if user needs to be guided to upload a file for KB creation
    const checkForNoKBWelcome = () => {
      // Must have a current user (not null/undefined)
      if (!currentUser.value) {
        return;
      }
      
      // Skip for deep link users
      if (currentUser.value.userId?.startsWith('deep_link_')) {
        return;
      }
      
      // Skip for Public User (they have their own modal)
      if (currentUser.value.userId === 'Public User') {
        return;
      }
      
      // Must have an agent (shown in Agent Badge)
      if (!currentAgent.value) {
        return;
      }
      
      // Must NOT have a KB attached (from Agent Badge)
      if (currentKnowledgeBase.value) {
        return;
      }

      // ✅ User has agent but no KB - show KnowledgeBaseWelcomeModal to guide file upload
      showKnowledgeBaseWelcomeModal.value = true;
    };

    // Watch for user, agent, and KB changes to show file upload guidance
    watch([currentUser, currentAgent, currentKnowledgeBase], () => {
      checkForNoKBWelcome();
    }, { immediate: true });

    // Check if Public User needs KB attachment warning
    const checkForPublicUserNoKB = () => {
      // Must be Public User
      if (currentUser.value?.userId !== 'Public User') {
        return;
      }
      
      // Must have an agent assigned
      if (!currentAgent.value) {
        return;
      }
      
      // Check if agent has no KB attached
      const hasKB = currentAgent.value.knowledgeBases?.length > 0 || currentAgent.value.knowledgeBase;
      
      if (!hasKB) {
        console.log(`[PUBLIC] Showing no-KB warning for Public User`);
        showPublicUserNoKBModal.value = true;
      }
    };

    // Watch for Public User's agent and KB changes
    watch([currentUser, currentAgent, currentKnowledgeBase], () => {
      checkForPublicUserNoKB();
    }, { immediate: true });

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
        appStateManager.setLoading(true); // Use default AI query message
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
        appStateManager.setLoading(false);
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
        appStateManager.setLoading(false);
      }

      logMessage({
        role: "user",
        content: `Sent query to ${appState.selectedAI}`,
      });
    };
const triggerUploadFile = (file: File) => {
  return uploadFile(file, appState, writeMessage, currentUser.value);
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
    const saveToFile = async () => {
      try {
        // Ensure userName is set from currentUser for transcript generation
        const userName = currentUser.value?.displayName || currentUser.value?.userId || 'Public User';
        appState.userName = userName;
        
        // Find the chat area element to capture
        const chatAreaElement = document.querySelector('.chat-area') || 
                               document.querySelector('.q-scrollarea') ||
                               document.querySelector('.chat-container');
        
        if (!chatAreaElement) {
          throw new Error('Chat area element not found');
        }
        
        // Configure html2pdf options for selectable text and good quality
        const opt = {
          margin: 0.5, // Small margin
          filename: 'transcript.pdf',
          image: { 
            type: 'jpeg', 
            quality: 0.98 
          },
          html2canvas: { 
            scale: 2, // High quality
            useCORS: true,
            allowTaint: true,
            backgroundColor: '#ffffff'
          },
          jsPDF: { 
            unit: 'in', 
            format: 'a4', 
            orientation: 'portrait' 
          }
        };
        
        // Generate PDF with selectable text
        await html2pdf().from(chatAreaElement).set(opt).save();
        
        logSystemEvent("Chat area saved as PDF with selectable text", {}, appState);
        
      } catch (error) {
        console.error('Error in saveToFile:', error);
        writeMessage("Failed to save transcript: " + error.message, "error");
      }
    };
    const closeNoSave = () => {
      // Reload the page to end the session without saving
      window.location.reload();
    };
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
    
    // Safari detection
    const isSafari = () => {
      const ua = navigator.userAgent.toLowerCase();
      return ua.indexOf('safari') !== -1 && ua.indexOf('chrome') === -1 && ua.indexOf('chromium') === -1;
    };
    
    const handleSignIn = () => {
      // DISABLED 2025-10-18: Passkeys are working in Safari again
      // Check for Safari browser
      // if (isSafari()) {
      //   showSafariWarningModal.value = true;
      //   return;
      // }
      // Open the passkey authentication dialog
      showPasskeyAuthDialog.value = true;
    };

    const handleSignInAnyway = () => {
      // User clicked "Try Anyway" on Safari warning - proceed with passkey auth
      console.log('[Safari Warning] User chose to try passkey authentication anyway');
      showPasskeyAuthDialog.value = true;
    };
    
    const handleSignInCancelled = () => {
      // Close the passkey authentication dialog
      showPasskeyAuthDialog.value = false;
    };
    const groupCount = ref(0);
    const updateGroupCount = async () => {
      try {
        // Use cached data from the backend instead of calling getAllGroupChats()
        const response = await fetch('/api/group-chats');
        if (!response.ok) {
          throw new Error(`Failed to fetch group chats: ${response.statusText}`);
        }
        const allGroups = await response.json();
        
        // Get current user name for filtering (same logic as Admin Panel)
        const currentUserName = currentUser.value?.userId || currentUser.value?.displayName || 'Unknown User';
        
        // Filter groups by current user (same logic as GroupManagementModal and SavedChatsDialog)
        let filteredGroups: any[];
        
        // Check if this is a deep link user with shareId
        const isDeepLinkUser = currentUser.value && typeof currentUser.value === 'object' && 
                              currentUser.value.userId && currentUser.value.userId.startsWith('deep_link_');
        const deepLinkShareId = currentUser.value?.shareId || null;
        
        if (isDeepLinkUser && deepLinkShareId) {
          // Deep link users see chats that match their shareId
          filteredGroups = allGroups.filter(group => group.shareId === deepLinkShareId);
        } else {
          // Regular users see chats that match their currentUser
          filteredGroups = allGroups.filter(group => {
            const isOwner = group.currentUser === currentUserName;
            const isPatientOwner = group.patientOwner === currentUserName;
            const isDeepLink = group.shareType === "deep_link";
            return (isOwner || isPatientOwner) && !isDeepLink;
          });
        }
        
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
      
      
      if (isLegacyChat) {
        // Legacy CouchDB chats already have proper UploadedFile format
        // No reconstruction needed - they were saved with the correct structure
        appState.uploadedFiles = filesToUse;
      } else {
        // New GroupChat format - reconstruct UploadedFile objects
        const reconstructedFiles = filesToUse.map((file: any) => {
          // If it's already a proper UploadedFile, return as-is
          if (file.originalFile instanceof File) {
            return file;
          }
          
          // If it's a database-loaded file, reconstruct the proper structure
          if (file.originalFile && typeof file.originalFile === 'object' && file.originalFile.base64) {
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
          return file;
        });
        
        appState.uploadedFiles = reconstructedFiles;
      }
      
      // Set the current chat ID for future updates
      appState.currentChatId = chat._id || chat.id;
      
      // Reset chat state to prevent "Modified" status when loading saved chats
      // This ensures the POST TO GROUP button doesn't appear unnecessarily
      if (chatAreaRef.value && typeof chatAreaRef.value.initializeChatState === 'function') {
        chatAreaRef.value.initializeChatState();
      }
      
      // Show success message
      writeMessage(
        `Loaded chat from ${new Date(chat.createdAt).toLocaleDateString()}`,
        "success"
      );
    };
    const handleDeepLinkUpdated = () => {};
    const handleGroupDeleted = async () => {
      // Update the group count when a chat is deleted
      await updateGroupCount();
    };
    
    const handleGroupSaved = async () => {
      // Update the group count when a chat is saved
      await updateGroupCount();
    };
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

    // Helper function to format file size in MB
    const formatFileSizeMB = (bytes) => {
      if (!bytes) return '0 MB';
      const mb = bytes / (1024 * 1024);
      return `${mb.toFixed(2)} MB`;
    };

    // Computed: check selections for existing vs new KB candidates
    const hasPreKBForExisting = computed(() => {
      const labelsExisting = new Set(kbInfo.value.filter((k: any) => k.exists).map((k: any) => `preKB${k.label}`));
      return kbFileLocations.value.some((file: any) => Object.keys(file.selectedLocations || {}).some(key => labelsExisting.has(key) && file.selectedLocations[key]));
    });
    const hasPreKBForNew = computed(() => {
      const labelsNew = new Set(kbInfo.value.filter((k: any) => !k.exists).map((k: any) => `preKB${k.label}`));
      return kbFileLocations.value.some((file: any) => Object.keys(file.selectedLocations || {}).some(key => labelsNew.has(key) && file.selectedLocations[key]));
    });

    // Computed: table columns based on KB info
    const tableColumns = computed(() => {
      const cols = [
        { name: 'fileName', label: 'File', field: 'fileName', align: 'left', style: 'max-width: 200px; overflow: hidden; text-overflow: ellipsis;' }
      ];
      
      // Replace Available with View column (eye icon)
      cols.push({ name: 'view', label: 'View', field: 'view', align: 'center' });
      
      // Add columns for each KB (In KB only)
      kbInfo.value.forEach(kb => {
        cols.push({ name: `inKB${kb.label}`, label: `In KB ${kb.label}`, field: `inKB${kb.label}`, align: 'center' });
      });
      
      return cols;
    });

    // Enablement computeds for action buttons (2-level design)
    const hasUpdateForExisting = computed(() => {
      const existing = kbInfo.value.filter((k: any) => k.exists);
      if (existing.length === 0) return false;
      return kbFileLocations.value.some((file: any) => existing.some((k: any) => {
        const key = `inKB${k.label}`;
        return (file.locations?.[key] || false) !== (file.originalLocations?.[key] || false);
      }));
    });
    const hasCreateForNew = computed(() => {
      const newKB = kbInfo.value.find((k: any) => !k.exists) || previewKB.value;
      if (!newKB) return false;
      const key = `inKB${newKB.label}`;
      return kbFileLocations.value.some((file: any) => file.locations?.[key] === true);
    });

    // Handle checkbox toggle - moves files immediately
    const toggleLocation = async (file, locationKey) => {
      if (!file.selectedLocations) file.selectedLocations = {};
      
      const wasChecked = file.selectedLocations[locationKey] || false;
      const currentLocation = Object.keys(file.selectedLocations).find(key => file.selectedLocations[key]);
      const userId = currentUser.value?.userId;
      
      if (!userId) {
        console.error(`❌ [KB STEP] No user ID available for file move`);
        return;
      }
      
      // Determine target location and KB name if needed
      let targetLocation = locationKey;
      let kbName = null;
      
      if (locationKey.startsWith('inKB')) {
        // Extract KB label (A, B, etc.) and find corresponding KB name
        const kbLabel = locationKey.replace('inKB', '');
        const matchingKB = kbInfo.value.find((kb: any) => kb.label === kbLabel);
        if (matchingKB) {
          kbName = matchingKB.kbName;
        }
      }
      
      // If checking a location, uncheck others (only one location per file)
      if (!wasChecked) {
        const fromLocation = currentLocation ? `(${currentLocation})` : '';
        console.log(`🔘 [KB STEP] CHECKBOX: Checking ${file.fileName} for location '${locationKey}' ${fromLocation}`);
        
        // No preview preKB logic in new design

        // Call API to move file immediately
        try {
          const response = await fetch('/api/kb-move-file', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              userId: userId,
              fileName: file.fileName,
              currentBucketKey: file.bucketKey,
              targetLocation: targetLocation,
              kbName: kbName
            })
          });
          
          const result = await response.json();
          
          if (result.success) {
            console.log(`✅ [KB STEP] MOVED file: ${file.fileName} from ${file.bucketKey} to ${result.newBucketKey}`);
            console.log(`📊 [KB STEP] Files in KB root after move: ${result.filesInKBRoot || 0}`);
            
            // Update file's bucket key
            file.bucketKey = result.newBucketKey;
            
            // Update selected locations in UI
            Object.keys(file.selectedLocations).forEach(key => {
              file.selectedLocations[key] = false;
            });
            file.selectedLocations[locationKey] = true;
            
            // Update file's locations to reflect new state (Level 1/2)
            file.locations = file.locations || {};
            // Update location flags based on new bucket key
            if (targetLocation === 'available') {
              file.locations.available = true;
              // Clear any inKB flags
              Object.keys(file.locations).forEach((k: string) => {
                if (k.startsWith('inKB')) delete (file.locations as any)[k];
              });
            } else if (targetLocation.startsWith('inKB')) {
              file.locations.available = false;
              // Set the specific inKB location to true
              file.locations[targetLocation] = true;
            }
          } else {
            console.error(`❌ [KB STEP] Failed to move file: ${result.message}`);
            // Revert checkbox state on error
            return;
          }
        } catch (error) {
          console.error(`❌ [KB STEP] Error moving file:`, error);
          // Revert checkbox state on error
          return;
        }
      } else {
        // Unchecking: move back to available (Level 1)
        console.log(`🔘 [KB STEP] CHECKBOX: Unchecking ${file.fileName} from location '${locationKey}' - moving to available`);
        
        try {
          const response = await fetch('/api/kb-move-file', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              userId: userId,
              fileName: file.fileName,
              currentBucketKey: file.bucketKey,
              targetLocation: 'available',
              kbName: null
            })
          });
          
          const result = await response.json();
          
          if (result.success) {
            console.log(`✅ [KB STEP] MOVED file back to available: ${file.fileName} from ${file.bucketKey} to ${result.newBucketKey}`);
            
            // Update file's bucket key
            file.bucketKey = result.newBucketKey;
            
            // Update selected locations in UI
            file.selectedLocations[locationKey] = false;
            
            // Update file's locations
            file.locations = file.locations || {};
            file.locations.available = true;
            // Clear inKB flags
            Object.keys(file.locations).forEach((k: string) => {
              if (k.startsWith('inKB')) delete (file.locations as any)[k];
            });
          } else {
            console.error(`❌ [KB STEP] Failed to move file back: ${result.message}`);
          }
        } catch (error) {
          console.error(`❌ [KB STEP] Error moving file back:`, error);
        }
      }
      
      // Count files in KB root after change (approx via selection state)
      const labels = kbInfo.value.map((k: any) => `inKB${k.label}`);
      const filesInAnyKB = kbFileLocations.value.filter(f => labels.some(k => f.locations?.[k] === true)).length;
      console.log(`📊 [KB STEP] Files in KB roots after checkbox: ${filesInAnyKB}`);
    };

    // Action button labels based on KB labels
    const existingKB = computed(() => kbInfo.value.find((k: any) => k.exists));
    const previewKBInfo = computed(() => kbInfo.value.find((k: any) => !k.exists));
    const updateKBLabel = computed(() => `UPDATE KB ${existingKB.value?.label || 'A'}`);
    const createNewKBLabel = computed(() => `CREATE NEW KB ${previewKBInfo.value?.label || previewKB.value?.label || 'A'}`);

    // Actions for buttons
    const handleAddToExistingKB = async () => {
      console.log('🟣 [KB STEP] ADD TO KNOWLEDGE BASE clicked - will update existing KB with selected files');
      // Ensure we do not create a new KB in this path
      previewKB.value = null;
      
      // Find which KBs need updating (existing KBs with changed files)
      const existingKBs = kbInfo.value.filter((k: any) => k.exists);
      const kbNamesToUpdate = existingKBs.filter((kb: any) => {
        const key = `inKB${kb.label}`;
        return kbFileLocations.value.some((file: any) => {
          const wasInKB = file.originalLocations?.[key] || false;
          const isNowInKB = file.locations?.[key] || false;
          return isNowInKB && !wasInKB; // File newly added to this KB
        });
      }).map((kb: any) => kb.kbName);
      
      if (kbNamesToUpdate.length === 0) {
        console.warn('⚠️ [KB STEP] No KBs found to update');
        return;
      }
      
      console.log(`🔄 [KB STEP] Updating KBs: ${kbNamesToUpdate.join(', ')}`);
      
      // Call update endpoint for each KB
      for (const kbName of kbNamesToUpdate) {
        await updateExistingKB(currentUser.value.userId, kbName);
      }
      
      // Refresh KB data
      await fetchUserKBs();
      showCreateKBActionModal.value = false;
    };
    const handleCreateNewKBAction = async () => {
      console.log('🟢 [KB STEP] CREATE A NEW KNOWLEDGE BASE clicked');
      await handleCreateKB();
    };
    
    // Update an existing KB by triggering re-indexing
    const updateExistingKB = async (userId: string, kbName: string) => {
      try {
        console.log(`🔄 [KB STEP] Updating existing KB: ${kbName}`);
        const response = await fetch('/api/update-kb-files', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userId, kbName })
        });
        
        if (!response.ok) {
          const error = await response.json();
          throw new Error(error.message || `HTTP ${response.status}`);
        }
        
        const result = await response.json();
        console.log(`✅ [KB STEP] KB ${kbName} updated successfully`);
        return result;
      } catch (error: any) {
        console.error(`❌ [KB STEP] Failed to update KB ${kbName}:`, error.message);
        throw error;
      }
    };

    // Open viewer for a file using the same modal code used in chat area
    const openKBFile = (file: any) => {
      const pdfFile = {
        id: `kb-view-${Date.now()}`,
        name: file.fileName,
        bucketKey: file.bucketKey,
        fileSize: file.fileSize,
        type: 'pdf',
        content: '',
        startPage: 1
      };
      viewFile(pdfFile as any);
    };

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
      showNewUserWelcomeModal,
      showWaitingForApprovalModal,
      showKnowledgeBaseWelcomeModal,
      showPublicUserKBWelcomeModal,
      showPublicUserNoKBModal,
      showSafariWarningModal,
      isSafari,
      showCreateKBActionModal,
      userKBsFromAPI,
      userKBsFromDB,
      kbValidationError,
      filesOrganized,
      isPreparingFolder,
      isLoadingKBData,
      availableFiles,
      organizedKBs,
      kbFileLocations,
      kbInfo,
      formatFileSizeMB,
      hasPreKBForExisting,
      hasPreKBForNew,
      tableColumns,
      toggleLocation,
      handleAddToExistingKB,
      handleCreateNewKBAction,
      updateKBLabel,
      createNewKBLabel,
      hasCreateForNew,
      hasUpdateForExisting,
      openKBFile,
      fetchUserKBs,
      prepareFolder,
      handleCreateKB,
      handleCancelKBCreation,
      automateKBCreationWithOrganizedFiles,
      updateExistingKB,
      triggerFileImport,
      handleOpenKBManager,
      handleImportFile,
      handleContinueFromWelcome,
      handleOpenPublicKBManager,
      handleOpenAgentManagementFromNoKB,
      handleSupportRequested,
      checkForKnowledgeBaseWelcome,
      
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
      triggerKBWelcome,
      handleDeepLink,
      handleDeepLinkUserIdentified,
      handleUserAuthenticated,
      handleSignOut,
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
      handleSignInAnyway,
      handleSignInCancelled,
      groupCount,
      updateGroupCount,
      handleChatLoaded,
      handleDeepLinkUpdated,
      handleGroupDeleted,
      handleGroupSaved,
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
      @group-saved="handleGroupSaved"
      @edit-message="editMessage"
      @save-message="saveMessage"
      @view-system-message="
        (content: string) => {
          appState.popupContent = content;
          showPopup();
        }
      "
      @save-to-file="saveToFile"
      @trigger-save-to-couchdb="triggerSaveToCouchDB"
      @close-no-save="closeNoSave"
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
      :triggerKBWelcome="triggerKBWelcome"
      :triggerFileImport="triggerFileImport"
      :clearLocalStorageKeys="clearLocalStorageKeys"
      @write-message="writeMessage"
      @show-saved-chats="showSavedChatsDialog = true"
      @trigger-agent-management="triggerAgentManagement"
      @show-popup="showPopup"
      @sign-in="handleSignIn"
      @sign-out="handleSignOut"
      @file-uploaded="checkForKnowledgeBaseWelcome"
    />

    <!-- Modals and Dialogs -->
    <SavedChatsDialog
      v-model="showSavedChatsDialog"
      :currentUser="currentUser"
      @chat-selected="handleChatLoaded"
      @group-deleted="handleGroupDeleted"
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

    <NewUserWelcomeModal
      v-model="showNewUserWelcomeModal"
      :currentUser="currentUser"
      @support-requested="handleSupportRequested"
    />

    <WaitingForApprovalModal
      v-model="showWaitingForApprovalModal"
    />

    <KnowledgeBaseWelcomeModal
      v-model="showKnowledgeBaseWelcomeModal"
      :current-user="currentUser"
      @open-manager="handleOpenKBManager"
      @import-file="handleImportFile"
      @continue="handleContinueFromWelcome"
    />

    <PublicUserKBWelcomeModal
      v-model="showPublicUserKBWelcomeModal"
      :current-user="currentUser"
      @open-manager="handleOpenPublicKBManager"
    />

    <PublicUserNoKBModal
      v-model="showPublicUserNoKBModal"
      @open-agent-management="handleOpenAgentManagementFromNoKB"
    />

    <SafariWarningModal
      v-model="showSafariWarningModal"
      @try-anyway="handleSignInAnyway"
    />

    <!-- Enhanced KB Management Modal -->
    <QDialog v-model="showCreateKBActionModal" persistent>
      <QCard style="width: 80vw; max-width: 80vw">
        <QCardSection class="text-center q-pt-lg">
          <div class="text-h5 q-mb-md">📚 Knowledge Base Management</div>
        </QCardSection>

        <!-- Loading State -->
        <QCardSection v-if="isLoadingKBData" class="text-center">
          <QSpinner size="40px" color="primary" />
          <div class="q-mt-md">Loading knowledge base information...</div>
        </QCardSection>

        <!-- Error State -->
        <QCardSection v-else-if="kbValidationError" class="text-center">
          <QIcon name="error" size="40px" color="negative" />
          <div class="text-h6 q-mt-md text-negative">Database Inconsistency Detected</div>
          <div class="q-mt-md text-body2" style="white-space: pre-line">{{ kbValidationError }}</div>
          <div class="q-mt-md text-caption">
            Please contact support to resolve this issue before proceeding.
          </div>
        </QCardSection>

        <!-- Normal State - Table View -->
        <QCardSection v-else>
          <!-- Table View -->
          <div v-if="kbFileLocations.length === 0" class="text-center text-grey-6 q-py-lg">
            No files found
          </div>
          
          <div v-else class="kb-file-table-container" style="max-height: 400px; overflow-x: auto;">
            <table class="kb-location-table" style="width: 100%; border-collapse: collapse;">
              <thead>
                <tr>
                  <th style="text-align: left; padding: 8px; border-bottom: 1px solid #e0e0e0;">File</th>
                  <th style="text-align: center; padding: 8px; border-bottom: 1px solid #e0e0e0;">Available</th>
                  <template v-for="kb in kbInfo" :key="kb.kbName">
                    <th style="text-align: center; padding: 8px; border-bottom: 1px solid #e0e0e0;">In KB {{ kb.label }}</th>
                  </template>
                </tr>
              </thead>
              <tbody>
                <tr v-for="file in kbFileLocations" :key="file.fileName" style="border-bottom: 1px solid #f0f0f0;">
                  <td style="padding: 8px; min-width: 200px;">
                    <div class="text-body2">
                      <QIcon name="description" size="14px" class="q-mr-xs" />
                      {{ file.fileName }}
                      <div class="text-caption text-grey-6">
                        {{ formatFileSizeMB(file.fileSize) }}
                      </div>
                    </div>
                  </td>
                  
                  <!-- View Column -->
                  <td style="padding: 8px; text-align: center;">
                    <QIcon name="visibility" size="20px" class="cursor-pointer" @click="openKBFile(file)" />
                  </td>
                  
                  <!-- KB Columns (dynamic) -->
          <template v-for="kb in kbInfo" :key="kb.kbName">
            <!-- In KB Column (interactive) -->
            <td style="padding: 8px; text-align: center;">
              <QCheckbox
                :model-value="file.locations?.[`inKB${kb.label}`] === true"
                color="primary"
                @update:model-value="toggleLocation(file, `inKB${kb.label}`)"
              />
            </td>
          </template>
                </tr>
              </tbody>
            </table>
          </div>
          
          <!-- KB Legend -->
          <div v-if="kbInfo.length > 0" class="q-mt-lg q-pt-md" style="border-top: 1px solid #e0e0e0;">
            <div class="text-caption text-grey-7 q-mb-xs"><strong>Knowledge Base Legend:</strong></div>
            <div v-for="kb in kbInfo" :key="kb.kbName" class="text-caption" :class="{ 'text-grey-5': !kb.exists }">
              KB {{ kb.label }}: {{ kb.kbName }}
            </div>
          </div>


        </QCardSection>

        <!-- Action Buttons -->
        <QCardActions align="center" class="q-pa-lg">
          <QBtn
            flat
            label="NOT YET"
            @click="handleCancelKBCreation"
            class="q-mr-md"
            :disable="isLoadingKBData"
          />
          
          <QSpace />
          
          <!-- CREATE A NEW KNOWLEDGE BASE (enabled when files marked for preview KB) -->
          <QBtn
            :color="hasCreateForNew ? 'primary' : 'grey-6'"
            :label="createNewKBLabel"
            @click="handleCreateNewKBAction"
            class="q-px-md q-ml-sm"
            unelevated
            :disable="!hasCreateForNew || isLoadingKBData"
          />

          <!-- ADD TO KNOWLEDGE BASE (enabled when files marked for existing KBs) -->
          <QBtn
            :color="hasUpdateForExisting ? 'primary' : 'grey-6'"
            :label="updateKBLabel"
            @click="handleAddToExistingKB"
            class="q-px-md q-ml-sm"
            unelevated
            :disable="!hasUpdateForExisting || isLoadingKBData"
          />
        </QCardActions>
      </QCard>
    </QDialog>

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
