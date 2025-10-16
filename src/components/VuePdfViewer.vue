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
const pageInput = ref('')
const pdfDocument = ref(null)
const isLoading = ref(false)

// Computed
const pdfUrl = computed(() => {
  if (!props.file) return ''
  
  // Use bucketKey to construct proxy URL for imported files
  if (props.file.bucketKey) {
    return `/api/proxy-pdf/${props.file.bucketKey}`
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
  if (!pdfUrl.value) {
    pdfDocument.value = null
    totalPages.value = 0
    isLoading.value = false
    return
  }

  // Prevent multiple simultaneous loads
  if (isLoading.value) {
    return
  }

  try {
    isLoading.value = true
    const loadingTask = pdfjsLib.getDocument(pdfUrl.value)
    pdfDocument.value = loadingTask
    const pdf = await loadingTask.promise
    totalPages.value = pdf.numPages || 0
  } catch (error) {
    console.error('❌ Vue PDF: PDF document loading error:', error)
    pdfDocument.value = null
    totalPages.value = 0
  } finally {
    isLoading.value = false
  }
}

const onPdfLoaded = (pdf: any) => {
  // Only update totalPages if it's not already set AND the component provides a valid numPages
  if (totalPages.value === 0 && pdf.numPages && pdf.numPages > 0) {
    totalPages.value = pdf.numPages
  }
}

const onPdfError = (err: any) => {
  console.error('❌ Vue PDF: PDF loading error:', err)
  totalPages.value = 0
}


const previousPage = () => {
  if (currentPage.value > 1) {
    currentPage.value--
  }
}

const nextPage = () => {
  if (totalPages.value === 0) {
    return
  }
  if (currentPage.value < totalPages.value) {
    currentPage.value++
  }
}

const zoomIn = () => {
  scale.value = Math.min(scale.value + 0.25, 3.0)
}

const zoomOut = () => {
  scale.value = Math.max(scale.value - 0.25, 0.5)
}

const goToPage = () => {
  const targetPage = pageInput.value
  
  if (targetPage >= 1 && targetPage <= totalPages.value) {
    currentPage.value = targetPage
    // Clear the input field after successful navigation
    pageInput.value = ''
  } else {
    // Clear the input field for invalid entries
    pageInput.value = ''
  }
}

// Watch for file changes - this handles both initial load and file changes
watch(() => props.file, (newFile, oldFile) => {
  if (newFile && !isLoading.value) {
    // Check if a specific start page was requested
    if (newFile.startPage && typeof newFile.startPage === 'number') {
      currentPage.value = newFile.startPage
    } else {
      currentPage.value = 1
    }
    totalPages.value = 0
    loadPdfDocument()
  }
}, { immediate: true })

// Note: Removed redundant URL watcher since file changes already trigger loadPdfDocument()
// The URL is computed from the file prop, so watching the file is sufficient

// Watchers for reactive state changes
watch(currentPage, (newPage, oldPage) => {
  // Page changed
})

watch(scale, (newScale, oldScale) => {
  // Scale changed
})

watch(totalPages, (newTotal, oldTotal) => {
  // Total pages changed
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
