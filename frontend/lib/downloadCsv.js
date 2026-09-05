import { api } from './api'

/** Fetch a report's CSV export and hand it to the browser as a download. */
export async function downloadCsv(path, params, filename) {
  const blob = await api.raw(path, { ...params, format: 'csv' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}
