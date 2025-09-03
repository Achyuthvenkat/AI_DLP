// Options page functionality with AI platform configuration
document.addEventListener('DOMContentLoaded', function() {
  loadSettings();
  
  // Button event listeners
  document.getElementById('save-btn').addEventListener('click', saveSettings);
  document.getElementById('reset-btn').addEventListener('click', resetSettings);
  document.getElementById('test-connection-btn').addEventListener('click', testConnection);
  document.getElementById('view-dashboard-btn').addEventListener('click', viewDashboard);
});

const DEFAULT_SETTINGS = {
  enabled: true,
  notifications: true,
  popups: true,
  serverUrl: 'http://10.160.14.76:8059',
  serverReporting: true,
  rules: {
    pan: true,
    aadhaar: true,
    creditCard: true,
    apiKeys: true,
    titanData: true,
    confidential: true
  },
  aiPlatforms: [
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
  ],
  customKeywords: []
};

async function loadSettings() {
  try {
    const result = await chrome.storage.sync.get(['dlp_settings']);
    const settings = { ...DEFAULT_SETTINGS, ...(result.dlp_settings || {}) };
    
    // Load general settings
    document.getElementById('enabled').checked = settings.enabled;
    document.getElementById('notifications').checked = settings.notifications;
    document.getElementById('popups').checked = settings.popups;
    
    // Load AI platforms
    document.getElementById('ai-platforms').value = settings.aiPlatforms.join('\n');
    
    // Load server settings
    document.getElementById('server-url').value = settings.serverUrl;
    document.getElementById('server-reporting').checked = settings.serverReporting;
    
    // Load detection rules
    document.getElementById('rule-pan').checked = settings.rules.pan;
    document.getElementById('rule-aadhaar').checked = settings.rules.aadhaar;
    document.getElementById('rule-credit-card').checked = settings.rules.creditCard;
    document.getElementById('rule-api-keys').checked = settings.rules.apiKeys;
    document.getElementById('rule-titan-data').checked = settings.rules.titanData !== undefined ? settings.rules.titanData : true;
    document.getElementById('rule-confidential').checked = settings.rules.confidential;
    
    // Load custom keywords
    document.getElementById('custom-keywords').value = settings.customKeywords.join('\n');
    
  } catch (error) {
    console.error('Error loading settings:', error);
    showStatus('Error loading settings', 'error');
  }
}

async function saveSettings() {
  try {
    const settings = {
      enabled: document.getElementById('enabled').checked,
      notifications: document.getElementById('notifications').checked,
      popups: document.getElementById('popups').checked,
      serverUrl: document.getElementById('server-url').value.trim(),
      serverReporting: document.getElementById('server-reporting').checked,
      rules: {
        pan: document.getElementById('rule-pan').checked,
        aadhaar: document.getElementById('rule-aadhaar').checked,
        creditCard: document.getElementById('rule-credit-card').checked,
        apiKeys: document.getElementById('rule-api-keys').checked,
        titanData: document.getElementById('rule-titan-data').checked,
        confidential: document.getElementById('rule-confidential').checked
      },
      aiPlatforms: document.getElementById('ai-platforms').value
        .split('\n')
        .map(line => line.trim().toLowerCase())
        .filter(line => line.length > 0),
      customKeywords: document.getElementById('custom-keywords').value
        .split('\n')
        .map(line => line.trim())
        .filter(line => line.length > 0)
    };
    
    await chrome.storage.sync.set({ dlp_settings: settings });
    
    // Notify all tabs about settings change
    const tabs = await chrome.tabs.query({});
    for (const tab of tabs) {
      try {
        await chrome.tabs.sendMessage(tab.id, {
          type: 'settings_updated',
          settings: settings
        });
      } catch (error) {
        // Ignore errors for tabs that don't have our content script
      }
    }
    
    // Also update the AI platforms in content scripts
    await updateAIPlatformsInContentScripts(settings.aiPlatforms);
    
    showStatus('Settings saved successfully! Please refresh any open tabs for changes to take effect.', 'success');
  } catch (error) {
    console.error('Error saving settings:', error);
    showStatus('Error saving settings', 'error');
  }
}

async function updateAIPlatformsInContentScripts(aiPlatforms) {
  const tabs = await chrome.tabs.query({});
  for (const tab of tabs) {
    try {
      await chrome.tabs.sendMessage(tab.id, {
        type: 'ai_platforms_updated',
        aiPlatforms: aiPlatforms
      });
    } catch (error) {
      // Ignore errors for tabs that don't have our content script
    }
  }
}

async function resetSettings() {
  if (confirm('Are you sure you want to reset all settings to defaults? This will restore the default AI platform list and clear any custom configurations.')) {
    try {
      await chrome.storage.sync.set({ dlp_settings: DEFAULT_SETTINGS });
      loadSettings();
      showStatus('Settings reset to defaults. Please refresh any open tabs.', 'success');
    } catch (error) {
      console.error('Error resetting settings:', error);
      showStatus('Error resetting settings', 'error');
    }
  }
}

async function testConnection() {
  const serverUrl = document.getElementById('server-url').value.trim();
  
  if (!serverUrl) {
    showStatus('Please enter a server URL', 'error');
    return;
  }
  
  try {
    showStatus('Testing connection...', 'success');
    
    const response = await fetch(`${serverUrl}/api/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ device_id: 'test_connection' })
    });
    
    if (response.ok) {
      showStatus('✅ Connection successful!', 'success');
    } else {
      showStatus(`❌ Connection failed: ${response.status} ${response.statusText}`, 'error');
    }
  } catch (error) {
    console.error('Connection test error:', error);
    showStatus(`❌ Connection failed: ${error.message}`, 'error');
  }
}

function viewDashboard() {
  const serverUrl = document.getElementById('server-url').value.trim() || 'http://10.160.14.76:8059';
  chrome.tabs.create({ url: `${serverUrl}/dashboard` });
}

function showStatus(message, type) {
  const statusDiv = document.getElementById('status-message');
  statusDiv.textContent = message;
  statusDiv.className = `status-message status-${type}`;
  statusDiv.style.display = 'block';
  
  // Hide after 5 seconds for success, 8 seconds for errors
  const timeout = type === 'success' ? 5000 : 8000;
  setTimeout(() => {
    statusDiv.style.display = 'none';
  }, timeout);
}