<template>
  <q-dialog v-model="isOpen" persistent>
    <q-card style="min-width: 500px; max-width: 600px">
      <q-card-section class="text-center">
        <div class="text-h4 q-mb-md">📚 Create Your Knowledge Base</div>
        <div class="text-subtitle1 text-grey-7 q-mb-lg">
          Your private AI will index the files you upload and use them to support chats.
        </div>
      </q-card-section>

      <q-card-section class="q-px-xl">
        <div class="welcome-content">
          <p class="list-heading">
            What is a knowledge base and why do I need it:
          </p>
          
          <ul class="feature-list">
            <li>• Health records are annotated and indexed for efficient use</li>
            <li>• Your private AI can restrict access to protect privacy</li>
            <li>• Your private AI can explain or correct errors in the record</li>
            <li>• To link to original documents for authenticity checks</li>
          </ul>

          <p v-if="!hasUnindexedFiles" class="welcome-paragraph upload-instruction">
            <strong>📎 First Step:</strong> Upload your health documents using the paper clip icon at the bottom of the chat.
          </p>
          
          <p v-if="hasUnindexedFiles" class="welcome-paragraph upload-instruction next-step">
            <strong>📎 Next Step:</strong> You have imported files that are not in any knowledge base.
          </p>
          
          <p v-if="!hasUnindexedFiles" class="welcome-paragraph">
            After importing files, click the Knowledge Base Status icon <QIcon name="book" size="20px" class="q-mx-xs" /> to turn them into a knowledge base.
          </p>
          
          <p v-if="hasUnindexedFiles" class="welcome-paragraph">
            Click Continue to create or update a knowledge base or click Import a file to import more files.
          </p>
        </div>
      </q-card-section>

      <q-card-actions class="q-px-xl q-pb-xl">
        <q-btn
          flat
          label="CANCEL"
          @click="handleCancel"
          class="q-mr-sm"
        />
        <q-space />
        <q-btn
          :color="hasUnindexedFiles ? 'primary' : 'grey-6'"
          :disable="!hasUnindexedFiles"
          label="CONTINUE"
          @click="handleContinue"
          class="q-px-lg q-mr-sm"
          unelevated
        />
        <q-btn
          color="primary"
          label="IMPORT A FILE"
          @click="handleImportFile"
          icon="attach_file"
          class="q-px-lg"
          unelevated
        />
      </q-card-actions>
    </q-card>
  </q-dialog>
</template>

<script setup>
import { ref, watch, onMounted } from 'vue'
import {
  QDialog,
  QCard,
  QCardSection,
  QCardActions,
  QBtn,
  QSpace,
  QIcon
} from 'quasar'

// Props
const props = defineProps({
  modelValue: {
    type: Boolean,
    default: false
  },
  currentUser: {
    type: Object,
    default: null
  }
})

// Emits
const emit = defineEmits(['update:modelValue', 'open-manager', 'import-file', 'continue'])

// Reactive state
const isOpen = ref(props.modelValue)
const hasUnindexedFiles = ref(false)
const isLoading = ref(false)

// Watch for prop changes
watch(() => props.modelValue, (newValue) => {
  isOpen.value = newValue
  if (newValue) {
    checkForUnindexedFiles()
  }
})

// Watch for internal changes
watch(isOpen, (newValue) => {
  emit('update:modelValue', newValue)
})

// Check for unindexed files in subfolders
const checkForUnindexedFiles = async () => {
  if (!props.currentUser?.userId || props.currentUser.userId === 'Public User') {
    hasUnindexedFiles.value = false
    return
  }
  
  isLoading.value = true
  try {
    const response = await fetch(`/api/users/${encodeURIComponent(props.currentUser.userId)}/unindexed-subfolder-files`)
    if (response.ok) {
      const data = await response.json()
      hasUnindexedFiles.value = data.hasUnindexedFiles || false
    } else {
      hasUnindexedFiles.value = false
    }
  } catch (error) {
    console.error('Error checking for unindexed files:', error)
    hasUnindexedFiles.value = false
  } finally {
    isLoading.value = false
  }
}

const handleCancel = () => {
  isOpen.value = false
}

const handleOpenManager = () => {
  emit('open-manager')
  isOpen.value = false
}

const handleImportFile = () => {
  emit('import-file')
  isOpen.value = false
}

const handleContinue = () => {
  emit('continue')
  isOpen.value = false
}

// Check on mount if modal is open
onMounted(() => {
  if (props.modelValue) {
    checkForUnindexedFiles()
  }
})
</script>

<style scoped>
.welcome-content {
  line-height: 1.6;
}

.list-heading {
  margin-bottom: 0.75rem;
  font-size: 1.05rem;
  font-weight: 600;
  color: #333;
}

.welcome-paragraph {
  margin-bottom: 1rem;
  margin-top: 1rem;
  font-size: 1rem;
  color: #333;
}

.upload-instruction {
  background-color: #e3f invadedfd;
  padding: 0.75rem;
  border-radius: 4px;
  border-left: 4px solid #2196f3;
}

.upload-instruction.next-step {
  background-color: #fff3e0;
  border-left-color: #ff9800;
}

.feature-list {
  margin: 1rem 0;
  padding-left: 0.5rem;
  list-style-type: none;
}

.feature-list li {
  margin-bottom: 0.5rem;
  font-size: 1rem;
  color: #555;
}
</style>

