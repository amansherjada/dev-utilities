/**
 * WHATSAPP HR ONBOARDING AUTOMATION BOT
 * 
 * An intelligent Google Apps Script system that automates employee onboarding 
 * through WhatsApp messaging at scheduled intervals (Day 0, 30, 60, 90).
 * 
 * FEATURES:
 * ✅ Automated onboarding message scheduling
 * ✅ WhatsApp integration via WAHA API
 * ✅ Employee type-specific messaging (Salon/BackOffice)
 * ✅ Progress tracking in Google Sheets
 * ✅ Message personalization with employee names
 * ✅ Smart duplicate prevention
 * ✅ Comprehensive error handling & logging
 * ✅ Manual testing capabilities
 * 
 * WORKFLOW:
 * 1. HR adds new employee to Google Sheet
 * 2. System automatically calculates message schedule
 * 3. Sends personalized WhatsApp messages at intervals
 * 4. Updates delivery status in Google Sheet
 * 5. Continues monitoring for all employees
 * 
 * USE CASES:
 * • Employee onboarding automation
 * • HR communication scheduling
 * • Welcome message sequences
 * • Milestone congratulations
 * • Check-in and feedback requests
 * 
 * MAIN FUNCTION: checkAndSendMessages() - Handles complete automation
 * 
 */

// ========================================
// CONFIGURATION - UPDATE THESE VALUES
// ========================================
const WAHA_CONFIG = {
  BASE_URL: 'YOUR_WAHA_SERVER_URL_HERE',     // e.g., 'https://waha.yourserver.com'
  API_KEY: 'YOUR_WAHA_API_KEY_HERE',         // Your WAHA API authentication key
  SESSION_NAME: 'YOUR_SESSION_NAME_HERE'     // Your WhatsApp session identifier
};

const GOOGLE_SHEET_CONFIG = {
  SHEET_NAME: 'Sheet1'  // Name of the Google Sheet containing employee data
};

// Google Docs containing message templates - UPDATE THESE DOC IDs
const MESSAGE_TEMPLATES = {
  salon_day0: 'YOUR_SALON_WELCOME_DOC_ID_HERE',
  backoffice_day0: 'YOUR_BACKOFFICE_WELCOME_DOC_ID_HERE',
  day30: 'YOUR_30DAY_MESSAGE_DOC_ID_HERE',
  day60: 'YOUR_60DAY_MESSAGE_DOC_ID_HERE',
  day90: 'YOUR_90DAY_MESSAGE_DOC_ID_HERE'
};

// Google Sheet column mapping (0-based indexing)
const SHEET_COLUMNS = {
  NAME: 0,           // Employee full name
  PHONE: 1,          // Phone number for WhatsApp
  JOIN_DATE: 2,      // Date employee joined
  LAST_SENT: 3,      // Timestamp of last message sent
  SENT_MESSAGE: 4,   // Tracking string of sent messages
  MESSAGE0: 5,       // Day 0 message status
  MESSAGE1: 6,       // Day 30 message status  
  MESSAGE2: 7,       // Day 60 message status
  MESSAGE3: 8,       // Day 90 message status
  STATUS: 9,         // Employee status (Active/Inactive)
  TYPE: 10          // Employee type (Salon/BackOffice)
};

// Message schedule configuration
const MESSAGE_SCHEDULE = [
  { day: 0, key: 'day0', column: 'MESSAGE0' },
  { day: 30, key: 'day30', column: 'MESSAGE1' },
  { day: 60, key: 'day60', column: 'MESSAGE2' },
  { day: 90, key: 'day90', column: 'MESSAGE3' }
];

/**
 * ========================================
 * MAIN AUTOMATION FUNCTION - Processes all employees and sends scheduled messages
 * 
 * This function handles the complete onboarding automation:
 * • Reads employee data from Google Sheet
 * • Calculates days since joining for each employee
 * • Determines which messages need to be sent
 * • Sends personalized WhatsApp messages via WAHA
 * • Updates Google Sheet with delivery status
 * • Handles errors and provides comprehensive logging
 * ========================================
 */
function checkAndSendMessages() {
  console.log('🤖 Starting HR Onboarding Automation...');
  
  try {
    // Get the Google Sheet with employee data
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(GOOGLE_SHEET_CONFIG.SHEET_NAME);
    if (!sheet) {
      console.error(`❌ Sheet "${GOOGLE_SHEET_CONFIG.SHEET_NAME}" not found`);
      return { success: false, error: 'Sheet not found' };
    }
    
    const employeeData = sheet.getDataRange().getValues();
    console.log(`📊 Processing ${employeeData.length - 1} employees...`);
    
    let processedCount = 0;
    let sentCount = 0;
    let errorCount = 0;
    
    // Process each employee (skip header row)
    for (let i = 1; i < employeeData.length; i++) {
      const employee = employeeData[i];
      
      // Skip incomplete rows
      if (!employee[SHEET_COLUMNS.NAME] || !employee[SHEET_COLUMNS.PHONE] || !employee[SHEET_COLUMNS.JOIN_DATE]) {
        continue;
      }
      
      processedCount++;
      
      // Extract employee information
      const employeeInfo = {
        name: employee[SHEET_COLUMNS.NAME],
        phone: formatPhoneForWhatsApp(employee[SHEET_COLUMNS.PHONE]),
        joinDate: new Date(employee[SHEET_COLUMNS.JOIN_DATE]),
        sentMessages: employee[SHEET_COLUMNS.SENT_MESSAGE] || '',
        type: employee[SHEET_COLUMNS.TYPE] || 'Salon',
        rowIndex: i + 1 // 1-based for Google Sheets
      };
      
      // Calculate days since joining
      const today = new Date();
      const daysSinceJoin = Math.floor((today - employeeInfo.joinDate) / (1000 * 60 * 60 * 24));
      
      console.log(`👤 Processing ${employeeInfo.name}: ${daysSinceJoin} days since joining`);
      
      // Check which message should be sent
      const messageResult = processEmployeeMessages(employeeInfo, daysSinceJoin, sheet);
      
      if (messageResult.sent) {
        sentCount++;
        // Add delay between messages to avoid rate limiting
        Utilities.sleep(2000);
      } else if (messageResult.error) {
        errorCount++;
      }
    }
    
    console.log('\n✅ HR Automation Complete!');
    console.log(`📊 Processed: ${processedCount} employees`);
    console.log(`📤 Messages Sent: ${sentCount}`);
    console.log(`❌ Errors: ${errorCount}`);
    
    return { 
      success: true, 
      processed: processedCount, 
      sent: sentCount, 
      errors: errorCount 
    };
    
  } catch (error) {
    console.error('❌ Critical error in HR automation:', error.toString());
    return { success: false, error: error.toString() };
  }
}

/**
 * Process messages for a single employee
 * Determines which message to send based on days since joining
 */
function processEmployeeMessages(employeeInfo, daysSinceJoin, sheet) {
  try {
    // Find the appropriate message to send
    for (const schedule of MESSAGE_SCHEDULE) {
      if (daysSinceJoin >= schedule.day && !employeeInfo.sentMessages.includes(schedule.key)) {
        
        // Determine message template based on employee type and day
        let messageTemplateKey;
        if (schedule.key === 'day0') {
          messageTemplateKey = employeeInfo.type.toLowerCase() === 'salon' ? 'salon_day0' : 'backoffice_day0';
        } else {
          messageTemplateKey = schedule.key;
        }
        
        // Get message content from Google Doc
        const messageContent = getMessageTemplate(MESSAGE_TEMPLATES[messageTemplateKey]);
        if (!messageContent) {
          console.error(`❌ Failed to load message template: ${messageTemplateKey}`);
          return { sent: false, error: 'Template load failed' };
        }
        
        // Send WhatsApp message
        const messageSent = sendWhatsAppMessage(
          employeeInfo.phone, 
          messageContent, 
          employeeInfo.name
        );
        
        if (messageSent) {
          // Update Google Sheet with success status
          updateEmployeeRecord(sheet, employeeInfo.rowIndex, schedule, true);
          console.log(`✅ ${schedule.key} message sent to ${employeeInfo.name}`);
          return { sent: true };
        } else {
          console.error(`❌ Failed to send ${schedule.key} message to ${employeeInfo.name}`);
          return { sent: false, error: 'Message send failed' };
        }
      }
    }
    
    // No message needed for this employee
    return { sent: false, reason: 'No message due' };
    
  } catch (error) {
    console.error(`❌ Error processing ${employeeInfo.name}:`, error.toString());
    return { sent: false, error: error.toString() };
  }
}

/**
 * ========================================
 * WHATSAPP MESSAGING FUNCTIONS
 * ========================================
 */

/**
 * Send personalized WhatsApp message via WAHA API
 * Handles connection testing, message formatting, and delivery
 */
function sendWhatsAppMessage(phone, messageTemplate, employeeName) {
  console.log(`📱 Sending WhatsApp message to ${phone}...`);
  
  try {
    // Test WAHA connection first
    const connectionStatus = testWAHAConnection();
    if (!connectionStatus.success) {
      console.error('❌ WAHA connection failed:', connectionStatus.error);
      return false;
    }

    // Personalize message with employee name
    const personalizedMessage = messageTemplate.replace(/\{name\}/g, employeeName);
    
    // Prepare WhatsApp message payload
    const messagePayload = {
      session: WAHA_CONFIG.SESSION_NAME,
      chatId: phone + '@c.us',
      text: personalizedMessage
    };
    
    // Configure HTTP request options
    const requestOptions = {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Api-Key': WAHA_CONFIG.API_KEY
      },
      payload: JSON.stringify(messagePayload)
    };
    
    console.log(`📤 Sending to: ${phone}@c.us via session: ${WAHA_CONFIG.SESSION_NAME}`);
    
    // Send message via WAHA API
    const response = UrlFetchApp.fetch(WAHA_CONFIG.BASE_URL + '/api/sendText', requestOptions);
    const responseCode = response.getResponseCode();
    const responseBody = response.getContentText();
    
    console.log(`📡 WAHA Response: ${responseCode}`);
    console.log(`📄 Response Body: ${responseBody.substring(0, 100)}...`);
    
    // Check if message was sent successfully
    if (responseCode === 200 || responseCode === 201) {
      console.log('✅ WhatsApp message delivered successfully');
      return true;
    } else {
      console.error(`❌ WAHA API error: ${responseCode} - ${responseBody}`);
      return false;
    }
    
  } catch (error) {
    console.error(`❌ WhatsApp messaging error:`, error.toString());
    return false;
  }
}

/**
 * Test WAHA connection and session status
 */
function testWAHAConnection() {
  console.log('🔍 Testing WAHA connection...');
  
  try {
    const testOptions = {
      method: 'GET',
      headers: { 'X-Api-Key': WAHA_CONFIG.API_KEY }
    };
    
    const response = UrlFetchApp.fetch(WAHA_CONFIG.BASE_URL + '/api/sessions', testOptions);
    
    if (response.getResponseCode() !== 200) {
      return { 
        success: false, 
        error: `WAHA server returned status ${response.getResponseCode()}` 
      };
    }
    
    const sessions = JSON.parse(response.getContentText());
    const targetSession = sessions.find(session => session.name === WAHA_CONFIG.SESSION_NAME);
    
    if (!targetSession || targetSession.status !== 'WORKING') {
      return { 
        success: false, 
        error: `Session ${WAHA_CONFIG.SESSION_NAME} is not in WORKING status` 
      };
    }
    
    console.log('✅ WAHA connection verified, session is operational');
    return { success: true };
    
  } catch (error) {
    return { success: false, error: error.toString() };
  }
}

/**
 * Format phone number for WhatsApp (Indian format)
 */
function formatPhoneForWhatsApp(phoneInput) {
  // Remove all non-digit characters
  let cleanPhone = phoneInput.toString().replace(/\D/g, '');
  
  // Add India country code if not present
  if (cleanPhone.length === 10) {
    cleanPhone = '91' + cleanPhone;
  }
  
  return cleanPhone;
}

/**
 * ========================================
 * GOOGLE DOCS & SHEETS FUNCTIONS
 * ========================================
 */

/**
 * Retrieve message template from Google Doc
 */
function getMessageTemplate(documentId) {
  console.log(`📄 Loading message template from document: ${documentId}`);
  
  try {
    const document = DocumentApp.openById(documentId);
    const documentBody = document.getBody();
    const messageContent = documentBody.getText();
    
    console.log(`✅ Message template loaded: ${messageContent.substring(0, 50)}...`);
    return messageContent;
    
  } catch (error) {
    console.error(`❌ Error loading document ${documentId}:`, error.toString());
    return null;
  }
}

/**
 * Update employee record in Google Sheet after successful message delivery
 */
function updateEmployeeRecord(sheet, rowIndex, messageSchedule, success) {
  try {
    if (success) {
      // Update message-specific column
      const columnIndex = SHEET_COLUMNS[messageSchedule.column];
      sheet.getRange(rowIndex, columnIndex + 1).setValue('Sent');
      
      // Update last sent timestamp
      sheet.getRange(rowIndex, SHEET_COLUMNS.LAST_SENT + 1).setValue(new Date());
      
      // Update employee status
      sheet.getRange(rowIndex, SHEET_COLUMNS.STATUS + 1).setValue('Active');
      
      // Update sent messages tracking
      updateSentMessageTracking(sheet, rowIndex, messageSchedule.key);
      
      console.log(`📊 Updated sheet record for row ${rowIndex}`);
    }
  } catch (error) {
    console.error(`❌ Error updating sheet record:`, error.toString());
  }
}

/**
 * Update the sent messages tracking column
 */
function updateSentMessageTracking(sheet, rowIndex, messageKey) {
  try {
    const currentTracking = sheet.getRange(rowIndex, SHEET_COLUMNS.SENT_MESSAGE + 1).getValue() || '';
    const updatedTracking = currentTracking ? `${currentTracking}, ${messageKey}` : messageKey;
    sheet.getRange(rowIndex, SHEET_COLUMNS.SENT_MESSAGE + 1).setValue(updatedTracking);
  } catch (error) {
    console.error('❌ Error updating message tracking:', error.toString());
  }
}

/**
 * ========================================
 * TESTING & UTILITY FUNCTIONS
 * ========================================
 */

/**
 * Test message sending with a single employee
 * Use this function to test your setup before running automation
 */
function testSingleMessage() {
  console.log('🧪 Testing single WhatsApp message...');
  
  const TEST_CONFIG = {
    phone: 'YOUR_TEST_PHONE_NUMBER_HERE',  // Replace with your test number
    name: 'Test Employee',
    message: 'Hello {name}, this is a test message from the HR Onboarding Bot! 🤖'
  };
  
  const success = sendWhatsAppMessage(TEST_CONFIG.phone, TEST_CONFIG.message, TEST_CONFIG.name);
  
  if (success) {
    console.log('✅ Test message sent successfully!');
  } else {
    console.log('❌ Test message failed. Check your configuration.');
  }
  
  return success;
}

/**
 * Process only employees who joined today
 * Useful for immediate welcome messages
 */
function processNewHiresToday() {
  console.log('👋 Processing new hires for today...');
  
  try {
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(GOOGLE_SHEET_CONFIG.SHEET_NAME);
    const employeeData = sheet.getDataRange().getValues();
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    let processedToday = 0;
    
    for (let i = 1; i < employeeData.length; i++) {
      const employee = employeeData[i];
      
      if (!employee[SHEET_COLUMNS.NAME] || !employee[SHEET_COLUMNS.PHONE] || !employee[SHEET_COLUMNS.JOIN_DATE]) {
        continue;
      }
      
      const joinDate = new Date(employee[SHEET_COLUMNS.JOIN_DATE]);
      joinDate.setHours(0, 0, 0, 0);
      
      // Check if employee joined today
      if (joinDate.getTime() === today.getTime()) {
        const employeeInfo = {
          name: employee[SHEET_COLUMNS.NAME],
          phone: formatPhoneForWhatsApp(employee[SHEET_COLUMNS.PHONE]),
          sentMessages: employee[SHEET_COLUMNS.SENT_MESSAGE] || '',
          type: employee[SHEET_COLUMNS.TYPE] || 'Salon'
        };
        
        // Send welcome message if not already sent
        if (!employeeInfo.sentMessages.includes('day0')) {
          const messageTemplateKey = employeeInfo.type.toLowerCase() === 'salon' ? 'salon_day0' : 'backoffice_day0';
          const messageContent = getMessageTemplate(MESSAGE_TEMPLATES[messageTemplateKey]);
          
          if (messageContent) {
            const success = sendWhatsAppMessage(employeeInfo.phone, messageContent, employeeInfo.name);
            
            if (success) {
              // Update sheet with welcome message status
              updateEmployeeRecord(sheet, i + 1, { column: 'MESSAGE0', key: 'day0' }, true);
              processedToday++;
              console.log(`✅ Welcome message sent to ${employeeInfo.name}`);
              Utilities.sleep(2000);
            }
          }
        }
      }
    }
    
    console.log(`📊 Processed ${processedToday} new hires today`);
    return processedToday;
    
  } catch (error) {
    console.error('❌ Error processing new hires:', error.toString());
    return 0;
  }
}

/**
 * Manual trigger function for Google Apps Script
 * Run this function manually to start the automation
 */
function runHRAutomation() {
  console.log('🚀 Manual HR Automation trigger activated...');
  return checkAndSendMessages();
}

/**
 * Sheet edit trigger - automatically runs when Google Sheet is edited
 * Set up as an installable trigger in Google Apps Script
 */
function onSheetEdit(event) {
  try {
    console.log('📝 Sheet edit detected, starting automation check...');
    
    // Verify edit was in target sheet
    if (event && event.source && event.source.getActiveSheet().getName() !== GOOGLE_SHEET_CONFIG.SHEET_NAME) {
      console.log('Edit was in different sheet, ignoring...');
      return;
    }
    
    // Small delay to ensure data is saved
    Utilities.sleep(3000);
    
    // Run automation check
    checkAndSendMessages();
    
  } catch (error) {
    console.error('❌ Error in sheet edit trigger:', error.toString());
    // Fallback: run automation anyway
    checkAndSendMessages();
  }
}
