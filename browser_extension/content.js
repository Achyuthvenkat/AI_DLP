// Enhanced content script with AI platform detection and different blocking behaviors
console.log("✅ AI DLP Browser Extension content script injected on", location.href);

// Global variable to store device ID
let currentDeviceId = 'Unknown-Device';

// Load device ID on startup
loadDeviceId();

async function loadDeviceId() {
  try {
    const result = await chrome.storage.local.get(['device_id']);
    if (result.device_id) {
      currentDeviceId = result.device_id;
      console.log('📱 Device ID loaded in content script:', currentDeviceId);
    } else {
      console.log('📱 No device ID configured');
    }
  } catch (error) {
    console.error('Error loading device ID in content script:', error);
  }
}

// AI Platforms that should BLOCK sensitive data
const AI_PLATFORMS = [
  'chat.openai.com',
  'claude.ai',
  'bard.google.com',
  'gemini.google.com',
  'copilot.microsoft.com',
  'poe.com',
  'huggingface.co',
  'perplexity.ai',
  'deepseek.com',
  'anthropic.com',
  'chatgpt.com',
  'bing.com/chat',
  'you.com',
  'character.ai',
  'replika.ai',
  'jasper.ai',
  'writesonic.com',
  'copy.ai'
];

// Check if current site is an AI platform
function isAIPlatform() {
  const hostname = window.location.hostname.toLowerCase();
  return AI_PLATFORMS.some(platform => 
    hostname === platform || 
    hostname.endsWith('.' + platform) || 
    hostname.includes(platform.split('.')[0])
  );
}

// Get current site behavior (block for AI, warn for others)
function getSiteBehavior() {
  return isAIPlatform() ? 'BLOCK' : 'WARN';
}

function isTextInput(el) {
  if (!el) return false;
  if (el.tagName === "TEXTAREA") return true;
  if (el.tagName === "INPUT") {
    const t = (el.type || "").toLowerCase();
    return ["text","search","email","url","tel"].includes(t);
  }
  if (el.isContentEditable) return true;
  return false;
}

function getElementText(el) {
  if (!el) return "";
  if (el.tagName === "INPUT" || el.tagName === "TEXTAREA") return el.value || "";
  if (el.isContentEditable) return el.innerText || el.textContent || "";
  return "";
}

// Show warning popup (for non-AI platforms)
function showWarningPopup(matches, text, behavior) {
  const popup = document.createElement('div');
  popup.style.cssText = `
    position: fixed;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    background: #fff;
    border: 3px solid ${behavior === 'BLOCK' ? '#f44336' : '#ff9800'};
    border-radius: 8px;
    padding: 20px;
    box-shadow: 0 4px 20px rgba(0,0,0,0.3);
    z-index: 10000;
    font-family: system-ui, -apple-system, sans-serif;
    max-width: 400px;
    text-align: center;
  `;
  
  const isBlocked = behavior === 'BLOCK';
  const icon = isBlocked ? '🚨' : '⚠️';
  const title = isBlocked ? 'SENSITIVE DATA BLOCKED' : 'SENSITIVE DATA WARNING';
  const message = isBlocked 
    ? 'This data has been blocked from submission to protect your privacy.'
    : 'Please review if this sensitive data should be shared on this platform.';
  const buttonColor = isBlocked ? '#f44336' : '#ff9800';
  
  popup.innerHTML = `
    <div style="color: ${buttonColor}; font-size: 24px; margin-bottom: 10px;">${icon} ${title}</div>
    <div style="margin-bottom: 10px; color: #333;">
      <strong>Detected:</strong> ${matches.join(", ")}
    </div>
    <div style="margin-bottom: 15px; color: #666; font-size: 14px; padding: 8px; background: #f5f5f5; border-radius: 4px;">
      <strong>Device:</strong> ${currentDeviceId}<br>
      <strong>Site Type:</strong> ${isAIPlatform() ? 'AI Platform' : 'Business Platform'}
    </div>
    <div style="margin-bottom: 20px; color: #666; font-size: 14px;">
      ${message}
    </div>
    <div style="display: flex; gap: 10px; justify-content: center;">
      <button id="dlp-close-popup" style="
        background: ${buttonColor};
        color: white;
        border: none;
        padding: 10px 20px;
        border-radius: 4px;
        cursor: pointer;
        font-size: 16px;
      ">OK</button>
      ${!isBlocked ? `
        <button id="dlp-proceed-anyway" style="
          background: #666;
          color: white;
          border: none;
          padding: 10px 20px;
          border-radius: 4px;
          cursor: pointer;
          font-size: 16px;
        ">Proceed Anyway</button>
      ` : ''}
    </div>
  `;
  
  document.body.appendChild(popup);
  
  // Close popup
  popup.querySelector('#dlp-close-popup').onclick = () => {
    popup.remove();
  };
  
  // Proceed anyway button for warnings
  const proceedBtn = popup.querySelector('#dlp-proceed-anyway');
  if (proceedBtn) {
    proceedBtn.onclick = () => {
      popup.remove();
      // Log the user's decision to proceed
      console.log('🔄 User chose to proceed with sensitive data on non-AI platform');
      chrome.runtime.sendMessage({
        type: "warning_acknowledged",
        matches: matches,
        snippet: text.substring(0, 200),
        url: window.location.href,
        timestamp: Date.now(),
        device_id: currentDeviceId,
        user_action: "proceeded"
      });
    };
  }
  
  // Auto-close after 10 seconds for warnings, 5 seconds for blocks
  setTimeout(() => {
    if (popup.parentNode) popup.remove();
  }, isBlocked ? 5000 : 10000);
}

function handleSensitiveData(matches, text, element) {
  const behavior = getSiteBehavior();
  const isBlocked = behavior === 'BLOCK';
  
  console.log(`${isBlocked ? '🚨' : '⚠️'} Sensitive data ${isBlocked ? 'blocked' : 'detected'}:`, matches, 'on', window.location.hostname);
  
  // Only clear input and prevent interaction for AI platforms (BLOCK behavior)
  if (isBlocked && element) {
    if (element.tagName === "INPUT" || element.tagName === "TEXTAREA") {
      element.value = "";
      element.style.border = "2px solid #f44336";
      element.blur();
    } else if (element.isContentEditable) {
      element.innerText = "";
      element.style.border = "2px solid #f44336";
      element.blur();
    }
  } else if (!isBlocked && element) {
    // For warnings, just highlight the element temporarily
    const originalBorder = element.style.border;
    element.style.border = "2px solid #ff9800";
    setTimeout(() => {
      element.style.border = originalBorder;
    }, 3000);
  }
  
  // Show appropriate popup
  showWarningPopup(matches, text, behavior);
  
  // Send to background script for server reporting
  try {
    chrome.runtime.sendMessage({
      type: isBlocked ? "sensitive_blocked" : "sensitive_detected",
      matches: matches,
      snippet: text.substring(0, 200),
      url: window.location.href,
      timestamp: Date.now(),
      device_id: currentDeviceId,
      site_type: isAIPlatform() ? 'ai_platform' : 'business_platform',
      behavior: behavior
    });
  } catch (e) {
    console.error("Failed to send message to background:", e);
  }
}

// Input monitoring - modified to handle different behaviors
document.addEventListener("input", function (e) {
  if (isTextInput(e.target)) {
    const text = getElementText(e.target);
    const matches = detectSensitive(text);
    if (matches.length > 0) {
      const behavior = getSiteBehavior();
      
      if (behavior === 'BLOCK') {
        // Block immediately for AI platforms
        handleSensitiveData(matches, text, e.target);
      } else {
        // For business platforms, just show warning but don't clear
        handleSensitiveData(matches, text, e.target);
      }
    }
  }
}, true);

// Form submission blocking - only for AI platforms
document.addEventListener("submit", function (e) {
  const behavior = getSiteBehavior();
  
  const inputs = e.target.querySelectorAll("input, textarea, [contenteditable='true']");
  for (const input of inputs) {
    const text = getElementText(input);
    const matches = detectSensitive(text);
    if (matches.length > 0) {
      if (behavior === 'BLOCK') {
        // Block form submission for AI platforms
        e.preventDefault();
        e.stopImmediatePropagation();
        handleSensitiveData(matches, text, input);
        chrome.runtime.sendMessage({
          type: "form_blocked",
          matches: matches,
          snippet: text.substring(0, 200),
          url: window.location.href,
          timestamp: Date.now(),
          device_id: currentDeviceId,
          site_type: 'ai_platform'
        });
        return false;
      } else {
        // For business platforms, show warning but don't prevent submission
        handleSensitiveData(matches, text, input);
        chrome.runtime.sendMessage({
          type: "form_warning",
          matches: matches,
          snippet: text.substring(0, 200),
          url: window.location.href,
          timestamp: Date.now(),
          device_id: currentDeviceId,
          site_type: 'business_platform'
        });
        // Don't prevent form submission, just warn
      }
    }
  }
}, true);

// File upload monitoring - modified for different behaviors
document.addEventListener("change", async function (e) {
  if (e.target.type === "file" && e.target.files && e.target.files.length) {
    const behavior = getSiteBehavior();
    
    for (const file of e.target.files) {
      let shouldBlock = false;
      let matches = [];
      
      // Check filename
      if (/confidential|secret|classified|internal|restricted|proprietary/i.test(file.name)) {
        matches = ["SUSPICIOUS_FILENAME"];
        shouldBlock = true;
      }
      
      // Check file content for text files
      if (!shouldBlock && file.size > 0 && /text|json|xml|csv|yaml|yml|markdown/i.test(file.type)) {
        try {
          const blob = file.slice(0, 1000000); // First 1MB
          const text = await blob.text();
          const detectedMatches = detectSensitive(text);
          if (detectedMatches.length > 0) {
            matches = detectedMatches;
            shouldBlock = true;
          }
        } catch (err) {
          console.error("Error reading file:", err);
        }
      }
      
      if (shouldBlock) {
        if (behavior === 'BLOCK') {
          // Block file upload for AI platforms
          e.target.value = "";
          handleSensitiveData(matches, `File: ${file.name}`, e.target);
          chrome.runtime.sendMessage({
            type: "file_blocked",
            matches: matches,
            filename: file.name,
            url: window.location.href,
            timestamp: Date.now(),
            device_id: currentDeviceId,
            site_type: 'ai_platform'
          });
          return false;
        } else {
          // For business platforms, warn but don't block
          handleSensitiveData(matches, `File: ${file.name}`, e.target);
          chrome.runtime.sendMessage({
            type: "file_warning",
            matches: matches,
            filename: file.name,
            url: window.location.href,
            timestamp: Date.now(),
            device_id: currentDeviceId,
            site_type: 'business_platform'
          });
          // Don't clear the file input for business platforms
        }
      }
    }
  }
}, true);

// Keydown monitoring for Enter key - only block on AI platforms
document.addEventListener("keydown", function (e) {
  if (e.key === "Enter" && !e.shiftKey) {
    const el = e.target;
    if (isTextInput(el)) {
      const text = getElementText(el);
      const matches = detectSensitive(text);
      if (matches.length > 0) {
        const behavior = getSiteBehavior();
        
        if (behavior === 'BLOCK') {
          e.preventDefault();
          e.stopImmediatePropagation();
        }
        
        handleSensitiveData(matches, text, el);
      }
    }
  }
}, true);

// Monitor for dynamic content changes
const observer = new MutationObserver(() => {
  // Attach to any new shadow roots
  try {
    const all = document.querySelectorAll("*");
    for (const el of all) {
      if (el.shadowRoot && !el.shadowRoot.__dlp_attached) {
        el.shadowRoot.__dlp_attached = true;
        el.shadowRoot.addEventListener("input", function(e) {
          if (isTextInput(e.target)) {
            const text = getElementText(e.target);
            const matches = detectSensitive(text);
            if (matches.length > 0) {
              handleSensitiveData(matches, text, e.target);
            }
          }
        }, true);
      }
    }
  } catch (e) {
    // Ignore errors accessing shadow roots
  }
});

observer.observe(document, { childList: true, subtree: true });

// Listen for updates from popup and settings
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'device_id_updated') {
    currentDeviceId = message.device_id;
    console.log('📱 Device ID updated in content script:', currentDeviceId);
    sendResponse({ status: 'updated' });
  } else if (message.type === 'ai_platforms_updated') {
    AI_PLATFORMS = message.aiPlatforms;
    console.log('🔄 AI platforms updated in content script:', AI_PLATFORMS.length, 'platforms');
    sendResponse({ status: 'updated' });
  } else if (message.type === 'settings_updated') {
    if (message.settings.aiPlatforms) {
      AI_PLATFORMS = message.settings.aiPlatforms;
      console.log('⚙️ Settings updated, AI platforms refreshed:', AI_PLATFORMS.length, 'platforms');
    }
    sendResponse({ status: 'updated' });
  }
});

// Notify background that content script is loaded
try {
  const behavior = getSiteBehavior();
  chrome.runtime.sendMessage({
    type: "content_loaded",
    url: window.location.href,
    timestamp: Date.now(),
    device_id: currentDeviceId,
    site_type: isAIPlatform() ? 'ai_platform' : 'business_platform',
    behavior: behavior
  });
  
  console.log(`✅ Content script loaded with ${behavior} behavior on`, window.location.hostname);
} catch (e) {
  console.error("Failed to notify background:", e);
}