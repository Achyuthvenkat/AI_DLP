// Popup functionality
document.addEventListener('DOMContentLoaded', async function() {
  console.log('🔧 Popup loaded');
  
  // Load device ID setup first
  await loadDeviceId();
  
  // Get current tab info
  try {
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    const currentTab = tabs[0];
    
    if (currentTab) {
      const url = new URL(currentTab.url);
      document.getElementById('current-site').textContent = url.hostname;
      console.log('📍 Current site:', url.hostname);
    }
  } catch (error) {
    console.error('Error getting current tab:', error);
    document.getElementById('current-site').textContent = 'Unknown';
  }
  
  // Load stats from storage
  await loadStats();
  await loadRecentBlocks();
  
  // Device ID button handlers
  document.getElementById('save-device-btn').addEventListener('click', saveDeviceId);
  document.getElementById('change-device-btn').addEventListener('click', showDeviceInput);
  
  // Other button handlers
  document.getElementById('settings-btn').addEventListener('click', function() {
    console.log('⚙️ Settings button clicked');
    
    // Always open in new tab for better reliability
    const optionsUrl = chrome.runtime.getURL('options.html');
    chrome.tabs.create({ url: optionsUrl }, (tab) => {
      if (chrome.runtime.lastError) {
        console.error('Failed to open settings:', chrome.runtime.lastError);
        // Final fallback
        window.open(optionsUrl, '_blank');
      } else {
        console.log('Settings tab created:', tab.id);
        // Close the popup
        window.close();
      }
    });
  });
  
  document.getElementById('dashboard-btn').addEventListener('click', function() {
    console.log('📊 Dashboard button clicked');
    chrome.tabs.create({ url: 'http://10.160.14.76:8059/dashboard' }, (tab) => {
      console.log('Dashboard tab created:', tab.id);
    });
  });
  
  // Allow Enter key to save device ID
  document.getElementById('device-id-input').addEventListener('keypress', function(e) {
    if (e.key === 'Enter') {
      saveDeviceId();
    }
  });
});

async function loadDeviceId() {
  try {
    const result = await chrome.storage.local.get(['device_id']);
    const deviceId = result.device_id;
    
    if (deviceId) {
      // Show configured state
      document.getElementById('device-input-container').style.display = 'none';
      document.getElementById('device-display-container').style.display = 'block';
      document.getElementById('device-display').textContent = `Device: ${deviceId}`;
      document.getElementById('device-setup').classList.add('configured');
      console.log('📱 Device ID loaded:', deviceId);
    } else {
      // Show input state
      showDeviceInput();
      console.log('📱 No device ID configured');
    }
  } catch (error) {
    console.error('Error loading device ID:', error);
    showDeviceInput();
  }
}

async function saveDeviceId() {
  const deviceInput = document.getElementById('device-id-input');
  const deviceId = deviceInput.value.trim();
  
  if (!deviceId) {
    // Simple validation feedback
    deviceInput.style.borderColor = '#f44336';
    deviceInput.placeholder = 'Device ID is required';
    setTimeout(() => {
      deviceInput.style.borderColor = '#ddd';
      deviceInput.placeholder = 'Enter your device ID (e.g., LAPTOP-123)';
    }, 2000);
    return;
  }
  
  // Basic validation - alphanumeric, hyphens, underscores only
  if (!/^[a-zA-Z0-9_-]+$/.test(deviceId)) {
    deviceInput.style.borderColor = '#f44336';
    deviceInput.placeholder = 'Only letters, numbers, - and _ allowed';
    deviceInput.value = '';
    setTimeout(() => {
      deviceInput.style.borderColor = '#ddd';
      deviceInput.placeholder = 'Enter your device ID (e.g., LAPTOP-123)';
    }, 3000);
    return;
  }
  
  try {
    // Save to storage
    await chrome.storage.local.set({ device_id: deviceId });
    
    // Update UI to show configured state
    document.getElementById('device-input-container').style.display = 'none';
    document.getElementById('device-display-container').style.display = 'block';
    document.getElementById('device-display').textContent = `Device: ${deviceId}`;
    document.getElementById('device-setup').classList.add('configured');
    
    console.log('✅ Device ID saved:', deviceId);
    
    // Notify content scripts about the device ID update
    const tabs = await chrome.tabs.query({});
    for (const tab of tabs) {
      try {
        await chrome.tabs.sendMessage(tab.id, {
          type: 'device_id_updated',
          device_id: deviceId
        });
      } catch (error) {
        // Ignore errors for tabs that don't have our content script
      }
    }
  } catch (error) {
    console.error('Error saving device ID:', error);
    deviceInput.style.borderColor = '#f44336';
    deviceInput.placeholder = 'Error saving device ID';
    setTimeout(() => {
      deviceInput.style.borderColor = '#ddd';
      deviceInput.placeholder = 'Enter your device ID (e.g., LAPTOP-123)';
    }, 2000);
  }
}

function showDeviceInput() {
  // Show input state
  document.getElementById('device-input-container').style.display = 'block';
  document.getElementById('device-display-container').style.display = 'none';
  document.getElementById('device-setup').classList.remove('configured');
  
  // Focus the input for better UX
  setTimeout(() => {
    document.getElementById('device-id-input').focus();
  }, 100);
  
  // Load current device ID if changing
  chrome.storage.local.get(['device_id']).then(result => {
    if (result.device_id) {
      document.getElementById('device-id-input').value = result.device_id;
    }
  });
}

async function loadStats() {
  try {
    const result = await chrome.storage.local.get(['dlp_stats']);
    const stats = result.dlp_stats || { blocks_today: 0, total_blocks: 0 };
    
    // Check if it's a new day
    const today = new Date().toDateString();
    const lastDate = stats.last_date || '';
    
    if (lastDate !== today) {
      stats.blocks_today = 0;
      stats.last_date = today;
      await chrome.storage.local.set({ dlp_stats: stats });
    }
    
    document.getElementById('blocks-today').textContent = stats.blocks_today || 0;
  } catch (error) {
    console.error('Error loading stats:', error);
  }
}

async function loadRecentBlocks() {
  try {
    const result = await chrome.storage.local.get(['recent_blocks']);
    const blocks = result.recent_blocks || [];
    
    const container = document.getElementById('recent-blocks-list');
    
    if (blocks.length === 0) {
      container.innerHTML = `
        <div style="text-align: center; color: #999; font-size: 12px; padding: 20px 0;">
          No recent blocks
        </div>
      `;
      return;
    }
    
    // Show last 5 blocks
    const recentBlocks = blocks.slice(-5).reverse();
    container.innerHTML = recentBlocks.map(block => `
      <div class="block-item">
        <div class="block-type">${block.matches.join(', ')}</div>
        <div class="block-url">${new URL(block.url).hostname}</div>
        <div style="color: #999; font-size: 11px;">${formatTime(block.timestamp)}</div>
      </div>
    `).join('');
  } catch (error) {
    console.error('Error loading recent blocks:', error);
  }
}

function formatTime(timestamp) {
  const now = Date.now();
  const diff = now - timestamp;
  
  if (diff < 60000) { // Less than 1 minute
    return 'Just now';
  } else if (diff < 3600000) { // Less than 1 hour
    const minutes = Math.floor(diff / 60000);
    return `${minutes}m ago`;
  } else if (diff < 86400000) { // Less than 1 day
    const hours = Math.floor(diff / 3600000);
    return `${hours}h ago`;
  } else {
    const days = Math.floor(diff / 86400000);
    return `${days}d ago`;
  }
}

// Listen for updates from background script
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'stats_updated') {
    loadStats();
    loadRecentBlocks();
  }
});