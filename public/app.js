// State Management
let vaultChartInstance = null;

// Helper: Format relative time
function timeAgo(dateString) {
  if (!dateString) return 'Never';
  const date = new Date(dateString);
  const now = new Date();
  const seconds = Math.floor((now - date) / 1000);
  
  if (seconds < 5) return 'Just now';
  
  const intervals = {
    year: 31536000,
    month: 2592000,
    week: 604800,
    day: 86400,
    hour: 3600,
    minute: 60
  };
  
  for (const [unit, value] of Object.entries(intervals)) {
    const count = Math.floor(seconds / value);
    if (count >= 1) {
      return `${count} ${unit}${count > 1 ? 's' : ''} ago`;
    }
  }
  
  return 'Just now';
}

// Helper: Convert bytes to readable string
function formatBytes(bytes) {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

// Helper: Escape HTML for security
function escapeHTML(str) {
  return str.replace(/[&<>'"]/g, 
    tag => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      "'": '&#39;',
      '"': '&quot;'
    }[tag] || tag)
  );
}

// Build Obsidian URI by absolute path (robust and requires no pre-registration)
function makeObsidianPathURI(absolutePath) {
  if (!absolutePath) return '';
  // Convert Windows backslashes to forward slashes for URI compatibility
  const normalizedPath = absolutePath.replace(/\\/g, '/');
  return `obsidian://open?path=${encodeURIComponent(normalizedPath)}`;
}

// Helper: Escape single quotes for inline JS function calls
function escapeJSString(str) {
  if (!str) return '';
  return str.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

// Action: Copy text to clipboard and animate button icon
function copyToClipboard(text, btnElement) {
  navigator.clipboard.writeText(text).then(() => {
    const originalHTML = btnElement.innerHTML;
    btnElement.innerHTML = '<i class="fa-solid fa-check" style="color: var(--accent-success)"></i>';
    btnElement.title = 'Copied absolute path!';
    
    setTimeout(() => {
      btnElement.innerHTML = originalHTML;
      btnElement.title = 'Copy path';
    }, 2000);
  }).catch(err => {
    console.error('Failed to copy to clipboard:', err);
  });
}
window.copyToClipboard = copyToClipboard;

// Backup cache for Canceling description edits
const descriptionBackupCache = {};

// Action: Toggle edit mode for vault description
function enterEditDescription(vaultName) {
  const wrapper = document.getElementById(`desc-wrapper-${vaultName}`);
  if (!wrapper) return;
  
  const textEl = document.getElementById(`desc-text-${vaultName}`);
  const currentVal = textEl.classList.contains('empty') ? '' : textEl.textContent;
  
  // Backup current HTML
  descriptionBackupCache[vaultName] = wrapper.innerHTML;
  
  wrapper.innerHTML = `
    <div class="desc-edit-container">
      <textarea class="desc-textarea" id="desc-input-${vaultName}" maxlength="150" placeholder="Write description (max 150 chars)...">${escapeHTML(currentVal)}</textarea>
      <div class="desc-edit-actions">
        <button class="btn-desc-action btn-desc-save" onclick="saveVaultDescription('${escapeJSString(vaultName)}')">Save</button>
        <button class="btn-desc-action btn-desc-cancel" onclick="cancelEditDescription('${escapeJSString(vaultName)}')">Cancel</button>
      </div>
    </div>
  `;
  
  const textarea = document.getElementById(`desc-input-${vaultName}`);
  textarea.focus();
  textarea.setSelectionRange(textarea.value.length, textarea.value.length);
}

// Action: Cancel editing and restore original layout
function cancelEditDescription(vaultName) {
  const wrapper = document.getElementById(`desc-wrapper-${vaultName}`);
  if (wrapper && descriptionBackupCache[vaultName]) {
    wrapper.innerHTML = descriptionBackupCache[vaultName];
    delete descriptionBackupCache[vaultName];
  }
}

// Action: Save description to backend JSON file
async function saveVaultDescription(vaultName) {
  const input = document.getElementById(`desc-input-${vaultName}`);
  if (!input) return;
  const description = input.value.trim();
  
  try {
    const res = await fetch('/api/vaults/description', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: vaultName, description })
    });
    const data = await res.json();
    
    if (data.success) {
      const wrapper = document.getElementById(`desc-wrapper-${vaultName}`);
      
      // Clear backup cache
      delete descriptionBackupCache[vaultName];
      
      // Update card description text
      wrapper.innerHTML = `
        ${description 
          ? `<span class="vault-description" id="desc-text-${escapeHTML(vaultName)}">${escapeHTML(description)}</span>` 
          : `<span class="vault-description empty" id="desc-text-${escapeHTML(vaultName)}" onclick="enterEditDescription('${escapeJSString(vaultName)}')">Add a description...</span>`}
        <button class="btn-edit-desc" onclick="enterEditDescription('${escapeJSString(vaultName)}')" title="Edit description">
          <i class="fa-solid fa-pen"></i>
        </button>
      `;
    }
  } catch (err) {
    console.error('Failed to save description:', err);
  }
}

// Bind to window for inline onclick handlers
window.enterEditDescription = enterEditDescription;
window.cancelEditDescription = cancelEditDescription;
window.saveVaultDescription = saveVaultDescription;

// Render chart using Chart.js
function renderVaultChart(vaults) {
  const canvas = document.getElementById('vaultChart');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  
  // Display all vaults, keeping their alphabetical order matching the grid
  const sortedVaults = [...vaults];
  
  const labels = sortedVaults.map(v => v.name);
  const data = sortedVaults.map(v => v.mdCount);
  
  if (vaultChartInstance) {
    vaultChartInstance.destroy();
  }
  
  vaultChartInstance = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: labels,
      datasets: [{
        label: 'Notes',
        data: data,
        backgroundColor: 'rgba(99, 102, 241, 0.4)',
        borderColor: '#6366f1',
        borderWidth: 1.5,
        borderRadius: 6,
        hoverBackgroundColor: 'rgba(168, 85, 247, 0.65)',
        hoverBorderColor: '#a855f7',
      }]
    },
    plugins: [{
      id: 'datalabels',
      afterDatasetsDraw(chart) {
        const { ctx } = chart;
        ctx.save();
        ctx.font = 'bold 11px Inter, sans-serif';
        ctx.textAlign = 'center';
        
        chart.data.datasets.forEach((dataset, i) => {
          const meta = chart.getDatasetMeta(i);
          meta.data.forEach((bar, index) => {
            const value = dataset.data[index];
            if (value !== undefined) {
              const x = bar.x;
              const y = bar.y;
              const base = bar.base;
              const height = base - y;
              
              // If the bar is tall enough (> 22px), place value inside it (white text)
              // Otherwise, draw it above the bar (gray text)
              if (height > 22) {
                ctx.fillStyle = '#ffffff';
                ctx.textBaseline = 'top';
                ctx.fillText(value.toLocaleString(), x, y + 6);
              } else {
                ctx.fillStyle = '#9ca3af';
                ctx.textBaseline = 'bottom';
                ctx.fillText(value.toLocaleString(), x, y - 4);
              }
            }
          });
        });
        ctx.restore();
      }
    }],
    options: {
      onClick: (event, activeElements, chart) => {
        const elements = chart.getElementsAtEventForMode(event, 'index', { intersect: false }, true);
        if (elements.length > 0) {
          const index = elements[0].index;
          const vault = sortedVaults[index];
          if (vault && vault.path) {
            const uri = makeObsidianPathURI(vault.path);
            window.location.href = uri;
          }
        }
      },
      onHover: (event, activeElements, chart) => {
        const elements = chart.getElementsAtEventForMode(event, 'index', { intersect: false }, true);
        chart.canvas.style.cursor = elements.length > 0 ? 'pointer' : 'default';
      },
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          display: false
        },
        tooltip: {
          backgroundColor: 'rgba(17, 24, 39, 0.95)',
          titleFont: { family: 'Outfit', size: 13, weight: 'bold' },
          bodyFont: { family: 'Inter', size: 12 },
          borderColor: 'rgba(255, 255, 255, 0.08)',
          borderWidth: 1,
          padding: 10,
          displayColors: false
        }
      },
      scales: {
        x: {
          grid: {
            color: 'rgba(255, 255, 255, 0.03)'
          },
          ticks: {
            color: '#9ca3af',
            font: { family: 'Inter', size: 10 }
          }
        },
        y: {
          type: 'logarithmic',
          min: 1, // Log scale requires min > 0
          grid: {
            display: false // Hide horizontal Y-axis grid lines completely
          },
          ticks: {
            display: false // Hide logarithmic scale labels entirely
          }
        }
      }
    }
  });
}

// Fetch all dashboard data
async function loadDashboardData() {
  try {
    // 1. Fetch status & last scan
    const statusRes = await fetch('/api/status');
    const status = await statusRes.json();
    
    if (status.lastScanTime) {
      document.getElementById('last-scan-time').textContent = new Date(status.lastScanTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    } else {
      document.getElementById('last-scan-time').textContent = 'Never';
    }

    // 2. Fetch vaults
    const vaultsRes = await fetch('/api/vaults');
    const vaults = await vaultsRes.json();
    
    // Sort vaults alphabetically
    vaults.sort((a, b) => a.name.localeCompare(b.name));

    // Update global counter stats
    let totalNotes = 0;
    let totalSize = 0;
    vaults.forEach(v => {
      totalNotes += v.mdCount;
      totalSize += v.totalSize;
    });

    document.getElementById('stat-vaults').textContent = vaults.length;
    document.getElementById('stat-notes').textContent = totalNotes.toLocaleString();
    document.getElementById('stat-size').textContent = formatBytes(totalSize);
    document.getElementById('vault-count-badge').textContent = vaults.length;

    // Build Vaults Grid cards
    const gridContainer = document.getElementById('vaults-grid');
    gridContainer.innerHTML = '';

    if (vaults.length === 0) {
      gridContainer.innerHTML = `
        <div class="search-placeholder" style="grid-column: 1/-1;">
          <i class="fa-solid fa-folder-closed placeholder-icon"></i>
          <p>No vaults found in the parent directory</p>
        </div>
      `;
    } else {
      vaults.forEach(vault => {
        const relativeLastUpdate = timeAgo(vault.lastModified);
        const cardHtml = `
          <div class="vault-card">
            <div class="vault-info-top">
              <div class="vault-title-group">
                <h3 title="${escapeHTML(vault.name)}">${escapeHTML(vault.name)}</h3>
                <span class="last-update"><i class="fa-regular fa-clock"></i> Active ${relativeLastUpdate}</span>
              </div>
              <div class="vault-badge-icon">
                <i class="fa-solid fa-book"></i>
              </div>
            </div>
            
            <div class="vault-desc-wrapper" id="desc-wrapper-${escapeHTML(vault.name)}">
              ${vault.description 
                ? `<span class="vault-description" id="desc-text-${escapeHTML(vault.name)}">${escapeHTML(vault.description)}</span>` 
                : `<span class="vault-description empty" id="desc-text-${escapeHTML(vault.name)}" onclick="enterEditDescription('${escapeJSString(vault.name)}')">Add a description...</span>`}
              <button class="btn-edit-desc" onclick="enterEditDescription('${escapeJSString(vault.name)}')" title="Edit description">
                <i class="fa-solid fa-pen"></i>
              </button>
            </div>
            
            <div class="vault-stats-list">
              <div class="vault-stat-item">
                <span class="vault-stat-num">${vault.mdCount.toLocaleString()}</span>
                <span class="vault-stat-lbl">Notes</span>
              </div>
              <div class="vault-stat-item">
                <span class="vault-stat-num">${vault.formattedSize}</span>
                <span class="vault-stat-lbl">Size</span>
              </div>
            </div>
            
            <div class="vault-card-actions">
              <a href="${makeObsidianPathURI(vault.path)}" class="btn-outline btn-open-vault" title="Open vault folder in Obsidian">
                <i class="fa-solid fa-arrow-up-right-from-square"></i> Open
              </a>
              <button class="btn-outline btn-copy-path" onclick="copyToClipboard('${escapeJSString(vault.path)}', this)" title="Copy absolute path">
                <i class="fa-regular fa-copy"></i>
              </button>
            </div>
          </div>
        `;
        gridContainer.insertAdjacentHTML('beforeend', cardHtml);
      });
    }

    // Render Notes count chart
    renderVaultChart(vaults);

    // 3. Fetch recent activity
    const recentRes = await fetch('/api/recent');
    const recent = await recentRes.json();
    
    const recentContainer = document.getElementById('recent-notes-container');
    recentContainer.innerHTML = '';

    if (recent.length === 0) {
      recentContainer.innerHTML = `
        <div class="search-placeholder">
          <i class="fa-solid fa-file-excel placeholder-icon"></i>
          <p>No recent files scanned yet</p>
        </div>
      `;
    } else {
      recent.forEach(note => {
        const timeStr = timeAgo(note.mtime);
        const obsUri = makeObsidianPathURI(note.fullPath);
        
        const itemHtml = `
          <div class="timeline-item">
            <div class="timeline-icon">
              <i class="fa-regular fa-file-lines"></i>
            </div>
            <div class="timeline-content">
              <div class="timeline-title-row">
                <div class="title-link-group">
                  <a href="${obsUri}" class="timeline-link" title="Open in Obsidian">${escapeHTML(note.title)}</a>
                  <button class="btn-icon-copy" onclick="copyToClipboard('${escapeJSString(note.fullPath)}', this)" title="Copy absolute path">
                    <i class="fa-regular fa-copy"></i>
                  </button>
                </div>
                <span class="timeline-time">${timeStr}</span>
              </div>
              <div class="timeline-meta">
                <span class="vault-tag"><i class="fa-solid fa-vault"></i> ${escapeHTML(note.vault)}</span>
                <span class="file-path-subtle"><i class="fa-regular fa-folder"></i> ${escapeHTML(note.path)}</span>
              </div>
            </div>
          </div>
        `;
        recentContainer.insertAdjacentHTML('beforeend', itemHtml);
      });
    }
  } catch (err) {
    console.error('Error fetching dashboard data:', err);
  }
}

// Global Search function
async function handleSearch() {
  const input = document.getElementById('search-input');
  const resultsContainer = document.getElementById('search-results');
  const query = input.value.trim();

  if (!query) {
    resultsContainer.innerHTML = `
      <div class="search-placeholder">
        <i class="fa-solid fa-keyboard placeholder-icon"></i>
        <p>Type a query and press enter to search across all notes</p>
      </div>
    `;
    document.getElementById('search-clear-btn').style.display = 'none';
    return;
  }

  // Show clear button
  document.getElementById('search-clear-btn').style.display = 'block';

  // Loading indicator
  resultsContainer.innerHTML = `
    <div class="loading-spinner">
      <i class="fa-solid fa-spinner fa-spin"></i> Searching notes...
    </div>
  `;

  try {
    const res = await fetch(`/api/search?q=${encodeURIComponent(query)}`);
    const results = await res.json();

    resultsContainer.innerHTML = '';

    if (results.length === 0) {
      resultsContainer.innerHTML = `
        <div class="search-placeholder">
          <i class="fa-solid fa-face-frown placeholder-icon"></i>
          <p>No results found for "${escapeHTML(query)}"</p>
        </div>
      `;
      return;
    }

    results.forEach(result => {
      const obsUri = makeObsidianPathURI(result.fullPath);
      const timeStr = timeAgo(result.mtime);
      
      // Escape HTML and highlight matching terms in snippet
      let snippetHtml = escapeHTML(result.snippet);
      // Simple regex replace to wrap matching query in <mark>
      const regex = new RegExp(`(${query.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&')})`, 'gi');
      snippetHtml = snippetHtml.replace(regex, '<mark>$1</mark>');

      const itemHtml = `
        <div class="search-result-item">
          <div class="result-title-row">
            <div class="title-link-group">
              <a href="${obsUri}" class="result-link" title="Open in Obsidian">${escapeHTML(result.title)}</a>
              <button class="btn-icon-copy" onclick="copyToClipboard('${escapeJSString(result.fullPath)}', this)" title="Copy absolute path">
                <i class="fa-regular fa-copy"></i>
              </button>
            </div>
            <span class="timeline-time">${timeStr}</span>
          </div>
          <div class="timeline-meta" style="margin-bottom: 0.25rem;">
            <span class="vault-tag"><i class="fa-solid fa-vault"></i> ${escapeHTML(result.vault)}</span>
            <span class="file-path-subtle"><i class="fa-regular fa-folder"></i> ${escapeHTML(result.path)}</span>
          </div>
          ${snippetHtml ? `<p class="snippet">${snippetHtml}</p>` : ''}
        </div>
      `;
      resultsContainer.insertAdjacentHTML('beforeend', itemHtml);
    });
  } catch (err) {
    console.error('Search request failed:', err);
    resultsContainer.innerHTML = `
      <div class="search-placeholder">
        <i class="fa-solid fa-triangle-exclamation placeholder-icon" style="color: var(--accent-secondary)"></i>
        <p>Failed to execute search. Please check the backend log.</p>
      </div>
    `;
  }
}

// Initial Setup & Event Listeners
document.addEventListener('DOMContentLoaded', () => {
  // Load data immediately
  loadDashboardData();

  // Refresh Dashboard
  const refreshBtn = document.getElementById('refresh-btn');
  const refreshIcon = document.getElementById('refresh-icon');
  
  refreshBtn.addEventListener('click', async () => {
    refreshBtn.disabled = true;
    refreshIcon.classList.add('fa-spin');
    
    try {
      const res = await fetch('/api/refresh', { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        await loadDashboardData();
      }
    } catch (err) {
      console.error('Manual refresh failed:', err);
    } finally {
      refreshBtn.disabled = false;
      refreshIcon.classList.remove('fa-spin');
    }
  });

  // Search Input Events
  const searchInput = document.getElementById('search-input');
  const searchSubmitBtn = document.getElementById('search-submit-btn');
  const searchClearBtn = document.getElementById('search-clear-btn');

  searchSubmitBtn.addEventListener('click', handleSearch);
  
  searchInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      handleSearch();
    }
  });

  searchClearBtn.addEventListener('click', () => {
    searchInput.value = '';
    searchClearBtn.style.display = 'none';
    handleSearch();
  });

  // Collapsible Sections (Folding)
  document.querySelectorAll('.card-header').forEach(header => {
    header.addEventListener('click', () => {
      const card = header.closest('.card');
      card.classList.toggle('collapsed');
    });
  });
});
