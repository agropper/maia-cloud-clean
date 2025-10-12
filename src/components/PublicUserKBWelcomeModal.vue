<template>
  <q-dialog v-model="show" persistent>
    <q-card style="min-width: 400px; max-width: 600px;">
      <q-card-section class="row items-center q-pb-none">
        <div class="text-h6">📚 Choose a Patient Record</div>
        <q-space />
        <q-btn icon="close" flat round dense v-close-popup />
      </q-card-section>

      <q-card-section>
        <div class="q-mb-md">
          <p>
            You do not have a knowledge base of simulated patient records attached to the demonstration agent.
          </p>
          <p>
            Choose a patient record from the Agent Management Dialog.
          </p>
        </div>
      </q-card-section>

      <q-card-actions align="right" class="q-pa-md">
        <q-btn
          flat
          label="Not Now"
          color="grey-7"
          v-close-popup
        />
        <q-btn
          unelevated
          label="Open Agent Manager"
          color="primary"
          @click="handleOpenManager"
        />
      </q-card-actions>
    </q-card>
  </q-dialog>
</template>

<script>
import { ref, watch } from 'vue';
import { QDialog, QCard, QCardSection, QCardActions, QBtn, QSpace } from 'quasar';

export default {
  name: 'PublicUserKBWelcomeModal',
  components: {
    QDialog,
    QCard,
    QCardSection,
    QCardActions,
    QBtn,
    QSpace,
  },
  props: {
    modelValue: {
      type: Boolean,
      default: false
    },
    currentUser: {
      type: Object,
      default: null
    }
  },
  emits: ['update:modelValue', 'open-manager'],
  setup(props, { emit }) {
    const show = ref(props.modelValue);

    watch(() => props.modelValue, (newVal) => {
      show.value = newVal;
    });

    watch(show, (newVal) => {
      emit('update:modelValue', newVal);
    });

    const handleOpenManager = () => {
      show.value = false;
      emit('open-manager');
    };

    return {
      show,
      handleOpenManager,
    };
  },
};
</script>

<style scoped>
.text-h6 {
  font-weight: 600;
}

p {
  margin-bottom: 0.5rem;
  line-height: 1.6;
}

p:last-child {
  margin-bottom: 0;
}
</style>

