<template>
  <q-dialog v-model="isOpen" persistent>
    <q-card style="min-width: 600px; max-width: 800px">
      <q-card-section class="row items-center q-pb-none">
        <div class="text-h6">Saved Chats</div>
        <q-space />
        <q-btn icon="close" flat round dense v-close-popup />
      </q-card-section>

      <q-card-section>
        <div v-if="loading" class="text-center q-pa-md">
          <q-spinner-dots color="primary" size="40px" />
          <div class="text-grey q-mt-sm">Loading saved chats...</div>
        </div>

        <div v-else-if="error" class="text-center q-pa-md">
          <q-icon name="error" color="negative" size="40px" />
          <div class="text-negative q-mt-sm">{{ error }}</div>
          <q-btn
            label="Retry"
            color="primary"
            @click="loadChats"
            class="q-mt-md"
          />
        </div>

        <div v-else-if="savedChats.length === 0" class="text-center q-pa-md">
          <q-icon name="chat" color="grey" size="40px" />
          <div class="text-grey q-mt-sm">No saved chats found</div>
        </div>

        <div v-else>
          <q-list>
            <q-item
              v-for="chat in savedChats"
              :key="chat.id"
              clickable
              v-ripple
              @click="selectChat(chat)"
            >
              <q-item-section>
                <!-- First message preview (up to 60 characters) -->
                <q-item-label v-if="getFirstMessagePreview(chat)" caption class="q-mb-xs">
                  {{ getFirstMessagePreview(chat) }}...
                </q-item-label>
                
                <!-- Chat title -->
                <q-item-label>{{ formatChatLabel(chat) }}</q-item-label>
                
                <!-- Documents list -->
                <q-item-label v-if="chat.uploadedFiles && chat.uploadedFiles.length > 0" caption class="q-mt-xs">
                  <div class="documents-list">
                    <span v-for="(file, index) in chat.uploadedFiles" :key="index" class="document-item">
                      📎 {{ file.name }}
                      <span v-if="index < chat.uploadedFiles.length - 1">, </span>
                    </span>
                  </div>
                </q-item-label>
                
                <!-- Message count and date -->
                <q-item-label caption class="q-mt-xs">
                  {{ chat.messageCount }} messages •
                  {{ formatChatDate(chat.updatedAt) }}
                </q-item-label>
              </q-item-section>

              <q-item-section side>
                <q-btn
                  flat
                  round
                  dense
                  icon="delete"
                  color="negative"
                  @click.stop="handleDeleteChat(chat.id)"
                >
                  <q-tooltip>Delete chat</q-tooltip>
                </q-btn>
              </q-item-section>
            </q-item>
          </q-list>
        </div>
      </q-card-section>

      <q-card-actions align="right">
        <q-btn flat label="Cancel" color="primary" v-close-popup />
      </q-card-actions>
    </q-card>
  </q-dialog>
</template>

<script lang="ts">
import { defineComponent, ref, onMounted } from "vue";
import {
  QDialog,
  QCard,
  QCardSection,
  QCardActions,
  QBtn,
  QList,
  QItem,
  QItemSection,
  QItemLabel,
  QSpinnerDots,
  QIcon,
  QTooltip,
  QSpace,
} from "quasar";
import { useCouchDB, type SavedChat } from "../composables/useCouchDB";

export default defineComponent({
  name: "SavedChatsDialog",
  components: {
    QDialog,
    QCard,
    QCardSection,
    QCardActions,
    QBtn,
    QList,
    QItem,
    QItemSection,
    QItemLabel,
    QSpinnerDots,
    QIcon,
    QTooltip,
    QSpace,
  },
  props: {
    modelValue: {
      type: Boolean,
      required: true,
    },
    patientId: {
      type: String,
      default: "demo_patient_001",
    },
  },
  emits: ["update:modelValue", "chat-selected"],
  setup(props, { emit }) {
    const { loadChats, deleteChat, formatChatLabel, formatChatDate } =
      useCouchDB();

    const isOpen = ref(props.modelValue);
    const savedChats = ref<SavedChat[]>([]);
    const loading = ref(false);
    const error = ref("");

    const loadSavedChats = async () => {
      loading.value = true;
      error.value = "";

      try {
        savedChats.value = await loadChats(props.patientId);
      } catch (err) {
        error.value =
          err instanceof Error ? err.message : "Failed to load chats";
      } finally {
        loading.value = false;
      }
    };

    const selectChat = (chat: SavedChat) => {
      console.log('🔍 [DEBUG LOAD] SavedChatsDialog selectChat called with:', chat);
      console.log('🔍 [DEBUG LOAD] Emitting chat-selected event...');
      emit("chat-selected", chat);
      console.log('🔍 [DEBUG LOAD] Emitting update:modelValue false...');
      emit("update:modelValue", false);
    };

    const getFirstMessagePreview = (chat: SavedChat): string => {
      if (chat.chatHistory && chat.chatHistory.length > 0) {
        const firstMessage = chat.chatHistory[0];
        if (firstMessage.content && typeof firstMessage.content === 'string') {
          return firstMessage.content.substring(0, 60);
        }
      }
      return '';
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
      loadChats: loadSavedChats,
      selectChat,
      handleDeleteChat,
      formatChatLabel,
      formatChatDate,
      getFirstMessagePreview,
      watchIsOpen,
      refresh: loadSavedChats,
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
.documents-list {
  .document-item {
    font-size: 0.85em;
    color: #666;
  }
}
</style>
