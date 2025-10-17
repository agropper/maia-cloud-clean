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
            :text-layer="false"
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
import { ref, computed, watch } from 'vue'
import { QBtn, QIcon, QSpinnerDots } from 'quasar'
import { VuePDF, usePDF } from '@tato30/vue-pdf'

const emit = defineEmits(['close'])

// Define props to track visibility
const props = defineProps({
  isVisible: {
    type: Boolean,
    default: true
  }
})

const pdfUrl = '/Help_Drawing.pdf'
const currentPage = ref(1)
const isLoading = ref(true)
const pdfError = ref(false)
const pdfErrorMessage = ref('')

// Use the usePDF composable to handle PDF loading
const { pdf: pdfDocument, pages: totalPages, info } = usePDF(pdfUrl)

// Watch for PDF loading
watch(pdfDocument, (newPdf) => {
  console.log('📄 PDF document changed:', newPdf)
  if (newPdf) {
    console.log(`📄 Help PDF loaded: ${totalPages.value} pages`)
    isLoading.value = false
  }
}, { immediate: true })

// Watch for errors
watch(() => info.value?.error, (error) => {
  if (error) {
    console.error('❌ PDF loading failed:', error)
    pdfError.value = true
    pdfErrorMessage.value = error?.message || 'Failed to load PDF'
    isLoading.value = false
  }
})

const handleClose = () => {
  emit('close')
}

const openPdf = () => {
  window.open(pdfUrl, '_blank')
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
