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
              <div class="col clickable" @click="loadChat(group)">
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
                
                <!-- File attachments -->
                <div v-if="group.uploadedFiles && group.uploadedFiles.length > 0" class="text-caption text-grey q-mt-xs">
                  <q-icon name="attach_file" size="xs" />
                  <span class="file-list">
                    {{ formatFileList(group.uploadedFiles) }}
                  </span>
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
                  @click.stop="confirmDelete(group)"
                  title="Delete group"
                />
                <q-btn
                  flat
                  round
                  dense
                  icon="link"
                  color="primary"
                  @click.stop="copyGroupLink(group)"
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
import type { PropType } from 'vue'
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
      type: [String, Object] as PropType<string | { userId: string; displayName: string }>,
      default: ''
    },
    onGroupDeleted: {
      type: Function as () => () => void | Promise<void>,
      required: false
    }
  },
  emits: ['update:modelValue', 'chatLoaded'],
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

    const { getAllGroupChats, deleteGroupChat, loadGroupChat } = useGroupChat()

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
        const allGroups = await getAllGroupChats()
        
        // Filter groups by current user (including "Unknown User")
        let currentUserName: string
        if (typeof props.currentUser === 'object' && props.currentUser !== null) {
          currentUserName = props.currentUser.userId || props.currentUser.displayName || 'Unknown User'
        } else {
          currentUserName = props.currentUser || 'Unknown User'
        }
        
        groups.value = allGroups.filter(group => group.currentUser === currentUserName)

      } catch (error) {
        console.error('❌ Failed to load groups:', error)
      } finally {
        loading.value = false
      }
    }

    const isOwner = (group: GroupChat) => {
      // Handle both string and object currentUser
      let currentUserName: string
      if (typeof props.currentUser === 'object' && props.currentUser !== null) {
        currentUserName = props.currentUser.username || props.currentUser.displayName || 'Unknown User'
      } else {
        currentUserName = props.currentUser || 'Unknown User'
      }
      
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

    const formatFileList = (files: any[]) => {
      if (!files || files.length === 0) return ''
      
      // Show up to 3 file names, then "and X more" if there are more
      const maxFiles = 3
      if (files.length <= maxFiles) {
        return files.map(file => file.name || 'Unknown file').join(', ')
      } else {
        const shownFiles = files.slice(0, maxFiles).map(file => file.name || 'Unknown file')
        const remainingCount = files.length - maxFiles
        return `${shownFiles.join(', ')} and ${remainingCount} more`
      }
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
        console.log('🗑️ Attempting to delete group:', {
          groupToDelete: groupToDelete.value,
          groupId: groupToDelete.value.id,
          groupIdType: typeof groupToDelete.value.id
        })
        
        await deleteGroupChat(groupToDelete.value.id)
        console.log('🗑️ Group deleted successfully')
        
        // Remove from local list
        groups.value = groups.value.filter(g => g.id !== groupToDelete.value!.id)
        
        // Notify parent to refresh group count
        if (props.onGroupDeleted) {
          props.onGroupDeleted()
        }
        
        showDeleteDialog.value = false
        groupToDelete.value = null
      } catch (error) {
        console.error('❌ Failed to delete group:', error)
      } finally {
        deleting.value = false
      }
    }

    const loadChat = async (group: GroupChat) => {
      try {
        console.log('📂 Loading group chat:', group.id)
        
        // Load the chat data
        const loadedChat = await loadGroupChat(group.id)
        console.log('✅ Chat loaded successfully:', loadedChat)
        
        // Emit the loaded chat to parent component
        emit('chatLoaded', loadedChat)
        
        // Close the modal
        isVisible.value = false
        
      } catch (error) {
        console.error('❌ Failed to load group chat:', error)
        // Show error notification
        const notification = document.createElement('div')
        notification.style.cssText = `
          position: fixed;
          top: 20px;
          right: 20px;
          background-color: #f44336;
          color: white;
          padding: 12px 24px;
          border-radius: 4px;
          box-shadow: 0 2px 10px rgba(0,0,0,0.2);
          z-index: 10000;
          font-family: Arial, sans-serif;
          font-size: 14px;
          font-weight: 500;
        `
        notification.textContent = 'Failed to load chat. Please try again.'
        document.body.appendChild(notification)
        
        setTimeout(() => {
          if (document.body.contains(notification)) {
            document.body.removeChild(notification)
          }
        }, 3000)
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
      formatFileList,
      copyGroupLink,
      confirmDelete,
      deleteGroup,
      loadChat
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

.clickable {
  cursor: pointer;
}

.owner-group {
  border-color: #1976d2;
  background-color: #f0f8ff;
}

.file-list {
  font-style: italic;
  color: #666;
}
</style>
