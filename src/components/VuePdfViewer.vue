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
import { QIcon, QBtn } from 'quasar'
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
const pdfDocument = ref(null)

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
  if (!pdfUrl.value) {
    pdfDocument.value = null
    return
  }

  try {
    console.log('🔄 Vue PDF: Loading PDF document from:', pdfUrl.value)
    const loadingTask = pdfjsLib.getDocument(pdfUrl.value)
    pdfDocument.value = loadingTask
    const pdf = await loadingTask.promise
    console.log('✅ Vue PDF: PDF document loaded successfully:', pdf)
    totalPages.value = pdf.numPages || 0
  } catch (error) {
    console.error('❌ Vue PDF: PDF document loading error:', error)
    pdfDocument.value = null
  }
}

const onPdfLoaded = (pdf: any) => {
  console.log('✅ Vue PDF: PDF loaded successfully:', pdf)
  totalPages.value = pdf.numPages || 0
}

const onPdfError = (err: any) => {
  console.error('❌ Vue PDF: PDF loading error:', err)
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

const zoomIn = () => {
  scale.value = Math.min(scale.value + 0.25, 3.0)
}

const zoomOut = () => {
  scale.value = Math.max(scale.value - 0.25, 0.5)
}

// Watch for file changes
watch(() => props.file, (newFile) => {
  if (newFile) {
    currentPage.value = 1
    totalPages.value = 0
    loadPdfDocument()
  }
}, { immediate: true })

// Watch for URL changes
watch(pdfUrl, () => {
  loadPdfDocument()
}, { immediate: true })
</script>

<style scoped>
.vue-pdf-viewer {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
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
}

.pdf-viewer {
  flex: 1;
  min-height: 0;
  width: 100%;
  height: 100%;
}

.pdf-controls {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 12px;
  padding: 12px;
  background: rgba(0, 0, 0, 0.05);
  border-top: 1px solid rgba(0, 0, 0, 0.1);
}

.page-info, .scale-info {
  font-size: 14px;
  font-weight: 500;
  min-width: 60px;
  text-align: center;
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
