import nano from 'nano'
import fetch from 'node-fetch'

export class CouchDBClient {
  constructor(config = {}) {
    // Support both local CouchDB and Cloudant
    const url = config.url || process.env.CLOUDANT_URL || process.env.COUCHDB_URL || 'http://localhost:5984'
    const username = config.username || process.env.CLOUDANT_USERNAME || process.env.COUCHDB_USER || 'maia_admin'
    const password = config.password || process.env.CLOUDANT_PASSWORD || process.env.COUCHDB_PASSWORD || 'MaiaSecure2024!'
    const database = config.database || process.env.CLOUDANT_DATABASE || process.env.COUCHDB_DATABASE || 'maia_chats'

    // Build connection string for Cloudant/CouchDB
    let connectionString
    if (url.includes('cloudant') || url.includes('bluemix')) {
      // For Cloudant, use the full URL with credentials
      const cleanUrl = url.replace(/^https?:\/\//, '')
      connectionString = `https://${username}:${password}@${cleanUrl}`
    } else {
      // For local CouchDB
      const protocol = url.startsWith('https') ? 'https' : 'http'
      const host = url.replace(/^https?:\/\//, '').split(':')[0]
      const port = url.includes(':') ? url.split(':')[2]?.split('/')[0] : (protocol === 'https' ? '443' : '5984')
      connectionString = `${protocol}://${username}:${password}@${host}:${port}`
    }
    
    this.db = nano(connectionString)
    this.databaseName = database
    this.database = this.db.use(database)
    
    // Detect if we're using Cloudant
    this.isCloudant = url.includes('cloudant') || url.includes('bluemix')
  }

  // Helper method to handle 429 errors with retry logic
  async handleCloudantError(operation, retryCount = 0) {
    try {
      return await operation()
    } catch (error) {
      // Check for 429 rate limiting errors
      if (error.statusCode === 429 || error.error === 'too_many_requests') {
        const retryAfter = error.headers?.['retry-after'] || 30
        const delay = Math.min(1000 * Math.pow(2, retryCount), 30000) // Exponential backoff, max 30s
        
        console.warn(`🚨 [429] Cloudant Rate Limit Exceeded (attempt ${retryCount + 1}):`, {
          operation: operation.name || 'unknown',
          retryAfter: `${retryAfter}s`,
          delay: `${delay}ms`,
          suggestion: 'Retrying with exponential backoff...'
        })
        
        if (retryCount < 3) { // Max 3 retries
          await new Promise(resolve => setTimeout(resolve, delay))
          return this.handleCloudantError(operation, retryCount + 1)
        } else {
          console.error(`❌ [429] Max retries exceeded for operation:`, operation.name || 'unknown')
          throw new Error(`Cloudant rate limit exceeded. Please try again in ${retryAfter} seconds.`)
        }
      }
      throw error
    }
  }

  async initializeDatabase() {
    try {
      await this.db.db.create(this.databaseName)
    } catch (error) {
      if (error.statusCode === 412) {
      } else {
        console.error('❌ Failed to create database:', error)
        throw error
      }
    }
  }

  async createDatabase(databaseName) {
    try {
      await this.db.db.create(databaseName)
      return true
    } catch (error) {
      if (error.statusCode === 412) {
        return true
      } else {
        console.error('❌ Failed to create database:', error)
        throw error
      }
    }
  }

  async saveDocument(databaseName, document) {
    return this.handleCloudantError(async () => {
      const db = this.db.use(databaseName)
      
      // If document has _id but no _rev, try to get the current revision first
      if (document._id && !document._rev) {
        try {
          const existing = await db.get(document._id)
          document._rev = existing._rev
        } catch (error) {
          // Document doesn't exist, that's fine - we'll create it
          if (error.statusCode !== 404) {
            throw error
          }
        }
      }
      
      const result = await db.insert(document)
      return {
        id: result.id,
        rev: result.rev,
        ok: result.ok
      }
    })
  }

  async getDocument(databaseName, documentId) {
    return this.handleCloudantError(async () => {
      const db = this.db.use(databaseName)
      return await db.get(documentId)
    }).catch(error => {
      if (error.statusCode === 404) {
        return null
      }
      throw error
    })
  }

  async findDocuments(databaseName, query) {
    try {
      const db = this.db.use(databaseName)
      return await db.find(query)
    } catch (error) {
      console.error('❌ Failed to find documents:', error)
      throw error
    }
  }

  async getAllDocuments(databaseName) {
    try {
      const db = this.db.use(databaseName)
      const result = await db.list({ include_docs: true })
      const docs = result.rows.map(row => row.doc)
      
      // DEBUG: Log thu1091 document from database
      const thu1091 = docs.find(doc => doc._id === 'thu1091')
      if (thu1091) {
        console.log(`🔍 [DB-READ] thu1091 from database - credentialID: ${thu1091.credentialID || 'MISSING'}`)
        console.log(`🔍 [DB-READ] thu1091 keys:`, Object.keys(thu1091))
      }
      
      return docs
    } catch (error) {
      console.error('❌ Failed to get all documents:', error)
      throw error
    }
  }

  async deleteDocument(databaseName, documentId) {
    try {
      const db = this.db.use(databaseName)
      const doc = await db.get(documentId)
      const result = await db.destroy(documentId, doc._rev)
      return result
    } catch (error) {
      console.error('❌ Failed to delete document:', error)
      throw error
    }
  }

  async testConnection() {
    try {
      const info = await this.db.info()
      const serviceType = this.isCloudant ? 'Cloudant' : 'CouchDB'
      return true
    } catch (error) {
      console.error('❌ Connection failed:', error)
      return false
    }
  }

  // Chat operations
  async saveChat(chatData) {
    return this.handleCloudantError(async () => {
      // Debug: Log what's being saved
      // Saving chat data
      
      // If chatData has an _id, try to update existing document
      if (chatData._id) {
        try {
          const existing = await this.database.get(chatData._id)
          chatData._rev = existing._rev
        } catch (error) {
          // Document doesn't exist, create new
          delete chatData._rev
        }
      }

      const result = await this.database.insert(chatData)
      return {
        id: result.id,
        rev: result.rev,
        ok: result.ok
      }
    })
  }

  async getChat(chatId) {
    return this.handleCloudantError(async () => {
      return await this.database.get(chatId)
    }).catch(error => {
      if (error.statusCode === 404) {
        return null
      }
      throw error
    })
  }

  async getAllChats() {
    return this.handleCloudantError(async () => {
      const result = await this.database.list({ include_docs: true })
      return result.rows
        .filter(row => !row.id.startsWith('_design/'))
        .map(row => row.doc)
    })
  }

  async deleteChat(chatId) {
    try {
      const doc = await this.database.get(chatId)
      return await this.database.destroy(chatId, doc._rev)
    } catch (error) {
      console.error('❌ Failed to delete chat:', error)
      throw error
    }
  }

  async getChatByShareId(shareId) {
    try {
      
      // Create a view to find chats by shareId
      const result = await this.database.view('chats', 'by_share_id', {
        key: shareId,
        include_docs: true
      })
      
      if (result.rows.length > 0) {
        return result.rows[0].doc
      }
      return null
    } catch (error) {
      
      // If view doesn't exist, fall back to scanning all documents
      try {
        const allChats = await this.getAllChats()
        
        const matchingChat = allChats.find(chat => {
          return chat.shareId === shareId;
        });
        
        return matchingChat || null
      } catch (scanError) {
        console.error('❌ Error scanning chats for shareId:', scanError)
        throw scanError
      }
    }
  }

  async createShareIdView() {
    try {
      const designDoc = {
        _id: '_design/chats',
        views: {
          by_share_id: {
            map: function(doc) {
              if (doc.shareId) {
                emit(doc.shareId, doc._id)
              }
            }.toString()
          }
        }
      }
      
      // Try to create or update the design document
      try {
        const existing = await this.database.get('_design/chats')
        designDoc._rev = existing._rev
      } catch (error) {
        // Design document doesn't exist, create new
      }
      
      await this.database.insert(designDoc)
    } catch (error) {
      console.error('❌ Failed to create share ID view:', error)
      // Don't throw error, fallback scanning will work
    }
  }

  // File operations
  async saveFile(fileData) {
    try {
      const result = await this.database.insert(fileData)
      return {
        id: result.id,
        rev: result.rev,
        ok: result.ok
      }
    } catch (error) {
      console.error('❌ Failed to save file:', error)
      throw error
    }
  }

  async getFile(fileId) {
    try {
      return await this.database.get(fileId)
    } catch (error) {
      if (error.statusCode === 404) {
        return null
      }
      console.error('❌ Failed to get file:', error)
      throw error
    }
  }

  async getAllFiles() {
    try {
      const result = await this.database.list({ include_docs: true })
      return result.rows
        .filter(row => !row.id.startsWith('_design/'))
        .map(row => row.doc)
    } catch (error) {
      console.error('❌ Failed to get all files:', error)
      throw error
    }
  }

  async deleteFile(fileId) {
    try {
      const doc = await this.database.get(fileId)
      return await this.database.destroy(fileId, doc._rev)
    } catch (error) {
      console.error('❌ Failed to delete file:', error)
      throw error
    }
  }

  // Search operations
  async searchChats(query, options = {}) {
    try {
      // Simple text search - in production, you'd use CouchDB views or Cloudant Search
      const allChats = await this.getAllChats()
      return allChats.filter(chat => {
        const searchText = JSON.stringify(chat).toLowerCase()
        return searchText.includes(query.toLowerCase())
      })
    } catch (error) {
      console.error('❌ Failed to search chats:', error)
      throw error
    }
  }

  // Backup operations
  async createBackup() {
    try {
      const allDocs = await this.database.list({ include_docs: true })
      return allDocs.rows
        .filter(row => !row.id.startsWith('_design/'))
        .map(row => row.doc)
    } catch (error) {
      console.error('❌ Failed to create backup:', error)
      throw error
    }
  }

  async restoreBackup(documents) {
    try {
      const results = []
      for (const doc of documents) {
        try {
          const result = await this.database.insert(doc)
          results.push({ id: doc._id, success: true, rev: result.rev })
        } catch (error) {
          results.push({ id: doc._id, success: false, error: error.message })
        }
      }
      return results
    } catch (error) {
      console.error('❌ Failed to restore backup:', error)
      throw error
    }
  }

  // Health check
  async healthCheck() {
    try {
      const info = await this.db.info()
      const dbInfo = await this.database.info()
      
      return {
        status: 'healthy',
        serviceType: this.isCloudant ? 'Cloudant' : 'CouchDB',
        version: info.version,
        databaseName: this.databaseName,
        documentCount: dbInfo.doc_count,
        dataSize: dbInfo.data_size,
        diskSize: dbInfo.disk_size
      }
    } catch (error) {
      return {
        status: 'unhealthy',
        serviceType: this.isCloudant ? 'Cloudant' : 'CouchDB',
        error: error.message
      }
    }
  }

  // Get service info
  getServiceInfo() {
    return {
      isCloudant: this.isCloudant,
      databaseName: this.databaseName,
      url: this.db.config.url
    }
  }

  // Get database information
  async getDatabaseInfo(databaseName) {
    try {
      const db = this.db.use(databaseName)
      const info = await db.info()
      return info
    } catch (error) {
      console.error(`❌ Failed to get database info for ${databaseName}:`, error)
      throw error
    }
  }
}

// Factory function for easy instantiation
export const createCouchDBClient = (config = {}) => {
  return new CouchDBClient(config)
}

// Default client instance
export const couchDBClient = new CouchDBClient() 