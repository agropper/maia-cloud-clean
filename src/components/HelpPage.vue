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
          <!-- Always render the PDF container for ref access -->
          <div class="pdf-content" :style="{ display: isLoading || pdfError ? 'none' : 'block' }">
            <!-- PDF pages will be rendered here -->
          </div>
          
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
        </div>

        <!-- Footer -->
        <div class="help-footer">
          <p class="help-footer-text">
            Click the X in the upper right corner when you're ready to continue
          </p>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, nextTick, watch } from 'vue'
import { QBtn, QIcon, QSpinnerDots } from 'quasar'
// PDF.js legacy build for better bundler compatibility
import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf'

const emit = defineEmits(['close'])

// Define props to track visibility like PopUp.vue does
const props = defineProps({
  isVisible: {
    type: Boolean,
    default: true
  }
})

const pdfUrl = ref('')
const isLoading = ref(false)
const pdfError = ref(false)
const pdfErrorMessage = ref('')

const handleClose = () => {
  emit('close')
}

const openPdf = () => {
  window.open(pdfUrl.value, '_blank')
}

const loadPDF = async () => {
  const container = document.querySelector('.pdf-content')
  if (!container) {
    return
  }
  isLoading.value = true
  pdfError.value = false
  pdfErrorMessage.value = ''
  
  try {
    // Clear any existing content
    container.innerHTML = ''
    
    // Use locally served worker to avoid CSP issues
    pdfjsLib.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.js'
    
    // Load the PDF
    const task = pdfjsLib.getDocument({ url: pdfUrl.value })
    const pdf = await task.promise
    
    const maxPages = 10
    const totalPages = Math.min(pdf.numPages, maxPages)
    
    // Render pages
    for (let pageNum = 1; pageNum <= totalPages; pageNum++) {
      const page = await pdf.getPage(pageNum)
      const viewport = page.getViewport({ scale: 1.25 })
      const canvas = document.createElement('canvas')
      const ctx = canvas.getContext('2d')
      if (!ctx) throw new Error('Could not get canvas context')
      canvas.width = Math.floor(viewport.width)
      canvas.height = Math.floor(viewport.height)
      canvas.style.display = 'block'
      canvas.style.margin = '0 auto 16px auto'
      canvas.style.maxWidth = '100%'
      canvas.style.width = '100%'
      canvas.style.height = 'auto'
      canvas.style.boxSizing = 'border-box'
      
      await page.render({ canvasContext: ctx, viewport }).promise
      container.appendChild(canvas)
    }
    
    isLoading.value = false
    
  } catch (error) {
    isLoading.value = false
    pdfError.value = true
    pdfErrorMessage.value = error instanceof Error ? error.message : 'Failed to load PDF'
  }
}

// Watch for visibility changes like PopUp.vue does
watch(() => props.isVisible, (val) => {
  if (val) {
    nextTick(() => loadPDF())
  }
}, { immediate: true })

onMounted(() => {
  // Set the PDF URL - we'll serve it from the dist folder
  pdfUrl.value = '/Help_Drawing.pdf'
})
</script>

<style scoped>
.help-page-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background-color: rgba(0, 0, 0, 0.8);
  z-index: 10000;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px;
}

.help-page-container {
  background: white;
  border-radius: 12px;
  box-shadow: 0 10px 40px rgba(0, 0, 0, 0.3);
  max-width: 1200px;
  width: 100%;
  max-height: 90vh;
  display: flex;
  flex-direction: column;
  position: relative;
}

.close-button-container {
  position: absolute;
  top: 16px;
  right: 16px;
  z-index: 10001;
}

.close-btn {
  background-color: rgba(255, 255, 255, 0.9);
  backdrop-filter: blur(10px);
  border: 1px solid rgba(0, 0, 0, 0.1);
}

.close-btn:hover {
  background-color: rgba(255, 255, 255, 1);
  transform: scale(1.1);
}

.help-content {
  padding: 20px;
  display: flex;
  flex-direction: column;
  height: 100%;
}

.pdf-viewer-container {
  flex: 1;
  min-height: 500px;
  border: 1px solid #e0e0e0;
  border-radius: 8px;
  overflow: hidden;
  background-color: #f8f9fa;
  position: relative;
}

.pdf-content {
  padding: 16px;
  overflow-y: auto;
  overflow-x: hidden;
  height: 100%;
  max-width: 100%;
  box-sizing: border-box;
}

.pdf-loading-overlay {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background-color: #f8f9fa;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  text-align: center;
  z-index: 10;
}

.pdf-loading-overlay p {
  margin: 16px 0 0 0;
  color: #7f8c8d;
  font-size: 1.1rem;
}

.pdf-error-overlay {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background-color: #f8f9fa;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  text-align: center;
  z-index: 10;
}

.pdf-error-overlay h3 {
  margin: 16px 0 8px 0;
  color: #2c3e50;
  font-size: 1.5rem;
}

.pdf-error-overlay p {
  margin: 0 0 24px 0;
  color: #7f8c8d;
  font-size: 1.1rem;
}

.help-footer {
  text-align: center;
  margin-top: 20px;
  padding-top: 20px;
  border-top: 1px solid #e0e0e0;
}

.help-footer-text {
  color: #7f8c8d;
  font-size: 0.9rem;
  margin: 0;
}

/* Responsive design */
@media (max-width: 768px) {
  .help-page-overlay {
    padding: 10px;
  }
  
  .help-content {
    padding: 20px;
  }
  
  .help-title {
    font-size: 2rem;
  }
  
  .help-subtitle {
    font-size: 1rem;
  }
  
  .pdf-viewer-container {
    min-height: 400px;
  }
  
  .pdf-viewer {
    min-height: 400px;
  }
}
</style>
