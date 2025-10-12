<template>
  <q-dialog v-model="show" persistent>
    <q-card style="min-width: 500px; max-width: 700px;">
      <q-card-section class="row items-center q-pb-none">
        <q-icon name="warning" color="orange" size="md" class="q-mr-sm" />
        <div class="text-h6">Update Knowledge Base</div>
        <q-space />
        <q-btn icon="close" flat round dense v-close-popup />
      </q-card-section>

      <q-card-section>
        <div class="q-mb-md">
          <p class="text-body1">
            You already have a knowledge base: <strong>{{ existingKBName }}</strong>
          </p>
          <p class="text-body2">
            Creating a new knowledge base will:
          </p>
          <ul class="q-pl-md text-body2">
            <li>Detach the old knowledge base from your agent</li>
            <li>Create a new knowledge base with your selected files</li>
            <li>Replace your current knowledge base</li>
          </ul>
          <p class="text-body2 text-grey-8 q-mt-md">
            Your archived files will remain safe in your storage folder.
          </p>
        </div>
      </q-card-section>

      <q-card-actions align="right" class="q-pa-md">
        <q-btn
          flat
          label="Cancel"
          color="grey-7"
          @click="handleCancel"
        />
        <q-btn
          unelevated
          label="Update Knowledge Base"
          color="primary"
          @click="handleConfirm"
        />
      </q-card-actions>
    </q-card>
  </q-dialog>
</template>

<script>
import { ref, watch } from 'vue';
import { QDialog, QCard, QCardSection, QCardActions, QBtn, QSpace, QIcon } from 'quasar';

export default {
  name: 'KBUpdateWarningModal',
  components: {
    QDialog,
    QCard,
    QCardSection,
    QCardActions,
    QBtn,
    QSpace,
    QIcon,
  },
  props: {
    modelValue: {
      type: Boolean,
      default: false
    },
    existingKBName: {
      type: String,
      default: ''
    }
  },
  emits: ['update:modelValue', 'confirm', 'cancel'],
  setup(props, { emit }) {
    const show = ref(props.modelValue);

    watch(() => props.modelValue, (newVal) => {
      show.value = newVal;
    });

    watch(show, (newVal) => {
      emit('update:modelValue', newVal);
    });

    const handleConfirm = () => {
      show.value = false;
      emit('confirm');
    };

    const handleCancel = () => {
      show.value = false;
      emit('cancel');
    };

    return {
      show,
      handleConfirm,
      handleCancel,
    };
  },
};
</script>

<style scoped>
.text-h6 {
  font-weight: 600;
}

ul {
  list-style-type: disc;
  line-height: 1.8;
}

p {
  margin-bottom: 0.5rem;
  line-height: 1.6;
}

p:last-child {
  margin-bottom: 0;
}
</style>

