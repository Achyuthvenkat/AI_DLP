// Enhanced background service worker with server communication
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
    
    console.log("📤 Sending event to server:", eventData.type, "from device:", deviceId);
    
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
            label: "Sensitive",
            confidence: 0.8
          },
          sklearn_classification: {
            label: "Sensitive",
            confidence: 0.8
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

// Handle messages from content scripts
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log("📨 Received message:", message.type, "from", sender?.tab?.url);
  
  if (!message || !message.type) {
    sendResponse({ status: "ignored" });
    return;
  }
  
  // Handle different message types
  switch (message.type) {
    case "sensitive_detected":
      console.warn("🚨 Sensitive data detected:", message.matches, "on", sender?.tab?.url, "from device:", message.device_id);
      
      // Update stats and store block
      updateStats(message);
      
      // Show notification with device ID
      try {
        chrome.notifications.create({
          type: "basic",
          iconUrl: "icon48.png",
          title: "🚨 AI DLP - Sensitive Data Blocked",
          message: `Device: ${message.device_id || 'Unknown'}\nDetected: ${message.matches.join(", ")} on ${sender?.tab?.url || 'unknown site'}`
        });
      } catch (e) {
        console.error("Failed to show notification:", e);
      }
      
      // Send to server
      sendToServer({
        type: "browser_input_blocked",
        url: message.url,
        matches: message.matches,
        snippet: message.snippet,
        device_id: message.device_id
      });
      
      sendResponse({ status: "reported" });
      break;
      
    case "form_blocked":
      console.warn("🚨 Form submission blocked:", message.matches, "on", sender?.tab?.url, "from device:", message.device_id);
      
      // Update stats and store block
      updateStats(message);
      
      // Show notification with device ID
      try {
        chrome.notifications.create({
          type: "basic",
          iconUrl: "icon48.png",
          title: "🚨 AI DLP - Form Submission Blocked",
          message: `Device: ${message.device_id || 'Unknown'}\nBlocked form with: ${message.matches.join(", ")}`
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
        device_id: message.device_id
      });
      
      sendResponse({ status: "blocked" });
      break;
      
    case "file_blocked":
      console.warn("🚨 File upload blocked:", message.filename, "on", sender?.tab?.url, "from device:", message.device_id);
      
      // Update stats and store block
      updateStats(message);
      
      // Show notification with device ID
      try {
        chrome.notifications.create({
          type: "basic",
          iconUrl: "icon48.png",
          title: "🚨 AI DLP - File Upload Blocked",
          message: `Device: ${message.device_id || 'Unknown'}\nBlocked file: ${message.filename}`
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
        device_id: message.device_id
      });
      
      sendResponse({ status: "file_blocked" });
      break;
      
    case "content_loaded":
      console.log("✅ Content script loaded on:", message.url, "device:", message.device_id);
      sendResponse({ status: "acknowledged" });
      break;
      
    default:
      console.log("❓ Unknown message type:", message.type);
      sendResponse({ status: "unknown" });
  }
  
  return true; // Keep message channel open for async response
});

// Update statistics
async function updateStats(blockData) {
  try {
    // Update daily stats
    const result = await chrome.storage.local.get(['dlp_stats']);
    const stats = result.dlp_stats || { blocks_today: 0, total_blocks: 0 };
    
    // Check if it's a new day
    const today = new Date().toDateString();
    const lastDate = stats.last_date || '';
    
    if (lastDate !== today) {
      stats.blocks_today = 0;
      stats.last_date = today;
    }
    
    stats.blocks_today++;
    stats.total_blocks++;
    
    await chrome.storage.local.set({ dlp_stats: stats });
    
    // Store recent blocks (keep last 50) with device ID
    const blocksResult = await chrome.storage.local.get(['recent_blocks']);
    const blocks = blocksResult.recent_blocks || [];
    
    blocks.push({
      timestamp: blockData.timestamp || Date.now(),
      matches: blockData.matches,
      url: blockData.url,
      type: blockData.type,
      device_id: blockData.device_id || 'Unknown'
    });
    
    // Keep only last 50 blocks
    if (blocks.length > 50) {
      blocks.splice(0, blocks.length - 50);
    }
    
    await chrome.storage.local.set({ recent_blocks: blocks });
    
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

console.log("✅ AI DLP Browser Extension background script initialized");