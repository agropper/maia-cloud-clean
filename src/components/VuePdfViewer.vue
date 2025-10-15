<template>
  <div class="vue-pdf-viewer">
    <!-- PDF Viewer -->
    <div v-if="pdfUrl" class="pdf-container">
      <VuePDF
        :pdf="pdfDocument"
        :page="currentPage"
        :scale="scale"
        :textLayer="true"
        class="pdf-viewer"
        @loaded="onPdfLoaded"
        @error="onPdfError"
      />
      
      <!-- PDF Controls -->
      <div class="pdf-controls">
        <q-btn 
          icon="chevron_left" 
          @click="previousPage" 
          :disable="currentPage <= 1"
          size="sm"
        />
        <span class="page-info">{{ currentPage }} / {{ totalPages }}</span>
        <q-btn 
          icon="chevron_right" 
          @click="nextPage" 
          :disable="currentPage >= totalPages"
          size="sm"
        />
        
        <!-- Page number input -->
        <div class="page-input-container">
          <q-input
            v-model.number="pageInput"
            type="number"
            :min="1"
            :max="totalPages"
            dense
            outlined
            class="page-input"
            @keyup.enter="goToPage"
            @blur="goToPage"
            placeholder="Page"
          />
          <q-btn 
            icon="arrow_forward" 
            @click="goToPage" 
            size="sm"
            flat
            class="go-button"
          />
        </div>
        <q-btn 
          icon="zoom_out" 
          @click="zoomOut" 
          size="sm"
        />
        <span class="scale-info">{{ Math.round(scale * 100) }}%</span>
        <q-btn 
          icon="zoom_in" 
          @click="zoomIn" 
          size="sm"
        />
      </div>
    </div>

    <!-- No PDF state -->
    <div v-else class="no-pdf">
      <q-icon name="description" size="40px" color="grey" />
      <p>No PDF to display</p>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { VuePDF } from '@tato30/vue-pdf'
import { QIcon, QBtn, QInput } from 'quasar'
import * as pdfjsLib from 'pdfjs-dist'

// Configure PDF.js worker immediately when module loads
if (typeof window !== 'undefined') {
  pdfjsLib.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.js'
}

// Props
interface Props {
  file?: {
    fileUrl?: string
    bucketKey?: string
    originalFile?: File
    name?: string
  }
}

const props = defineProps<Props>()

// Reactive state
const currentPage = ref(1)
const totalPages = ref(0)
const scale = ref(1.0)
const pageInput = ref(1)
const pdfDocument = ref(null)
const isLoading = ref(false)

// Computed
const pdfUrl = computed(() => {
  if (!props.file) return ''
  
  // Use hardcoded URL for testing
  if (props.file.bucketKey) {
    return `/api/proxy-pdf/fri1/archived/GROPPER_ADRIAN_09_24_25_1314.PDF`
  }
  
  if (props.file.fileUrl) {
    return props.file.fileUrl
  }
  
  if (props.file.originalFile instanceof File) {
    return URL.createObjectURL(props.file.originalFile)
  }
  
  return ''
})

// Methods
const loadPdfDocument = async () => {
  console.log('🔄 Vue PDF: loadPdfDocument() called')
  console.log('🔄 Vue PDF: pdfUrl.value:', pdfUrl.value)
  console.log('🔄 Vue PDF: isLoading.value:', isLoading.value)
  
  if (!pdfUrl.value) {
    console.log('🔄 Vue PDF: No PDF URL, clearing state')
    pdfDocument.value = null
    totalPages.value = 0
    isLoading.value = false
    return
  }

  // Prevent multiple simultaneous loads
  if (isLoading.value) {
    console.log('🔄 Vue PDF: Already loading, skipping duplicate load')
    return
  }

  try {
    isLoading.value = true
    console.log('🔄 Vue PDF: Starting PDF load from:', pdfUrl.value)
    const loadingTask = pdfjsLib.getDocument(pdfUrl.value)
    pdfDocument.value = loadingTask
    const pdf = await loadingTask.promise
    console.log('✅ Vue PDF: PDF document loaded successfully:', pdf)
    totalPages.value = pdf.numPages || 0
    console.log('📄 Vue PDF: Total pages set to:', totalPages.value)
  } catch (error) {
    console.error('❌ Vue PDF: PDF document loading error:', error)
    pdfDocument.value = null
    totalPages.value = 0
  } finally {
    isLoading.value = false
    console.log('🔄 Vue PDF: Loading completed, isLoading set to false')
  }
}

const onPdfLoaded = (pdf: any) => {
  console.log('✅ Vue PDF: PDF loaded via component event:', pdf)
  console.log('📄 Vue PDF: Component PDF object has numPages:', pdf.numPages)
  console.log('📄 Vue PDF: Current totalPages value:', totalPages.value)
  
  // Only update totalPages if it's not already set AND the component provides a valid numPages
  if (totalPages.value === 0 && pdf.numPages && pdf.numPages > 0) {
    totalPages.value = pdf.numPages
    console.log('📄 Vue PDF: Total pages updated via component to:', totalPages.value)
  } else if (totalPages.value > 0) {
    console.log('📄 Vue PDF: Total pages already set to', totalPages.value, ', ignoring component event')
  } else {
    console.log('📄 Vue PDF: Component PDF object has invalid numPages:', pdf.numPages, ', keeping current value')
  }
}

const onPdfError = (err: any) => {
  console.error('❌ Vue PDF: PDF loading error:', err)
  totalPages.value = 0
}


const previousPage = () => {
  console.log('📄 Vue PDF: Previous page clicked - current:', currentPage.value, 'total:', totalPages.value)
  if (currentPage.value > 1) {
    currentPage.value--
    console.log('📄 Vue PDF: Previous page, now on page:', currentPage.value)
  } else {
    console.log('📄 Vue PDF: Already on first page, cannot go previous')
  }
}

const nextPage = () => {
  console.log('📄 Vue PDF: Next page clicked - current:', currentPage.value, 'total:', totalPages.value)
  if (totalPages.value === 0) {
    console.log('📄 Vue PDF: Total pages is 0, cannot navigate')
    return
  }
  if (currentPage.value < totalPages.value) {
    currentPage.value++
    console.log('📄 Vue PDF: Next page, now on page:', currentPage.value)
  } else {
    console.log('📄 Vue PDF: Already on last page, cannot go next')
  }
}

const zoomIn = () => {
  scale.value = Math.min(scale.value + 0.25, 3.0)
  console.log('🔍 Vue PDF: Zoom in, scale now:', scale.value)
}

const zoomOut = () => {
  scale.value = Math.max(scale.value - 0.25, 0.5)
  console.log('🔍 Vue PDF: Zoom out, scale now:', scale.value)
}

const goToPage = () => {
  const targetPage = pageInput.value
  console.log('📄 Vue PDF: Go to page clicked - target:', targetPage, 'current:', currentPage.value, 'total:', totalPages.value)
  
  if (targetPage >= 1 && targetPage <= totalPages.value) {
    currentPage.value = targetPage
    console.log('📄 Vue PDF: Navigated to page:', currentPage.value)
  } else {
    console.log('📄 Vue PDF: Invalid page number:', targetPage, ', must be between 1 and', totalPages.value)
    // Reset input to current page
    pageInput.value = currentPage.value
  }
}

// Watch for file changes - this handles both initial load and file changes
watch(() => props.file, (newFile, oldFile) => {
  console.log('📄 Vue PDF: File watcher triggered')
  console.log('📄 Vue PDF: Old file:', oldFile?.name || 'none')
  console.log('📄 Vue PDF: New file:', newFile?.name || 'none')
  console.log('📄 Vue PDF: Is loading:', isLoading.value)
  
  if (newFile && !isLoading.value) {
    console.log('📄 Vue PDF: File changed, resetting state and loading PDF')
    currentPage.value = 1
    totalPages.value = 0
    loadPdfDocument()
  } else if (isLoading.value) {
    console.log('📄 Vue PDF: Skipping load because already loading')
  } else {
    console.log('📄 Vue PDF: No file or same file, skipping load')
  }
}, { immediate: true })

// Note: Removed redundant URL watcher since file changes already trigger loadPdfDocument()
// The URL is computed from the file prop, so watching the file is sufficient

// Watch for page changes to debug navigation
watch(currentPage, (newPage, oldPage) => {
  console.log('📄 Vue PDF: Page changed from', oldPage, 'to', newPage)
})

// Watch for scale changes to debug zoom
watch(scale, (newScale, oldScale) => {
  console.log('🔍 Vue PDF: Scale changed from', oldScale, 'to', newScale)
})

// Watch for totalPages changes to debug page count issues
watch(totalPages, (newTotal, oldTotal) => {
  console.log('📄 Vue PDF: Total pages changed from', oldTotal, 'to', newTotal)
})

// Watch for currentPage changes to sync pageInput
watch(currentPage, (newPage, oldPage) => {
  console.log('📄 Vue PDF: Page changed from', oldPage, 'to', newPage)
  pageInput.value = newPage
})
</script>

<style scoped>
.vue-pdf-viewer {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.no-pdf {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 400px;
  gap: 16px;
}

.pdf-container {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-height: 0;
  overflow: hidden;
}

.pdf-viewer {
  flex: 1;
  min-height: 0;
  width: 100%;
  height: 100%;
  overflow: auto;
  position: relative;
}

/* Ensure PDF content is properly contained */
.pdf-viewer :deep(.vue-pdf-embed) {
  width: 100% !important;
  height: auto !important;
  max-width: 100% !important;
  display: block !important;
}

/* Text layer styling for better selection */
.pdf-viewer :deep(.textLayer) {
  position: absolute;
  left: 0;
  top: 0;
  right: 0;
  bottom: 0;
  overflow: hidden;
  opacity: 0.2;
  line-height: 1.0;
  pointer-events: auto;
  user-select: text;
  -webkit-user-select: text;
  -moz-user-select: text;
  -ms-user-select: text;
}

.pdf-viewer :deep(.textLayer > span) {
  color: transparent;
  position: absolute;
  white-space: pre;
  cursor: text;
  transform-origin: 0% 0%;
  user-select: text;
  -webkit-user-select: text;
  -moz-user-select: text;
  -ms-user-select: text;
}

.pdf-viewer :deep(.textLayer > span:hover) {
  background-color: rgba(255, 255, 0, 0.3);
}

.pdf-viewer :deep(.textLayer > span::selection) {
  background-color: rgba(0, 123, 255, 0.3);
}

.pdf-controls {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 12px;
  padding: 12px;
  background: rgba(0, 0, 0, 0.05);
  border-top: 1px solid rgba(0, 0, 0, 0.1);
  flex-shrink: 0;
}

.page-info, .scale-info {
  font-size: 14px;
  font-weight: 500;
  min-width: 60px;
  text-align: center;
}

.page-input-container {
  display: flex;
  align-items: center;
  gap: 4px;
}

.page-input {
  width: 60px;
}

.page-input :deep(.q-field__control) {
  min-height: 32px;
  height: 32px;
}

.page-input :deep(.q-field__native) {
  padding: 0 8px;
  font-size: 14px;
  text-align: center;
}

.go-button {
  min-width: 32px;
  width: 32px;
  height: 32px;
}

/* Responsive design */
@media (max-width: 768px) {
  .pdf-controls {
    flex-wrap: wrap;
    gap: 8px;
  }
  
  .page-info, .scale-info {
    font-size: 12px;
    min-width: 50px;
  }
}
</style>
