// Enhanced background service worker with AI platform differentiation
console.log("🚀 AI DLP Browser Extension background service worker starting");

const SERVER_URL = "http://10.160.14.76:8059/api/report";
let JWT_TOKEN = null;

// Initialize
chrome.runtime.onInstalled.addListener(() => {
  console.log("AI DLP Browser Extension installed");
  fetchJWTToken();
});

chrome.runtime.onStartup.addListener(() => {
  console.log("AI DLP Browser Extension starting up");
  fetchJWTToken();
});

// Get device ID from storage
async function getDeviceId() {
  try {
    const result = await chrome.storage.local.get(['device_id']);
    return result.device_id || `browser_extension_${Date.now()}`;
  } catch (error) {
    console.error('Error getting device ID:', error);
    return `browser_extension_${Date.now()}`;
  }
}

// Fetch JWT token from server
async function fetchJWTToken() {
  try {
    console.log("🔄 Attempting to fetch JWT token from server...");
    
    const deviceId = await getDeviceId();
    console.log("📱 Using device ID for token request:", deviceId);
    
    const response = await fetch("http://10.160.14.76:8059/api/token", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        device_id: deviceId
      })
    });
    
    console.log("📡 Server response status:", response.status);
    
    if (response.ok) {
      const data = await response.json();
      JWT_TOKEN = data.token;
      console.log("✅ JWT Token obtained for browser extension");
    } else {
      const errorText = await response.text();
      console.error("❌ Failed to get JWT token:", response.status, errorText);
      console.log("🔧 Check if your DLP server is running on http://10.160.14.76:8059");
      
      // Use fallback token
      JWT_TOKEN = "browser_fallback_token";
      console.log("⚠️ Using fallback token for testing");
    }
  } catch (error) {
    console.error("❌ Network error fetching JWT token:", error.message);
    console.log("🔧 Possible issues:");
    console.log("   - DLP server not running on http://10.160.14.76:8059");
    console.log("   - CORS configuration issue");
    console.log("   - Network connectivity problem");
    
    // Fallback token for testing
    JWT_TOKEN = "browser_fallback_token";
    console.log("⚠️ Using fallback token for testing");
  }
}

// Send data to server
async function sendToServer(eventData) {
  if (!JWT_TOKEN) {
    console.warn("⚠️ No JWT token available, attempting to fetch...");
    await fetchJWTToken();
  }
  
  const deviceId = await getDeviceId();
  
  try {
    const headers = {
      "Content-Type": "application/json"
    };
    
    if (JWT_TOKEN && JWT_TOKEN !== "browser_fallback_token") {
      headers["Authorization"] = `Bearer ${JWT_TOKEN}`;
    }
    
    console.log("📤 Sending event to server:", eventData.type, "from device:", deviceId, "site type:", eventData.site_type);
    
    const response = await fetch(SERVER_URL, {
      method: "POST",
      headers: headers,
      body: JSON.stringify({
        events: [{
          device_id: eventData.device_id || deviceId,
          user_email: "browser_user",
          event_type: eventData.type,
          target: eventData.url,
          snippet: eventData.snippet,
          detector_hits: eventData.matches ? eventData.matches.reduce((acc, match) => {
            acc[match.toLowerCase()] = [match];
            return acc;
          }, {}) : {},
          ai_classification: {
            label: eventData.site_type === 'ai_platform' ? "Sensitive" : "Sensitive",
            confidence: 0.8
          },
          sklearn_classification: {
            label: eventData.site_type === 'ai_platform' ? "Sensitive" : "Sensitive",
            confidence: 0.8
          },
          metadata: {
            site_type: eventData.site_type,
            behavior: eventData.behavior,
            user_action: eventData.user_action || null
          }
        }]
      })
    });
    
    if (response.ok) {
      const result = await response.json();
      console.log("✅ Successfully sent event to server:", eventData.type, result);
    } else {
      const errorText = await response.text();
      console.error("❌ Failed to send to server:", response.status, errorText);
      
      if (response.status === 401) {
        console.log("🔄 Token might be expired, trying to refresh...");
        await fetchJWTToken();
      }
    }
  } catch (error) {
    console.error("❌ Network error sending to server:", error.message);
    console.log("📝 Event will be lost:", eventData.type, "on", eventData.url, "from device:", deviceId);
  }
}

// Get notification message based on site type and behavior
function getNotificationMessage(message, isAIPlatform) {
  const siteType = isAIPlatform ? 'AI Platform' : 'Business Platform';
  const action = isAIPlatform ? 'Blocked' : 'Warning';
  
  return `${action} on ${siteType}\nDevice: ${message.device_id || 'Unknown'}\nDetected: ${message.matches?.join(", ") || 'Sensitive data'}`;
}

// Handle messages from content scripts
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log("📨 Received message:", message.type, "from", sender?.tab?.url, "site type:", message.site_type);
  
  if (!message || !message.type) {
    sendResponse({ status: "ignored" });
    return;
  }
  
  const isAIPlatform = message.site_type === 'ai_platform';
  
  // Handle different message types
  switch (message.type) {
    case "sensitive_detected":
    case "sensitive_blocked":
      const action = message.type === "sensitive_blocked" ? "blocked" : "detected";
      console.log(`${isAIPlatform ? '🚨' : '⚠️'} Sensitive data ${action}:`, message.matches, "on", sender?.tab?.url, "from device:", message.device_id);
      
      // Update stats and store event
      updateStats(message);
      
      // Show notification with appropriate messaging
      try {
        const notificationTitle = isAIPlatform ? "🚨 AI DLP - Sensitive Data Blocked" : "⚠️ AI DLP - Sensitive Data Warning";
        chrome.notifications.create({
          type: "basic",
          iconUrl: "icon48.png",
          title: notificationTitle,
          message: getNotificationMessage(message, isAIPlatform)
        });
      } catch (e) {
        console.error("Failed to show notification:", e);
      }
      
      // Send to server
      sendToServer({
        type: isAIPlatform ? "browser_input_blocked" : "browser_input_warning",
        url: message.url,
        matches: message.matches,
        snippet: message.snippet,
        device_id: message.device_id,
        site_type: message.site_type,
        behavior: message.behavior
      });
      
      sendResponse({ status: isAIPlatform ? "blocked" : "warned" });
      break;
      
    case "form_blocked":
      console.warn("🚨 Form submission blocked:", message.matches, "on", sender?.tab?.url, "from device:", message.device_id);
      
      // Update stats and store block
      updateStats(message);
      
      // Show notification
      try {
        chrome.notifications.create({
          type: "basic",
          iconUrl: "icon48.png",
          title: "🚨 AI DLP - Form Submission Blocked",
          message: `AI Platform Block\nDevice: ${message.device_id || 'Unknown'}\nBlocked form with: ${message.matches.join(", ")}`
        });
      } catch (e) {
        console.error("Failed to show notification:", e);
      }
      
      // Send to server
      sendToServer({
        type: "browser_form_blocked",
        url: message.url,
        matches: message.matches,
        snippet: message.snippet,
        device_id: message.device_id,
        site_type: message.site_type
      });
      
      sendResponse({ status: "blocked" });
      break;
      
    case "form_warning":
      console.warn("⚠️ Form submission warning:", message.matches, "on", sender?.tab?.url, "from device:", message.device_id);
      
      // Update stats and store warning
      updateStats({ ...message, type: "sensitive_warning" });
      
      // Send to server
      sendToServer({
        type: "browser_form_warning",
        url: message.url,
        matches: message.matches,
        snippet: message.snippet,
        device_id: message.device_id,
        site_type: message.site_type
      });
      
      sendResponse({ status: "warned" });
      break;
      
    case "file_blocked":
      console.warn("🚨 File upload blocked:", message.filename, "on", sender?.tab?.url, "from device:", message.device_id);
      
      // Update stats and store block
      updateStats(message);
      
      // Show notification
      try {
        chrome.notifications.create({
          type: "basic",
          iconUrl: "icon48.png",
          title: "🚨 AI DLP - File Upload Blocked",
          message: `AI Platform Block\nDevice: ${message.device_id || 'Unknown'}\nBlocked file: ${message.filename}`
        });
      } catch (e) {
        console.error("Failed to show notification:", e);
      }
      
      // Send to server
      sendToServer({
        type: "browser_file_blocked",
        url: message.url,
        matches: message.matches,
        snippet: `File: ${message.filename}`,
        device_id: message.device_id,
        site_type: message.site_type
      });
      
      sendResponse({ status: "file_blocked" });
      break;
      
    case "file_warning":
      console.warn("⚠️ File upload warning:", message.filename, "on", sender?.tab?.url, "from device:", message.device_id);
      
      // Update stats and store warning
      updateStats({ ...message, type: "sensitive_warning" });
      
      // Send to server
      sendToServer({
        type: "browser_file_warning",
        url: message.url,
        matches: message.matches,
        snippet: `File: ${message.filename}`,
        device_id: message.device_id,
        site_type: message.site_type
      });
      
      sendResponse({ status: "file_warned" });
      break;
      
    case "warning_acknowledged":
      console.log("ℹ️ User acknowledged warning and chose to proceed:", message.user_action, "on", sender?.tab?.url);
      
      // Send acknowledgment to server
      sendToServer({
        type: "browser_warning_acknowledged",
        url: message.url,
        matches: message.matches,
        snippet: message.snippet,
        device_id: message.device_id,
        user_action: message.user_action,
        site_type: "business_platform"
      });
      
      sendResponse({ status: "acknowledged" });
      break;
      
    case "content_loaded":
      console.log("✅ Content script loaded on:", message.url, "device:", message.device_id, "behavior:", message.behavior);
      sendResponse({ status: "acknowledged" });
      break;
      
    default:
      console.log("❓ Unknown message type:", message.type);
      sendResponse({ status: "unknown" });
  }
  
  return true; // Keep message channel open for async response
});

// Update statistics - modified to handle warnings vs blocks
async function updateStats(eventData) {
  try {
    // Update daily stats
    const result = await chrome.storage.local.get(['dlp_stats']);
    const stats = result.dlp_stats || { 
      blocks_today: 0, 
      warnings_today: 0,
      total_blocks: 0, 
      total_warnings: 0
    };
    
    // Check if it's a new day
    const today = new Date().toDateString();
    const lastDate = stats.last_date || '';
    
    if (lastDate !== today) {
      stats.blocks_today = 0;
      stats.warnings_today = 0;
      stats.last_date = today;
    }
    
    // Increment appropriate counters
    const isWarning = eventData.type?.includes('warning') || eventData.site_type === 'business_platform';
    
    if (isWarning) {
      stats.warnings_today++;
      stats.total_warnings = (stats.total_warnings || 0) + 1;
    } else {
      stats.blocks_today++;
      stats.total_blocks++;
    }
    
    await chrome.storage.local.set({ dlp_stats: stats });
    
    // Store recent events (keep last 50) with site type and behavior
    const eventsResult = await chrome.storage.local.get(['recent_blocks']);
    const events = eventsResult.recent_blocks || [];
    
    events.push({
      timestamp: eventData.timestamp || Date.now(),
      matches: eventData.matches,
      url: eventData.url,
      type: eventData.type,
      device_id: eventData.device_id || 'Unknown',
      site_type: eventData.site_type || 'unknown',
      behavior: isWarning ? 'WARNING' : 'BLOCK'
    });
    
    // Keep only last 50 events
    if (events.length > 50) {
      events.splice(0, events.length - 50);
    }
    
    await chrome.storage.local.set({ recent_blocks: events });
    
    // Notify popup if open
    try {
      chrome.runtime.sendMessage({ type: 'stats_updated' });
    } catch (e) {
      // Ignore if no popup is listening
    }
    
  } catch (error) {
    console.error('Error updating stats:', error);
  }
}

// Periodic token refresh (every 30 minutes)
setInterval(() => {
  fetchJWTToken();
}, 30 * 60 * 1000);

console.log("✅ AI DLP Browser Extension background script initialized with AI platform differentiation");