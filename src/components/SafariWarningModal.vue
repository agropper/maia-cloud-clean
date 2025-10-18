<template>
  <QDialog v-model="isOpen" persistent>
    <QCard style="min-width: 400px">
      <QCardSection class="bg-warning text-white">
        <div class="text-h6">⚠️ Safari Browser Detected</div>
      </QCardSection>

      <QCardSection>
        <p class="text-body1">
          Passkey flows are broken on Safari for now. We suggest Chrome.
        </p>
        <p class="text-body2 text-grey-7 q-mt-md">
          Public User and deep link functionality should be fine.
        </p>
      </QCardSection>

      <QCardActions align="right">
        <QBtn
          label="Try Anyway"
          color="grey-7"
          flat
          @click="handleTryAnyway"
        />
        <QBtn
          label="Got it"
          color="primary"
          @click="handleClose"
          v-close-popup
        />
      </QCardActions>
    </QCard>
  </QDialog>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue'
import { QDialog, QCard, QCardSection, QCardActions, QBtn } from 'quasar'

const props = defineProps<{
  modelValue: boolean
}>()

const emit = defineEmits<{
  (e: 'update:modelValue', value: boolean): void
  (e: 'try-anyway'): void
}>()

const isOpen = ref(props.modelValue)

watch(() => props.modelValue, (newValue) => {
  isOpen.value = newValue
})

watch(isOpen, (newValue) => {
  emit('update:modelValue', newValue)
})

const handleClose = () => {
  isOpen.value = false
}

const handleTryAnyway = () => {
  emit('try-anyway')
  isOpen.value = false
}
</script>

<style scoped>
.text-body1 {
  line-height: 1.6;
}
</style>

