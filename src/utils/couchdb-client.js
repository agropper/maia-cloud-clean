import nano from 'nano'
import fetch from 'node-fetch'

export class CouchDBClient {
  constructor(config = {}) {
    // Support both local CouchDB and Cloudant
    const url = config.url || process.env.CLOUDANT_URL || process.env.COUCHDB_URL || 'http://localhost:5984'
    const username = config.username || process.env.CLOUDANT_USERNAME || process.env.COUCHDB_USER || 'maia_admin'
    const password = config.password || process.env.CLOUDANT_PASSWORD || process.env.COUCHDB_PASSWORD || 'MaiaSecure2024!'
    const database = config.database || process.env.CLOUDANT_DATABASE || process.env.COUCHDB_DATABASE || 'maia3_chats'

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

  async initializeDatabase() {
    try {
      await this.db.db.create(this.databaseName)
      console.log(`✅ Database '${this.databaseName}' created`)
    } catch (error) {
      if (error.statusCode === 412) {
        console.log(`✅ Database '${this.databaseName}' already exists`)
      } else {
        console.error('❌ Failed to create database:', error)
        throw error
      }
    }
  }

  async createDatabase(databaseName) {
    try {
      await this.db.db.create(databaseName)
      console.log(`✅ Database '${databaseName}' created`)
      return true
    } catch (error) {
      if (error.statusCode === 412) {
        console.log(`✅ Database '${databaseName}' already exists`)
        return true
      } else {
        console.error('❌ Failed to create database:', error)
        throw error
      }
    }
  }

  async saveDocument(databaseName, document) {
    try {
      const db = this.db.use(databaseName)
      const result = await db.insert(document)
      return {
        id: result.id,
        rev: result.rev,
        ok: result.ok
      }
    } catch (error) {
      console.error('❌ Failed to save document:', error)
      throw error
    }
  }

  async getDocument(databaseName, documentId) {
    try {
      const db = this.db.use(databaseName)
      return await db.get(documentId)
    } catch (error) {
      if (error.statusCode === 404) {
        return null
      }
      console.error('❌ Failed to get document:', error)
      throw error
    }
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
      return result.rows.map(row => row.doc)
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
      console.log(`✅ Connected to ${serviceType}: ${info.version}`)
      return true
    } catch (error) {
      console.error('❌ Connection failed:', error)
      return false
    }
  }

  // Chat operations
  async saveChat(chatData) {
    try {
      // Debug: Log what's being saved
      console.log(`🔍 [COUCHDB] Saving chat document:`, {
        _id: chatData._id,
        type: chatData.type,
        uploadedFilesCount: chatData.uploadedFiles?.length || 0,
        firstFileStructure: chatData.uploadedFiles?.[0] ? {
          name: chatData.uploadedFiles[0].name,
          type: chatData.uploadedFiles[0].type,
          hasOriginalFile: !!chatData.uploadedFiles[0].originalFile,
          originalFileKeys: chatData.uploadedFiles[0].originalFile ? Object.keys(chatData.uploadedFiles[0].originalFile) : 'none'
        } : 'no files'
      });
      
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
      console.log(`🔍 [COUCHDB] Chat saved successfully: ${result.id}`);
      return {
        id: result.id,
        rev: result.rev,
        ok: result.ok
      }
    } catch (error) {
      console.error('❌ Failed to save chat:', error)
      throw error
    }
  }

  async getChat(chatId) {
    try {
      return await this.database.get(chatId)
    } catch (error) {
      if (error.statusCode === 404) {
        return null
      }
      console.error('❌ Failed to get chat:', error)
      throw error
    }
  }

  async getAllChats() {
    try {
      const result = await this.database.list({ include_docs: true })
      return result.rows
        .filter(row => !row.id.startsWith('_design/'))
        .map(row => row.doc)
    } catch (error) {
      console.error('❌ Failed to get all chats:', error)
      throw error
    }
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
      console.log('📄 Share ID view not found, scanning all documents...')
      try {
        const allChats = await this.getAllChats()
        return allChats.find(chat => chat.shareId === shareId) || null
      } catch (scanError) {
        console.error('❌ Failed to get chat by share ID:', scanError)
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
      console.log('✅ Share ID view created successfully')
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