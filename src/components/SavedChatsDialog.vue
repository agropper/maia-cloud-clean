<template>
  <q-dialog v-model="isOpen" persistent>
    <q-card style="min-width: 600px; max-width: 800px;">
      <q-card-section class="row items-center q-pb-none">
        <div class="text-h6">Saved Chats</div>
        <q-space />
        <q-btn icon="close" flat round dense v-close-popup />
      </q-card-section>

      <q-card-section>
        <div v-if="loading" class="text-center q-pa-md">
          <q-spinner size="2em" />
          <div class="q-mt-sm">Loading saved chats...</div>
        </div>

        <div v-else-if="error" class="text-center q-pa-md">
          <q-icon name="error" color="negative" size="40px" />
          <div class="text-negative q-mt-sm">{{ error }}</div>
          <q-btn
            label="Retry"
            color="primary"
            @click="loadSavedChats"
            class="q-mt-md"
          />
        </div>

        <div v-else-if="savedChats.length === 0" class="text-center q-pa-md text-grey">
          <q-icon name="chat" size="3em" />
          <div class="q-mt-sm">No saved chats found</div>
          <div class="text-caption">Create your first chat by posting a message!</div>
        </div>

        <div v-else class="chat-list">
          <div 
            v-for="chat in sortedChats" 
            :key="chat.id" 
            class="chat-item q-pa-md q-mb-sm"
            :class="{ 'owner-chat': isOwner(chat) }"
          >
            <div class="row items-center justify-between">
              <div class="col clickable" @click="selectChat(chat)">
                <div class="row items-center q-mb-xs">
                  <div class="text-weight-medium text-body1">
                    {{ formatDate(chat.updatedAt || chat.createdAt) }}
                  </div>
                  <q-chip 
                    v-if="isOwner(chat)" 
                    size="sm" 
                    color="primary" 
                    text-color="white"
                    class="q-ml-sm"
                  >
                    Owner
                  </q-chip>
                </div>
                
                <!-- First message preview (up to 100 characters) -->
                <div v-if="getFirstMessagePreview(chat)" class="text-caption text-grey q-mb-xs">
                  {{ getFirstMessagePreview(chat) }}...
                </div>
                
                <!-- File attachments -->
                <div v-if="chat.uploadedFiles && chat.uploadedFiles.length > 0" class="text-caption text-grey q-mt-xs">
                  <q-icon name="attach_file" size="xs" />
                  <span class="file-list">
                    {{ formatFileList(chat.uploadedFiles) }}
                  </span>
                </div>
              </div>
              
              <div class="row items-center">
                <q-btn
                  v-if="isOwner(chat)"
                  flat
                  round
                  dense
                  icon="delete"
                  color="negative"
                  @click.stop="handleDeleteChat(chat.id)"
                  title="Delete chat"
                />
                <q-btn
                  flat
                  round
                  dense
                  icon="link"
                  color="primary"
                  @click.stop="copyChatLink(chat)"
                  title="Copy chat link"
                />
              </div>
            </div>
          </div>
        </div>
      </q-card-section>
    </q-card>
  </q-dialog>
</template>

<script lang="ts">
import { defineComponent, ref, onMounted, computed } from "vue";
import {
  QDialog,
  QCard,
  QCardSection,
  QBtn,
  QSpinner,
  QIcon,
  QChip,
  QSpace,
} from "quasar";
import { useGroupChat, type GroupChat } from "../composables/useGroupChat";
import { useCouchDB } from "../composables/useCouchDB";

export default defineComponent({
  name: "SavedChatsDialog",
  components: {
    QDialog,
    QCard,
    QCardSection,
    QBtn,
    QSpinner,
    QIcon,
    QChip,
    QSpace,
  },
  props: {
    modelValue: {
      type: Boolean,
      required: true,
    },
    currentUser: {
      type: [String, Object],
      required: true,
    },
  },
  emits: ["update:modelValue", "chat-selected"],
  setup(props, { emit }) {
    const { getAllGroupChats } = useGroupChat();
    const { loadChats, deleteChat } = useCouchDB();

    const isOpen = ref(props.modelValue);
    const savedChats = ref<GroupChat[]>([]);
    const loading = ref(false);
    const error = ref("");

    const loadSavedChats = async () => {
      loading.value = true;
      error.value = "";

      try {
        // Load from both GroupChat and CouchDB systems
        const [allGroups, couchChats] = await Promise.all([
          getAllGroupChats().catch(() => []), // Don't fail if GroupChat system is unavailable
          loadChats().catch(() => []) // Don't fail if CouchDB system is unavailable
        ]);
        
        console.log('🔗 [DEEP LINK CHATS] Loaded all groups:', allGroups.length);
        console.log('🔗 [DEEP LINK CHATS] Loaded couch chats:', couchChats.length);
        
        // Get current user name for filtering
        let currentUserName: string;
        if (typeof props.currentUser === 'object' && props.currentUser !== null) {
          currentUserName = props.currentUser.userId || props.currentUser.displayName || 'Unknown User';
        } else {
          currentUserName = props.currentUser || 'Unknown User';
        }
        
        console.log('🔗 [DEEP LINK CHATS] Current user name for filtering:', currentUserName);
        console.log('🔗 [DEEP LINK CHATS] Current user object:', props.currentUser);
        
        // Filter GroupChats by current user (exclude deep link shares)
        const filteredGroups = allGroups.filter(group => {
          const isOwner = group.currentUser === currentUserName;
          const isPatientOwner = group.patientOwner === currentUserName;
          const isDeepLink = group.shareType === "deep_link";
          const shouldInclude = (isOwner || isPatientOwner) && !isDeepLink;
          
          console.log('🔗 [DEEP LINK CHATS] Group:', {
            id: group.id,
            currentUser: group.currentUser,
            patientOwner: group.patientOwner,
            shareType: group.shareType,
            isOwner,
            isPatientOwner,
            isDeepLink,
            shouldInclude
          });
          
          return shouldInclude;
        });
        
        // Convert CouchDB chats to GroupChat format for compatibility
        const convertedCouchChats = couchChats.map(chat => ({
          id: chat.id,
          shareId: `legacy_${chat.id}`, // Create a legacy shareId
          currentUser: currentUserName, // Use current user as owner
          connectedKB: '', // Legacy chats don't have KB info
          createdAt: chat.createdAt,
          updatedAt: chat.updatedAt,
          participantCount: chat.participantCount,
          messageCount: chat.messageCount,
          chatHistory: chat.chatHistory,
          uploadedFiles: chat.uploadedFiles, // These are already in UploadedFile format
          isShared: false,
          shareType: 'private' // Legacy chats are private
        }));
        
        // Combine both sources
        savedChats.value = [...filteredGroups, ...convertedCouchChats];
        
        console.log('🔗 [DEEP LINK CHATS] Filtered groups:', filteredGroups.length);
        console.log('🔗 [DEEP LINK CHATS] Converted couch chats:', convertedCouchChats.length);
        console.log('🔗 [DEEP LINK CHATS] Final saved chats:', savedChats.value.length);
        console.log('🔗 [DEEP LINK CHATS] Final saved chats details:', savedChats.value.map(chat => ({
          id: chat.id,
          currentUser: chat.currentUser,
          shareType: chat.shareType,
          isShared: chat.isShared
        })));
      } catch (err) {
        error.value = err instanceof Error ? err.message : "Failed to load chats";
      } finally {
        loading.value = false;
      }
    };

    const selectChat = (chat: GroupChat) => {
      emit("chat-selected", chat);
      emit("update:modelValue", false);
    };

    const isOwner = (chat: GroupChat) => {
      let currentUserName: string;
      if (typeof props.currentUser === 'object' && props.currentUser !== null) {
        currentUserName = props.currentUser.userId || props.currentUser.displayName || 'Unknown User';
      } else {
        currentUserName = props.currentUser || 'Unknown User';
      }
      return chat.currentUser === currentUserName;
    };

    const formatDate = (dateString: string) => {
      const date = new Date(dateString);
      return date.toLocaleDateString() + ' ' + date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    };

    const formatFileList = (files: any[]) => {
      if (!files || files.length === 0) return '';
      
      // Show up to 3 file names, then "and X more" if there are more
      const maxFiles = 3;
      if (files.length <= maxFiles) {
        return files.map(file => file.name || 'Unknown file').join(', ');
      } else {
        const shownFiles = files.slice(0, maxFiles).map(file => file.name || 'Unknown file');
        const remainingCount = files.length - maxFiles;
        return `${shownFiles.join(', ')} and ${remainingCount} more`;
      }
    };

    const getFirstMessagePreview = (chat: GroupChat): string => {
      if (chat.chatHistory && chat.chatHistory.length > 1) {
        const secondMessage = chat.chatHistory[1];
        if (secondMessage.content && typeof secondMessage.content === 'string') {
          return secondMessage.content.substring(0, 100);
        }
      }
      return '';
    };

    const copyChatLink = async (chat: GroupChat) => {
      try {
        const baseUrl = window.location.origin;
        const chatLink = `${baseUrl}/shared/${chat.shareId}`;
        await navigator.clipboard.writeText(chatLink);
        
        // Show success notification
        const notification = document.createElement('div');
        notification.style.cssText = `
          position: fixed;
          top: 20px;
          right: 20px;
          background-color: #4CAF50;
          color: white;
          padding: 12px 24px;
          border-radius: 4px;
          box-shadow: 0 2px 10px rgba(0,0,0,0.2);
          z-index: 10000;
          font-family: Arial, sans-serif;
          font-size: 14px;
          font-weight: 500;
        `;
        notification.textContent = 'Chat link copied to clipboard!';
        document.body.appendChild(notification);
        
        setTimeout(() => {
          document.body.removeChild(notification);
        }, 3000);
      } catch (err) {
        console.error('Failed to copy chat link:', err);
      }
    };

    const handleDeleteChat = async (chatId: string) => {
      try {
        await deleteChat(chatId);
        // Remove from local list
        savedChats.value = savedChats.value.filter(
          (chat) => chat.id !== chatId
        );
      } catch (err) {
        console.error("Failed to delete chat:", err);
      }
    };

    const sortedChats = computed(() => {
      return [...savedChats.value].sort((a, b) => {
        const dateA = new Date(a.updatedAt || a.createdAt);
        const dateB = new Date(b.updatedAt || b.createdAt);
        return dateB.getTime() - dateA.getTime();
      });
    });

    // Watch for dialog open/close
    const watchIsOpen = (newValue: boolean) => {
      if (newValue) {
        loadSavedChats();
      }
    };

    onMounted(() => {
      if (isOpen.value) {
        loadSavedChats();
      }
    });

    return {
      isOpen,
      savedChats,
      loading,
      error,
      loadSavedChats,
      selectChat,
      handleDeleteChat,
      getFirstMessagePreview,
      watchIsOpen,
      refresh: loadSavedChats,
      isOwner,
      formatDate,
      formatFileList,
      copyChatLink,
      sortedChats,
    };
  },
  watch: {
    modelValue(newValue) {
      this.isOpen = newValue;
      this.watchIsOpen(newValue);
    },
    isOpen(newValue) {
      this.$emit("update:modelValue", newValue);
    },
  },
});
</script>

<style lang="scss" scoped>
.chat-list {
  .chat-item {
    border: 1px solid #e0e0e0;
    border-radius: 8px;
    transition: all 0.2s ease;
    cursor: pointer;
    
    &:hover {
      border-color: #1976d2;
      box-shadow: 0 2px 8px rgba(25, 118, 210, 0.15);
    }
    
    &.owner-chat {
      border-color: #1976d2;
      background-color: #f3f8ff;
    }
    
    .clickable {
      cursor: pointer;
    }
    
    .file-list {
      font-size: 0.85em;
      color: #666;
    }
  }
}
</style>
