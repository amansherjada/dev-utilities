/**
 * VECTOR DATABASE DOCUMENT EMBEDDER
 * 
 * A comprehensive Google Apps Script utility that transforms text documents into searchable 
 * vector embeddings and stores them in Pinecone vector database for semantic search and 
 * AI-powered document retrieval.
 * 
 * FEATURES:
 * ✅ Document chunking with splitting
 * ✅ Text embedding using Google Gemini AI
 * ✅ Pinecone vector database integration
 * ✅ Batch processing with rate limiting
 * ✅ Comprehensive error handling
 * ✅ Flexible namespace management
 * ✅ Built-in query functionality
 * ✅ Sample documents for testing
 * 
 * USE CASES:
 * • Build semantic search systems
 * • Create AI-powered document Q&A
 * • Enable content similarity matching
 * • Support RAG (Retrieval Augmented Generation) applications
 * 
 * WORKFLOW:
 * 1. Documents → Text chunks → Vector embeddings → Pinecone storage
 * 2. Query text → Vector embedding → Semantic search → Relevant results
 * 
 */

// Configuration - UPDATE THESE VALUES
const CONFIG = {
  GEMINI_API_KEY: 'YOUR_GEMINI_API_KEY_HERE',
  PINECONE_API_KEY: 'YOUR_PINECONE_API_KEY_HERE',
  PINECONE_HOST: 'YOUR_PINECONE_HOST_URL_HERE'
};

/**
 * STEP 1: Test Pinecone connection
 * Run this first to verify everything works
 */
function testPineconeConnection() {
  try {
    console.log('🔍 Testing Pinecone connection...');
    
    const response = UrlFetchApp.fetch(CONFIG.PINECONE_HOST + '/describe_index_stats', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Api-Key': CONFIG.PINECONE_API_KEY
      },
      payload: JSON.stringify({})
    });
    
    if (response.getResponseCode() === 200) {
      const stats = JSON.parse(response.getContentText());
      console.log('✅ Pinecone connection successful!');
      console.log('Index stats:', JSON.stringify(stats, null, 2));
      return true;
    } else {
      console.error(`❌ Pinecone connection failed: ${response.getResponseCode()}`);
      console.error('Response:', response.getContentText());
      return false;
    }
    
  } catch (error) {
    console.error('❌ Pinecone connection error:', error.toString());
    return false;
  }
}

/**
 * STEP 2: Embed your documents - MAIN FUNCTION (Does Everything!)
 * 
 * This is the primary function that handles the complete embedding pipeline:
 * • Processes your documents or uses samples
 * • Intelligently chunks text content
 * • Generates vector embeddings via Gemini AI
 * • Stores vectors in Pinecone with metadata
 * • Handles rate limiting and error recovery
 * • Reports progress and final statistics
 * 
 * Run this after testPineconeConnection() succeeds
 * 
 * @param {Object} documents - Object with document names as keys and content as values
 * @param {Object} options - Optional configuration (chunkSize, namespace, etc.)
 * @returns {Object} - {success: number, errors: number} statistics
 */
function embedDocuments(documents = null, options = {}) {
  // Use sample documents if none provided
  if (!documents) {
    documents = getSampleDocuments();
    console.log('📝 Using sample documents for demonstration...');
  }
  
  console.log('📝 Starting Document Embedding...');
  
  const settings = {
    chunkSize: options.chunkSize || 'auto',
    namespace: options.namespace || 'default',
    ...options
  };
  
  try {
    let totalSuccess = 0;
    let totalErrors = 0;
    
    // Process each document
    for (const [docName, content] of Object.entries(documents)) {
      console.log(`\n📄 Processing ${docName.toUpperCase()} document...`);
      
      const chunks = chunkDocument(content, docName, settings);
      console.log(`Created ${chunks.length} chunks for ${docName}`);
      
      const namespace = settings.namespace === 'auto' ? docName : settings.namespace;
      const results = storeChunksInPinecone(chunks, namespace);
      
      totalSuccess += results.success;
      totalErrors += results.errors;
      
      console.log(`✅ ${docName.toUpperCase()}: ${results.success} chunks embedded`);
      
      // Rate limiting between documents
      Utilities.sleep(3000);
    }
    
    console.log('\n🎉 EMBEDDING COMPLETE!');
    console.log(`✅ Total Success: ${totalSuccess} chunks`);
    console.log(`❌ Total Errors: ${totalErrors} chunks`);
    
    return { success: totalSuccess, errors: totalErrors };
    
  } catch (error) {
    console.error('❌ Error in embedding:', error.toString());
    return { success: 0, errors: 1 };
  }
}

/**
 * Sample documents for testing
 * Replace with your actual content
 */
function getSampleDocuments() {
  return {
    sample_policy: `Sample Policy Document

1. Introduction
This is a sample policy document that demonstrates the embedding functionality.

2. Guidelines
a. Follow all procedures outlined in this document.
b. Report any issues to the appropriate department.
c. Regular training sessions will be conducted.

3. Compliance
All employees must comply with these policies to ensure smooth operations.`,
    
    sample_manual: `Sample Manual

1. Getting Started
This manual provides step-by-step instructions for common procedures.

2. Basic Operations
a. Login to the system using your credentials.
b. Navigate to the appropriate section.
c. Complete your assigned tasks.

3. Troubleshooting
Contact support if you encounter any technical difficulties.`
  };
}

/**
 * Chunk document content intelligently
 * 
 * @param {string} content - Document content
 * @param {string} docName - Document identifier
 * @param {Object} settings - Chunking settings
 */
function chunkDocument(content, docName, settings = {}) {
  console.log(`Chunking ${docName} document...`);
  
  // Split by numbered sections (1., 2., etc.) and lettered subsections (a., b., etc.)
  const sections = content.split(/\n(?=\d+\.|[a-z]\.|[A-Z][a-z]+ [A-Z])/);
  
  const chunks = [];
  let chunkIndex = 0;
  
  for (let i = 0; i < sections.length; i++) {
    const section = sections[i].trim();
    
    // Skip very short sections
    if (section.length < 50) continue;
    
    // Further split large sections if needed
    const subChunks = settings.chunkSize !== 'auto' && section.length > settings.chunkSize 
      ? splitLargeSection(section, settings.chunkSize)
      : [section];
    
    for (const subChunk of subChunks) {
      chunks.push({
        id: `${docName}_chunk_${chunkIndex}`,
        text: subChunk,
        metadata: {
          docName: docName,
          chunkIndex: chunkIndex,
          sectionIndex: i,
          wordCount: subChunk.split(' ').length,
          source: 'document_embedder',
          timestamp: new Date().toISOString(),
          text: subChunk // Store text in metadata for retrieval
        }
      });
      
      chunkIndex++;
    }
  }
  
  console.log(`Created ${chunks.length} chunks for ${docName}`);
  return chunks;
}

/**
 * Split large sections into smaller chunks
 */
function splitLargeSection(text, maxSize) {
  if (text.length <= maxSize) return [text];
  
  const words = text.split(' ');
  const chunks = [];
  let currentChunk = '';
  
  for (const word of words) {
    if ((currentChunk + ' ' + word).length > maxSize && currentChunk) {
      chunks.push(currentChunk.trim());
      currentChunk = word;
    } else {
      currentChunk += (currentChunk ? ' ' : '') + word;
    }
  }
  
  if (currentChunk) chunks.push(currentChunk.trim());
  return chunks;
}

/**
 * Store chunks in Pinecone
 */
function storeChunksInPinecone(chunks, namespace) {
  console.log(`Storing ${chunks.length} chunks in namespace: ${namespace}`);
  
  let successCount = 0;
  let errorCount = 0;
  
  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i];
    
    try {
      console.log(`Processing chunk ${i + 1}/${chunks.length}: ${chunk.id}`);
      
      // Get embedding from Gemini
      const embedding = getEmbedding(chunk.text);
      
      if (!embedding) {
        console.error(`Failed to get embedding for chunk ${chunk.id}`);
        errorCount++;
        continue;
      }
      
      // Store in Pinecone
      const stored = storeToPinecone(chunk.id, embedding, chunk.metadata, namespace);
      
      if (stored) {
        successCount++;
        console.log(`✅ Stored: ${chunk.id}`);
      } else {
        errorCount++;
        console.log(`❌ Failed: ${chunk.id}`);
      }
      
      // Rate limiting
      Utilities.sleep(2000);
      
    } catch (error) {
      console.error(`Error processing chunk ${chunk.id}:`, error.toString());
      errorCount++;
    }
  }
  
  return { success: successCount, errors: errorCount };
}

/**
 * Get embedding from Gemini API
 */
function getEmbedding(text) {
  try {
    const response = UrlFetchApp.fetch(
      `https://generativelanguage.googleapis.com/v1/models/text-embedding-004:embedContent?key=${CONFIG.GEMINI_API_KEY}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        payload: JSON.stringify({
          content: {
            parts: [{ text: text }]
          }
        })
      }
    );
    
    if (response.getResponseCode() !== 200) {
      console.error(`Gemini API error: ${response.getResponseCode()}`);
      console.error('Response:', response.getContentText());
      return null;
    }
    
    const data = JSON.parse(response.getContentText());
    return data.embedding.values;
    
  } catch (error) {
    console.error('Error getting embedding:', error.toString());
    return null;
  }
}

/**
 * Store vector in Pinecone
 */
function storeToPinecone(id, embedding, metadata, namespace) {
  try {
    const response = UrlFetchApp.fetch(CONFIG.PINECONE_HOST + '/vectors/upsert', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Api-Key': CONFIG.PINECONE_API_KEY
      },
      payload: JSON.stringify({
        vectors: [
          {
            id: id,
            values: embedding,
            metadata: metadata
          }
        ],
        namespace: namespace
      })
    });
    
    if (response.getResponseCode() !== 200) {
      console.error(`Pinecone API error: ${response.getResponseCode()}`);
      console.error('Response:', response.getContentText());
      return false;
    }
    
    return true;
    
  } catch (error) {
    console.error('Error storing to Pinecone:', error.toString());
    return false;
  }
}

/**
 * Utility function to query Pinecone (bonus feature)
 */
function queryPinecone(queryText, topK = 5, namespace = 'default') {
  try {
    const embedding = getEmbedding(queryText);
    if (!embedding) return null;
    
    const response = UrlFetchApp.fetch(CONFIG.PINECONE_HOST + '/query', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Api-Key': CONFIG.PINECONE_API_KEY
      },
      payload: JSON.stringify({
        vector: embedding,
        topK: topK,
        namespace: namespace,
        includeMetadata: true
      })
    });
    
    if (response.getResponseCode() === 200) {
      return JSON.parse(response.getContentText());
    }
    return null;
    
  } catch (error) {
    console.error('Query error:', error.toString());
    return null;
  }
}
