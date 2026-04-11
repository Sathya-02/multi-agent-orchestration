/**
 * Returns an emoji icon for a given filename based on its extension.
 */
export function fileIcon(name) {
  if (!name || typeof name !== 'string') return '📎'
  const ext = name.split('.').pop().toLowerCase()
  const map = {
    pdf: '📄', docx: '📝', doc: '📝', txt: '📃',
    csv: '📊', xlsx: '📊', xls: '📊', json: '📋',
    md:  '📝', log:  '📃', png:  '🖼️', jpg:  '🖼️',
    jpeg:'🖼️', gif:  '🖼️', svg:  '🖼️', mp4:  '🎬',
    mp3: '🎵', zip:  '🗜️', tar:  '🗜️', py:   '🐍',
    js:  '📜', ts:   '📜', jsx:  '📜', tsx:  '📜',
  }
  return map[ext] || '📎'
}

/**
 * Formats a byte count into a human-readable string.
 */
export function formatBytes(bytes) {
  if (bytes == null) return ''
  if (bytes < 1024)       return `${bytes} B`
  if (bytes < 1_048_576)  return `${(bytes / 1024).toFixed(1)} KB`
  if (bytes < 1_073_741_824) return `${(bytes / 1_048_576).toFixed(1)} MB`
  return `${(bytes / 1_073_741_824).toFixed(2)} GB`
}

/**
 * Clamps a number between min and max.
 */
export function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max)
}

/**
 * Returns a relative time string (e.g. "2 minutes ago").
 */
export function timeAgo(ts) {
  const diff = Date.now() / 1000 - ts
  if (diff < 60)   return 'just now'
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
  if (diff < 86400)return `${Math.floor(diff / 3600)}h ago`
  return `${Math.floor(diff / 86400)}d ago`
}
