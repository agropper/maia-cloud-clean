<template>
  <q-dialog v-model="showModal" persistent>
    <q-card style="min-width: 450px; max-width: 600px;">
      <q-card-section class="bg-warning text-white">
        <div class="text-h6">Choose a Demo Patient Record</div>
      </q-card-section>

      <q-card-section class="q-pt-md">
        <p class="text-body1">
          Choose a demo patient record to see how patient summaries work.
        </p>
        <p class="text-body1">
          Click a <span class="text-primary text-bold">blue link icon</span>.
        </p>
      </q-card-section>

      <q-card-actions align="right">
        <q-btn 
          flat 
          label="NOT NOW" 
          color="grey-7" 
          @click="handleNotNow"
          v-close-popup
        />
        <q-btn 
          unelevated
          label="OPEN AGENT MANAGEMENT SO I CAN CHOOSE" 
          color="primary" 
          @click="handleOpenAgentManagement"
          autofocus
        />
      </q-card-actions>
    </q-card>
  </q-dialog>
</template>

<script>
import { ref, watch } from 'vue';
import { QDialog, QCard, QCardSection, QCardActions, QBtn } from 'quasar';

export default {
  name: 'PublicUserNoKBModal',
  components: {
    QDialog,
    QCard,
    QCardSection,
    QCardActions,
    QBtn
  },
  props: {
    modelValue: {
      type: Boolean,
      default: false
    }
  },
  emits: ['update:modelValue', 'open-agent-management'],
  setup(props, { emit }) {
    const showModal = ref(props.modelValue);

    // Sync internal showModal with external modelValue
    watch(() => props.modelValue, (newVal) => {
      showModal.value = newVal;
    });

    watch(showModal, (newVal) => {
      emit('update:modelValue', newVal);
    });

    const handleNotNow = () => {
      showModal.value = false;
    };

    const handleOpenAgentManagement = () => {
      showModal.value = false;
      emit('open-agent-management');
    };

    return {
      showModal,
      handleNotNow,
      handleOpenAgentManagement
    };
  }
};
</script>

<style scoped>
.text-bold {
  font-weight: 600;
}
</style>

