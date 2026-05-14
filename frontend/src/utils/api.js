/**
 * API helper functions for communicating with the backend.
 */

const API_BASE = 'http://localhost:3847/api';

async function request(endpoint, options = {}) {
    const url = `${API_BASE}${endpoint}`;
    
    const config = {
        headers: {
            'Content-Type': 'application/json',
        },
        ...options,
    };

    // Don't set Content-Type for FormData
    if (options.body instanceof FormData) {
        delete config.headers['Content-Type'];
    }

    try {
        const response = await fetch(url, config);
        const data = await response.json();
        
        if (!response.ok) {
            throw new Error(data.error || `HTTP ${response.status}`);
        }
        
        return data;
    } catch (error) {
        if (error.message === 'Failed to fetch') {
            throw new Error('Cannot connect to server. Make sure the backend is running on port 3847.');
        }
        throw error;
    }
}

// Video APIs
export async function submitYouTubeUrl(url, settings = {}) {
    return request('/video/youtube', {
        method: 'POST',
        body: JSON.stringify({ url, ...settings }),
    });
}

export async function uploadVideoFile(file, settings = {}) {
    const formData = new FormData();
    formData.append('video', file);
    Object.entries(settings).forEach(([key, value]) => {
        if (value !== undefined && value !== null) {
            formData.append(key, value);
        }
    });
    
    return request('/video/upload', {
        method: 'POST',
        body: formData,
    });
}

export async function getVideoInfo(url) {
    return request(`/video/info?url=${encodeURIComponent(url)}`);
}

export async function getJobStatus(videoId) {
    return request(`/video/${videoId}/status`);
}

export async function cancelJob(videoId) {
    return request(`/video/${videoId}/cancel`, { method: 'POST' });
}

export async function clearSession(videoId) {
    return request(`/video/${videoId}/clear-session`, { method: 'POST' });
}

export async function listVideos() {
    return request('/video');
}

// Clip APIs
export async function getClips(videoId) {
    return request(`/clips/${videoId}`);
}

export function getClipStreamUrl(videoId, index) {
    return `${API_BASE}/clips/${videoId}/${index}/stream`;
}

export function getClipThumbnailUrl(videoId, index) {
    return `${API_BASE}/clips/${videoId}/${index}/thumbnail`;
}

export function getClipDownloadUrl(videoId, index) {
    return `${API_BASE}/clips/${videoId}/${index}/download`;
}

/**
 * Download a SINGLE clip as MP4.
 * Uses window.open which tells the browser to natively process the download.
 * Since the backend serves it with "Content-Disposition: attachment; filename=...",
 * the browser will natively save it as an MP4 with the correct name!
 */
export function downloadSingleClip(videoId, index) {
    const url = `${API_BASE}/clips/${videoId}/${index}/download`;
    const a = document.createElement('a');
    a.href = url;
    a.style.display = 'none';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
}

/**
 * Bulk download clips as ZIP.
 * Same method — lets the browser handle the attachment headers directly.
 */
export function bulkDownloadClips(videoId, clipIndices = null, hashtagMode = 'with_tags') {
    let url = `${API_BASE}/clips/${videoId}/bulk-download?hashtagMode=${hashtagMode}`;
    if (clipIndices && clipIndices.length > 0) {
        url += `&indices=${clipIndices.join(',')}`;
    }
    const a = document.createElement('a');
    a.href = url;
    a.style.display = 'none';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
}

export async function deleteClips(videoId) {
    return request(`/clips/${videoId}`, { method: 'DELETE' });
}

// Template APIs
export async function getTemplates() {
    return request('/templates');
}

// Health check
export async function checkHealth() {
    return request('/health');
}
