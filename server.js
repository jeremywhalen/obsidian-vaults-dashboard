import express from 'express';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const vaultsDir = path.resolve(__dirname, '..');

const app = express();
const PORT = process.env.PORT || 3000;

// Serve frontend static files
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());

// In-memory cache
let cachedVaults = [];
let cachedRecent = [];
let cachedMdFiles = []; // Used for global search
let isScanning = false;
let lastScanTime = null;

// Helper to convert size to human readable format
function formatSize(bytes) {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

// Scanning logic (Read-Only)
async function refreshCache() {
  if (isScanning) return;
  isScanning = true;
  console.log(`Starting scan of vaults directory: ${vaultsDir}`);
  const startTime = Date.now();

  const tempVaults = [];
  const tempMdFiles = [];

  try {
    const entries = await fs.readdir(vaultsDir, { withFileTypes: true });

    for (const entry of entries) {
      if (entry.isDirectory()) {
        const name = entry.name;
        // Skip hidden directories, backups, and the dashboard itself
        if (name.startsWith('.') || name.startsWith('_')) continue;

        const vaultPath = path.join(vaultsDir, name);
        
        let mdCount = 0;
        let mediaCount = 0;
        let totalCount = 0;
        let totalSize = 0;
        let lastModified = 0;

        // Recursive walker
        async function walk(dir) {
          try {
            const files = await fs.readdir(dir, { withFileTypes: true });
            for (const file of files) {
              const fullPath = path.join(dir, file.name);
              // Skip hidden files/directories (e.g. .obsidian, .git)
              if (file.name.startsWith('.')) continue;

              if (file.isDirectory()) {
                await walk(fullPath);
              } else if (file.isFile()) {
                try {
                  const stats = await fs.stat(fullPath);
                  totalCount++;
                  totalSize += stats.size;
                  
                  if (stats.mtimeMs > lastModified) {
                    lastModified = stats.mtimeMs;
                  }

                  const ext = path.extname(file.name).toLowerCase();
                  if (ext === '.md') {
                    mdCount++;
                    // Calculate path relative to the vault root
                    const relativePath = path.relative(vaultPath, fullPath);
                    const title = path.basename(file.name, '.md');
                    tempMdFiles.push({
                      vaultName: name,
                      relativePath,
                      fullPath,
                      title,
                      mtime: stats.mtimeMs
                    });
                  } else if (['.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg', '.pdf', '.mp3', '.mp4'].includes(ext)) {
                    mediaCount++;
                  }
                } catch (err) {
                  // Ignore files we cannot access
                }
              }
            }
          } catch (err) {
            // Ignore directories we cannot access
          }
        }

        await walk(vaultPath);

        tempVaults.push({
          name,
          path: vaultPath,
          mdCount,
          mediaCount,
          totalCount,
          totalSize,
          formattedSize: formatSize(totalSize),
          lastModified: lastModified > 0 ? new Date(lastModified).toISOString() : null
        });
      }
    }

    cachedVaults = tempVaults;
    cachedMdFiles = tempMdFiles;

    // Filter and sort the 30 most recently modified markdown files
    cachedRecent = [...tempMdFiles]
      .sort((a, b) => b.mtime - a.mtime)
      .slice(0, 30);

    lastScanTime = new Date().toISOString();
    console.log(`Scan completed in ${Date.now() - startTime}ms. Found ${cachedVaults.length} vaults, ${cachedMdFiles.length} notes.`);
  } catch (err) {
    console.error('Failed to scan vaults directory:', err);
  } finally {
    isScanning = false;
  }
}

// API: Server Status
app.get('/api/status', (req, res) => {
  res.json({
    lastScanTime,
    isScanning,
    vaultsCount: cachedVaults.length,
    notesCount: cachedMdFiles.length
  });
});

// API: Vault list with stats
app.get('/api/vaults', (req, res) => {
  res.json(cachedVaults);
});

// API: Recent notes across all vaults
app.get('/api/recent', (req, res) => {
  res.json(cachedRecent.map(note => ({
    vault: note.vaultName,
    path: note.relativePath,
    fullPath: note.fullPath,
    title: note.title,
    mtime: new Date(note.mtime).toISOString()
  })));
});

// API: Global search with snippet extraction
app.get('/api/search', async (req, res) => {
  const query = req.query.q;
  if (!query || typeof query !== 'string') {
    return res.status(400).json({ error: 'Search query is required' });
  }

  const results = [];
  const lowerQuery = query.toLowerCase();

  for (const file of cachedMdFiles) {
    try {
      const titleMatch = file.title.toLowerCase().includes(lowerQuery);
      let contentMatch = false;
      let snippet = '';

      const content = await fs.readFile(file.fullPath, 'utf-8');
      const lowerContent = content.toLowerCase();
      const index = lowerContent.indexOf(lowerQuery);

      if (index !== -1) {
        contentMatch = true;
        const start = Math.max(0, index - 60);
        const end = Math.min(content.length, index + query.length + 60);
        snippet = content.slice(start, end).replace(/\r?\n/g, ' ').trim();
        if (start > 0) snippet = '...' + snippet;
        if (end < content.length) snippet += '...';
      }

      if (titleMatch || contentMatch) {
        if (!snippet && content.length > 0) {
          snippet = content.slice(0, 120).replace(/\r?\n/g, ' ').trim();
          if (content.length > 120) snippet += '...';
        }

        results.push({
          vault: file.vaultName,
          path: file.relativePath,
          fullPath: file.fullPath,
          title: file.title,
          mtime: new Date(file.mtime).toISOString(),
          snippet
        });

        // Cap results to avoid performance issues
        if (results.length >= 50) break;
      }
    } catch (err) {
      // Skip files we fail to read
    }
  }

  res.json(results);
});

// API: Manual refresh
app.post('/api/refresh', async (req, res) => {
  await refreshCache();
  res.json({ success: true, lastScanTime });
});

// Initial scan and start server
(async () => {
  await refreshCache();
  
  // Set up periodic cache refresh every 5 minutes
  setInterval(refreshCache, 5 * 60 * 1000);

  app.listen(PORT, () => {
    console.log(`Vault Dashboard Server running at http://localhost:${PORT}`);
  });
})();
