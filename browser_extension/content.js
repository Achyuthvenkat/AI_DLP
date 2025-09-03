// Enhanced content script with proper blocking and server communication
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

function showSensitiveDataPopup(matches, text) {
  // Create popup with device ID
  const popup = document.createElement('div');
  popup.style.cssText = `
    position: fixed;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    background: #fff;
    border: 3px solid #f44336;
    border-radius: 8px;
    padding: 20px;
    box-shadow: 0 4px 20px rgba(0,0,0,0.3);
    z-index: 10000;
    font-family: system-ui, -apple-system, sans-serif;
    max-width: 400px;
    text-align: center;
  `;
  
  popup.innerHTML = `
    <div style="color: #f44336; font-size: 24px; margin-bottom: 10px;">🚨 SENSITIVE DATA DETECTED</div>
    <div style="margin-bottom: 10px; color: #333;">
      <strong>Detected:</strong> ${matches.join(", ")}
    </div>
    <div style="margin-bottom: 15px; color: #666; font-size: 14px; padding: 8px; background: #f5f5f5; border-radius: 4px;">
      <strong>Device:</strong> ${currentDeviceId}
    </div>
    <div style="margin-bottom: 20px; color: #666; font-size: 14px;">
      This data has been blocked from submission to protect your privacy.
    </div>
    <button id="dlp-close-popup" style="
      background: #f44336;
      color: white;
      border: none;
      padding: 10px 20px;
      border-radius: 4px;
      cursor: pointer;
      font-size: 16px;
    ">OK</button>
  `;
  
  document.body.appendChild(popup);
  
  // Close popup
  popup.querySelector('#dlp-close-popup').onclick = () => {
    popup.remove();
  };
  
  // Auto-close after 5 seconds
  setTimeout(() => {
    if (popup.parentNode) popup.remove();
  }, 5000);
}

function handleSensitiveData(matches, text, element) {
  console.warn("🚨 Sensitive data detected:", matches, text.substring(0, 50));
  
  // Clear the input
  if (element) {
    if (element.tagName === "INPUT" || element.tagName === "TEXTAREA") {
      element.value = "";
      element.style.border = "2px solid #f44336";
      element.blur();
    } else if (element.isContentEditable) {
      element.innerText = "";
      element.style.border = "2px solid #f44336";
      element.blur();
    }
  }
  
  // Show popup with device ID
  showSensitiveDataPopup(matches, text);
  
  // Send to background script for server reporting
  try {
    chrome.runtime.sendMessage({
      type: "sensitive_detected",
      matches: matches,
      snippet: text.substring(0, 200),
      url: window.location.href,
      timestamp: Date.now(),
      device_id: currentDeviceId
    });
  } catch (e) {
    console.error("Failed to send message to background:", e);
  }
}

// Input monitoring
document.addEventListener("input", function (e) {
  if (isTextInput(e.target)) {
    const text = getElementText(e.target);
    const matches = detectSensitive(text);
    if (matches.length > 0) {
      handleSensitiveData(matches, text, e.target);
    }
  }
}, true);

// Form submission blocking
document.addEventListener("submit", function (e) {
  const inputs = e.target.querySelectorAll("input, textarea, [contenteditable='true']");
  for (const input of inputs) {
    const text = getElementText(input);
    const matches = detectSensitive(text);
    if (matches.length > 0) {
      e.preventDefault();
      e.stopImmediatePropagation();
      handleSensitiveData(matches, text, input);
      chrome.runtime.sendMessage({
        type: "form_blocked",
        matches: matches,
        snippet: text.substring(0, 200),
        url: window.location.href,
        timestamp: Date.now(),
        device_id: currentDeviceId
      });
      return false;
    }
  }
}, true);

// File upload monitoring
document.addEventListener("change", async function (e) {
  if (e.target.type === "file" && e.target.files && e.target.files.length) {
    for (const file of e.target.files) {
      // Check filename
      if (/confidential|secret|classified|internal|restricted|proprietary/i.test(file.name)) {
        e.target.value = "";
        handleSensitiveData(["SUSPICIOUS_FILENAME"], `Filename: ${file.name}`, e.target);
        return false;
      }
      
      // Check file content for text files
      if (file.size > 0 && /text|json|xml|csv|yaml|yml|markdown/i.test(file.type)) {
        try {
          const blob = file.slice(0, 1000000); // First 1MB
          const text = await blob.text();
          const matches = detectSensitive(text);
          if (matches.length > 0) {
            e.target.value = "";
            handleSensitiveData(matches, `File: ${file.name}`, e.target);
            chrome.runtime.sendMessage({
              type: "file_blocked",
              matches: matches,
              filename: file.name,
              url: window.location.href,
              timestamp: Date.now(),
              device_id: currentDeviceId
            });
            return false;
          }
        } catch (err) {
          console.error("Error reading file:", err);
        }
      }
    }
  }
}, true);

// Keydown monitoring for Enter key
document.addEventListener("keydown", function (e) {
  if (e.key === "Enter" && !e.shiftKey) {
    const el = e.target;
    if (isTextInput(el)) {
      const text = getElementText(el);
      const matches = detectSensitive(text);
      if (matches.length > 0) {
        e.preventDefault();
        e.stopImmediatePropagation();
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

// Listen for device ID updates from popup
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'device_id_updated') {
    currentDeviceId = message.device_id;
    console.log('📱 Device ID updated in content script:', currentDeviceId);
    sendResponse({ status: 'updated' });
  }
});

// Notify background that content script is loaded
try {
  chrome.runtime.sendMessage({
    type: "content_loaded",
    url: window.location.href,
    timestamp: Date.now(),
    device_id: currentDeviceId
  });
} catch (e) {
  console.error("Failed to notify background:", e);
}