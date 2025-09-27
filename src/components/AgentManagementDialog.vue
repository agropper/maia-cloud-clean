<template>
  <q-dialog v-model="showDialog" persistent @before-show="onDialogBeforeShow" @show="onDialogOpen">
    <q-card style="min-width: 600px; max-width: 800px">
      <q-card-section class="row items-center q-pb-none">
        <div class="text-h6">🤖 Agent Management</div>
        <q-space />
        <q-btn icon="close" flat round dense @click="handleClose" />
      </q-card-section>

      <q-card-section>
        <!-- Dialog Loading State -->
        <div v-if="isDialogLoading" class="text-center q-pa-xl">
          <q-spinner-dots
            size="48px"
                    color="primary"
          />
          <div class="text-h6 q-mt-md">Loading Agent Management...</div>
          <div class="text-caption q-mt-sm">Please wait while we load your agent and knowledge base information</div>
        </div>

        <!-- Main Content (only show when not loading) -->
        <div v-else>
          <!-- Agent Badge for All Users - Always show -->
          <div class="q-mb-lg">
            <AgentStatusIndicator
              :agent="assignedAgent"
              :warning="warning"
              :currentUser="localCurrentUser"
              @clear-warning="warning = ''"
              :currentWorkflowStep="currentWorkflowStep"
              :workflowSteps="workflowSteps"
              :userEmail="userEmail"
              :showManageButton="false"
              :class="isAuthenticated ? 'agent-badge-authenticated' : 'agent-badge-unauthenticated'"
            />
          </div>

          <!-- Deep Link User Text Prompt -->
          <div v-if="isDeepLinkUser" class="q-mb-lg">
            <div class="text-caption text-grey-7 q-pa-md" style="background-color: #e8f5e8; border-radius: 8px; border-left: 4px solid #4caf50;">
              <div class="row items-center">
                <q-icon name="link" color="positive" size="1.2rem" class="q-mr-sm" />
                <div>
                  <strong>Shared Chat Access</strong><br>
                  The Private AI is controlled by the patient. You are viewing a shared chat with access to the patient's knowledge base and AI agent.
                </div>
              </div>
            </div>
          </div>

          <!-- User Information Panel - Always shown for authenticated users -->
          <div v-else-if="isAuthenticated && !isDeepLinkUser" class="q-mb-lg">
            <!-- Workflow Stage Information Block -->
            <div v-if="currentWorkflowMessage" class="text-caption text-grey-7 q-pa-md" :style="getWorkflowStateStyle(currentWorkflowState)">
              <div class="row items-center">
                <q-icon :name="getWorkflowStateIcon(currentWorkflowState)" :color="getWorkflowStateColor(currentWorkflowState)" size="1.2rem" class="q-mr-sm" />
                <div>
                  <strong>{{ currentWorkflowMessage }}</strong>
                </div>
              </div>
            </div>
            
            <!-- File Management Options for Authenticated Users -->
            <div v-if="assignedAgent && assignedAgent.type === 'assigned'" class="q-mb-lg">
              <div class="text-h6 q-mb-md">📁 File Management</div>
              <div class="row q-gutter-md">
                <q-btn
                  v-if="userHasFiles"
                  label="Create/Add to Knowledge Base"
                  color="positive"
                  icon="add_circle"
                  @click="handleFileAction('create_or_add')"
                  class="q-px-lg"
                />
                <q-btn
                  v-if="userHasFiles"
                  label="Import More Files"
                  color="primary"
                  icon="upload_file"
                  @click="handleFileAction('import_more')"
                  class="q-px-lg"
                />
                <q-btn
                  v-if="userHasFiles"
                  label="Clear Files"
                  color="warning"
                  icon="clear_all"
                  @click="handleFileAction('clear_files')"
                  class="q-px-lg"
                />
                <q-btn
                  v-if="!userHasFiles"
                  label="Import Files"
                  color="primary"
                  icon="upload_file"
                  @click="handleFileAction('import_files')"
                  class="q-px-lg"
                />
                <q-btn
                  label="Cancel"
                  color="grey"
                  icon="cancel"
                  @click="handleClose"
                  class="q-px-lg"
                />
              </div>
            </div>
          </div>

          <!-- Public User Text Prompt -->
          <div v-else-if="!isAuthenticated" class="q-mb-lg">
            <div class="text-caption text-grey-7 q-pa-md" style="background-color: #f5f5f5; border-radius: 8px; border-left: 4px solid #1976d2;">
              The Public User is a shared demo environment. You must sign-in to request a private agent and to create knowledge bases from real health records.
            </div>
          </div>

        <!-- Workflow Progress Section - Only for authenticated users -->
        <div v-else-if="isAuthenticated" class="q-mb-lg">
          <!-- Show detailed progress list only when no agent or no KBs -->
          <div v-if="!assignedAgent || !assignedAgent.knowledgeBases || assignedAgent.knowledgeBases.length === 0">
          <h6 class="q-mb-sm">🔐 Private AI Setup Progress</h6>
          <div class="workflow-steps">
            <div 
              v-for="(step, index) in workflowSteps" 
              :key="index"
              class="workflow-step"
              :class="{ 'completed': step.completed, 'current': step.current }"
            >
              <div class="step-indicator">
                <q-icon 
                  v-if="step.completed"
                  name="check_circle" 
                  color="positive" 
                  size="1.2rem"
                />
                <q-icon 
                  v-else-if="step.current"
                  name="radio_button_checked" 
                  color="primary" 
                  size="1.2rem"
                />
                <q-icon 
                  v-else
                  name="radio_button_unchecked" 
                  color="grey-4" 
                  size="1.2rem"
                />
              </div>
              <div class="step-content">
                <div class="step-title" :class="{ 'text-grey-6': !step.completed && !step.current }">
                  {{ step.title }}
                </div>
              </div>
              <div class="step-help">
                <q-btn 
                  flat 
                  dense 
                  size="sm" 
                  color="primary" 
                  icon="help_outline"
                  @click="showStepHelp(index)"
                  class="help-btn"
                />
              </div>
          </div>
        </div>

          <!-- Request Administrator Approval Button (below first step) -->
          <div v-if="!assignedAgent && !hasRequestedApproval" class="q-mt-md text-center">
            <q-btn
              label="Request Administrator Approval"
              color="primary"
              @click="showAdminApprovalDialog = true"
              :loading="isRequestingApproval"
              class="q-px-lg"
            />
          </div>

          <!-- Choose Files Button (when agent is assigned) - Only for authenticated users (not deep link users) -->
          <div v-if="assignedAgent && assignedAgent.type === 'assigned' && !hasRequestedApproval && !workflowSteps[5].current && isAuthenticated && !isDeepLinkUser" class="q-mt-md text-center">
            <q-btn
              label="CREATE KNOWLEDGE BASE"
              color="positive"
              @click="handleChooseFiles"
              icon="folder_open"
              class="q-px-lg"
            />
          </div>

          <!-- Cancel Request Button (when on Step 3) - Only for authenticated users (not deep link users) -->
          <div v-if="workflowSteps[2].current && isAuthenticated && !isDeepLinkUser" class="q-mt-md text-center">
            <q-btn
              label="CANCEL REQUEST"
              color="warning"
              @click="showCancelRequestModal = true"
              icon="cancel"
              class="q-px-lg"
            />
        </div>

          <!-- Cancel Indexing Button (when on Step 6) - Only for authenticated users (not deep link users) -->
          <div v-if="workflowSteps[5].current && isAuthenticated && !isDeepLinkUser" class="q-mt-md text-center">
            <q-btn
              label="CANCEL INDEXING"
              color="warning"
              @click="showCancelIndexingModal = true"
              icon="stop"
              class="q-px-lg"
            />
                  </div>

          <!-- Start Indexing Button (when on Step 6 but no indexing job) - Only for authenticated users (not deep link users) -->
          <div v-if="workflowSteps[5].current && workflowSteps[5].title.includes('indexing needs to be started') && isAuthenticated && !isDeepLinkUser" class="q-mt-md text-center">
            <q-btn
              label="START INDEXING"
              color="primary"
              @click="startIndexingJob(currentKbId)"
              icon="play_arrow"
              class="q-px-lg"
            />
                </div>
              </div>

          <!-- Show manage button when agent and KBs are ready - Only for authenticated users (not deep link users) -->
          <div v-else-if="assignedAgent && assignedAgent.knowledgeBases && assignedAgent.knowledgeBases.length > 0 && isAuthenticated && !isDeepLinkUser" class="q-mt-md text-center">
            <q-btn
              label="MANAGE HEALTH RECORDS KNOWLEDGE BASES"
              color="primary"
              @click="handleManageKnowledgeBases"
              icon="manage_accounts"
              class="q-px-lg"
              size="lg"
            />
              </div>
        </div>



        <!-- Agent Instructions -->
        <div v-if="assignedAgent" class="q-mb-md">
          <h6 class="q-mb-sm">Agent Instructions:</h6>
          <div class="q-pa-md" style="background-color: #f5f5f5; border-radius: 8px; border-left: 4px solid #1976d2;">
            <div class="text-body2">
              <strong>{{ assignedAgent.name }}</strong>
            </div>
            <div class="text-caption text-grey-7 q-mt-sm">
              {{ assignedAgent.instructions || assignedAgent.description || 'No specific instructions available for this agent.' }}
            </div>
          </div>
        </div>

        <!-- Agent Actions (if agent exists) - Only for authenticated users (not deep link users) -->
        <div v-if="assignedAgent && isAuthenticated && !isDeepLinkUser" class="q-mb-md">
          <div class="row q-gutter-md">
            <q-btn
              label="Update Agent"
              color="primary"
              @click="updateAgent"
              :loading="isUpdating"
              :disable="!knowledgeBase"
              :title="
                knowledgeBase
                  ? 'Update agent settings'
                  : 'Select a knowledge base first'
              "
            />
            <q-btn label="Close" flat @click="handleClose" />
          </div>
        </div>

        <!-- Loading State -->
        <div v-if="isLoading" class="text-center q-pa-md">
          <q-icon
            name="hourglass_empty"
            size="2rem"
            color="primary"
            class="q-mb-sm"
          />
          <div class="text-caption">Loading agent information...</div>
        </div>

        <!-- Content (only show when not loading) -->
        <div v-else>


          <!-- No Agent Configured - Only for Public User (not deep link users) -->
          <div v-if="!assignedAgent && !isAuthenticated && !isDeepLinkUser" class="text-center q-pa-md">
            <q-icon name="smart_toy" size="4rem" color="grey-4" />
            <div class="text-h6 q-mt-md">No Agent Configured</div>
            <div class="text-caption q-mb-md">
              Please sign in to access your private AI agent and create knowledge bases from your health records.
            </div>
          </div>

          <!-- Assigned Agent Display (for authenticated users, not deep link users) -->
          <div v-if="isAuthenticated && !isDeepLinkUser && assignedAgent && assignedAgent.type === 'assigned'" class="text-center q-pa-md">
            <q-icon name="smart_toy" size="4rem" color="positive" />
            <div class="text-h6 q-mt-md text-positive">Agent Assigned!</div>
            <div class="text-subtitle1 q-mb-sm">{{ assignedAgent.name }}</div>
            <div class="text-caption q-mb-md text-grey">
              Your private AI agent has been created and is ready for use.
            </div>
            
            <!-- Create Knowledge Base Button -->
            <q-btn
              label="Create private knowledge base"
              color="primary"
              size="lg"
              @click="handleCreateKnowledgeBase"
              icon="add"
              class="q-mt-md"
            />
          </div>

          <!-- Agent Management (if agent exists) -->
          <div v-if="assignedAgent">
          </div>

          <!-- Knowledge Base Section - Only show for authenticated users (not deep link users) -->
            <q-card v-if="!isDeepLinkUser" flat bordered class="q-mb-md">
              <q-card-section>
                <div class="row items-center q-mb-sm">
                  <q-icon name="library_books" color="secondary" />
                  <span class="text-subtitle2 q-ml-sm"
                    >Available Knowledge Bases</span
                  >
                </div>

                <!-- Available files for knowledge base creation -->
                <div v-if="isAuthenticated && !isDeepLinkUser" class="q-mb-md">
                  <div class="text-subtitle2 q-mb-sm">
                    Available files for knowledge base creation:
                  </div>
                  <!-- Debug info -->
                  <div class="text-caption text-grey q-mb-xs">
                    [KB DEBUG] uploadedFiles: {{ uploadedFiles ? uploadedFiles.length : 'null' }}, userBucketFiles: {{ userBucketFiles ? userBucketFiles.length : 'null' }}
                  </div>
                  <div class="text-caption text-grey q-mb-xs">
                    [KB DEBUG] props.uploadedFiles: {{ uploadedFiles ? uploadedFiles.length : 'null' }}
                  </div>
                  <div v-if="(uploadedFiles && uploadedFiles.length > 0) || (userBucketFiles && userBucketFiles.length > 0)" class="q-pa-sm bg-blue-1 rounded-borders">
                    <q-list dense>
                      <!-- Uploaded files from chat area -->
                      <q-item
                        v-for="file in uploadedFiles"
                        :key="file.id"
                        class="q-pa-xs"
                      >
                        <q-item-section avatar>
                          <q-checkbox
                            v-model="file.selected"
                            color="primary"
                          />
                        </q-item-section>
                        <q-item-section>
                          <q-item-label class="text-body2">
                            {{ file.name }}
                          </q-item-label>
                          <q-item-label caption class="text-grey-6">
                            {{ file.size }} bytes
                          </q-item-label>
                        </q-item-section>
                      </q-item>
                      
                      <!-- Files from bucket -->
                      <q-item
                        v-for="file in userBucketFiles"
                        :key="file.key"
                        class="q-pa-xs"
                      >
                        <q-item-section avatar>
                          <q-checkbox
                            v-model="file.selected"
                            color="primary"
                          />
                        </q-item-section>
                        <q-item-section>
                          <q-item-label class="text-body2">
                            {{ file.key.split('/').pop() }} - saved
                          </q-item-label>
                          <q-item-label caption class="text-grey-6">
                            {{ file.size }} bytes
                          </q-item-label>
                        </q-item-section>
                      </q-item>
                    </q-list>
                  </div>
                  <div v-else class="text-caption text-grey q-pa-sm">
                    Files can be imported with the paper clip
                  </div>
                </div>

                <!-- Create Knowledge Base Button - Only for authenticated users (not deep link users) -->
                <div v-if="isAuthenticated && !isDeepLinkUser" class="q-mb-md">
                  <q-btn
                    label="CREATE KNOWLEDGE BASE"
                    color="primary"
                    icon="add_circle"
                    :disable="getSelectedFilesCount() === 0"
                    @click="createKnowledgeBaseFromSelectedFiles"
                    class="q-px-lg"
                  />
                  
                  <div class="text-caption text-grey q-mt-xs">
                    Select at least one file for the knowledge base.
                  </div>
                </div>

                <!-- Knowledge Base List - Only show if user has assigned agent -->
                <div v-if="availableKnowledgeBases.length > 0 && assignedAgent" class="q-mb-md">
                  <div
                    v-for="kb in availableKnowledgeBases"
                    :key="kb.uuid"
                    class="q-mb-sm"
                  >
                    <q-item class="kb-item">
                      <q-item-section>
                        <q-item-label>
                          {{ kb.name || 'NO NAME' }} ({{ kb.uuid }})
                          <!-- Protection Status Icon -->
                          <q-icon
                            v-if="kb.isProtected"
                            name="lock"
                            color="warning"
                            size="sm"
                            class="q-ml-xs"
                            title="Protected KB"
                          />
                          <q-icon
                            v-else
                            name="public"
                            color="positive"
                            size="sm"
                            class="q-ml-xs"
                            title="Public KB"
                          />
                          <q-chip
                            v-if="isKnowledgeBaseConnected(kb)"
                            size="sm"
                            color="positive"
                            text-color="white"
                            class="q-ml-sm"
                          >
                            Connected
                          </q-chip>
                          <q-chip
                            v-else
                            size="sm"
                            color="grey"
                            text-color="white"
                            class="q-ml-sm"
                          >
                            Available
                          </q-chip>
                          <!-- Owner info for protected KBs -->
                          <q-chip
                            v-if="kb.isProtected && kb.owner"
                            size="sm"
                            color="warning"
                            text-color="white"
                            class="q-ml-sm"
                          >
                            {{ kb.owner }}
                          </q-chip>
                        </q-item-label>
                        <q-item-label caption>{{
                          kb.description || "No description"
                        }}</q-item-label>
                      </q-item-section>
                      <q-item-section side>
                        <div class="row q-gutter-xs">
                          <!-- Protection Toggle (only for KB owner) -->
                          <q-btn
                            v-if="
                              localCurrentUser && kb.owner === localCurrentUser.userId
                            "
                            :icon="kb.isProtected ? 'lock_open' : 'lock'"
                            :color="kb.isProtected ? 'warning' : 'grey'"
                            size="sm"
                            flat
                            @click="toggleKBProtection(kb)"
                            :title="
                              kb.isProtected
                                ? 'Remove protection'
                                : 'Add protection'
                            "
                          />

                          <!-- DETACH button for connected KBs -->
                          <q-btn
                            v-if="isKnowledgeBaseConnected(kb)"
                            icon="link_off"
                            color="negative"
                            size="sm"
                            flat
                            @click="confirmDetachKnowledgeBase(kb)"
                            title="Detach this knowledge base from the agent"
                          />
                          <!-- CONNECT button for available KBs -->
                          <q-btn
                            v-else
                            icon="link"
                            color="primary"
                            size="sm"
                            flat
                            @click="confirmConnectKnowledgeBase(kb)"
                            title="Connect this knowledge base to the agent"
                          />
                        </div>
                      </q-item-section>
                    </q-item>
                  </div>
                </div>
                <div v-else class="text-caption text-grey">
                  No knowledge bases available
                </div>
              </q-card-section>
            </q-card>
          </div>
        </div>
      </q-card-section>
    </q-card>

    <!-- Knowledge Base Link Suggestion Modal -->
    <q-dialog v-model="showKbLinkSuggestionDialog" persistent>
      <q-card style="min-width: 500px">
        <q-card-section class="row items-center q-pb-none">
          <q-avatar icon="link" color="primary" text-color="white" />
          <span class="q-ml-sm text-h6">Link Knowledge Base</span>
        </q-card-section>
        <q-card-section>
          <p>Great! You've selected an agent. Now you should link a knowledge base to it for better AI responses.</p>
          <p class="text-caption text-grey">
            Click the link icon (🔗) next to any knowledge base in the list below to connect it to your selected agent.
          </p>
        </q-card-section>
        <q-card-actions align="right">
          <q-btn flat label="Got it!" color="primary" @click="showKbLinkSuggestionDialog = false" />
        </q-card-actions>
      </q-card>
    </q-dialog>

    <!-- Agent Creation Wizard -->
    <AgentCreationWizard
      v-model="showWizard"
      @agent-created="handleAgentCreated"
    />

    <!-- Document Manager Dialog -->
    <q-dialog v-model="showDocumentManager" persistent>
      <q-card style="min-width: 500px">
        <q-card-section class="row items-center q-pb-none">
          <div class="text-h6">📚 Knowledge Base Documents</div>
          <q-space />
          <q-btn icon="close" flat round dense v-close-popup />
        </q-card-section>
        <q-card-section>
          <div class="text-center q-pa-md">
            <q-icon name="library_books" size="48px" color="grey-4" />
            <div class="text-caption text-grey q-mt-sm">
              Document management coming soon
            </div>
          </div>
        </q-card-section>
      </q-card>
    </q-dialog>

    <!-- Enhanced File Selection Dialog -->
    <q-dialog v-model="showChooseFilesDialog" persistent>
      <q-card style="min-width: 700px; max-width: 900px">
        <q-card-section class="row items-center q-pb-none">
          <div class="text-h6">📁 Choose Files for Knowledge Base</div>
          <q-space />
          <q-btn icon="close" flat round dense v-close-popup />
        </q-card-section>
        <q-card-section>
          <div v-if="!hasUploadedDocuments && userBucketFiles.length === 0" class="text-center q-pa-md">
            <q-icon name="attach_file" size="48px" color="grey-4" />
            <div class="text-h6 q-mt-md">No Files Available</div>
            <div class="text-caption q-mb-md">
              Upload documents using the paper clip button or add files to your bucket folder
            </div>
          </div>

          <div v-else>
            <q-form
              @submit="handleEnhancedFileSelection"
              class="q-gutter-md"
            >
              <!-- Knowledge Base Selection -->
              <div class="q-mb-md">
                <div class="text-subtitle2 q-mb-sm">Knowledge Base:</div>
                <q-select
                  v-model="selectedKbId"
                  :options="kbOptions"
                  option-value="value"
                  option-label="label"
                  emit-value
                  map-options
                  outlined
                  :rules="[(val) => !!val || 'Please select or create a knowledge base']"
                  hint="Select existing KB or create new one"
                />
                
                <!-- Show KB name input when creating new -->
                <q-input
                  v-if="selectedKbId === 'new'"
                  v-model="newKbNameInput"
                  label="New Knowledge Base Name"
                  outlined
                  :rules="[(val) => !!val || 'Name is required']"
                  hint="Enter a descriptive name for your knowledge base"
                  class="q-mt-sm"
                />
                
                <q-input
                  v-if="selectedKbId === 'new'"
                  v-model="newKbDescriptionInput"
                  label="Description"
                  outlined
                  type="textarea"
                  rows="2"
                  hint="Optional description of the knowledge base contents"
                />
              </div>

              <!-- Uploaded Files Section -->
              <div v-if="hasUploadedDocuments" class="q-mb-md">
                <div class="text-subtitle2 q-mb-sm">
                  📎 Uploaded Files ({{ uploadedFiles?.length || 0 }} files):
                </div>
                <div class="q-pa-sm bg-blue-1 rounded-borders">
                  <div
                    v-for="file in uploadedFiles"
                    :key="file.id"
                    class="q-mb-xs"
                  >
                    <q-item dense>
                      <q-item-section>
                        <q-item-label>{{ file.name }}</q-item-label>
                        <q-item-label caption>{{
                          formatFileSize(file.content?.length || 0)
                        }} characters | {{ file.type }}</q-item-label>
                      </q-item-section>
                      <q-item-section side>
                        <q-checkbox v-model="selectedDocuments" :val="file.id" />
                      </q-item-section>
                    </q-item>
                  </div>
                </div>
              </div>

              <!-- Bucket Files Section -->
              <div v-if="userBucketFiles.length > 0" class="q-mb-md">
                <div class="text-subtitle2 q-mb-sm">
                  📁 Files in Bucket Folder ({{ userBucketFiles.length }} files):
                </div>
                <div class="q-pa-sm bg-green-1 rounded-borders">
                  <div
                    v-for="file in userBucketFiles"
                    :key="file.key"
                    class="q-mb-xs"
                  >
                    <q-item dense>
                      <q-item-section>
                        <q-item-label>{{ file.key.split('/').pop() }}</q-item-label>
                        <q-item-label caption>{{
                          formatFileSize(file.size || 0)
                        }} bytes | Last modified: {{ new Date(file.lastModified).toLocaleDateString() }}</q-item-label>
                      </q-item-section>
                      <q-item-section side>
                        <q-checkbox v-model="selectedBucketFiles" :val="file.key" />
                      </q-item-section>
                    </q-item>
                  </div>
                </div>
              </div>

              <div class="row q-gutter-sm q-mt-md">
                <q-btn
                  label="Create/Update Knowledge Base"
                  color="primary"
                  type="submit"
                  :loading="isCreatingKb"
                  :disable="selectedDocuments.length === 0 && selectedBucketFiles.length === 0"
                />
                <q-btn label="Cancel" flat v-close-popup />
              </div>
            </q-form>
          </div>
        </q-card-section>
      </q-card>
    </q-dialog>

    <!-- Step 5: Create Knowledge Base Dialog -->
    <q-dialog v-model="showCreateKbDialog" persistent>
      <q-card style="min-width: 600px">
        <q-card-section class="row items-center q-pb-none">
          <div class="text-h6">🚀 Create Knowledge Base</div>
          <q-space />
          <q-btn icon="close" flat round dense v-close-popup />
        </q-card-section>
        <q-card-section>
            <div class="text-subtitle2 q-mb-md">
            Create knowledge base from your existing bucket files:
            </div>

            <q-form
            @submit="handleCreateKbSubmit"
              class="q-gutter-md"
            >
              <q-input
                v-model="newKbName"
                label="Knowledge Base Name"
                outlined
                :rules="[(val) => !!val || 'Name is required']"
                hint="Enter a descriptive name for your knowledge base"
              readonly
              />

              <q-input
                v-model="newKbDescription"
                label="Description"
                outlined
                type="textarea"
                rows="3"
                hint="Optional description of the knowledge base contents"
              readonly
            />

            <!-- Existing Files in User's Bucket Folder -->
            <div class="q-mb-md">
              <div class="text-subtitle2 q-mb-sm text-positive">
                📁 Files in Your Bucket Folder ({{ userBucketFiles.length }} files):
              </div>
              <div class="q-pa-sm bg-positive-1 rounded-borders">
                <div
                  v-for="file in userBucketFiles"
                  :key="file.key"
                  class="q-mb-xs"
                >
                  <q-item dense>
                    <q-item-section>
                      <q-item-label>{{ file.key.split('/').pop() }}</q-item-label>
                      <q-item-label caption>{{
                        formatFileSize(file.size || 0)
                      }} bytes | Last modified: {{ new Date(file.lastModified).toLocaleDateString() }}</q-item-label>
                    </q-item-section>
                    <q-item-section side>
                      <q-icon name="check_circle" color="positive" size="sm" />
                    </q-item-section>
                  </q-item>
                </div>
              </div>
              <div class="text-caption text-positive q-mt-sm">
                ✅ These files are already stored in your DigitalOcean Spaces folder and ready for knowledge base creation.
                </div>
              </div>

              <div class="row q-gutter-sm q-mt-md">
                <q-btn
                label="Create Knowledge Base from Bucket Files"
                  color="primary"
                  type="submit"
                  :loading="isCreatingKb"
                />
                <q-btn label="Cancel" flat v-close-popup />
              </div>
            </q-form>
        </q-card-section>
      </q-card>
    </q-dialog>

    <!-- Delete Confirmation Dialog -->
    <q-dialog v-model="showDeleteConfirm">
      <q-card>
        <q-card-section>
          <div class="text-h6">Delete Agent</div>
          <div class="text-body2 q-mt-sm">
            Are you sure you want to delete "{{ assignedAgent?.name }}"? This
            action cannot be undone.
          </div>
        </q-card-section>
        <q-card-actions align="right">
          <q-btn flat label="Cancel" v-close-popup />
          <q-btn
            color="negative"
            label="Delete"
            @click="deleteAgent"
            :loading="isDeleting"
          />
        </q-card-actions>
      </q-card>
    </q-dialog>

    <!-- Add Document Dialog -->
    <q-dialog v-model="showAddDocumentDialog" persistent>
      <q-card style="min-width: 500px">
        <q-card-section class="row items-center q-pb-none">
          <div class="text-h6">📚 Add Documents to Knowledge Base</div>
          <q-space />
          <q-btn icon="close" flat round dense v-close-popup />
        </q-card-section>
        <q-card-section>
          <div class="text-center q-pa-md">
            <q-icon name="upload_file" size="48px" color="primary" />
            <div class="text-h6 q-mt-md">Add Documents</div>
            <div class="text-caption text-grey q-mt-sm">
              Upload files to add to your knowledge base:
              {{ knowledgeBase?.name }}
            </div>

            <div class="q-mt-md">
              <q-btn
                label="Upload Files"
                color="primary"
                icon="upload"
                @click="handleFileUpload"
              />
            </div>

            <div class="q-mt-md">
              <q-btn
                label="Create New Knowledge Base"
                color="secondary"
                icon="add"
                @click="handleCreateKnowledgeBase"
              />
            </div>
          </div>
        </q-card-section>
      </q-card>
    </q-dialog>

    <!-- Switch Knowledge Base Confirmation Dialog -->
    <q-dialog v-model="showSwitchKbDialog" persistent>
      <q-card style="min-width: 400px">
        <q-card-section class="row items-center q-pb-none">
          <div class="text-h6">Switch Knowledge Base</div>
          <q-space />
          <q-btn icon="close" flat round dense v-close-popup />
        </q-card-section>
        <q-card-section>
          <div class="text-body2">
            Are you sure you want to switch the current agent to use
            <strong>"{{ selectedKnowledgeBase?.name }}"</strong>?
          </div>
          <div class="text-caption text-grey q-mt-sm">
            This will disassociate the current knowledge base and associate the
            new one.
          </div>
        </q-card-section>
        <q-card-actions align="right">
          <q-btn flat label="Cancel" v-close-popup />
          <q-btn
            color="primary"
            label="Switch"
            @click="confirmSwitchKnowledgeBase"
            :loading="isUpdating"
          />
        </q-card-actions>
      </q-card>
    </q-dialog>

    <!-- Confirmation Dialog -->
    <q-dialog v-model="showConfirmDialog" persistent>
      <q-card>
        <q-card-section>
          <div class="text-h6">{{ confirmTitle }}</div>
          <div class="text-body2 q-mt-sm">{{ confirmMessage }}</div>
        </q-card-section>
        <q-card-actions align="right">
          <q-btn flat label="Cancel" v-close-popup />
          <q-btn
            color="negative"
            label="Confirm"
            @click="executeConfirmAction"
            :loading="isUpdating"
          />
        </q-card-actions>
      </q-card>
    </q-dialog>

    <!-- Sign In Dialog for Create Knowledge Base flow -->
    <PasskeyAuthDialog
      v-model="showPasskeyAuthDialog"
      @authenticated="handleUserAuthenticated"
      @cancelled="handleSignInCancelled"
    />

    <!-- Ownership Transfer Modal -->
    <KBOwnershipTransferModal
      v-if="showOwnershipTransferModal && ownershipTransferData.kbId"
      v-model="showOwnershipTransferModal"
      :kb-id="ownershipTransferData.kbId"
      :kb-name="ownershipTransferData.kbName"
      :current-owner="ownershipTransferData.currentOwner"
      :new-owner="ownershipTransferData.newOwner"
      @ownership-transferred="handleOwnershipTransferred"
    />

    <!-- Admin Approval Request Dialog -->
    <q-dialog v-model="showAdminApprovalDialog" persistent>
      <q-card style="min-width: 500px">
        <q-card-section class="row items-center q-pb-none">
          <div class="text-h6">🔒 Administrator Approval Required</div>
          <q-space />
          <q-btn icon="close" flat round dense @click="showAdminApprovalDialog = false" />
        </q-card-section>
        <q-card-section>
          <div class="text-body1 q-mb-md">
            As a signed-in user, you need administrator approval to access private AI agents and health record knowledge bases.
          </div>
          <div class="text-body2 q-mb-md">
            This ensures proper resource allocation and privacy protection for your personal health data.
          </div>
          
          <!-- Email Input Field -->
          <div class="q-mt-lg">
            <q-input
              v-model="userEmail"
              label="Email Address *"
              type="email"
              outlined
              dense
              :rules="[val => !!val || 'Email is required']"
              placeholder="Enter your email address"
              class="q-mb-md"
            />
            <div class="text-caption text-grey">
              The administrator will use this email to notify you when your private AI agent and knowledge base are ready.
            </div>
          </div>
        </q-card-section>
        <q-card-actions align="right">
          <q-btn flat label="Cancel" @click="showAdminApprovalDialog = false" />
          <q-btn
            color="primary"
            label="Request Private AI Support"
            @click="requestAdminApproval"
            :loading="isRequestingApproval"
            icon="send"
          />
        </q-card-actions>
      </q-card>
    </q-dialog>

    <!-- Step Help Email Dialog -->
    <q-dialog v-model="showStepHelpDialog" persistent>
      <q-card style="min-width: 500px; max-width: 700px">
        <q-card-section class="row items-center q-pb-none">
          <div class="text-h6">
            <q-icon name="email" color="primary" class="q-mr-sm" />
            Email Administrator - {{ currentStepHelp.title }}
          </div>
          <q-space />
          <q-btn icon="close" flat round dense @click="showStepHelpDialog = false" />
        </q-card-section>
        <q-card-section>
          <!-- Email Form -->
          <div class="q-mb-md">
            <q-input
              v-model="helpEmailData.from"
              label="From Email *"
              type="email"
              outlined
              dense
              :rules="[val => !!val || 'From email is required']"
              placeholder="Enter your email address"
            />
          </div>
          
          <div class="q-mb-md">
            <q-input
              v-model="helpEmailData.subject"
              label="Subject *"
              outlined
              dense
              :rules="[val => !!val || 'Subject is required']"
              placeholder="Enter email subject"
            />
          </div>
          
          <div class="q-mb-md">
            <q-input
              v-model="helpEmailData.body"
              label="Message Body *"
              type="textarea"
              outlined
              :rules="[val => !!val || 'Message body is required']"
              placeholder="Enter your message to the administrator"
              rows="6"
            />
          </div>
          
          <div class="text-caption text-grey-6">
            This email will be sent to the administrator regarding: {{ currentStepHelp.description }}
          </div>
        </q-card-section>
        <q-card-actions align="right">
          <q-btn flat label="Cancel" @click="showStepHelpDialog = false" />
          <q-btn 
            color="primary" 
            label="Send Email" 
            @click="sendHelpEmail"
            :loading="isSendingHelpEmail"
            icon="send"
          />
        </q-card-actions>
      </q-card>
    </q-dialog>

    <!-- Warning Modal for Multiple Knowledge Bases -->
    <q-dialog v-model="showWarningModal" persistent no-esc-dismiss no-backdrop-dismiss class="warning-modal-dialog">
      <q-card style="min-width: 400px; max-width: 600px; z-index: 9999;" class="warning-modal-card">
        <q-card-section class="row items-center q-pb-none">
          <div class="text-h6 text-warning">
            <q-icon name="warning" color="warning" class="q-mr-sm" />
            Multiple Knowledge Bases Warning
          </div>
        </q-card-section>

        <q-card-section>
          <div class="text-body1 q-mb-md">
            {{ warningMessage }}
          </div>
          <div class="text-caption text-grey-6">
            This warning appears when your agent has more than one knowledge base attached, which can cause data contamination and hallucinations in AI responses.
          </div>
        </q-card-section>

        <q-card-actions align="right">
          <q-btn 
            label="Cancel" 
            color="primary" 
            flat 
            @click="showWarningModal = false"
            :autofocus="true"
          />
          <q-btn 
            label="I understand" 
            color="grey" 
            @click="handleWarningConfirmed"
          />
        </q-card-actions>
      </q-card>
    </q-dialog>

    <!-- Cancel Indexing Confirmation Modal -->
    <q-dialog v-model="showCancelIndexingModal" persistent>
      <q-card style="min-width: 350px">
        <q-card-section class="q-pb-none">
          <div class="text-h6">Cancel Indexing?</div>
        </q-card-section>
        
        <q-card-section>
          <p>Are you sure you want to cancel the knowledge base indexing process?</p>
          <p class="text-caption text-grey">
            This will stop the current indexing and you'll need to restart it later.
          </p>
        </q-card-section>

        <q-card-actions align="right">
          <q-btn 
            flat 
            label="Cancel" 
            @click="showCancelIndexingModal = false"
          />
          <q-btn 
            label="Yes, Cancel Indexing" 
            color="warning" 
            @click="cancelIndexing"
            :loading="isCancellingIndexing"
          />
        </q-card-actions>
      </q-card>
    </q-dialog>

    <!-- Cancel Request Confirmation Modal -->
    <q-dialog v-model="showCancelRequestModal" persistent>
      <q-card style="min-width: 350px">
        <q-card-section class="q-pb-none">
          <div class="text-h6">Cancel Request?</div>
        </q-card-section>
        
        <q-card-section>
          <p>Are you sure you want to cancel your private AI agent request?</p>
          <p class="text-caption text-grey">
            This will undo your request and you'll need to request approval again if you want a private agent.
          </p>
        </q-card-section>

        <q-card-actions align="right">
          <q-btn 
            flat 
            label="Cancel" 
            @click="showCancelRequestModal = false"
          />
          <q-btn 
            label="Yes, Cancel Request" 
            color="warning" 
            @click="cancelRequest"
            :loading="isCancellingRequest"
          />
        </q-card-actions>
      </q-card>
    </q-dialog>
  </q-dialog>
  
  <!-- File Choice Confirmation Modal -->
  <q-dialog v-model="showFileChoiceModal" persistent>
    <q-card style="min-width: 400px">
      <q-card-section class="row items-center q-pb-none">
        <div class="text-h6">Confirm File Action</div>
        <q-space />
        <q-btn icon="close" flat round dense @click="showFileChoiceModal = false" />
      </q-card-section>

      <q-card-section>
        <div class="text-body1 q-mb-md">
          You are about to: <strong>{{ getActionDescription(selectedFileAction) }}</strong>
        </div>
        <div class="text-caption text-grey-6">
          This action will be executed in the background. You can monitor progress in the execution modal.
        </div>
      </q-card-section>

      <q-card-actions align="right">
        <q-btn
          label="Cancel"
          color="grey"
          @click="showFileChoiceModal = false"
        />
        <q-btn
          label="Confirm"
          color="primary"
          @click="executeFileAction"
        />
      </q-card-actions>
    </q-card>
  </q-dialog>

  <!-- Execution Progress Modal -->
  <q-dialog v-model="showExecutionModal" persistent>
    <q-card style="min-width: 500px">
      <q-card-section class="row items-center q-pb-none">
        <div class="text-h6">Executing Action</div>
        <q-space />
        <q-btn 
          icon="close" 
          flat 
          round 
          dense 
          @click="showExecutionModal = false"
          :disable="executionInProgress"
        />
      </q-card-section>

      <q-card-section>
        <div class="text-body1 q-mb-md">
          <strong>{{ getActionDescription(selectedFileAction) }}</strong>
        </div>
        
        <!-- Execution Stages -->
        <div class="execution-stages">
          <div 
            v-for="(stage, index) in executionStages" 
            :key="index"
            class="execution-stage q-mb-sm"
            :class="{ 
              'completed': index < currentExecutionStage,
              'current': index === currentExecutionStage,
              'pending': index > currentExecutionStage
            }"
          >
            <div class="row items-center">
              <q-icon 
                :name="index < currentExecutionStage ? 'check_circle' : 
                       index === currentExecutionStage ? 'radio_button_unchecked' : 'radio_button_unchecked'"
                :color="index < currentExecutionStage ? 'positive' : 
                        index === currentExecutionStage ? 'primary' : 'grey-4'"
                size="1.2rem"
                class="q-mr-sm"
              />
              <div class="text-body2">{{ stage.title }}</div>
              <q-space />
              <q-spinner-dots 
                v-if="index === currentExecutionStage && executionInProgress"
                size="1rem"
                color="primary"
              />
            </div>
            <div v-if="stage.description" class="text-caption text-grey-6 q-ml-lg">
              {{ stage.description }}
            </div>
          </div>
        </div>
      </q-card-section>

      <q-card-actions align="right">
        <q-btn
          label="Cancel"
          color="grey"
          @click="cancelExecution"
          :disable="!executionInProgress"
        />
        <q-btn
          label="OK"
          color="primary"
          @click="showExecutionModal = false"
          :disable="!executionComplete"
        />
      </q-card-actions>
    </q-card>
  </q-dialog>
</template>

<script lang="ts">
import { defineComponent, ref, computed, watch, nextTick, onMounted, onUnmounted } from "vue";
import type { PropType } from "vue";
import { useQuasar } from "quasar";
import { API_BASE_URL } from "../utils/apiBase";
import { UserService } from "../utils/UserService";
import {
  QDialog,
  QCard,
  QCardSection,
  QCardActions,
  QSpace,
  QBtn,
  QBtnDropdown,
  QIcon,
  QForm,
  QInput,
  QSelect,
  QList,
  QItem,
  QItemSection,
  QItemLabel,
  QCheckbox,
  QChip,
  QTooltip,
  QAvatar,
  QSpinnerDots,
} from "quasar";
import AgentCreationWizard from "./AgentCreationWizard.vue";
import PasskeyAuthDialog from "./PasskeyAuthDialog.vue";
import KBOwnershipTransferModal from "./KBOwnershipTransferModal.vue";
import AgentStatusIndicator from "./AgentStatusIndicator.vue";
import type { UploadedFile } from "../types";

export interface DigitalOceanAgent {
  id: string;
  name: string;
  description: string;
  model: string;
  status: string;
  instructions: string;
  knowledgeBase?: DigitalOceanKnowledgeBase;
  knowledgeBases?: DigitalOceanKnowledgeBase[]; // Added for multiple KBs
}

export interface DigitalOceanKnowledgeBase {
  uuid: string;
  id: string;
  name: string;
  description: string;
  created_at: string;
  updated_at: string;
  region: string;
  isProtected: boolean;
  owner?: string;
}

export default defineComponent({
  name: "AgentManagementDialog",
  components: {
    QDialog,
    QCard,
    QCardSection,
    QCardActions,
    QSpace,
    QBtn,
    QBtnDropdown,
    QIcon,
    QForm,
    QInput,
    QSelect,
    QList,
    QItem,
    QItemSection,
    QItemLabel,
    AgentCreationWizard,
    PasskeyAuthDialog,
    KBOwnershipTransferModal,
    AgentStatusIndicator,
    QCheckbox,
    QChip,
    QTooltip,
    QAvatar,
    QSpinnerDots,
  },
  props: {
    modelValue: {
      type: Boolean,
      default: false,
    },
    uploadedFiles: {
      type: Array as PropType<UploadedFile[]>,
      default: () => [],
    },
    currentUser: {
      type: Object,
      default: null,
    },
    warning: {
      type: String,
      default: "",
    },
    AIoptions: {
      type: Array,
      default: () => [],
    },
    currentAgent: {
      type: Object,
      default: null,
    },
    currentKnowledgeBase: {
      type: Object,
      default: null,
    },
    assignedAgent: {
      type: Object,
      default: null,
    },
  },
  emits: [
    "update:modelValue",
    "agent-created",
    "agent-selected",
    "agent-updated",
    "refresh-agent-data",
    "user-authenticated",
  ],
  setup(props, { emit }) {
    const $q = useQuasar();

    const showDialog = computed({
      get: () => props.modelValue,
      set: (value) => emit("update:modelValue", value),
    });



    // Agent state
    const currentAgent = ref<DigitalOceanAgent | null>(null);
    const assignedAgent = ref<DigitalOceanAgent | null>(null);
    // Agent selection removed - agents are assigned only by admin process
    const knowledgeBase = ref<DigitalOceanKnowledgeBase | null>(null);
    const availableKnowledgeBases = ref<DigitalOceanKnowledgeBase[]>([]);
    const documents = ref<any[]>([]);
    const isLoading = ref(false); // Start with loading false
    const isDialogLoading = ref(false); // New loading state for dialog opening
    const isCreating = ref(false);
    const isUpdating = ref(false);
    const isDeleting = ref(false);
    const showDocumentManager = ref(false);
    const showDeleteConfirm = ref(false);
    const showWizard = ref(false);
    const showAddDocumentDialog = ref(false);
    const showChooseFilesDialog = ref(false);
    const showCreateKbDialog = ref(false);
    const showSwitchKbDialog = ref(false);
    const showKbLinkSuggestionDialog = ref(false);
    const selectedKnowledgeBase = ref<DigitalOceanKnowledgeBase | null>(null);
    const newKbName = ref("");
    const newKbDescription = ref("");
    const isCreatingKb = ref(false);
    const selectedDocuments = ref<string[]>([]);
    
    // Enhanced file selection modal state
    const selectedBucketFiles = ref<string[]>([]);
    const selectedKbId = ref<string>('');
    const newKbNameInput = ref<string>('');
    const newKbDescriptionInput = ref<string>('');
    
    // Files to be cleaned up after successful indexing
    const filesToCleanup = ref<string[]>([]);

    // Sign In Dialog state
    const showPasskeyAuthDialog = ref(false);
    const localCurrentUser = ref<any>(null);
    const isAuthenticated = ref(false);
    const isUpdatingWorkflow = ref(false);
    const hasLoggedAgentAssignment = ref(false);
    const hasLoggedNoAgents = ref(false);
    const hasLoggedNoKBs = ref(false);
    const hasLoggedStep5 = ref(false);

    // Dialog state for confirmations
    const showConfirmDialog = ref(false);
    const confirmAction = ref<(() => Promise<void>) | null>(null);
    const confirmMessage = ref("");
    const confirmTitle = ref("");

    // Ownership transfer state
    const showOwnershipTransferModal = ref(false);
    const ownershipTransferData = ref({
      kbId: '',
      kbName: '',
      currentOwner: '',
      newOwner: ''
    });

    // Warning modal state
    const showWarningModal = ref(false);
    const warningMessage = computed(() => props.warning || '');

    // Watch for warning changes and show modal immediately
    watch(() => props.warning, (newWarning) => {
      if (newWarning && newWarning.trim() !== '') {
        showWarningModal.value = true;
      }
    }, { immediate: true });

    // Admin approval request state
    const showAdminApprovalDialog = ref(false);
    const isRequestingApproval = ref(false);
    const userEmail = ref('');

    // Step help dialog state
    const showStepHelpDialog = ref(false);
    const currentStepHelp = ref({
      title: '',
      description: '',
      details: ''
    });
    
    // Help email data
    const helpEmailData = ref({
      from: '',
      subject: '',
      body: ''
    });
    
    const isSendingHelpEmail = ref(false);
    
    // Track if approval has been requested
    const hasRequestedApproval = ref(false);
    
    // Workflow stage messages for user information block
    const workflowStateMessages = {
      'no_passkey': 'No Passkey - Please register a passkey to access private features',
      'no_request_yet': 'No Request Yet - You can request support for a private AI agent',
      'awaiting_approval': 'Awaiting Approval - Your request for a private agent has been sent to the administrator',
      'approved': 'Approved - You have been approved for private AI access',
      'agent_assigned': 'Agent Assigned - You have access to your private AI agent',
      'inconsistent': 'Inconsistent State - Please contact administrator for assistance'
    };
    
    // Update hasRequestedApproval based on user workflow stage
    watch(() => localCurrentUser.value?.workflowStage, (newWorkflowStage) => {
      hasRequestedApproval.value = newWorkflowStage === 'awaiting_approval';
    }, { immediate: true });
    
    // Get current workflow stage and message
    const currentWorkflowState = computed(() => {
      if (!localCurrentUser.value) return null;
      
      // Use workflowStage from database if available (this is the field used by Admin Panel)
      if (localCurrentUser.value.workflowStage) {
        return localCurrentUser.value.workflowStage;
      }
      
      // Fallback logic for users without workflowStage field
      if (!localCurrentUser.value.credentialID) {
        return 'no_passkey';
      }
      
      // Check if user has requested support (has email)
      if (localCurrentUser.value.email) {
        return 'awaiting_approval';
      }
      
      return 'no_request_yet';
    });
    
    const currentWorkflowMessage = computed(() => {
      const state = currentWorkflowState.value;
      return state ? workflowStateMessages[state] || `Unknown State: ${state}` : null;
    });
    
    // Helper functions for workflow stage styling
    const getWorkflowStateStyle = (state) => {
      const styles = {
        'no_passkey': 'background-color: #ffebee; border-radius: 8px; border-left: 4px solid #f44336;',
        'no_request_yet': 'background-color: #e3f2fd; border-radius: 8px; border-left: 4px solid #2196f3;',
        'awaiting_approval': 'background-color: #fff3cd; border-radius: 8px; border-left: 4px solid #ffc107;',
        'approved': 'background-color: #e8f5e8; border-radius: 8px; border-left: 4px solid #4caf50;',
        'agent_assigned': 'background-color: #e3f2fd; border-radius: 8px; border-left: 4px solid #2196f3;',
        'inconsistent': 'background-color: #fce4ec; border-radius: 8px; border-left: 4px solid #e91e63;'
      };
      return styles[state] || 'background-color: #f5f5f5; border-radius: 8px; border-left: 4px solid #9e9e9e;';
    };
    
    const getWorkflowStateIcon = (state) => {
      const icons = {
        'no_passkey': 'vpn_key_off',
        'no_request_yet': 'help_outline',
        'awaiting_approval': 'hourglass_empty',
        'approved': 'check_circle',
        'agent_assigned': 'smart_toy',
        'inconsistent': 'warning'
      };
      return icons[state] || 'info';
    };
    
    const getWorkflowStateColor = (state) => {
      const colors = {
        'no_passkey': 'negative',
        'no_request_yet': 'primary',
        'awaiting_approval': 'warning',
        'approved': 'positive',
        'agent_assigned': 'primary',
        'inconsistent': 'negative'
      };
      return colors[state] || 'grey';
    };

    // Cancel indexing modal state
    const showCancelIndexingModal = ref(false);
    const isCancellingIndexing = ref(false);

    // Cancel request modal state
    const showCancelRequestModal = ref(false);
    const isCancellingRequest = ref(false);
    
    // File management state for authenticated users
    const userHasFiles = ref(false);
    const showFileChoiceModal = ref(false);
    const showExecutionModal = ref(false);
    const executionStages = ref([]);
    const currentExecutionStage = ref(0);
    const executionInProgress = ref(false);
    const executionComplete = ref(false);
    const selectedFileAction = ref('');
    
    // Debounce timer for loadAgentInfo calls
    const loadAgentInfoDebounceTimer = ref(null);

    // Workflow progress state
    const workflowSteps = ref([
      {
        title: "User authenticated with passkey",
        helpTitle: "Passkey Authentication",
        helpDescription: "You have successfully signed in using a secure passkey (WebAuthn).",
        helpDetails: "This provides strong, phishing-resistant authentication without passwords.",
        completed: false,
        current: false
      },
      {
        title: "Private AI agent requested",
        helpTitle: "Administrator Approval Request",
        helpDescription: "You have requested access to private AI agents and health record knowledge bases.",
        helpDetails: "The administrator will review your request and approve access to dedicated resources.",
        completed: false,
        current: false
      },
      {
        title: "Private AI agent created",
        helpTitle: "AI Agent Creation",
        helpDescription: "Administrator has approved your request and created a dedicated AI agent.",
        helpDetails: "This agent will be exclusively available to you for processing your health data.",
        completed: false,
        current: false
      },
      {
        title: "CHOOSE FILES FOR KNOWLEDGE BASE",
        helpTitle: "File Selection for Knowledge Base",
        helpDescription: "Select the files you want to include in your knowledge base. Only AI-readable versions (.md files) will be used.",
        helpDetails: "PDFs and RTF files are converted to markdown format for AI processing. Files are stored in your personal folder in DigitalOcean Spaces.",
        completed: false,
        current: false
      },
      {
        title: "CREATE KNOWLEDGE BASE",
        helpTitle: "Knowledge Base Creation",
        helpDescription: "Create your knowledge base with the selected files.",
        helpDetails: "Files will be uploaded to DigitalOcean Spaces and indexed for AI processing.",
        completed: false,
        current: false
      },
      {
        title: "Knowledge base being indexed. This can take many minutes.",
        helpTitle: "Indexing in Progress",
        helpDescription: "Your knowledge base is being indexed for AI processing. This can take several minutes.",
        helpDetails: "The system will automatically check indexing status and update token count every 30 seconds.",
        completed: false,
        current: false
      }
    ]);

    // Get current workflow step for Agent Badge display
    const currentWorkflowStep = computed(() => {
      const currentStep = workflowSteps.value.find(step => step.current);
      return currentStep ? currentStep.title : '';
    });

    // Check if current user is a deep link user
    const isDeepLinkUser = computed(() => {
      return localCurrentUser.value?.userId?.startsWith('deep_link_') || false;
    });

    // Check if user is already authenticated from passkey system
    const checkAuthenticationStatus = async () => {
      try {
        // For deep link users, skip the auth-status API call and use props directly
        if (props.currentUser && props.currentUser.userId?.startsWith('deep_link_')) {
          localCurrentUser.value = props.currentUser;
          isAuthenticated.value = true;
          console.log(`🔗 [AgentManagementDialog] Deep link user authenticated via props: ${props.currentUser.userId}`);
          return;
        }
        
        const response = await fetch(`${API_BASE_URL}/passkey/auth-status`);
        if (response.ok) {
          const authData = await response.json();
          if (authData.authenticated && authData.user) {
            localCurrentUser.value = authData.user;
            isAuthenticated.value = true;
            // User authenticated
          } else if (authData.redirectTo) {
            // Deep link user detected on main app - redirect them to their deep link page
            console.log(`🔗 [AgentManagementDialog] Deep link user detected on main app, redirecting to: ${authData.redirectTo}`);
            window.location.href = authData.redirectTo;
            return;
          } else {
            // Check if we have a currentUser prop and it's not "Public User"
            if (props.currentUser && props.currentUser.userId !== 'Public User') {
              localCurrentUser.value = props.currentUser;
              isAuthenticated.value = true;
            } else {
              isAuthenticated.value = false;
              localCurrentUser.value = null;
            }
          }
        } else {
          // Check if we have a currentUser prop and it's not "Unknown User"
          if (props.currentUser && props.currentUser.userId !== 'Unknown User') {
            localCurrentUser.value = props.currentUser;
            isAuthenticated.value = true;
          } else {
            isAuthenticated.value = false;
            localCurrentUser.value = null;
          }
        }
      } catch (error) {
        // Fallback to props
        if (props.currentUser && props.currentUser.userId !== 'Unknown User') {
          localCurrentUser.value = props.currentUser;
          isAuthenticated.value = true;
        } else {
          isAuthenticated.value = false;
          localCurrentUser.value = null;
        }
      }
    };

    // Show step help dialog
    const showStepHelp = (stepIndex: number) => {
      const step = workflowSteps.value[stepIndex];
      currentStepHelp.value = {
        title: step.helpTitle,
        description: step.helpDescription,
        details: step.helpDetails
      };
      
      // Pre-populate email fields
      helpEmailData.value = {
        from: userEmail.value || '',
        subject: `Help Request: ${step.helpTitle}`,
        body: ''
      };
      
      showStepHelpDialog.value = true;
    };

    // Send help email to administrator
    const sendHelpEmail = async () => {
      // Validate required fields
      if (!helpEmailData.value.from || !helpEmailData.value.subject || !helpEmailData.value.body) {
        $q.notify({
          type: "negative",
          message: "Please fill in all required fields",
        });
        return;
      }

      isSendingHelpEmail.value = true;
      try {
        // Send email notification to admin using Resend
        const response = await fetch('/api/admin/request-approval', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            username: localCurrentUser.value?.userId || 'Public User',
            email: helpEmailData.value.from,
            requestType: 'help_request',
            message: `Help Request from ${localCurrentUser.value?.userId || 'Public User'}:\n\nSubject: ${helpEmailData.value.subject}\n\nMessage:\n${helpEmailData.value.body}`
          }),
        });

        if (response.ok) {
          $q.notify({
            type: "positive",
            message: "Help email sent successfully to administrator",
          });
          showStepHelpDialog.value = false;
          
          // Reset email data
          helpEmailData.value = {
            from: '',
            subject: '',
            body: ''
          };
        } else {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
      } catch (error) {
        console.error('Error sending help email:', error);
        $q.notify({
          type: "negative",
          message: `Failed to send help email: ${error.message}`,
        });
      } finally {
        isSendingHelpEmail.value = false;
      }
    };

    // Update workflow progress based on current state
    const updateWorkflowProgress = async () => {
      // Prevent duplicate calls
      if (isUpdatingWorkflow.value) return;
      isUpdatingWorkflow.value = true;
      
      try {
      // Reset all steps
      workflowSteps.value.forEach(step => {
        step.completed = false;
        step.current = false;
        // Reset logged flags when workflow is updated
      });

      // Step 1: User authenticated with passkey
      if (isAuthenticated.value) {
        workflowSteps.value[0].completed = true;
        workflowSteps.value[1].current = true; // Next step is current
      }

      // Step 2: Private AI agent requested
      // This will be updated when the user actually requests approval
      // For now, we'll check if they have any agents (which means they were approved)
      if (assignedAgent.value) {
        workflowSteps.value[1].completed = true;
        workflowSteps.value[2].completed = true;
        
        // Step 4: CHOOSE FILES FOR KNOWLEDGE BASE
        // Check if user has files in their bucket folder
        try {
          const response = await fetch('/api/bucket-files');
          const data = await response.json();
          
          // Filter files for current user
          const userFiles = data.files.filter((file: any) => 
            file.key && file.key.startsWith(`${localCurrentUser.value?.userId}/`)
          );
          
          if (userFiles.length > 0) {
            // User has files - complete step 4 and advance to step 5
            workflowSteps.value[3].completed = true;
            workflowSteps.value[3].current = false;
            workflowSteps.value[4].current = true;
            // Only log once per session to prevent duplicates
            if (!hasLoggedStep5.value) {
              console.log(`🎯 STEP 5 ACTIVATED: User has ${userFiles.length} files in bucket, ready to create knowledge base`);
              hasLoggedStep5.value = true;
            }
          } else {
            // No files yet - step 4 is current
            workflowSteps.value[3].current = true;
            workflowSteps.value[4].current = false;
          }
        } catch (error) {
          console.error('Error checking bucket files:', error);
          // Fallback: step 4 is current
          workflowSteps.value[3].current = true;
          workflowSteps.value[4].current = false;
        }
      }

      // Step 3: Private AI agent created
      // This is handled above when assignedAgent exists

      // Step 6: Knowledge base indexing status
      // Check if KB exists and start monitoring indexing
      if (knowledgeBase.value) {
        workflowSteps.value[4].completed = true;
        workflowSteps.value[4].current = false;
        workflowSteps.value[5].current = true;
        
        // Start monitoring indexing status
        startIndexingMonitor(knowledgeBase.value);
      }
      } finally {
        isUpdatingWorkflow.value = false;
      }
    };

    // Update workflow progress when agent is assigned
    const updateWorkflowProgressForAgent = async () => {
      // Step 1: User authenticated with passkey (already completed)
      workflowSteps.value[0].completed = true;
      
      // Step 2: Private AI agent requested (mark as completed)
      workflowSteps.value[1].completed = true;
      
      // Step 3: Private AI agent created (mark as completed)
      workflowSteps.value[2].completed = true;
      workflowSteps.value[2].current = false;
      
      // Step 4: CHOOSE FILES FOR KNOWLEDGE BASE
      // Check if user already has files in bucket
      try {
        const response = await fetch('/api/bucket-files');
        const data = await response.json();
        
        // Filter files for current user
        const userFiles = data.files.filter((file: any) => 
          file.key && file.key.startsWith(`${localCurrentUser.value?.userId}/`)
        );
        
        if (userFiles.length > 0) {
          // User already has files - complete step 4 and advance to step 5
          workflowSteps.value[3].completed = true;
          workflowSteps.value[3].current = false;
          workflowSteps.value[4].current = true;
          // Only log once per session to prevent duplicates
          if (!hasLoggedStep5.value) {
            console.log(`🎯 STEP 5 ACTIVATED: User already has ${userFiles.length} files in bucket, ready to create knowledge base`);
            hasLoggedStep5.value = true;
          }
        } else {
          // No files yet - step 4 is current
          workflowSteps.value[3].current = true;
          workflowSteps.value[4].current = false;
          console.log("✅ Workflow progress updated: Agent created, ready for file selection");
        }
      } catch (error) {
        console.error('Error checking bucket files:', error);
        // Fallback: step 4 is current
        workflowSteps.value[3].current = true;
        workflowSteps.value[4].current = false;
        console.log("✅ Workflow progress updated: Agent created, ready for file selection");
      }
    };

    // Check for existing files in user's bucket folder (with robust caching)
    const checkUserBucketFiles = async (forceRefresh = false) => {
      console.log('[KB DEBUG] checkUserBucketFiles called, forceRefresh:', forceRefresh);
      
      if (!localCurrentUser.value?.userId) {
        console.log('[KB DEBUG] No userId available:', localCurrentUser.value);
        return [];
      }
      
      // Use cached value if available and not forcing refresh
      if (!forceRefresh && userBucketFiles.value.length > 0) {
        console.log('[KB DEBUG] Using cached value, count:', userBucketFiles.value.length);
        return userBucketFiles.value;
      }
      
      try {
        const username = localCurrentUser.value.userId
        console.log('[KB DEBUG] Fetching files for user:', username);
        
        // Use the same endpoint as UserDetailsPage
        const response = await fetch(`/api/bucket/user-status/${username}`)
        console.log('[KB DEBUG] API response status:', response.status, response.ok);
        
        if (response.ok) {
          const result = await response.json()
          console.log('[KB DEBUG] API response data:', result);
          if (result.success && result.files) {
            console.log('[KB DEBUG] Found user files:', result.files.length, result.files);
            // Update the cached value
            userBucketFiles.value = result.files;
            console.log('[KB DEBUG] Updated userBucketFiles.value:', userBucketFiles.value);
            return result.files
          } else {
            console.log('[KB DEBUG] No files found or result.success is false:', result);
          }
        } else {
          console.log('[KB DEBUG] API response not ok:', response.status, response.statusText);
        }
      } catch (error) {
        console.error('[KB DEBUG] Error checking user bucket files:', error)
      }
      console.log('[KB DEBUG] Returning empty array');
      return []
    };

    // Note: loadAgentInfo function removed - replaced with clean approach
    // const loadAgentInfo = async () => {
      
      // // Clear any existing debounce timer
      // if (loadAgentInfoDebounceTimer.value) {
      //   clearTimeout(loadAgentInfoDebounceTimer.value);
      // }
      
      // // Set a new debounce timer
      // loadAgentInfoDebounceTimer.value = setTimeout(async () => {
      //   await performLoadAgentInfo();
      // }, 300); // 300ms debounce
    // };
    
    // Note: performLoadAgentInfo function removed - replaced with clean approach
      
      // // Prevent multiple simultaneous calls
      // if (isLoading.value) {
      //   console.log("Skipping duplicate loadAgentInfo request");
      //   return;
      // }
      
      // // Add delay to avoid 429 errors during app initialization
      // await new Promise(resolve => setTimeout(resolve, 500));
      
      // isLoading.value = true;
      
      // OLD FUNCTION REMOVED - was making 6 redundant API calls
      // Replaced with clean approach using props and 2 DO API calls only
      // All old function code removed
    // All old function code removed - was causing build errors

    // Handle agent selection - REMOVED: Users can no longer select their own agents
    // Agents are now assigned only by admin process to prevent security violations
    const onAgentSelected = async (agentId: string) => {
      $q.notify({
        type: "negative",
        message: "Agent selection is disabled. Agents are assigned by administrator only.",
        timeout: 5000,
      });
    };


    // Create new agent
    const createAgent = async () => {
      isCreating.value = true;
      try {
        const response = await fetch(`${API_BASE_URL}/setup-maia`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            patientId: "demo_patient_001",
          }),
        });

        if (!response.ok) {
          throw new Error("Failed to create agent");
        }

        const result = await response.json();

        currentAgent.value = result.agent;
        assignedAgent.value = result.agent;
        knowledgeBase.value = result.knowledgeBase;

        $q.notify({
          type: "positive",
          message: "Agent created successfully!",
        });

        emit("agent-updated", result);
        showDialog.value = false;
      } catch (error: any) {
        $q.notify({
          type: "negative",
          message: `Failed to create agent: ${error.message}`,
        });
      } finally {
        isCreating.value = false;
      }
    };

    // Update agent
    const updateAgent = async () => {
      // TODO: Implement agent update functionality
      $q.notify({
        type: "info",
        message: "Agent update functionality coming soon",
      });
    };

    // Delete agent
    const confirmDelete = () => {
      showDeleteConfirm.value = true;
    };

    const deleteAgent = async () => {
      if (!assignedAgent.value) return;

      isDeleting.value = true;
      try {
        const response = await fetch(`/api/agents/${assignedAgent.value.id}`, {
          method: "DELETE",
        });

        if (!response.ok) {
          throw new Error("Failed to delete agent");
        }

        currentAgent.value = null;
        assignedAgent.value = null;
        knowledgeBase.value = null;

        $q.notify({
          type: "positive",
          message: "Agent deleted successfully!",
        });

        emit("agent-updated", null);
        showDeleteConfirm.value = false;
      } catch (error: any) {
        $q.notify({
          type: "negative",
          message: `Failed to delete agent: ${error.message}`,
        });
      } finally {
        isDeleting.value = false;
      }
    };

    // Handle user authenticated from PasskeyAuthDialog
    const handleUserAuthenticated = (userData: {
      userId: string;
      username: string;
      displayName: string;
    }) => {
      const userInfo = UserService.normalizeUserObject(userData);
      localCurrentUser.value = userInfo;
      isAuthenticated.value = true;
      showPasskeyAuthDialog.value = false;

      // Emit the current user to parent component
      emit("user-authenticated", userInfo);

      

      // Continue to knowledge base creation dialog instead of closing
      showCreateKbDialog.value = true;

      $q.notify({
        type: "positive",
        message: `Welcome, ${userInfo.displayName}! Proceeding to knowledge base creation.`,
      });
    };

    // Handle sign-in cancellation
    const handleSignInCancelled = () => {
      showPasskeyAuthDialog.value = false;
      
    };

    // Handle ownership transfer completion
    const handleOwnershipTransferred = async (transferData: {
      kbId: string;
      newOwner: string;
      displayName: string;
    }) => {
      console.log("✅ Ownership transfer completed:", transferData);
      
      // Close the modal
      showOwnershipTransferModal.value = false;
      
      // Refresh the knowledge base list to show updated ownership
      await refreshKnowledgeBases();
      
      // Try to connect the KB again now that ownership is transferred
      try {
        if (assignedAgent.value) {
          const response = await fetch(
            `${API_BASE_URL}/agents/${assignedAgent.value.id}/knowledge-bases/${transferData.kbId}`,
            { method: "POST" }
          );
          
          if (response.ok) {
            $q.notify({
              type: "positive",
              message: `Knowledge base "${transferData.displayName}" connected successfully after ownership transfer!`,
              timeout: 8000,
            });
            
            // Refresh agent info to show the new KB connection
            await loadAgentInfo();
            // Don't emit refresh-agent-data to prevent overriding the current agent
            // emit("refresh-agent-data");
          } else {
            throw new Error(`Failed to connect KB after transfer: ${response.statusText}`);
          }
        }
      } catch (error) {
        console.error("❌ Failed to connect KB after ownership transfer:", error);
        $q.notify({
          type: "negative",
          message: `Ownership transferred but failed to connect KB: ${error.message}`,
          timeout: 8000,
        });
      }
    };

    // Set loading state before dialog shows
    const onDialogBeforeShow = () => {
      isDialogLoading.value = true;
    };

    // Agent loading removed - agents are assigned only by admin process

    // Load available knowledge bases from DO API
    const loadAvailableKnowledgeBases = async () => {
      try {
        let kbResponse;
        if (isAuthenticated.value && localCurrentUser.value?.userId) {
          kbResponse = await fetch(`${API_BASE_URL}/knowledge-bases?user=${localCurrentUser.value.userId}`);
        } else {
          kbResponse = await fetch(`${API_BASE_URL}/knowledge-bases`);
        }
        
        if (kbResponse.ok) {
          const allKnowledgeBases = await kbResponse.json();
          availableKnowledgeBases.value = allKnowledgeBases;
          console.log(`📚 Loaded ${allKnowledgeBases.length} available knowledge bases`);
        }
      } catch (error) {
        console.error('❌ Error loading available knowledge bases:', error);
        availableKnowledgeBases.value = [];
      }
    };

    // Load current user state from props/session and fetch workflow stage from database
    const loadCurrentUserState = async () => {
      // Store previous user ID to detect user changes
      const previousUserId = localCurrentUser.value?.userId;
      
      // Normalize the user object to ensure consistent structure
      const normalizedUser = UserService.normalizeUserObject(props.currentUser);
      localCurrentUser.value = normalizedUser;
      isAuthenticated.value = UserService.isAuthenticated(normalizedUser);
      
      // Clear cached data if user has changed
      const currentUserId = normalizedUser?.userId;
      if (previousUserId !== currentUserId) {
        console.log(`🔄 [AgentManagementDialog] User changed from ${previousUserId} to ${currentUserId}, clearing cached data`);
        // Agent loading removed
        availableKnowledgeBases.value = [];
      }
      
      // Fetch user's workflow stage from database (same source as Admin Panel)
      if (isAuthenticated.value && currentUserId && currentUserId !== 'Public User') {
        try {
          const response = await fetch(`${API_BASE_URL}/admin-management/users/${encodeURIComponent(currentUserId)}`);
          if (response.ok) {
            const userData = await response.json();
            // Update the local user with the workflow stage from database
            if (userData.workflowStage) {
              localCurrentUser.value.workflowStage = userData.workflowStage;
              console.log(`🔍 [AgentManagementDialog] Fetched workflow stage from database: ${userData.workflowStage} for user ${currentUserId}`);
            }
          } else {
            console.warn(`⚠️ [AgentManagementDialog] Could not fetch user data for ${currentUserId}`);
          }
        } catch (error) {
          console.error(`❌ [AgentManagementDialog] Error fetching user workflow stage:`, error);
        }
      }
      
      // Set current agent from props (if available)
      if (props.currentAgent) {
        currentAgent.value = props.currentAgent;
      } else {
        currentAgent.value = null;
      }
      
      // Set assigned agent from props (if available)
      if (props.assignedAgent) {
        assignedAgent.value = props.assignedAgent;
      } else {
        assignedAgent.value = null;
      }
      
      // Set current knowledge base from props (if available)
      if (props.currentKnowledgeBase) {
        knowledgeBase.value = props.currentKnowledgeBase;
      } else {
        knowledgeBase.value = null;
      }
    };

    // Clean dialog opening function - only loads what's needed
    const onDialogOpen = async () => {
      console.log('[KB DEBUG] onDialogOpen called');
      console.log('[KB DEBUG] props.uploadedFiles:', props.uploadedFiles);
      console.log('[KB DEBUG] props.uploadedFiles length:', props.uploadedFiles?.length || 'null');
      try {
        // Load current user state first (includes fetching workflow stage from database)
        await loadCurrentUserState();
        console.log('[KB DEBUG] loadCurrentUserState completed');
        
        // Load available data from DO API in parallel
        await Promise.all([
          loadAvailableKnowledgeBases()
        ]);
        console.log('[KB DEBUG] loadAvailableKnowledgeBases completed');
        
        // Load user bucket files
        console.log('[KB DEBUG] Loading bucket files...');
        await checkUserBucketFiles(true);
        console.log('[KB DEBUG] checkUserBucketFiles completed');
        
        console.log(`✅ Dialog data loaded successfully`);
      } catch (error) {
        console.error('❌ Error loading dialog data:', error);
      } finally {
        isDialogLoading.value = false;
      }
    };

    // Watch for user changes to log them (but don't make API calls)
    watch(() => props.currentUser, (newUser) => {
      if (newUser && localCurrentUser.value?.userId !== newUser.userId) {
        console.log(`[*] Current user: ${newUser.userId}`);
        localCurrentUser.value = newUser;
      }
    }, { immediate: true });

    // Watch for agent changes to update dialog state
    watch(() => props.currentAgent, (newAgent) => {
      if (newAgent && currentAgent.value?.id !== newAgent.id) {
        console.log(`🤖 Agent updated in dialog: ${newAgent.name}`);
        currentAgent.value = newAgent;
        assignedAgent.value = newAgent;
      }
    });
    
    // Watch for assigned agent changes to update dialog state
    watch(() => props.assignedAgent, (newAgent) => {
      if (newAgent && assignedAgent.value?.id !== newAgent.id) {
        console.log(`🤖 Assigned agent updated in dialog: ${newAgent.name}`);
        assignedAgent.value = newAgent;
        currentAgent.value = newAgent;
      }
    });

    // Watch for knowledge base changes to update dialog state
    watch(() => props.currentKnowledgeBase, (newKB) => {
      if (newKB && knowledgeBase.value?.id !== newKB.id) {
        console.log(`📚 KB updated in dialog: ${newKB.name}`);
        knowledgeBase.value = newKB;
      } else if (!newKB && knowledgeBase.value) {
        console.log(`📚 KB removed from dialog`);
        knowledgeBase.value = null;
      }
    });

    // Watch for uploaded files changes
    watch(() => props.uploadedFiles, (newFiles) => {
      console.log('[KB DEBUG] props.uploadedFiles changed:', newFiles);
      console.log('[KB DEBUG] props.uploadedFiles length:', newFiles?.length || 'null');
    }, { immediate: true, deep: true });

    const handleAgentCreated = (agent: DigitalOceanAgent) => {
      currentAgent.value = agent;
      assignedAgent.value = agent;
      knowledgeBase.value = null; // No direct knowledge base creation here, it's part of the wizard
      showWizard.value = false;
      $q.notify({
        type: "positive",
        message: "Agent created successfully!",
      });
      emit("agent-updated", { agent: agent, knowledgeBase: null });
    };

    // Note: Dialog opening is handled by onDialogOpen function
    // No need for additional watcher as this causes duplicate API calls

    // Handle knowledge base selection
    const handleKnowledgeBaseClick = async (kb: DigitalOceanKnowledgeBase) => {
      if (!assignedAgent.value) return;

      // If clicking on the current KB, show add document dialog
      if (kb === knowledgeBase.value) {
        showAddDocumentDialog.value = true;
        return;
      }

      // If clicking on a different KB, show confirmation dialog
      selectedKnowledgeBase.value = kb;
      showSwitchKbDialog.value = true;
    };

    // Handle KB switch confirmation
    const confirmSwitchKnowledgeBase = async () => {
      if (!selectedKnowledgeBase.value || !assignedAgent.value) return;

      try {
        console.log(
          `🔄 Starting KB switch from ${knowledgeBase.value?.name} to ${selectedKnowledgeBase.value.name}`
        );

        // First, detach current KB from agent
        if (knowledgeBase.value && assignedAgent.value) {
          const deleteResponse = await fetch(
            `/api/agents/${assignedAgent.value.id}/knowledge-bases/${knowledgeBase.value.uuid}`,
            {
              method: "DELETE",
            }
          );
          if (!deleteResponse.ok) {
            throw new Error(
              `Failed to detach current KB: ${deleteResponse.statusText}`
            );
          }
          console.log(`✅ Detached current KB: ${knowledgeBase.value.name}`);
        }

        // Then associate new KB with agent
        if (assignedAgent.value) {
          const postResponse = await fetch(
            `/api/agents/${assignedAgent.value.id}/knowledge-bases/${selectedKnowledgeBase.value.uuid}`,
            {
              method: "POST",
            }
          );
          if (!postResponse.ok) {
            throw new Error(
              `Failed to associate new KB: ${postResponse.statusText}`
            );
          }
          console.log(
            `✅ Associated new KB: ${selectedKnowledgeBase.value.name}`
          );
        }

        // CRITICAL: Verify the switch actually worked by fetching the current agent state

        const verifyResponse = await fetch(`${API_BASE_URL}/current-agent`, { credentials: 'include' });
        if (!verifyResponse.ok) {
          throw new Error("Failed to verify agent state after KB switch");
        }

        const agentData = await verifyResponse.json();
        const actualKb = agentData.agent?.knowledgeBase;

        if (!actualKb) {
          throw new Error(
            "Agent has no knowledge base after switch - this indicates a failure"
          );
        }

        if (actualKb.uuid !== selectedKnowledgeBase.value.uuid) {
          throw new Error(
            `KB switch verification failed: expected ${selectedKnowledgeBase.value.name} but agent has ${actualKb.name}`
          );
        }

        console.log(`✅ KB switch verified: agent now has ${actualKb.name}`);

        // Update local state with the verified data
        knowledgeBase.value = actualKb;
        if (assignedAgent.value) {
          assignedAgent.value.knowledgeBase = actualKb;
          currentAgent.value = assignedAgent.value;
        }

        // Emit event to parent to update agent badge
        emit("agent-updated", assignedAgent.value);

        // Refresh the knowledge base list to reflect the change
        await refreshKnowledgeBases();

        $q.notify({
          type: "positive",
          message: `Successfully switched to knowledge base: ${actualKb.name}`,
        });

        showSwitchKbDialog.value = false;
        selectedKnowledgeBase.value = null;
      } catch (error) {
        console.error("❌ Failed to switch knowledge base:", error);
        $q.notify({
          type: "negative",
          message: `Failed to switch knowledge base: ${error.message}`,
        });

        // Try to reload the current agent state to ensure UI is accurate
        try {
          await loadAgentInfo();
        } catch (reloadError) {
          console.error(
            "Failed to reload agent info after KB switch failure:",
            reloadError
          );
        }
      }
    };

    // Refresh knowledge bases list
    const refreshKnowledgeBases = async () => {
      try {
        // For authenticated users, fetch user-specific KBs
        // For unauthenticated users, fetch all KBs
        let kbResponse;
        if (isAuthenticated.value && localCurrentUser.value?.userId) {
          kbResponse = await fetch(`${API_BASE_URL}/knowledge-bases?user=${localCurrentUser.value.userId}`);
        } else {
          kbResponse = await fetch(`${API_BASE_URL}/knowledge-bases`);
        }
        
        if (kbResponse.ok) {
          const knowledgeBases: DigitalOceanKnowledgeBase[] =
            await kbResponse.json();

          // Get all connected KBs from the assigned agent
          const connectedKBs = assignedAgent.value?.knowledgeBases ||
            (assignedAgent.value?.knowledgeBase
            ? [assignedAgent.value.knowledgeBase]
              : []);

          // Combine available KBs with connected KBs, avoiding duplicates
          const allKBs = [...knowledgeBases];
          connectedKBs.forEach((connectedKB) => {
            if (!allKBs.find((kb) => kb.uuid === connectedKB.uuid)) {
              allKBs.push(connectedKB);
            }
          });

          availableKnowledgeBases.value = allKBs;
          console.log(
            `📚 Refreshed ${allKBs.length} knowledge bases (${connectedKBs.length} connected) for user ${localCurrentUser.value?.userId || 'Public User'}`
          );

          // Update the current knowledge base to reflect the switch
          if (assignedAgent.value && selectedKnowledgeBase.value) {
            knowledgeBase.value = selectedKnowledgeBase.value;
          }
        }
      } catch (error) {
        console.error("Failed to refresh knowledge bases:", error);
      }
    };

    // Handle add document to current KB
    const handleAddDocument = () => {
      showAddDocumentDialog.value = true;
    };

    // Handle choose files (new step 4)
    const handleChooseFiles = async () => {
      // Check if user is authenticated (either via props or local state)
      const authenticatedUser = localCurrentUser.value || props.currentUser;
      
      if (!authenticatedUser) {
        // Show passkey auth dialog for existing users
        // No authenticated user found, showing passkey auth dialog
        showPasskeyAuthDialog.value = true;
      } else {
        // Check if user already has files in bucket
        const bucketFiles = await checkUserBucketFiles();
        
        if (bucketFiles.length > 0) {
          // User already has files - skip to knowledge base creation
          console.log(`🎯 User already has ${bucketFiles.length} files, proceeding to knowledge base creation`);
          // Update workflow to step 5
          workflowSteps.value[3].completed = true;
          workflowSteps.value[3].current = false;
          workflowSteps.value[4].current = true;
          // Ensure userBucketFiles is updated before opening dialog
          userBucketFiles.value = bucketFiles;
          
          // Set default KB name and description for testing since we're skipping Step 4
          if (!newKbName.value) {
            newKbName.value = "kb1";
          }
          if (!newKbDescription.value) {
            newKbDescription.value = "kb1 description";
          }
          
          // Use nextTick to ensure Vue reactivity is complete before opening dialog
          await nextTick();
          
          // Show knowledge base creation dialog instead
          showCreateKbDialog.value = true;
        } else {
          // No files yet - show file selection dialog
          showChooseFilesDialog.value = true;
        }
      }
    };

    // Handle create new KB (moved to step 5)
    const handleCreateKnowledgeBase = async () => {
      // Check if user is authenticated (either via props or local state)
      const authenticatedUser = localCurrentUser.value || props.currentUser;
      
      if (!authenticatedUser) {
        // Show passkey auth dialog for existing users
        showPasskeyAuthDialog.value = true;
      } else {
        // User is already authenticated, show KB creation dialog
        // KB creation dialog opening
        
        // Load user's existing files from bucket folder (force refresh)
        await checkUserBucketFiles(true);
        
        showCreateKbDialog.value = true;
      }
    };

    // Handle file upload
    const handleFileUpload = () => {
      // TODO: Implement file upload functionality
      $q.notify({
        type: "info",
        message: "File upload functionality coming soon",
      });
    };

    // Upload selected files to bucket (step 4) - UNIQUE FUNCTION IDENTIFIER
    const uploadSelectedFilesToBucket = async () => {
      if (selectedDocuments.value.length === 0) return;

      isCreatingKb.value = true;
      try {
        const uploadedFiles = []
        const username = localCurrentUser.value?.userId || 'unknown'
        const userFolder = `${username}/`
        
        for (const fileId of selectedDocuments.value) {
          const file = props.uploadedFiles.find(f => f.id === fileId)
          if (file) {
            
            // For PDFs and RTFs, we need to extract transcript first
            let aiContent = null
            let fileName = file.name
            let fileType = 'text/plain'
            
            if (file.type === 'pdf') {
              // PDF files have both raw text (content) and AI-ready markdown (transcript)
              if (file.transcript && file.transcript.length > 0) {
                aiContent = file.transcript
                fileName = file.name.replace('.pdf', '.md')
                fileType = 'text/markdown'
              } else if (file.content && file.content.length > 0) {
                // Fallback to raw content if no transcript available
                aiContent = file.content
                fileName = file.name.replace('.pdf', '.md')
                fileType = 'text/markdown'
              } else {
                console.warn(`⚠️ PDF file ${fileName} has no content or transcript - skipping`)
                continue
              }
            } else if (file.type === 'rtf') {
              // RTF files have both raw text (content) and AI-ready markdown (transcript)
              if (file.transcript && file.transcript.length > 0) {
                aiContent = file.transcript
                fileName = file.name.replace('.rtf', '.md')
                fileType = 'text/markdown'
              } else if (file.content && file.content.length > 0) {
                // Fallback to raw content if no transcript available
                aiContent = file.content
                fileName = file.name.replace('.rtf', '.md')
                fileType = 'text/markdown'
              } else {
                console.warn(`⚠️ RTF file ${fileName} has no content or transcript - skipping`)
                continue
              }
            } else if (file.type === 'transcript' || file.name.endsWith('.md')) {
              // Already in markdown format
              aiContent = file.content
              fileType = 'text/markdown'
            } else {
              // Other file types
              aiContent = file.content
            }
            
            if (!aiContent || aiContent.length === 0) {
              console.warn(`⚠️ No content available for file: ${file.name}`)
              continue
            }
            
            // Upload to user-specific folder in DigitalOcean Spaces - FIRST INSTANCE
            const bucketKey = `${userFolder}${fileName}`
            
            const uploadResponse = await fetch('/api/upload-to-bucket', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                fileName: fileName,
                content: aiContent,
                fileType: fileType,
                userFolder: userFolder
              }),
            })
            
            if (uploadResponse.ok) {
              const uploadResult = await uploadResponse.json()
              if (uploadResult.success) {
                console.log(`✅ File uploaded to bucket: ${bucketKey}`)
                uploadedFiles.push({
                  id: uploadResult.fileInfo.bucketKey,
                  name: fileName,
                  content: aiContent,
                  bucketKey: bucketKey
                })
              } else {
                console.error(`❌ Failed to upload file to bucket: ${fileName}`)
                throw new Error(`Failed to upload ${fileName} to bucket`)
              }
            } else {
              console.error(`❌ Upload request failed for ${fileName}: ${uploadResponse.statusText}`)
              throw new Error(`Upload request failed for ${fileName}`)
            }
          }
        }
        
        // Step 2: Update user bucket files and show success (force refresh)
        await checkUserBucketFiles(true);
        
        // Clear form and close Step 4 dialog
        selectedDocuments.value = []
        showChooseFilesDialog.value = false;
        
        $q.notify({
          type: "positive",
          message: `Successfully uploaded ${uploadedFiles.length} files to your bucket folder! Now you can create your knowledge base.`,
        });
        
        // Update workflow progress to step 5
        if (uploadedFiles.length > 0) {
          workflowSteps.value[3].completed = true; // Step 4 completed
          workflowSteps.value[4].current = true;   // Step 5 is current
          
          // Show Step 5 dialog to create knowledge base
          // The KB name and description are already saved in newKbName and newKbDescription
          showCreateKbDialog.value = true;
        }
        
      } catch (error: any) {
        console.error('❌ File upload failed:', error)
        $q.notify({
          type: "negative",
          message: `Failed to upload files: ${error.message}`,
        });
      } finally {
        isCreatingKb.value = false;
      }
    };

    // Create knowledge base (moved to step 5)
    const createKnowledgeBase = async () => {
      if (!newKbName.value) return;

      isCreatingKb.value = true;
      try {
        console.log('🚀 KB creation starting with', selectedDocuments.value.length, 'selected files')
        
        // Step 1: Upload selected files to Spaces bucket in user-specific folder
        console.log('📤 Starting bucket upload to user folder...')
        const uploadedFiles = []
        const username = localCurrentUser.value?.userId || 'unknown'
        const userFolder = `${username}/`
        
        for (const fileId of selectedDocuments.value) {
          const file = props.uploadedFiles.find(f => f.id === fileId)
          if (file) {
            // Use AI-ready content (.md files) instead of original content
            let aiContent = file.content
            let fileName = file.name
            let fileType = 'text/plain'
            
            // Processing file for upload
            
            // For PDFs and RTFs, use the extracted markdown content
            if (file.type === 'pdf' && file.transcript) {
              aiContent = file.transcript
              fileName = file.name.replace('.pdf', '.md')
              fileType = 'text/markdown'
              console.log(`📄 Using extracted markdown for PDF: ${fileName} (${aiContent?.length || 0} chars)`)
            } else if (file.type === 'rtf' && file.transcript) {
              aiContent = file.transcript
              fileName = file.name.replace('.rtf', '.md')
              fileType = 'text/markdown'
              console.log(`📄 Using extracted markdown for RTF: ${fileName} (${aiContent?.length || 0} chars)`)
            } else if (file.type === 'transcript' || file.name.endsWith('.md')) {
              // Already in markdown format
              fileType = 'text/markdown'
              console.log(`📄 Using existing markdown: ${fileName} (${aiContent?.length || 0} chars)`)
            } else if (file.type === 'pdf' && !file.transcript) {
              // PDF without transcript - this shouldn't happen
              console.warn(`⚠️ PDF file ${fileName} has no transcript - skipping`)
              continue
            }
            
            if (!aiContent || aiContent.length === 0) {
              console.warn(`⚠️ No AI-ready content for file: ${file.name}`)
              continue
            }
            
            // Upload to user-specific folder in DigitalOcean Spaces
            const bucketKey = `${userFolder}${fileName}`
            console.log(`📤 Uploading to bucket: ${bucketKey} (${aiContent.length} chars)`)
            
            const uploadResponse = await fetch('/api/upload-to-bucket', {
              method: 'POST',
          headers: {
                'Content-Type': 'application/json',
          },
          body: JSON.stringify({
                fileName: fileName,
                content: aiContent,
                fileType: fileType
              }),
            })
            
            if (uploadResponse.ok) {
              const uploadResult = await uploadResponse.json()
              if (uploadResult.success) {
                console.log(`✅ File uploaded to bucket: ${bucketKey}`)
                uploadedFiles.push({
                  id: uploadResult.fileInfo.bucketKey,
                  name: fileName,
                  content: aiContent,
                  bucketKey: bucketKey
                })
              } else {
                console.error(`❌ Failed to upload file to bucket: ${fileName}`)
                throw new Error(`Failed to upload ${fileName} to bucket`)
              }
            } else {
              console.error(`❌ Upload request failed for ${fileName}: ${uploadResponse.statusText}`)
              throw new Error(`Upload request failed for ${fileName}`)
            }
          }
        }
        
        console.log(`✅ NEW CODE - Uploaded ${uploadedFiles.length} files to bucket`)
        
        // Step 2: Create knowledge base with uploaded files
        console.log('📚 NEW CODE - Creating knowledge base...')
        const requestBody = {
            name: newKbName.value,
            description: newKbDescription.value,
          documents: uploadedFiles
        };
        console.log(`📚 NEW CODE - Creating KB with ${uploadedFiles.length} documents`);

        const response = await fetch(`${API_BASE_URL}/knowledge-bases`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(requestBody),
        });

        if (!response.ok) {
          const errorText = await response.text()
          console.error(`❌ KB creation failed: ${response.status} ${response.statusText}`)
          console.error(`❌ Error details: ${errorText}`)
          throw new Error(`Failed to create knowledge base: ${response.status} ${response.statusText}`);
        }

        const newKb = await response.json();
        console.log('✅ NEW CODE - Knowledge base created successfully')

        // Step 3: Clean up bucket (but don't delete yet - wait for user confirmation)
        console.log('🧹 NEW CODE - KB creation successful, bucket cleanup ready')

        // Add to available knowledge bases
        availableKnowledgeBases.value.push(newKb);

        // Set as current knowledge base
        knowledgeBase.value = newKb;

        // Clear form
        newKbName.value = "";
        newKbDescription.value = "";
        selectedDocuments.value = [];
        showCreateKbDialog.value = false;

        $q.notify({
          type: "positive",
          message: "Knowledge base created successfully! Files in bucket will be cleaned up after confirmation.",
        });
      } catch (error: any) {
        console.error('❌ KB creation failed:', error)
        $q.notify({
          type: "negative",
          message: `Failed to create knowledge base: ${error.message}`,
        });
      } finally {
        isCreatingKb.value = false;
      }
    };

    // Handle Step 4: Choose files and upload to bucket
    const handleChooseFilesSubmit = async () => {
      console.log('🚀 Step 4: Form submitted - calling uploadSelectedFilesToBucket');
      await uploadSelectedFilesToBucket();
    };

    // Handle Step 5: Create knowledge base from bucket files
    const handleCreateKbSubmit = async () => {
      await createKnowledgeBaseFromBucketFiles();
    };

    // Handle enhanced file selection with both uploaded and bucket files
    const handleEnhancedFileSelection = async () => {
      if (selectedDocuments.value.length === 0 && selectedBucketFiles.value.length === 0) {
        $q.notify({
          type: 'warning',
          message: 'Please select at least one file to include in the knowledge base'
        });
        return;
      }

      if (!selectedKbId.value) {
        $q.notify({
          type: 'warning',
          message: 'Please select or create a knowledge base'
        });
        return;
      }

      isCreatingKb.value = true;
      
      try {
        const kbName = selectedKbId.value === 'new' ? newKbNameInput.value : 
          availableKnowledgeBases.value.find(kb => (kb.uuid || kb.id) === selectedKbId.value)?.name;
        
        console.log(`🚀 Creating/updating knowledge base: ${kbName}`);
        console.log(`📎 Selected files: ${selectedDocuments.value.length} uploaded, ${selectedBucketFiles.value.length} from bucket`);

        // Store files for cleanup after successful indexing
        filesToCleanup.value = [...selectedBucketFiles.value];

        // TODO: Implement actual KB creation/update logic here
        // This will involve:
        // 1. Creating new KB if selectedKbId === 'new'
        // 2. Adding selected files to the KB
        // 3. Starting indexing
        // 4. Cleaning up files after successful indexing (handled in checkIndexingStatus)

        $q.notify({
          type: 'positive',
          message: `Knowledge base "${kbName}" will be created/updated with selected files`
        });

        // Close the dialog
        showChooseFilesDialog.value = false;
        
        // Reset form
        selectedDocuments.value = [];
        selectedBucketFiles.value = [];
        selectedKbId.value = '';
        newKbNameInput.value = '';
        newKbDescriptionInput.value = '';

      } catch (error) {
        console.error('❌ Error creating/updating knowledge base:', error);
        $q.notify({
          type: 'negative',
          message: `Failed to create/update knowledge base: ${error.message || 'Unknown error'}`
        });
      } finally {
        isCreatingKb.value = false;
      }
    };

    // Create knowledge base directly from existing bucket files
    const createKnowledgeBaseFromBucketFiles = async () => {
      if (!newKbName.value) return;

      isCreatingKb.value = true;
      try {
        // Get username from session or props
        let username = localCurrentUser.value?.userId;
        if (!username) {
          // Fallback: try to get username from props
          username = props.currentUser?.userId;
        }
        if (!username) {
          // Final fallback: try to get from session
          try {
            const authResponse = await fetch(`${API_BASE_URL}/passkey/auth-status`);
            if (authResponse.ok) {
              const authData = await authResponse.json();
              username = authData.user?.userId;
            }
          } catch (error) {
            console.log('Could not get username from session:', error);
          }
        }
        
        const requestBody = {
            name: newKbName.value,
            description: newKbDescription.value,
          username: username || 'unknown',
          documents: userBucketFiles.value.map(file => ({
            id: file.key,
            name: file.key.split('/').pop(),
            content: file.content || '',
            bucketKey: file.key
          }))
        };

        const response = await fetch(`${API_BASE_URL}/knowledge-bases`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(requestBody),
        });

        if (!response.ok) {
          const errorText = await response.text()
          console.error(`❌ KB creation failed: ${response.status} ${response.statusText}`)
          console.error(`❌ Error details: ${errorText}`)
          throw new Error(`Failed to create knowledge base: ${response.status} ${response.statusText}`);
        }

        const newKb = await response.json();
        const kbName = newKb.name || newKb.knowledge_base?.name || 'Unknown KB';
        console.log(`✅ Knowledge base created successfully from bucket files: ${kbName}`)

        // Add to available knowledge bases
        availableKnowledgeBases.value.push(newKb);

        // Set as current knowledge base
        knowledgeBase.value = newKb;

        // Update workflow progress to Step 6 (indexing)
        workflowSteps.value[4].completed = true;
        workflowSteps.value[4].current = false;
        workflowSteps.value[5].current = true;
        
        console.log(`🎯 STEP 6 ACTIVATED: Knowledge base created, starting indexing monitor`);
        
        // Start monitoring indexing status
        startIndexingMonitor(newKb);

        // Clear form
        newKbName.value = "";
        newKbDescription.value = "";
        showCreateKbDialog.value = false;

        $q.notify({
          type: "positive",
          message: "Knowledge base created successfully from your bucket files!",
        });
      } catch (error: any) {
        console.error('❌ KB creation from bucket files failed:', error)
        $q.notify({
          type: "negative",
          message: `Failed to create knowledge base: ${error.message}`,
        });
      } finally {
        isCreatingKb.value = false;
      }
    };

    // User's existing files in bucket folder
    const userBucketFiles = ref<any[]>([]);

    // Helper functions for file selection
    const getSelectedFilesCount = () => {
      const uploadedSelected = props.uploadedFiles?.filter(file => file.selected).length || 0;
      const bucketSelected = userBucketFiles.value?.filter(file => file.selected).length || 0;
      return uploadedSelected + bucketSelected;
    };

    const createKnowledgeBaseFromSelectedFiles = async () => {
      console.log('[KB DEBUG] createKnowledgeBaseFromSelectedFiles called');
      
      const selectedUploadedFiles = props.uploadedFiles?.filter(file => file.selected) || [];
      const selectedBucketFiles = userBucketFiles.value?.filter(file => file.selected) || [];
      
      console.log('[KB DEBUG] Selected uploaded files:', selectedUploadedFiles.length);
      console.log('[KB DEBUG] Selected bucket files:', selectedBucketFiles.length);
      
      if (selectedUploadedFiles.length === 0 && selectedBucketFiles.length === 0) {
        $q.notify({
          type: 'warning',
          message: 'Please select at least one file to create a knowledge base'
        });
        return;
      }

      try {
        // If there are uploaded files that aren't in bucket yet, copy them to bucket first
        if (selectedUploadedFiles.length > 0) {
          console.log('[KB DEBUG] Copying uploaded files to bucket...');
          console.log('[KB DEBUG] Files to copy:', selectedUploadedFiles.map(f => f.name));
          
          for (const file of selectedUploadedFiles) {
            console.log('[KB DEBUG] Copying file to bucket:', file.name);
            
            try {
              // Prepare file content and metadata
              let aiContent = null;
              let fileName = file.name;
              let fileType = 'text/plain';
              
              // Handle different file types like the existing uploadSelectedFilesToBucket function
              if (file.type === 'pdf') {
                // PDF files have both raw text (content) and AI-ready markdown (transcript)
                if (file.transcript && file.transcript.length > 0) {
                  aiContent = file.transcript;
                  fileName = file.name.replace('.pdf', '.md');
                  fileType = 'text/markdown';
                } else if (file.content && file.content.length > 0) {
                  // Fallback to raw content if no transcript available
                  aiContent = file.content;
                  fileName = file.name.replace('.pdf', '.md');
                  fileType = 'text/markdown';
                } else {
                  console.warn(`[KB DEBUG] PDF file ${fileName} has no content or transcript - skipping`);
                  continue;
                }
              } else if (file.type === 'rtf') {
                // RTF files have both raw text (content) and AI-ready markdown (transcript)
                if (file.transcript && file.transcript.length > 0) {
                  aiContent = file.transcript;
                  fileName = file.name.replace('.rtf', '.md');
                  fileType = 'text/markdown';
                } else if (file.content && file.content.length > 0) {
                  // Fallback to raw content if no transcript available
                  aiContent = file.content;
                  fileName = file.name.replace('.rtf', '.md');
                  fileType = 'text/markdown';
                } else {
                  console.warn(`[KB DEBUG] RTF file ${fileName} has no content or transcript - skipping`);
                  continue;
                }
              } else if (file.type === 'transcript' || file.name.endsWith('.md')) {
                // Already in markdown format
                aiContent = file.content;
                fileType = 'text/markdown';
              } else {
                // Other file types
                aiContent = file.content;
              }
              
              if (!aiContent || aiContent.length === 0) {
                console.warn(`[KB DEBUG] No content available for file: ${file.name}`);
                continue;
              }
              
              // Upload to user-specific folder in DigitalOcean Spaces using JSON format
              const username = localCurrentUser.value?.userId || 'unknown';
              const userFolder = `${username}/`;
              
              const uploadResponse = await fetch('/api/upload-to-bucket', {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                  fileName: fileName,
                  content: aiContent,
                  fileType: fileType,
                  userFolder: userFolder
                })
              });
              
              if (uploadResponse.ok) {
                const uploadResult = await uploadResponse.json();
                if (uploadResult.success) {
                  console.log('[KB DEBUG] Successfully uploaded file to bucket:', file.name, uploadResult);
                } else {
                  console.error('[KB DEBUG] Failed to upload file to bucket:', file.name, uploadResult);
                  throw new Error(`Failed to upload ${file.name} to bucket`);
                }
              } else {
                console.error('[KB DEBUG] Failed to upload file to bucket:', file.name, uploadResponse.status);
                throw new Error(`Failed to upload ${file.name} to bucket`);
              }
            } catch (uploadError) {
              console.error('[KB DEBUG] Error uploading file to bucket:', file.name, uploadError);
              throw uploadError;
            }
          }
          
          console.log('[KB DEBUG] All uploaded files copied to bucket successfully');
          
          // Refresh bucket files after upload
          await checkUserBucketFiles(true);
        }

        // Create knowledge base with selected files
        console.log('[KB DEBUG] Creating knowledge base with selected files...');
        // This would trigger the knowledge base creation process
        $q.notify({
          type: 'positive',
          message: `Creating knowledge base with ${getSelectedFilesCount()} selected files...`
        });
        
      } catch (error) {
        console.error('[KB DEBUG] Error creating knowledge base:', error);
        $q.notify({
          type: 'negative',
          message: 'Failed to create knowledge base'
        });
      }
    };

    // Computed property to check if there are documents available for KB creation
    const hasUploadedDocuments = computed(() => {
      // Check if user has files in bucket OR uploaded files
      return (userBucketFiles.value && userBucketFiles.value.length > 0) || 
             (props.uploadedFiles && props.uploadedFiles.length > 0);
    });

    // Computed property for KB dropdown options
    const kbOptions = computed(() => {
      const options = [];
      
      // Add existing KBs owned by the current user
      const userKBs = availableKnowledgeBases.value.filter(kb => 
        kb.name && kb.name.startsWith(localCurrentUser.value?.userId || '')
      );
      
      // Sort by most recently indexed (if we have that info)
      userKBs.sort((a, b) => {
        const aTime = new Date(a.created_at || 0).getTime();
        const bTime = new Date(b.created_at || 0).getTime();
        return bTime - aTime;
      });
      
      // Add existing KBs to options
      userKBs.forEach(kb => {
        options.push({
          value: kb.uuid || kb.id,
          label: kb.name,
          kb: kb
        });
      });
      
      // Add option to create new KB
      options.push({
        value: 'new',
        label: 'Create New Knowledge Base',
        kb: null
      });
      
      return options;
    });

    // Computed property to get the default selected KB (most recent)
    const defaultKbId = computed(() => {
      const userKBs = availableKnowledgeBases.value.filter(kb => 
        kb.name && kb.name.startsWith(localCurrentUser.value?.userId || '')
      );
      
      if (userKBs.length > 0) {
        // Return the most recently indexed KB
        userKBs.sort((a, b) => {
        const aTime = new Date(a.created_at || 0).getTime();
        const bTime = new Date(b.created_at || 0).getTime();
          return bTime - aTime;
        });
        return userKBs[0].uuid || userKBs[0].id;
      }
      
      return 'new'; // Default to creating new if no existing KBs
    });
    


    // Format file size
    const formatFileSize = (bytes: number, decimalPoint = 2) => {
      if (bytes === 0) return "0 Bytes";
      const k = 1024;
      const dm = decimalPoint < 0 ? 0 : decimalPoint;
      const sizes = ["Bytes", "KB", "MB", "GB", "TB", "PB", "EB", "ZB", "YB"];
      const i = Math.floor(Math.log(bytes) / Math.log(k));
      return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + " " + sizes[i];
    };

    // Delete files from bucket folder after successful KB indexing
    const cleanupBucketFiles = async (fileKeys: string[]) => {
      if (!fileKeys || fileKeys.length === 0) {
        return;
      }

      try {
        console.log(`🧹 Cleaning up ${fileKeys.length} files from bucket folder`);
        
        for (const fileKey of fileKeys) {
          try {
            const response = await fetch(`${API_BASE_URL}/bucket-files`, {
              method: 'DELETE',
              headers: {
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({ key: fileKey })
            });

            if (response.ok) {
              console.log(`✅ Deleted file: ${fileKey}`);
            } else {
              console.warn(`⚠️ Failed to delete file: ${fileKey} (${response.status})`);
            }
          } catch (error) {
            console.error(`❌ Error deleting file ${fileKey}:`, error);
          }
        }

        // Refresh bucket files list
        await checkUserBucketFiles(true);
        
        console.log('🧹 Bucket cleanup completed');
      } catch (error) {
        console.error('❌ Error during bucket cleanup:', error);
        throw error;
      }
    };

    // Show error modal for cleanup failures
    const showCleanupErrorModal = (error: any, fileKeys: string[]) => {
      $q.dialog({
        title: 'Cleanup Error',
        message: `Failed to clean up files after successful indexing: ${error.message || 'Unknown error'}. Would you like to clean up the files anyway?`,
        ok: {
          label: 'Clean Up Files',
          color: 'primary'
        },
        cancel: {
          label: 'Keep Files',
          color: 'grey'
        }
      }).onOk(async () => {
        try {
          await cleanupBucketFiles(fileKeys);
          $q.notify({
            type: 'positive',
            message: 'Files cleaned up successfully'
          });
        } catch (cleanupError) {
          console.error('❌ Manual cleanup failed:', cleanupError);
          $q.notify({
            type: 'negative',
            message: 'Failed to clean up files manually'
          });
        }
      });
    };

    // Clean up bucket after successful KB creation
    const cleanupBucket = async () => {
      console.log('🧹 Starting bucket cleanup...')
      try {
        // First, get list of files in bucket
        const listResponse = await fetch('/api/bucket-files')
        if (listResponse.ok) {
          const result = await listResponse.json()
          if (result.success && result.files.length > 0) {
            console.log(`🧹 Found ${result.files.length} files to delete from bucket`)
            
            // Delete each file
            for (const file of result.files) {
              console.log(`🧹 Deleting file from bucket: ${file.key}`)
              const deleteResponse = await fetch('/api/delete-bucket-file', {
                method: 'DELETE',
                headers: {
                  'Content-Type': 'application/json',
                },
                body: JSON.stringify({ key: file.key }),
              })
              
              if (deleteResponse.ok) {
                console.log(`✅ Deleted file from bucket: ${file.key}`)
              } else {
                console.error(`❌ Failed to delete file from bucket: ${file.key}`)
              }
            }
            
            console.log('✅ Bucket cleanup completed')
            $q.notify({
              type: "positive",
              message: "Bucket cleanup completed successfully!",
            });
          } else {
            console.log('🧹 No files found in bucket to clean up')
          }
        } else {
          console.error('❌ Failed to list bucket files for cleanup')
        }
      } catch (error) {
        console.error('❌ Error during bucket cleanup:', error)
        $q.notify({
          type: "negative",
          message: `Bucket cleanup failed: ${error.message}`,
        });
      }
    };

    // Indexing monitoring variables
    let indexingInterval: NodeJS.Timeout | null = null;
    let currentKbId: string | null = null;
    let indexingStartTime: number = 0;

    // Start monitoring knowledge base indexing status
    const startIndexingMonitor = async (knowledgeBase: any) => {
      // Extract UUID from different possible response structures
      const kbUuid = knowledgeBase?.uuid || 
                     knowledgeBase?.id || 
                     knowledgeBase?.knowledge_base?.uuid || 
                     knowledgeBase?.knowledge_base?.id;
      
      if (!kbUuid) {
        console.warn('⚠️ No knowledge base UUID available for indexing monitor');
        // Knowledge base object structure logged
        return;
      }

      // Stop any existing monitor
      stopIndexingMonitor();
      
      currentKbId = kbUuid;
      const kbName = knowledgeBase.name || knowledgeBase.knowledge_base?.name || 'Unknown KB';
      console.log(`📊 Starting indexing monitor for KB: ${kbName} (${currentKbId})`);
      
      // Record start time for timing measurement
      indexingStartTime = Date.now();
      
      // Start monitoring every 10 seconds
      indexingInterval = setInterval(async () => {
        await checkIndexingStatus(currentKbId);
      }, 10000);
      
      // Check immediately
      await checkIndexingStatus(currentKbId);
    };

    // Stop monitoring indexing status
    const stopIndexingMonitor = () => {
      if (indexingInterval) {
        clearInterval(indexingInterval);
        indexingInterval = null;
        console.log('📊 Stopped indexing monitor');
      }
      currentKbId = null;
    };

    // Start indexing job for a knowledge base
    const startIndexingJob = async (kbId: string) => {
      // Also log to browser console for user visibility
      console.log('🚀 AUTO-START INDEXING: Starting indexing job for knowledge base...');
      try {
        console.log(`🚀 Starting indexing job for KB: ${kbId}`);
        
        const response = await fetch(`${API_BASE_URL}/test-start-indexing`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            kbId: kbId,
            kbName: knowledgeBase.value?.name || 'Unknown KB'
          }),
        });

        if (response.ok) {
          const result = await response.json();
          
          if (result.success) {
            console.log(`✅ Indexing job started successfully: ${result.indexingJob.uuid}`);
            
            // Update workflow step
            workflowSteps.value[5].title = 'Indexing job started - monitoring progress...';
            
            // Show success notification
            $q.notify({
              type: "positive",
              message: "Indexing job started successfully! Monitoring progress...",
            });
            
            // Restart the indexing monitor
            startIndexingMonitor(knowledgeBase.value);
            
          } else {
            throw new Error(result.message || 'Failed to start indexing job');
          }
        } else {
          const errorText = await response.text();
          throw new Error(`Failed to start indexing job: ${response.status} ${response.statusText}`);
        }
        
      } catch (error) {
        console.error('❌ Error starting indexing job:', error);
        $q.notify({
          type: "negative",
          message: `Failed to start indexing job: ${error.message}`,
        });
      }
    };

    // Cancel indexing process
    const cancelIndexing = async () => {
      try {
        isCancellingIndexing.value = true;
        console.log('🛑 Cancelling indexing process...');
        
        // Stop the monitoring
        stopIndexingMonitor();
        
        // Update workflow step to show cancelled
        workflowSteps.value[5].title = 'Knowledge base indexing cancelled by user';
        workflowSteps.value[5].current = false;
        
        // Show notification
        $q.notify({
          type: "warning",
          message: "Indexing process cancelled. You can restart indexing later.",
        });
        
        // Close modal
        showCancelIndexingModal.value = false;
        
      } catch (error) {
        console.error('❌ Error cancelling indexing:', error);
        $q.notify({
          type: "negative",
          message: "Failed to cancel indexing process.",
        });
      } finally {
        isCancellingIndexing.value = false;
      }
    };

    // Cancel request process
    const cancelRequest = async () => {
      try {
        isCancellingRequest.value = true;
        console.log('🛑 Cancelling private AI agent request...');
        
        // Reset workflow steps to go back to Step 2 (request pending)
        workflowSteps.value[2].completed = false;
        workflowSteps.value[2].current = false;
        workflowSteps.value[1].completed = false;
        workflowSteps.value[1].current = true;
        
        // Update local user workflow stage to reflect the change
        if (localCurrentUser.value) {
          localCurrentUser.value.workflowStage = 'no_request_yet';
        }
        
        // Show notification
        $q.notify({
          type: "warning",
          message: "Request cancelled. You can request approval again when ready.",
        });
        
        // Close modal
        showCancelRequestModal.value = false;
        
      } catch (error) {
        console.error('❌ Error cancelling request:', error);
        $q.notify({
          type: "negative",
          message: "Failed to cancel request.",
        });
      } finally {
        isCancellingRequest.value = false;
      }
    };

    // Check indexing status using DigitalOcean API
    const checkIndexingStatus = async (kbId: string) => {
      try {
        const response = await fetch(`${API_BASE_URL}/knowledge-bases/${kbId}/indexing-status`);
        if (response.ok) {
          const statusData = await response.json();
          
          if (statusData.success && statusData.indexingJob) {
            const job = statusData.indexingJob;
            const status = job.status || 'unknown';
            const phase = job.phase || 'unknown';
            
            // Update the workflow step title with current status and elapsed time
            const elapsedSeconds = Math.round((Date.now() - indexingStartTime) / 1000);
            workflowSteps.value[5].title = `Knowledge base being indexed. Status: ${status}, Phase: ${phase} (${elapsedSeconds}s)`;
            
            // Hide the CREATE KNOWLEDGE BASE button once indexing starts
            if (status === 'INDEX_JOB_STATUS_IN_PROGRESS' || status === 'INDEX_JOB_STATUS_PENDING') {
        showCreateKbDialog.value = false;
            }
            
            console.log(`📊 Indexing status: ${status}, Phase: ${phase}`);
            
            // Debug: Log the exact status values to help troubleshoot
            // Checking indexing status
            
            // Check if indexing is complete (check both status and phase)
            if (status === 'INDEX_JOB_STATUS_COMPLETED' || status === 'completed' || status === 'success' || 
                phase === 'BATCH_JOB_PHASE_SUCCEEDED') {
              const completionTime = Date.now();
              const indexingDuration = Math.round((completionTime - indexingStartTime) / 1000);
              console.log(`✅ Knowledge base indexing completed in ${indexingDuration} seconds!`);
              
              // Mark step 6 as completed
              workflowSteps.value[5].completed = true;
              workflowSteps.value[5].current = false;
              workflowSteps.value[5].title = `Knowledge base indexed and available`;
              
              // Stop monitoring
              stopIndexingMonitor();
              
              // Remove the CANCEL button
              showCancelIndexingModal.value = false;
              
              // Show success notification
        $q.notify({
          type: "positive",
                message: `Knowledge base indexing completed successfully in ${indexingDuration} seconds!`,
              });
              
              // Attach the knowledge base to the current agent
              await attachKnowledgeBaseToAgent(kbId, job);
              
              // Clean up files after successful indexing
              if (filesToCleanup.value.length > 0) {
                try {
                  await cleanupBucketFiles(filesToCleanup.value);
                  console.log('🧹 Files cleaned up successfully after indexing');
                } catch (cleanupError) {
                  console.error('❌ Failed to cleanup files after indexing:', cleanupError);
                  showCleanupErrorModal(cleanupError, filesToCleanup.value);
                }
                // Clear the cleanup list
                filesToCleanup.value = [];
              }
            } else if (status === 'INDEX_JOB_STATUS_FAILED' || status === 'failed' || status === 'error') {
              console.error(`❌ Knowledge base indexing failed: ${job.error || 'Unknown error'}`);
              
              // Update step title to show error
              workflowSteps.value[5].title = `Knowledge base indexing failed. Please contact support.`;
              
              // Stop monitoring
              stopIndexingMonitor();
              
              // Show error notification
        $q.notify({
          type: "negative",
                message: "Knowledge base indexing failed. Please contact support.",
              });
            }
            // If status is 'INDEX_JOB_STATUS_IN_PROGRESS' or 'INDEX_JOB_STATUS_PENDING', continue monitoring
          } else if (statusData.needsIndexing) {
            console.log('📊 No indexing job found - indexing needs to be started');
            
            // Update workflow step to show that indexing needs to be started
            workflowSteps.value[5].title = 'Knowledge base ready - indexing needs to be started';
            
            // Show notification with option to start indexing
            $q.notify({
              type: "info",
              message: "Knowledge base created but indexing hasn't started. Use the test endpoint to start indexing.",
              actions: [
                { label: 'Start Indexing', color: 'primary', handler: () => startIndexingJob(kbId) }
              ]
            });
            
            // Stop monitoring since there's no job to monitor
            stopIndexingMonitor();
            
          } else {
            console.warn('⚠️ No indexing job data available');
          }
        } else {
          console.warn(`⚠️ Failed to check indexing status: ${response.status}`);
        }
      } catch (error) {
        console.error('❌ Error checking indexing status:', error);
      }
    };

    // Note: refreshAgentData function removed - agent data is now updated via props from parent component

    // Attach knowledge base to current agent
    const attachKnowledgeBaseToAgent = async (kbId: string, jobStatus: any) => {
      try {
        if (!assignedAgent.value) {
          console.warn('⚠️ No assigned agent to attach KB to');
          return;
        }
        
        // Checking assigned agent values
        
        if (!assignedAgent.value.uuid && !assignedAgent.value.id) {
          console.warn('⚠️ Assigned agent has no UUID or ID');
          return;
        }
        
        const agentId = assignedAgent.value.uuid || assignedAgent.value.id;
        console.log(`🔗 Attaching knowledge base ${kbId} to agent ${agentId}`);
        
        // Call the backend to attach the KB to the agent
        const response = await fetch(`${API_BASE_URL}/agents/${agentId}/knowledge-bases`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            knowledgeBaseId: kbId,
            action: 'attach'
          })
        });
        
        if (response.ok) {
          const result = await response.json();
          console.log(`✅ Knowledge base attached to agent successfully:`, result);
          
          // Agent data will be updated via props from parent component
          
          // Don't emit refresh-agent-data to prevent overriding the current agent
          // emit("refresh-agent-data");
          
          // Show success notification
          $q.notify({
            type: "positive",
            message: "Knowledge base attached to agent successfully!",
          });
        } else {
          console.error(`❌ Failed to attach KB to agent: ${response.status}`);
          $q.notify({
            type: "negative",
            message: "Failed to attach knowledge base to agent",
          });
        }
      } catch (error) {
        console.error('❌ Error attaching KB to agent:', error);
        $q.notify({
          type: "negative",
          message: "Error attaching knowledge base to agent",
        });
      }
    };

    // Helper to check if a KB is connected to the assigned agent
    const isKnowledgeBaseConnected = (kb: DigitalOceanKnowledgeBase) => {
      if (!assignedAgent.value) {
        // No assigned agent
        return false;
      }

      // Check against all connected KBs
      const connectedKBs =
        assignedAgent.value.knowledgeBases ||
        (assignedAgent.value.knowledgeBase
          ? [assignedAgent.value.knowledgeBase]
          : []);
      
      const isConnected = connectedKBs.some((connectedKB) => connectedKB.uuid === kb.uuid);
      // KB connection status checked
      return isConnected;
    };

    // Handle KB detachment with confirmation
    const confirmDetachKnowledgeBase = async (
      kb: DigitalOceanKnowledgeBase
    ) => {
      if (!assignedAgent.value) return;

      confirmTitle.value = "Confirm Detach";
      confirmMessage.value = `Are you sure you want to detach the knowledge base "${kb.name}" from the agent?`;
      confirmAction.value = () => detachKnowledgeBase(kb);
      showConfirmDialog.value = true;
    };

    // Handle KB connection with confirmation
    const confirmConnectKnowledgeBase = async (
      kb: DigitalOceanKnowledgeBase
    ) => {
      if (!assignedAgent.value) return;

      confirmTitle.value = "Confirm Connect";
      confirmMessage.value = `Are you sure you want to connect the knowledge base "${kb.name}" to the agent?`;
      confirmAction.value = () => connectKnowledgeBase(kb);
      showConfirmDialog.value = true;
    };

    // Handle KB detachment
    const detachKnowledgeBase = async (kb: DigitalOceanKnowledgeBase) => {
      if (!assignedAgent.value) return;
      
      // Prevent rapid successive calls
      if (isUpdating.value) {
        console.log("Skipping duplicate detachKnowledgeBase request");
        return;
      }

      isUpdating.value = true;
      try {
        const response = await fetch(
          `${API_BASE_URL}/agents/${assignedAgent.value.id}/knowledge-bases/${kb.uuid}`,
          {
            method: "DELETE",
          }
        );

        if (!response.ok) {
          throw new Error(`Failed to detach KB: ${response.statusText}`);
        }

        console.log(`✅ Detached KB: ${kb.name}`);
        $q.notify({
          type: "positive",
          message: `Knowledge base "${kb.name}" detached from agent.`,
        });

        // Update local agent state to reflect KB detachment
        if (assignedAgent.value) {
          // Remove the KB from the agent's knowledgeBases array
          if (assignedAgent.value.knowledgeBases) {
            assignedAgent.value.knowledgeBases = assignedAgent.value.knowledgeBases.filter(
              (agentKb: any) => agentKb.uuid !== kb.uuid
            );
          }
          // Clear the single knowledgeBase property if it matches
          if (assignedAgent.value.knowledgeBase && assignedAgent.value.knowledgeBase.uuid === kb.uuid) {
            assignedAgent.value.knowledgeBase = null;
          }
          // Update currentAgent to match assignedAgent
          currentAgent.value = assignedAgent.value;
        }
        
        // Update local knowledge base state
        knowledgeBase.value = null;
        
        // Emit event to parent to update agent badge
        emit("agent-updated", assignedAgent.value);
        
        // Don't emit refresh-agent-data to prevent overriding the current agent
        // emit("refresh-agent-data");
      } catch (error: any) {
        console.error("❌ Failed to detach KB:", error);
        $q.notify({
          type: "negative",
          message: `Failed to detach KB: ${error.message}`,
        });
      } finally {
        isUpdating.value = false;
      }
    };

    // Handle KB connection
    const connectKnowledgeBase = async (kb: DigitalOceanKnowledgeBase) => {
      if (!assignedAgent.value) {
        // No assigned agent
        return;
      }
      
      // Prevent rapid successive calls
      if (isUpdating.value) {
        console.log("Skipping duplicate connectKnowledgeBase request");
        return;
      }

      console.log(`[*] Connecting KB "${kb.name}" to agent "${assignedAgent.value.name}"`);
      isUpdating.value = true;
      try {
        const response = await fetch(
          `${API_BASE_URL}/agents/${assignedAgent.value.id}/knowledge-bases/${kb.uuid}`,
          {
            method: "POST",
          }
        );

        const result = await response.json();


        if (!response.ok) {
          // Check if this requires ownership transfer
          if (result.requiresOwnershipTransfer && result.kbInfo) {
            console.log("🔄 Ownership transfer required for KB:", result.kbInfo);
            
            // Validate kbInfo data before showing modal
            if (result.kbInfo && result.kbInfo.id) {
              // Show ownership transfer modal
              showOwnershipTransferModal.value = true;
              ownershipTransferData.value = {
                kbId: result.kbInfo.id,
                kbName: result.kbInfo.name || 'Unknown KB',
                currentOwner: result.kbInfo.currentOwner || 'Unknown',
                newOwner: localCurrentUser.value?.userId || 'unknown'
              };
            } else {
              console.error("❌ Invalid kbInfo data for ownership transfer:", result.kbInfo);
              $q.notify({
                type: "negative",
                message: "Ownership transfer data is incomplete. Please try again.",
                timeout: 5000,
                position: "top",
              });
              return;
            }
            
            $q.notify({
              type: "warning",
              message: `Ownership transfer required for "${result.kbInfo.name || 'this knowledge base'}". Please complete the admin transfer process.`,
              timeout: 8000,
              position: "top",
            });
            return; // Exit early, don't throw error
          }
          
          // Check if this is the DigitalOcean API limitation
          if (result.api_limitation) {
            console.error(
              "❌ DigitalOcean API limitation detected:",
              result.message
            );
            $q.notify({
              type: "warning",
              message:
                "⚠️ DigitalOcean API Limitation: Knowledge base attachment operations are not working correctly. Please use the DigitalOcean dashboard to manually attach knowledge bases.",
              timeout: 10000,
              position: "top",
            });
          } else {
            throw new Error(`Failed to connect KB: ${response.statusText}`);
          }
        } else {
          console.log(`✅ Connected KB: ${kb.name}`);
          $q.notify({
            type: "positive",
            message: `Knowledge base "${kb.name}" connected to agent.`,
          });
        }

        // Update local agent state to reflect KB connection
        if (assignedAgent.value) {
          // Add the KB to the agent's knowledgeBases array
          if (!assignedAgent.value.knowledgeBases) {
            assignedAgent.value.knowledgeBases = [];
          }
          // Check if KB is not already in the array
          const existingKb = assignedAgent.value.knowledgeBases.find(
            (agentKb: any) => agentKb.uuid === kb.uuid
          );
          if (!existingKb) {
            assignedAgent.value.knowledgeBases.push(kb);
          }
          // Set as single knowledgeBase property
          assignedAgent.value.knowledgeBase = kb;
          // Update currentAgent to match assignedAgent
          currentAgent.value = assignedAgent.value;
        }
        
        // Update local knowledge base state
        knowledgeBase.value = kb;
        
        // Emit event to parent to update agent badge
        emit("agent-updated", assignedAgent.value);
        
        // Don't emit refresh-agent-data to prevent overriding the current agent
        // emit("refresh-agent-data");
      } catch (error: any) {
        console.error("❌ Failed to connect KB:", error);
        $q.notify({
          type: "negative",
          message: `Failed to connect KB: ${error.message}`,
        });
      } finally {
        isUpdating.value = false;
      }
    };

    // Execute confirmed action
    const executeConfirmAction = async () => {
      if (confirmAction.value) {
        await confirmAction.value();
        showConfirmDialog.value = false;
        confirmAction.value = null;
      }
    };

    // Toggle KB protection
    const toggleKBProtection = async (kb: DigitalOceanKnowledgeBase) => {
      try {
        if (kb.isProtected) {
          // Remove protection
          const response = await fetch(
            `${API_BASE_URL}/kb-protection/unprotect-kb`,
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                kbId: kb.uuid,
                owner: localCurrentUser.value?.userId,
              }),
            }
          );

          const result = await response.json();

          if (result.success) {
            $q.notify({
              type: "positive",
              message: "Knowledge base protection removed",
            });
            await loadAgentInfo(); // Refresh the list
          } else {
            throw new Error(result.error);
          }
        } else {
          // Add protection
          const response = await fetch(
            `${API_BASE_URL}/kb-protection/protect-kb`,
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                kbId: kb.uuid,
                kbName: kb.name,
                owner: localCurrentUser.value?.username,
                description: `Protected by ${localCurrentUser.value?.displayName || localCurrentUser.value?.username}`,
              }),
            }
          );

          const result = await response.json();

          if (result.success) {
            $q.notify({
              type: "positive",
              message: "Knowledge base is now protected",
            });
            await loadAgentInfo(); // Refresh the list
          } else {
            throw new Error(result.error);
          }
        }
      } catch (error: any) {
        console.error("Error toggling KB protection:", error);
        $q.notify({
          type: "negative",
          message: `Failed to ${kb.isProtected ? "remove" : "add"} protection: ${error.message}`,
        });
      }
    };

    // Handle close button click - check for warning
    const handleClose = () => {
      if (props.warning && props.warning.trim() !== '') {
        showWarningModal.value = true;
      } else {
        emit("update:modelValue", false);
      }
    };

    // Handle warning confirmation
    const handleWarningConfirmed = () => {
      showWarningModal.value = false;
      emit("update:modelValue", false);
    };



    // Request admin approval for private AI and knowledge base access
    const requestAdminApproval = async () => {
      if (!localCurrentUser.value?.userId) {
        $q.notify({
          type: "negative",
          message: "User not authenticated",
        });
        return;
      }

      isRequestingApproval.value = true;
      try {
        // Validate email is provided
        if (!userEmail.value) {
          $q.notify({
            type: "negative",
            message: "Please provide your email address",
          });
          return;
        }

        // Send email notification to admin using Resend
        const response = await fetch('/api/admin/request-approval', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            username: localCurrentUser.value.userId,
            email: userEmail.value,
            requestType: 'private_ai_access',
            message: `User ${localCurrentUser.value.userId} (${userEmail.value}) is requesting access to private AI agents and health record knowledge bases.`
          }),
        });

        if (response.ok) {
          $q.notify({
            type: "positive",
            message: "Approval request sent successfully! The administrator will review your request.",
          });
          
          // Update local user workflow stage to reflect the change
          if (localCurrentUser.value) {
            localCurrentUser.value.workflowStage = 'awaiting_approval';
          }
          
          showAdminApprovalDialog.value = false;
          
          // Update workflow progress to show step 2 is completed
          workflowSteps.value[1].completed = true;
          workflowSteps.value[1].current = false;
          workflowSteps.value[2].current = true; // Step 3 is now current
        } else {
          throw new Error('Failed to send approval request');
        }
      } catch (error: any) {
        console.error('Error requesting admin approval:', error);
        $q.notify({
          type: "negative",
          message: `Failed to send approval request: ${error.message}`,
        });
      } finally {
        isRequestingApproval.value = false;
      }
    };

    // Cleanup function for indexing monitor
    onUnmounted(() => {
      stopIndexingMonitor();
    });

    // Handle manage knowledge bases button click
    const handleManageKnowledgeBases = () => {
      // Start a new progress sequence with Step 4 (CHOOSE FILES FOR KNOWLEDGE BASE)
      // Reset workflow to step 4
      workflowSteps.value.forEach((step, index) => {
        step.completed = index < 3; // Steps 1-3 are completed
        step.current = index === 3; // Step 4 is current
      });
      
      // Show the choose files dialog
      showChooseFilesDialog.value = true;
    };

    // File management methods for authenticated users
    
    const checkUserFiles = async () => {
      if (!isAuthenticated.value || isDeepLinkUser.value) {
        return;
      }
      
      try {
        // Check if user has files in their Spaces bucket using user-specific endpoint
        const response = await fetch(`${API_BASE_URL}/bucket/user-status/${encodeURIComponent(localCurrentUser.value?.userId || '')}`);
        if (response.ok) {
          const statusData = await response.json();
          
          // Use the hasFolder and fileCount from the status endpoint
          const hasFiles = statusData.hasFolder && statusData.fileCount > 0;
          userHasFiles.value = hasFiles || false;
          console.log(`📁 User has ${statusData.fileCount || 0} files in bucket`);
        } else {
          // Fallback to general bucket-files endpoint and filter by user
          const response = await fetch(`${API_BASE_URL}/bucket-files`);
          if (response.ok) {
            const filesData = await response.json();
            
            // Filter files for current user only
            const userFiles = filesData.files && filesData.files.filter((file: any) => 
              file.key.startsWith(`${localCurrentUser.value?.userId}/`) && 
              !file.key.endsWith('/') && 
              file.size > 0
            );
            const hasFiles = userFiles && userFiles.length > 0;
            userHasFiles.value = hasFiles || false;
            console.log(`📁 User has ${userFiles?.length || 0} files in bucket (fallback)`);
          } else {
            userHasFiles.value = false;
          }
        }
      } catch (error) {
        console.error('❌ Error checking user files:', error);
        userHasFiles.value = false;
      }
    };

    const handleFileAction = async (action: string) => {
      selectedFileAction.value = action;
      
      // For create_or_add action, open the enhanced file selection modal directly
      if (action === 'create_or_add') {
        console.log('🔧 Opening enhanced file selection modal for create_or_add action');
        console.log('🔧 Current userHasFiles:', userHasFiles.value);
        console.log('🔧 Current userBucketFiles count:', userBucketFiles.value.length);
        
        // Ensure bucket files are loaded before opening modal
        await checkUserBucketFiles(true);
        console.log('🔧 After loading bucket files:', userBucketFiles.value.length);
        
        showChooseFilesDialog.value = true;
      } else {
        // For other actions, show the confirmation modal
        showFileChoiceModal.value = true;
      }
    };

    const getActionDescription = (action: string) => {
      const descriptions: Record<string, string> = {
        'create_or_add': 'Create new or add to existing knowledge base',
        'import_more': 'Import more files before creating knowledge base',
        'clear_files': 'Clear all files (you will need to import them again)',
        'import_files': 'Import files to create a new knowledge base'
      };
      return descriptions[action] || action;
    };

    const executeFileAction = async () => {
      showFileChoiceModal.value = false;
      showExecutionModal.value = true;
      executionInProgress.value = true;
      executionComplete.value = false;
      currentExecutionStage.value = 0;

      // Set up execution stages based on action
      const stages = getExecutionStages(selectedFileAction.value);
      executionStages.value = stages;

      try {
        for (let i = 0; i < stages.length; i++) {
          currentExecutionStage.value = i;
          await executeStage(stages[i], selectedFileAction.value);
          
          // Wait a bit between stages for visual feedback
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
        
        executionComplete.value = true;
        executionInProgress.value = false;
        
        $q.notify({
          type: 'positive',
          message: 'Action completed successfully!'
        });
        
        } catch (error: any) {
        console.error('❌ Execution failed:', error);
        executionInProgress.value = false;
        $q.notify({
          type: 'negative',
          message: `Action failed: ${error.message || 'Unknown error'}`
        });
      }
    };

    const getExecutionStages = (action: string) => {
      const stageTemplates: Record<string, Array<{title: string, description: string}>> = {
        'create_or_add': [
          { title: 'Checking existing knowledge bases', description: 'Scanning for existing knowledge bases' },
          { title: 'Processing files', description: 'Converting files to AI-readable format' },
          { title: 'Creating/updating knowledge base', description: 'Setting up knowledge base structure' },
          { title: 'Indexing content', description: 'Processing content for AI search' },
          { title: 'Verifying completion', description: 'Ensuring indexing is complete' }
        ],
        'import_more': [
          { title: 'Opening file import', description: 'Launching file selection interface' },
          { title: 'Waiting for file selection', description: 'User selecting additional files' }
        ],
        'clear_files': [
          { title: 'Backing up file references', description: 'Creating backup of file metadata' },
          { title: 'Clearing user files', description: 'Removing files from storage' },
          { title: 'Cleaning up metadata', description: 'Removing file references' }
        ],
        'import_files': [
          { title: 'Opening file import', description: 'Launching file selection interface' },
          { title: 'Waiting for file selection', description: 'User selecting files to import' }
        ]
      };
      return stageTemplates[action] || [];
    };

    const executeStage = async (stage: any, action: string) => {
      // Simulate stage execution - in real implementation, this would call actual APIs
      console.log(`Executing stage: ${stage.title} for action: ${action}`);
      
      switch (stage.title) {
        case 'Indexing content':
          // For knowledge base creation, wait for indexing to complete
          if (action === 'create_or_add') {
            // TODO: Pass actual kbId when implementing real KB creation
            await waitForIndexingCompletion('placeholder-kb-id');
          }
          break;
        case 'Opening file import':
          // Trigger file import dialog
          if (action === 'import_more' || action === 'import_files') {
            // This would open the file chooser
            console.log('Opening file chooser...');
          }
          break;
        default:
          // Simulate work
          await new Promise(resolve => setTimeout(resolve, 2000));
      }
    };

    const waitForIndexingCompletion = async (kbId: string) => {
      // Poll for indexing completion using existing DigitalOcean API
      let attempts = 0;
      const maxAttempts = 30; // 5 minutes max
      
      while (attempts < maxAttempts) {
        try {
          // Use existing checkIndexingStatus function that uses DigitalOcean API
          await checkIndexingStatus(kbId);
          
          // Check if indexing is complete by looking at the workflow step
          if (workflowSteps.value[5].completed) {
            console.log('✅ Indexing completed');
            return;
          }
        } catch (error) {
          console.warn('Error checking indexing status:', error);
        }
        
        await new Promise(resolve => setTimeout(resolve, 10000)); // Wait 10 seconds
        attempts++;
      }
      
      throw new Error('Indexing timeout - please check manually');
    };

    const cancelExecution = () => {
      executionInProgress.value = false;
      showExecutionModal.value = false;
      
      $q.notify({
        type: 'warning',
        message: 'Action cancelled'
      });
    };

    // Note: Dialog opening logic is consolidated in onDialogOpen function
    // Removed duplicate watcher to prevent multiple API calls

    // Watch for file selection dialog opening to initialize KB selection
    watch(showChooseFilesDialog, (newValue) => {
      if (newValue) {
        // Initialize KB selection with default
        selectedKbId.value = defaultKbId.value;
        
        // Load user bucket files
        checkUserBucketFiles(true);
      }
    });

    // Test call on component mount - removed to prevent excessive API calls

    return {
      showDialog,
      currentAgent,
      assignedAgent,
      // availableAgents removed
      knowledgeBase,
      availableKnowledgeBases,
      documents,
      isLoading,
      isDialogLoading,
      isCreating,
      isUpdating,
      isDeleting,
      showDocumentManager,
      showDeleteConfirm,
      showWizard,
      showAddDocumentDialog,
      showChooseFilesDialog,
      showCreateKbDialog,
      showSwitchKbDialog,
      showKbLinkSuggestionDialog,
      selectedKnowledgeBase,
      newKbName,
      newKbDescription,
      isCreatingKb,
      selectedDocuments,
      hasUploadedDocuments,
      onAgentSelected,
      updateAgent,
      confirmDelete,
      deleteAgent,
      onDialogBeforeShow,
      onDialogOpen,
      handleAgentCreated,
      handleKnowledgeBaseClick,
      confirmSwitchKnowledgeBase,
      refreshKnowledgeBases,
      handleAddDocument,
      handleChooseFiles,
      handleCreateKnowledgeBase,
      handleFileUpload,
      handleChooseFilesSubmit,
      handleCreateKbSubmit,
      uploadSelectedFilesToBucket,
      createKnowledgeBase,
      createKnowledgeBaseFromBucketFiles,
      formatFileSize,
      confirmDetachKnowledgeBase,
      confirmConnectKnowledgeBase,
      getSelectedFilesCount,
      createKnowledgeBaseFromSelectedFiles,
      uploadedFiles: props.uploadedFiles,
      isKnowledgeBaseConnected,
      showConfirmDialog,
      confirmAction,
      confirmMessage,
      confirmTitle,
      executeConfirmAction,
      localCurrentUser,
      toggleKBProtection,
      showPasskeyAuthDialog,
      handleUserAuthenticated,
      handleSignInCancelled,
      showOwnershipTransferModal,
      ownershipTransferData,
      showWarningModal,
      warningMessage,
      handleClose,
      handleWarningConfirmed,
      showAdminApprovalDialog,
      isRequestingApproval,
      userEmail,
      requestAdminApproval,
      checkAuthenticationStatus,
      isAuthenticated,
      workflowSteps,
      showStepHelp,
      showStepHelpDialog,
      currentStepHelp,
      helpEmailData,
      isSendingHelpEmail,
      sendHelpEmail,
      hasRequestedApproval,
      updateWorkflowProgressForAgent,
      cleanupBucket,
      userBucketFiles,
      checkUserBucketFiles,
      startIndexingMonitor,
      stopIndexingMonitor,
      startIndexingJob,
      cancelIndexing,
      showCancelIndexingModal,
      isCancellingIndexing,
      cancelRequest,
      showCancelRequestModal,
      isCancellingRequest,
      attachKnowledgeBaseToAgent,
      // refreshAgentData removed - agent data updated via props
      currentWorkflowStep,
      handleManageKnowledgeBases,
      isDeepLinkUser,
      // File management for authenticated users
      userHasFiles,
      showFileChoiceModal,
      showExecutionModal,
      executionStages,
      currentExecutionStage,
      executionInProgress,
      executionComplete,
      selectedFileAction,
      handleFileAction,
      getActionDescription,
      executeFileAction,
      cancelExecution,
      // Enhanced file selection modal
      selectedBucketFiles,
      selectedKbId,
      newKbNameInput,
      newKbDescriptionInput,
      kbOptions,
      defaultKbId,
      handleEnhancedFileSelection,
      filesToCleanup,
      cleanupBucketFiles,
      showCleanupErrorModal,
      currentKbId,
      // Workflow stage management
      workflowStateMessages,
      currentWorkflowState,
      currentWorkflowMessage,
      getWorkflowStateStyle,
      getWorkflowStateIcon,
      getWorkflowStateColor,
    };


  },
});
</script>

<style scoped>
.agent-status {
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  border-radius: 8px;
  color: white;
}

.q-card {
  border-radius: 12px;
}

/* Ensure warning modal is properly isolated */
.warning-modal-dialog {
  z-index: 9999 !important;
}

.warning-modal-card {
  position: relative;
  z-index: 10000 !important;
}

/* Agent Summary Card Styling */
.agent-summary-card {
  background: linear-gradient(135deg, #f5f7fa 0%, #c3cfe2 100%);
  border-radius: 8px;
}

.agent-summary-text {
  flex: 1;
  min-width: 0;
  word-wrap: break-word;
  overflow-wrap: break-word;
}

.agent-summary-text .text-caption {
  white-space: normal;
  line-height: 1.3;
  word-break: break-word;
}

/* Workflow Steps Styling */
.workflow-steps {
  background: #f8f9fa;
  border-radius: 8px;
  padding: 16px;
  border: 1px solid #e9ecef;
}

.workflow-step {
  display: flex;
  align-items: center;
  margin-bottom: 12px;
  padding: 6px 8px;
  border-radius: 6px;
  transition: all 0.2s ease;
}

.workflow-step:last-child {
  margin-bottom: 0;
}

.workflow-step.completed {
  background: rgba(76, 175, 80, 0.1);
  border-left: 3px solid #4caf50;
}

.workflow-step.current {
  background: rgba(33, 150, 243, 0.1);
  border-left: 3px solid #2196f3;
}

.step-indicator {
  flex-shrink: 0;
  margin-right: 12px;
}

.step-content {
  flex: 1;
  min-width: 0;
}

.step-title {
  font-weight: 500;
  line-height: 1.3;
  font-size: 0.9rem;
}

.step-help {
  flex-shrink: 0;
  margin-left: 8px;
}

.help-btn {
  opacity: 0.7;
  transition: opacity 0.2s ease;
}

.help-btn:hover {
  opacity: 1;
}

/* Execution modal styling */
.execution-stages {
  margin: 16px 0;
}

.execution-stage {
  padding: 8px 0;
  border-radius: 4px;
  transition: all 0.3s ease;
}

.execution-stage.completed {
  background: rgba(76, 175, 80, 0.1);
}

.execution-stage.current {
  background: rgba(33, 150, 243, 0.1);
}

.execution-stage.pending {
  opacity: 0.6;
}
</style>
