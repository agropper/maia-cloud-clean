<template>
  <div class="help-page-overlay">
    <div class="help-page-container">
      <!-- Close button in upper right -->
      <div class="close-button-container">
        <q-btn
          flat
          round
          dense
          icon="close"
          color="grey-8"
          size="md"
          @click="handleClose"
          class="close-btn"
        />
      </div>

      <!-- Help content -->
      <div class="help-content">

        <!-- PDF Viewer -->
        <div class="pdf-viewer-container">
          <!-- VuePDF Component -->
          <VuePDF
            v-if="pdfDocument"
            :pdf="pdfDocument"
            :page="currentPage"
            :textLayer="false"
            @loaded="onPdfLoaded"
            class="pdf-page"
          />
          
          <!-- Loading overlay -->
          <div v-if="isLoading" class="pdf-loading-overlay">
            <q-spinner-dots size="40px" color="primary" />
            <p>Loading help document...</p>
          </div>
          
          <!-- Error overlay -->
          <div v-if="pdfError" class="pdf-error-overlay">
            <q-icon name="error_outline" size="48px" color="warning" />
            <h3>PDF Could Not Be Displayed</h3>
            <p>{{ pdfErrorMessage }}</p>
            <q-btn 
              color="primary" 
              label="Download PDF" 
              @click="openPdf"
              icon="download"
            />
          </div>

          <!-- Navigation controls -->
          <div v-if="!isLoading && !pdfError && totalPages > 0" class="pdf-controls">
            <q-btn
              flat
              dense
              round
              icon="chevron_left"
              :disable="currentPage <= 1"
              @click="previousPage"
              color="primary"
            />
            <span class="page-info">{{ currentPage }} of {{ totalPages }}</span>
            <q-btn
              flat
              dense
              round
              icon="chevron_right"
              :disable="currentPage >= totalPages"
              @click="nextPage"
              color="primary"
            />
          </div>
        </div>

      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted, watch } from 'vue'
import { QBtn, QIcon, QSpinnerDots } from 'quasar'
import { VuePDF, usePDF } from '@tato30/vue-pdf'
import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf'

// Configure PDF.js worker globally
pdfjsLib.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.js'

const emit = defineEmits(['close'])

// Define props to track visibility
const props = defineProps({
  isVisible: {
    type: Boolean,
    default: true
  }
})

const pdfUrl = ref('/Help_Drawing.pdf')
const pdfDocument = ref(null)
const currentPage = ref(1)
const totalPages = ref(0)
const isLoading = ref(false)
const pdfError = ref(false)
const pdfErrorMessage = ref('')

const handleClose = () => {
  emit('close')
}

const openPdf = () => {
  window.open(pdfUrl.value, '_blank')
}

const previousPage = () => {
  if (currentPage.value > 1) {
    currentPage.value--
  }
}

const nextPage = () => {
  if (currentPage.value < totalPages.value) {
    currentPage.value++
  }
}

const onPdfLoaded = (pdf) => {
  if (totalPages.value === 0 && pdf.numPages && pdf.numPages > 0) {
    totalPages.value = pdf.numPages
    console.log(`📄 Help PDF loaded: ${totalPages.value} pages`)
  }
  isLoading.value = false
}

const loadingTask = ref(null)

const loadPdfDocument = async () => {
  try {
    isLoading.value = true
    pdfError.value = false
    pdfErrorMessage.value = ''
    
    // Load the PDF document
    loadingTask.value = pdfjsLib.getDocument(pdfUrl.value)
    pdfDocument.value = loadingTask.value
    
  } catch (error) {
    console.error('❌ Failed to load help PDF:', error)
    pdfError.value = true
    pdfErrorMessage.value = error.message || 'Unable to load the PDF document'
    isLoading.value = false
  }
}

// Helper function to properly clean up PDF.js resources
const cleanupPdf = async () => {
  try {
    // If there's an active loading task, destroy it properly
    if (loadingTask.value) {
      // Cancel the loading if it's still in progress
      if (loadingTask.value.destroy) {
        await loadingTask.value.destroy()
      }
      loadingTask.value = null
    }
    
    // If there's a loaded PDF document, destroy it
    if (pdfDocument.value && pdfDocument.value !== loadingTask.value) {
      if (pdfDocument.value.destroy) {
        await pdfDocument.value.destroy()
      }
    }
    
    pdfDocument.value = null
    currentPage.value = 1
    totalPages.value = 0
    isLoading.value = false
  } catch (error) {
    // Silently catch cleanup errors - already being destroyed
    console.log('📄 PDF cleanup completed (with minor warnings)')
  }
}

// Watch for visibility changes to load PDF
watch(() => props.isVisible, async (newVal, oldVal) => {
  if (newVal && !pdfDocument.value) {
    loadPdfDocument()
  } else if (!newVal && oldVal) {
    // Component is being hidden - clean up PDF properly
    await cleanupPdf()
  }
}, { immediate: true })

onMounted(() => {
  if (props.isVisible) {
    loadPdfDocument()
  }
})

onUnmounted(async () => {
  // Clean up when component is destroyed
  await cleanupPdf()
})
</script>

<style scoped>
.help-page-overlay {
  position: fixed;
  top: 0;
  left: 0;
  width: 100vw;
  height: 100vh;
  background-color: rgba(0, 0, 0, 0.8);
  display: flex;
  justify-content: center;
  align-items: center;
  z-index: 9999;
  padding: 20px;
}

.help-page-container {
  position: relative;
  background-color: white;
  border-radius: 8px;
  max-width: 90%;
  max-height: 90%;
  width: 900px;
  height: 90vh;
  display: flex;
  flex-direction: column;
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.5);
  overflow: hidden;
}

.close-button-container {
  position: absolute;
  top: 10px;
  right: 10px;
  z-index: 10;
}

.close-btn {
  background-color: rgba(255, 255, 255, 0.9);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.2);
}

.close-btn:hover {
  background-color: rgba(255, 255, 255, 1);
}

.help-content {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.pdf-viewer-container {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  position: relative;
  background-color: white;
}

.pdf-page {
  flex: 1;
  width: 100%;
  height: 100%;
  overflow-y: auto;
  overflow-x: hidden;
  display: flex;
  justify-content: center;
  align-items: flex-start;
}

/* Style the VuePDF canvas to fill available space */
.pdf-page :deep(canvas) {
  max-width: 100%;
  max-height: 100%;
  width: auto !important;
  height: auto !important;
  object-fit: contain;
}

.pdf-loading-overlay,
.pdf-error-overlay {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  background-color: rgba(255, 255, 255, 0.95);
  z-index: 5;
}

.pdf-error-overlay {
  padding: 40px;
  text-align: center;
}

.pdf-error-overlay h3 {
  margin: 20px 0 10px;
  color: #f57c00;
}

.pdf-error-overlay p {
  margin-bottom: 20px;
  color: #666;
}

.pdf-controls {
  display: flex;
  justify-content: center;
  align-items: center;
  gap: 16px;
  padding: 12px;
  background-color: white;
  border-top: 1px solid #e0e0e0;
}

.page-info {
  min-width: 100px;
  text-align: center;
  font-size: 14px;
  color: #666;
}

/* Responsive adjustments */
@media (max-width: 768px) {
  .help-page-container {
    max-width: 95%;
    max-height: 95%;
    width: 100%;
  }
}
</style>
