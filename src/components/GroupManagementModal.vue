<template>
  <q-dialog v-model="isVisible" persistent>
    <q-card style="min-width: 600px; max-width: 800px;">
      <q-card-section class="row items-center q-pb-none">
        <div class="text-h6">Shared Groups</div>
        <q-space />
        <q-btn icon="close" flat round dense v-close-popup />
      </q-card-section>

      <q-card-section>
        <div v-if="loading" class="text-center q-pa-md">
          <q-spinner size="2em" />
          <div class="q-mt-sm">Loading groups...</div>
        </div>

        <div v-else-if="groups.length === 0" class="text-center q-pa-md text-grey">
          <q-icon name="group" size="3em" />
          <div class="q-mt-sm">No shared groups yet</div>
          <div class="text-caption">Create your first shared group by posting a chat!</div>
        </div>

        <div v-else class="group-list">
          <div 
            v-for="group in sortedGroups" 
            :key="group.id" 
            class="group-item q-pa-md q-mb-sm"
            :class="{ 'owner-group': isOwner(group) }"
          >
            <div class="row items-center justify-between">
              <div class="col">
                <div class="row items-center q-mb-xs">
                  <div class="text-weight-medium text-body1">
                    {{ formatDate(group.updatedAt || group.createdAt) }}
                  </div>
                  <q-chip 
                    v-if="isOwner(group)" 
                    size="sm" 
                    color="primary" 
                    text-color="white"
                    class="q-ml-sm"
                  >
                    Owner
                  </q-chip>
                </div>
                
                <div class="text-caption text-grey q-mb-xs">
                  <q-icon name="school" size="xs" />
                  {{ group.connectedKB || 'No KB connected' }}
                </div>
                
                <div class="text-caption text-grey">
                  <q-icon name="people" size="xs" />
                  {{ formatParticipants(group) }}
                </div>
              </div>
              
              <div class="row items-center">
                <q-btn
                  v-if="isOwner(group)"
                  flat
                  round
                  dense
                  icon="delete"
                  color="negative"
                  @click="confirmDelete(group)"
                  title="Delete group"
                />
                <q-btn
                  flat
                  round
                  dense
                  icon="link"
                  color="primary"
                  @click="copyGroupLink(group)"
                  title="Copy group link"
                />
              </div>
            </div>
          </div>
        </div>
      </q-card-section>
    </q-card>

    <!-- Delete Confirmation Dialog -->
    <q-dialog v-model="showDeleteDialog" persistent>
      <q-card>
        <q-card-section>
          <div class="text-h6">Delete Shared Group</div>
        </q-card-section>

        <q-card-section>
          <p>Are you sure you want to delete this shared group?</p>
          <p class="text-caption text-grey">
            This will permanently remove the group and all shared chat data. 
            Anyone with the link will no longer be able to access it.
          </p>
        </q-card-section>

        <q-card-actions align="right">
          <q-btn flat label="Cancel" v-close-popup />
          <q-btn 
            flat 
            label="Delete" 
            color="negative" 
            @click="deleteGroup"
            :loading="deleting"
          />
        </q-card-actions>
      </q-card>
    </q-dialog>
  </q-dialog>
</template>

<script lang="ts">
import { defineComponent, ref, computed, watch } from 'vue'
import { QDialog, QCard, QCardSection, QCardActions, QBtn, QSpace, QSpinner, QIcon, QChip } from 'quasar'
import { useGroupChat } from '../composables/useGroupChat'
import type { GroupChat } from '../composables/useGroupChat'

export default defineComponent({
  name: 'GroupManagementModal',
  components: {
    QDialog,
    QCard,
    QCardSection,
    QCardActions,
    QBtn,
    QSpace,
    QSpinner,
    QIcon,
    QChip
  },
  props: {
    modelValue: {
      type: Boolean,
      required: true
    },
    currentUser: {
      type: String,
      default: ''
    }
  },
  emits: ['update:modelValue'],
  setup(props, { emit }) {
    const isVisible = computed({
      get: () => props.modelValue,
      set: (value) => emit('update:modelValue', value)
    })

    const loading = ref(false)
    const groups = ref<GroupChat[]>([])
    const showDeleteDialog = ref(false)
    const deleting = ref(false)
    const groupToDelete = ref<GroupChat | null>(null)

    const { getAllGroupChats, deleteGroupChat } = useGroupChat()

    const sortedGroups = computed(() => {
      return [...groups.value].sort((a, b) => {
        const dateA = new Date(a.updatedAt || a.createdAt)
        const dateB = new Date(b.updatedAt || b.createdAt)
        return dateB.getTime() - dateA.getTime() // Most recent first
      })
    })

    const loadGroups = async () => {
      loading.value = true
      try {
        groups.value = await getAllGroupChats()
        console.log('📋 Loaded groups:', groups.value.length)
        console.log('📋 Groups data:', groups.value.map(g => ({
          id: g.id,
          currentUser: g.currentUser,
          shareId: g.shareId,
          createdAt: g.createdAt
        })))
      } catch (error) {
        console.error('❌ Failed to load groups:', error)
      } finally {
        loading.value = false
      }
    }

    const isOwner = (group: GroupChat) => {
      const currentUserName = props.currentUser?.username || props.currentUser?.displayName || props.currentUser || 'Unknown User'
      console.log('🔍 Checking ownership:', {
        groupUser: group.currentUser,
        currentUser: currentUserName,
        isOwner: group.currentUser === currentUserName
      })
      return group.currentUser === currentUserName
    }

    const formatDate = (dateString: string) => {
      const date = new Date(dateString)
      return date.toLocaleDateString() + ' ' + date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    }

    const formatParticipants = (group: GroupChat) => {
      const participants = [group.currentUser]
      // For now, just show the owner. Later we'll add group members
      return participants.join(', ')
    }

    const copyGroupLink = async (group: GroupChat) => {
      try {
        const baseUrl = window.location.origin
        const groupLink = `${baseUrl}/shared/${group.shareId}`
        await navigator.clipboard.writeText(groupLink)
        
        // Show success notification
        const notification = document.createElement('div')
        notification.style.cssText = `
          position: fixed;
          top: 20px;
          right: 20px;
          background-color: #4CAF50;
          color: white;
          padding: 12px 24px;
          border-radius: 4px;
          box-shadow: 0 2px 10px rgba(0,0,0,0.2);
          z-index: 10000;
          font-family: Arial, sans-serif;
          font-size: 14px;
          font-weight: 500;
        `
        notification.textContent = 'Group link copied to clipboard!'
        document.body.appendChild(notification)
        
        setTimeout(() => {
          if (document.body.contains(notification)) {
            document.body.removeChild(notification)
          }
        }, 1000)
        
        console.log('✅ Group link copied:', groupLink)
      } catch (error) {
        console.error('❌ Failed to copy group link:', error)
      }
    }

    const confirmDelete = (group: GroupChat) => {
      groupToDelete.value = group
      showDeleteDialog.value = true
    }

    const deleteGroup = async () => {
      if (!groupToDelete.value) return
      
      deleting.value = true
      try {
        await deleteGroupChat(groupToDelete.value.id)
        console.log('✅ Group deleted successfully')
        
        // Remove from local list
        groups.value = groups.value.filter(g => g.id !== groupToDelete.value!.id)
        
        showDeleteDialog.value = false
        groupToDelete.value = null
      } catch (error) {
        console.error('❌ Failed to delete group:', error)
      } finally {
        deleting.value = false
      }
    }

    // Load groups when modal opens
    watch(isVisible, (newValue) => {
      if (newValue) {
        loadGroups()
      }
    })

    return {
      isVisible,
      loading,
      groups,
      sortedGroups,
      showDeleteDialog,
      deleting,
      isOwner,
      formatDate,
      formatParticipants,
      copyGroupLink,
      confirmDelete,
      deleteGroup
    }
  }
})
</script>

<style scoped>
.group-list {
  max-height: 400px;
  overflow-y: auto;
}

.group-item {
  border: 1px solid #e0e0e0;
  border-radius: 8px;
  transition: all 0.2s ease;
}

.group-item:hover {
  border-color: #1976d2;
  background-color: #f5f5f5;
}

.owner-group {
  border-color: #1976d2;
  background-color: #f0f8ff;
}
</style>
