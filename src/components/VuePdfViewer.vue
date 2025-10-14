<template>
  <div class="vue-pdf-viewer">
    <!-- PDF Viewer -->
    <div v-if="pdfUrl" class="pdf-container">
      <VPdfViewer
        :src="pdfUrl"
        class="pdf-viewer"
        @loaded="onPdfLoaded"
        @error="onPdfError"
      />
    </div>

    <!-- No PDF state -->
    <div v-else class="no-pdf">
      <q-icon name="description" size="40px" color="grey" />
      <p>No PDF to display</p>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted } from 'vue'
import { VPdfViewer } from '@vue-pdf-viewer/viewer'
import { QIcon } from 'quasar'
import * as pdfjsLib from 'pdfjs-dist'

// Configure PDF.js worker for better compatibility
onMounted(() => {
  // Set the worker source to use the bundled worker
  if (typeof window !== 'undefined') {
    pdfjsLib.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.js'
  }
})

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
const onPdfLoaded = (pdf: any) => {
  console.log('✅ Vue PDF Viewer: PDF loaded successfully:', pdf)
}

const onPdfError = (err: any) => {
  console.error('❌ Vue PDF Viewer: PDF loading error:', err)
}
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
</style>
