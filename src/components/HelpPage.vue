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

      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted, nextTick, watch } from 'vue'
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
      
      // Get the first page to calculate modal size
      const firstPage = await pdf.getPage(1)
      const naturalViewport = firstPage.getViewport({ scale: 1.0 })
      const naturalWidth = naturalViewport.width
      const naturalHeight = naturalViewport.height
      
      // Calculate optimal modal size based on PDF dimensions and browser window
      const browserWidth = window.innerWidth
      const browserHeight = window.innerHeight
      const maxModalWidth = browserWidth * 0.8  // 80% of browser width
      const maxModalHeight = browserHeight * 0.8 // 80% of browser height
      
      // Calculate scale to fit PDF in available browser space (minus padding)
      const availableWidth = maxModalWidth - 80  // 40px padding on each side
      const availableHeight = maxModalHeight - 80 // 40px padding top/bottom
      
      const scaleX = availableWidth / naturalWidth
      const scaleY = availableHeight / naturalHeight
      const actualScale = Math.min(scaleX, scaleY)
      
      // Calculate final modal dimensions based on scaled PDF
      const scaledWidth = naturalWidth * actualScale
      const scaledHeight = naturalHeight * actualScale
      
      // Calculate modal size maintaining PDF aspect ratio
      const pdfAspectRatio = naturalWidth / naturalHeight
      const modalContentWidth = scaledWidth + 80  // Add back padding
      const modalContentHeight = scaledHeight + 80 // Add back padding
      
      // Ensure modal maintains PDF aspect ratio
      let modalWidth = modalContentWidth
      let modalHeight = modalContentHeight
      
      // If modal aspect ratio doesn't match PDF, adjust to match PDF aspect ratio
      const modalAspectRatio = modalWidth / modalHeight
      if (Math.abs(modalAspectRatio - pdfAspectRatio) > 0.01) {
        // Adjust modal height to match PDF aspect ratio
        modalHeight = modalWidth / pdfAspectRatio
      }
      
      // Set modal dimensions FIRST
      const modalContainer = container.closest('.help-page-container')
      if (modalContainer) {
        modalContainer.style.width = `${modalWidth}px`
        modalContainer.style.height = `${modalHeight}px`
      }
      
      // Wait for modal to resize, then capture container dimensions
      await new Promise(resolve => setTimeout(resolve, 200))
      
      // Set loading to false so container becomes visible
      isLoading.value = false
      
      // Wait for container to become visible
      await new Promise(resolve => setTimeout(resolve, 50))
      
      // NOW capture container dimensions after modal is properly sized and visible
      const containerWidth = container.offsetWidth
      const containerHeight = container.offsetHeight
      
      // PDF loaded and modal sized
      
      // Render pages
      for (let pageNum = 1; pageNum <= totalPages; pageNum++) {
        const page = await pdf.getPage(pageNum)
      
      // Recalculate viewport with proper scale
      const properViewport = page.getViewport({ scale: actualScale })
      
      const canvas = document.createElement('canvas')
      const ctx = canvas.getContext('2d')
      if (!ctx) throw new Error('Could not get canvas context')
      
      canvas.width = Math.floor(properViewport.width)
      canvas.height = Math.floor(properViewport.height)
      
      canvas.style.width = `${properViewport.width}px`
      canvas.style.height = `${properViewport.height}px`
      canvas.style.display = 'block'
      canvas.style.margin = '0 auto 16px auto'
      canvas.style.maxWidth = 'none'
      canvas.style.maxHeight = 'none'
      
      await page.render({ canvasContext: ctx, viewport: properViewport }).promise
      container.appendChild(canvas)
      
      // Set container size to match canvas to avoid empty space
      container.style.width = `${properViewport.width + 32}px` // Add padding
      container.style.height = `${properViewport.height + 32}px` // Add padding
      
      // Fix the pdf-viewer-container size to match the content
      const pdfViewerContainer = container.parentElement
      if (pdfViewerContainer) {
        pdfViewerContainer.style.width = `${properViewport.width + 32}px`
        pdfViewerContainer.style.height = `${properViewport.height + 32}px`
        pdfViewerContainer.style.flex = 'none'
        pdfViewerContainer.style.minHeight = '0'
      }
      
      // Wait for DOM to update
      await new Promise(resolve => setTimeout(resolve, 10))
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

onUnmounted(() => {
  // Cleanup if needed
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
  min-height: 0;
  border: 1px solid #e0e0e0;
  border-radius: 8px;
  overflow: hidden;
  background-color: #f8f9fa;
  position: relative;
  max-width: 100%;
  width: 100%;
}

.pdf-content {
  padding: 16px;
  overflow-y: auto;
  overflow-x: hidden;
  flex: 1;
  min-height: 0;
  max-width: 100%;
  box-sizing: border-box;
}

.pdf-content canvas {
  max-width: 100% !important;
  width: auto !important;
  height: auto !important;
  display: block !important;
  margin: 0 auto 16px auto !important;
  box-sizing: border-box !important;
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

/* Responsive design */
@media (max-width: 768px) {
  .help-page-overlay {
    padding: 10px;
  }
  
  .help-content {
    padding: 20px;
  }
  
  .pdf-viewer-container {
    min-height: 400px;
  }
}
</style>