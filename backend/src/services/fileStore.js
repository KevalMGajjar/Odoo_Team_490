import { createHash } from 'node:crypto'
import { mkdir, writeFile, access } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

/**
 * Content-addressed file storage on local disk.
 *
 * Images used to live in the database as base64 data URIs. That kept backups
 * simple but meant every read of a product carried its picture: the products
 * list shipped every thumbnail in its JSON, and base64 is ~33% larger than the
 * bytes it encodes. Files move that weight out of the row and let the browser
 * cache them.
 *
 * The name is the SHA-256 of the contents, so uploading the same image twice
 * writes it once, a file can never be silently replaced by different bytes,
 * and the URL can be cached forever — the content at a given path cannot
 * change by definition.
 *
 * Local disk, deliberately: the same "no cloud" rule the database follows.
 * Swapping in object storage later means reimplementing `save` and `urlFor`,
 * nothing else.
 */

const HERE = path.dirname(fileURLToPath(import.meta.url))
export const STORAGE_ROOT = path.resolve(HERE, '../../storage')

/** The public URL prefix these files are served from. */
export const PUBLIC_PREFIX = '/files'

const EXT_BY_MIME = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
}

export const ALLOWED_MIME = Object.keys(EXT_BY_MIME)
export const MAX_BYTES = 5 * 1024 * 1024

/** Fan out over two levels of subdirectory so one folder never holds
 *  hundreds of thousands of entries, which some filesystems handle badly. */
const shardPath = (hash, ext) => path.join(hash.slice(0, 2), hash.slice(2, 4), `${hash}.${ext}`)

/**
 * Write a buffer and return its public URL.
 *
 * Re-uploading identical bytes is a no-op that returns the existing URL.
 */
export async function saveBuffer(buffer, mimeType) {
  const ext = EXT_BY_MIME[mimeType]
  if (!ext) throw new Error(`Unsupported image type: ${mimeType}`)

  const hash = createHash('sha256').update(buffer).digest('hex')
  const relative = shardPath(hash, ext)
  const absolute = path.join(STORAGE_ROOT, relative)

  try {
    await access(absolute)
    // Already stored — identical content, so there is nothing to write.
  } catch {
    await mkdir(path.dirname(absolute), { recursive: true })
    await writeFile(absolute, buffer)
  }

  return `${PUBLIC_PREFIX}/${relative.split(path.sep).join('/')}`
}

/** Decode a `data:` URI into { buffer, mimeType }, or null if it isn't one. */
export function parseDataUri(value) {
  if (typeof value !== 'string') return null
  const match = value.match(/^data:([\w/+.-]+);base64,(.+)$/)
  if (!match) return null
  return { mimeType: match[1], buffer: Buffer.from(match[2], 'base64') }
}
