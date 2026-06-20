// DOM Elements
const urlInput = document.getElementById('youtube-url');
const clearBtn = document.getElementById('clear-btn');
const fetchBtn = document.getElementById('fetch-btn');
const inputError = document.getElementById('input-error');
const loadingSpinner = document.getElementById('loading-spinner');

const ffmpegBadge = document.getElementById('ffmpeg-badge');
const videoCard = document.getElementById('video-card');
const videoThumb = document.getElementById('video-thumb');
const videoDuration = document.getElementById('video-duration');
const videoTitle = document.getElementById('video-title');
const videoUploader = document.getElementById('video-uploader').querySelector('span');
const videoViews = document.getElementById('video-views');
const videoLikes = document.getElementById('video-likes');
const formatSelect = document.getElementById('format-select');
const downloadBtn = document.getElementById('download-btn');

const progressCard = document.getElementById('progress-card');
const progressVideoTitle = document.getElementById('progress-video-title');
const progressPercent = document.getElementById('progress-percent');
const progressBar = document.getElementById('progress-bar');
const progressSpeed = document.getElementById('progress-speed');
const progressEta = document.getElementById('progress-eta');
const progressSize = document.getElementById('progress-size');
const progressFormat = document.getElementById('progress-format');

const openFolderBtn = document.getElementById('open-folder-btn');
const historyList = document.getElementById('history-list');

const toast = document.getElementById('toast');
const toastIcon = document.getElementById('toast-icon');
const toastText = document.getElementById('toast-text');

// State Variables
let currentVideoData = null;
let downloadIntervalId = null;

// Initial Setup
document.addEventListener('DOMContentLoaded', () => {
    checkFfmpegStatus();
    loadHistory();
    setupEventListeners();
});

// Event Listeners Setup
function setupEventListeners() {
    // Show/hide clear button
    urlInput.addEventListener('input', () => {
        if (urlInput.value.trim() !== '') {
            clearBtn.style.display = 'flex';
        } else {
            clearBtn.style.display = 'none';
        }
        hideError();
    });

    // Clear input
    clearBtn.addEventListener('click', () => {
        urlInput.value = '';
        clearBtn.style.display = 'none';
        hideError();
        urlInput.focus();
    });

    // Fetch video info
    fetchBtn.addEventListener('click', handleFetch);
    urlInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            handleFetch();
        }
    });

    // Start download
    downloadBtn.addEventListener('click', handleDownload);

    // Open Downloads Folder
    openFolderBtn.addEventListener('click', openDownloadsFolder);
}

// Show Error Message
function showError(message) {
    inputError.textContent = message;
    inputError.style.display = 'flex';
}

function hideError() {
    inputError.style.display = 'none';
}

// Toast Utility
function showToast(message, type = 'info') {
    toastText.textContent = message;
    toast.className = `toast ${type}`;
    
    // Update Lucide Icon by replacing the element
    let iconName = 'info';
    if (type === 'success') iconName = 'check-circle';
    if (type === 'error') iconName = 'alert-triangle';
    
    const oldIcon = toast.querySelector('[data-lucide]') || toast.querySelector('svg');
    if (oldIcon) {
        const newIcon = document.createElement('i');
        newIcon.setAttribute('data-lucide', iconName);
        oldIcon.replaceWith(newIcon);
    }
    
    lucide.createIcons();
    
    toast.style.display = 'flex';
    
    // Auto hide after 4 seconds
    setTimeout(() => {
        toast.style.display = 'none';
    }, 4000);
}

// Check FFmpeg status
async function checkFfmpegStatus() {
    try {
        const response = await fetch('/api/ffmpeg-status');
        const data = await response.json();
        
        if (data.ffmpeg_available) {
            ffmpegBadge.className = 'badge success';
            ffmpegBadge.innerHTML = '<i data-lucide="shield-check"></i><span>FFmpeg Enabled (1080p/4K Supported)</span>';
        } else {
            ffmpegBadge.className = 'badge warning';
            ffmpegBadge.innerHTML = '<i data-lucide="alert-circle"></i><span>FFmpeg Missing (Max Quality 720p)</span>';
            
            // Add tooltip instructions when clicked
            ffmpegBadge.title = "Click to see how to enable HD resolutions";
            ffmpegBadge.addEventListener('click', () => {
                showToast("Without FFmpeg, YouTube merges are limited to 720p. Install FFmpeg in Windows PATH for 1080p+ and MP3s.", "info");
            });
        }
        lucide.createIcons();
    } catch (error) {
        console.error('Error checking FFmpeg status:', error);
    }
}

// Fetch Video Details
async function handleFetch() {
    const url = urlInput.value.trim();
    if (!url) {
        showError('Please enter a YouTube video URL.');
        return;
    }

    // Hide previous screens
    videoCard.style.display = 'none';
    hideError();
    loadingSpinner.style.display = 'flex';
    fetchBtn.disabled = true;

    try {
        const response = await fetch('/api/info', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ url: url })
        });
        
        const data = await response.json();
        
        if (response.ok) {
            currentVideoData = data;
            currentVideoData.url = url; // save URL
            
            // Populate Video Card Details
            videoThumb.src = data.thumbnail || 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?q=80&w=300';
            videoDuration.textContent = data.duration;
            videoTitle.textContent = data.title;
            videoUploader.textContent = data.uploader;
            videoViews.textContent = data.views;
            videoLikes.textContent = data.likes;
            
            // Populate format selector
            formatSelect.innerHTML = '';
            data.formats.forEach(fmt => {
                const option = document.createElement('option');
                option.value = fmt.id;
                option.textContent = `${fmt.label} (${fmt.ext}) - ${fmt.note}`;
                formatSelect.appendChild(option);
            });
            
            loadingSpinner.style.display = 'none';
            videoCard.style.display = 'block';
            
            // Smooth scroll to video details
            videoCard.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        } else {
            loadingSpinner.style.display = 'none';
            showError(data.error || 'Failed to retrieve video information. Make sure it is a valid YouTube link.');
        }
    } catch (error) {
        loadingSpinner.style.display = 'none';
        showError('Network error. Make sure your local Flask backend is running.');
        console.error('Fetch error:', error);
    } finally {
        fetchBtn.disabled = false;
    }
}

// Handle Download Request
async function handleDownload() {
    if (!currentVideoData) return;
    
    const selectedFormatId = formatSelect.value;
    const selectedFormatLabel = formatSelect.options[formatSelect.selectedIndex].text;
    
    downloadBtn.disabled = true;
    downloadBtn.querySelector('span').textContent = 'Starting...';
    
    try {
        const response = await fetch('/api/download', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                url: currentVideoData.url,
                format_id: selectedFormatId,
                title: currentVideoData.title,
                thumbnail: currentVideoData.thumbnail,
                duration: currentVideoData.duration,
                format_label: selectedFormatLabel.split(' - ')[0]
            })
        });
        
        const data = await response.json();
        
        if (response.ok) {
            showToast('Download initialized in background!', 'success');
            
            // Setup Progress UI
            progressCard.style.display = 'block';
            progressVideoTitle.textContent = currentVideoData.title;
            progressFormat.textContent = selectedFormatLabel.split(' - ')[0];
            progressPercent.textContent = '0%';
            progressBar.style.width = '0%';
            
            // Smooth scroll to progress area
            progressCard.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
            
            // Clear existing polling
            if (downloadIntervalId) clearInterval(downloadIntervalId);
            
            // Start Polling progress
            pollProgress(data.download_id);
        } else {
            showToast(data.error || 'Failed to start download.', 'error');
            downloadBtn.disabled = false;
            downloadBtn.querySelector('span').textContent = 'Start Download';
        }
    } catch (error) {
        showToast('Error communicating with download server.', 'error');
        downloadBtn.disabled = false;
        downloadBtn.querySelector('span').textContent = 'Start Download';
        console.error('Download error:', error);
    }
}

// Poll Active Download Progress
function pollProgress(downloadId) {
    downloadIntervalId = setInterval(async () => {
        try {
            const response = await fetch(`/api/progress/${downloadId}`);
            if (!response.ok) return;
            
            const data = await response.json();
            
            // Update UI
            progressPercent.textContent = `${data.percent}%`;
            progressBar.style.width = `${data.percent}%`;
            progressSpeed.textContent = data.speed;
            progressEta.textContent = data.eta;
            progressSize.textContent = `${data.downloaded_bytes} / ${data.total_bytes}`;
            
            if (data.status === 'processing') {
                progressPercent.textContent = '99%';
                progressBar.style.width = '99%';
                progressEta.textContent = 'Processing...';
                document.getElementById('status-message').textContent = 'Merging video and audio packages. Almost done...';
            }
            
            if (data.status === 'completed') {
                clearInterval(downloadIntervalId);
                showToast('Download completed successfully!', 'success');
                document.getElementById('status-message').textContent = `Saved: ${data.filename} in Downloads folder.`;
                
                // Re-enable download button
                downloadBtn.disabled = false;
                downloadBtn.querySelector('span').textContent = 'Start Download';
                
                // Reload History
                loadHistory();
            } else if (data.status === 'error') {
                clearInterval(downloadIntervalId);
                showToast(`Download failed: ${data.error_message}`, 'error');
                document.getElementById('status-message').innerHTML = `<span style="color: var(--accent-error);">Error: ${data.error_message}</span>`;
                
                // Re-enable download button
                downloadBtn.disabled = false;
                downloadBtn.querySelector('span').textContent = 'Start Download';
            }
        } catch (error) {
            console.error('Error polling progress:', error);
        }
    }, 1000);
}

// Load Recent History
async function loadHistory() {
    try {
        const response = await fetch('/api/recent');
        const data = await response.json();
        
        if (data.length === 0) {
            historyList.innerHTML = `
                <div class="history-empty">
                    <i data-lucide="folder-heart"></i>
                    <p>No downloads yet. Paste a link above to start downloading!</p>
                </div>
            `;
            lucide.createIcons();
            return;
        }
        
        historyList.innerHTML = '';
        data.forEach(item => {
            const historyItem = document.createElement('div');
            historyItem.className = 'history-item';
            
            // Handle display values
            const thumbUrl = item.thumbnail || 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?q=80&w=300';
            
            historyItem.innerHTML = `
                <div class="history-thumb">
                    <img src="${thumbUrl}" alt="Thumbnail">
                </div>
                <div class="history-info">
                    <h4 class="history-title" title="${escapeHtml(item.title)}">${escapeHtml(item.title)}</h4>
                    <div class="history-meta">
                        <span><i data-lucide="clock"></i> ${item.duration}</span>
                        <span><i data-lucide="file-video"></i> ${item.format}</span>
                    </div>
                </div>
                <div class="history-actions">
                    <button class="btn-icon open-file-btn" data-path="${escapeHtml(item.full_path)}" title="Open file folder">
                        <i data-lucide="folder"></i>
                    </button>
                </div>
            `;
            
            historyList.appendChild(historyItem);
        });
        
        // Add event listeners to the folder action buttons inside history
        document.querySelectorAll('.open-file-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                openDownloadsFolder();
            });
        });
        
        lucide.createIcons();
    } catch (error) {
        console.error('Error loading history:', error);
    }
}

// Open Downloads Folder in File Explorer
async function openDownloadsFolder() {
    try {
        const response = await fetch('/api/open-folder', { method: 'POST' });
        if (response.ok) {
            showToast('Opening downloads folder...', 'success');
        } else {
            showToast('Could not open downloads folder.', 'error');
        }
    } catch (error) {
        showToast('Error opening folder.', 'error');
    }
}

// HTML Escaping helper
function escapeHtml(text) {
    if (!text) return '';
    const map = {
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#039;'
    };
    return text.toString().replace(/[&<>"']/g, function(m) { return map[m]; });
}
