export function fileIcon(name) {
  if (!name || typeof name !== 'string') return '📎'
  const ext = name.split('.').pop().toLowerCase()
  return { pdf:'📄', docx:'📝', txt:'📃', csv:'📊', xlsx:'📊',
           json:'📋', md:'📝', log:'📃', png:'🖼️', jpg:'🖼️' }[ext] || '📎'
}
export function formatBytes(b) {
  if (b < 1024)    return `${b} B`
  if (b < 1048576) return `${(b/1024).toFixed(1)} KB`
  return `${(b/1048576).toFixed(1)} MB`
}