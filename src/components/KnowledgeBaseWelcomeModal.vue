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

          <p class="welcome-paragraph upload-instruction">
            <strong>📎 First Step:</strong> Upload your health documents using the paper clip icon at the bottom of the chat.
          </p>
          
          <p class="welcome-paragraph">
            After uploading files, open the Private AI Manager to select which documents to include in your knowledge base.
          </p>
        </div>
      </q-card-section>

      <q-card-actions class="q-px-xl q-pb-xl">
        <q-space />
        <q-btn
          flat
          label="Cancel"
          @click="handleCancel"
          class="q-mr-sm"
        />
        <q-btn
          color="primary"
          label="IMPORT A FILE"
          @click="handleImportFile"
          icon="attach_file"
          class="q-px-lg"
        />
      </q-card-actions>
    </q-card>
  </q-dialog>
</template>

<script setup>
import { ref, watch } from 'vue'
import {
  QDialog,
  QCard,
  QCardSection,
  QCardActions,
  QBtn,
  QSpace
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
const emit = defineEmits(['update:modelValue', 'open-manager', 'import-file'])

// Reactive state
const isOpen = ref(props.modelValue)

// Watch for prop changes
watch(() => props.modelValue, (newValue) => {
  isOpen.value = newValue
})

// Watch for internal changes
watch(isOpen, (newValue) => {
  emit('update:modelValue', newValue)
})

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
  background-color: #e3f2fd;
  padding: 0.75rem;
  border-radius: 4px;
  border-left: 4px solid #2196f3;
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

