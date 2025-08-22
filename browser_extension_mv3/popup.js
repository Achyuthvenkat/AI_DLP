// Popup functionality
document.addEventListener('DOMContentLoaded', async function() {
  console.log('🔧 Popup loaded');
  
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
  
  // Button handlers
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
    chrome.tabs.create({ url: 'http://127.0.0.1:8000/dashboard' }, (tab) => {
      console.log('Dashboard tab created:', tab.id);
    });
  });
});

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