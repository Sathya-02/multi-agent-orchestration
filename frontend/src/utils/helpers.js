/**
 * Returns an emoji icon for a given filename based on its extension.
 */
export function fileIcon(name) {
  if (!name || typeof name !== 'string') return '📎'
  const ext = name.split('.').pop().toLowerCase()
  const map = {
    pdf: '📄', docx: '📝', txt: '📃', csv: '📊', xlsx: '📊',
    json: '📋', md: '📝', log: '📃', png: '🖼️', jpg: '🖼️', jpeg: '🖼️',
  }
  return map[ext] || '📎'
}

/**
 * Formats a byte count to a human-readable string.
 */
export function formatBytes(b) {
  if (b == null) return ''
  if (b < 1024)    return `${b} B`
  if (b < 1048576) return `${(b / 1024).toFixed(1)} KB`
  return `${(b / 1048576).toFixed(1)} MB`
}
