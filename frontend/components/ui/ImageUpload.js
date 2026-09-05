'use client'

import { useRef, useState } from 'react'
import { Image as ImageIcon, Upload, X } from 'lucide-react'
import clsx from 'clsx'
import { Button } from '@/components/ui/Button'
import { useToast } from '@/components/ui/Toast'
import { api, ApiError, assetUrl } from '@/lib/api'

const MAX_DIMENSION = 320
const JPEG_QUALITY = 0.82
const MAX_SOURCE_BYTES = 8 * 1024 * 1024 // reject absurdly large uploads before we even try to decode them

function resizeToBlob(file) {
  return new Promise((resolve, reject) => {
    const img = new window.Image()
    const reader = new FileReader()
    reader.onerror = () => reject(new Error('Could not read file'))
    reader.onload = () => {
      img.onerror = () => reject(new Error('Could not decode image'))
      img.onload = () => {
        const scale = Math.min(1, MAX_DIMENSION / Math.max(img.width, img.height))
        const w = Math.round(img.width * scale)
        const h = Math.round(img.height * scale)
        const canvas = document.createElement('canvas')
        canvas.width = w
        canvas.height = h
        canvas.getContext('2d').drawImage(img, 0, 0, w, h)
        // A Blob rather than a data URI: it's uploaded as multipart, and
        // base64 would inflate the transfer by about a third for no benefit.
        canvas.toBlob(
          (blob) => (blob ? resolve(blob) : reject(new Error('Could not encode image'))),
          'image/jpeg',
          JPEG_QUALITY,
        )
      }
      img.src = reader.result
    }
    reader.readAsDataURL(file)
  })
}

/**
 * A thumbnail + Upload/Remove pair.
 *
 * The value is a URL into the file store. Images used to be kept as base64 on
 * the record itself, which meant every list request carried its thumbnails.
 * Existing records may still hold a `data:` URI, and those keep rendering —
 * an <img> treats both the same.
 *
 * The client still resizes to MAX_DIMENSION before uploading, so the stored
 * file is a thumbnail regardless of what the user picked.
 */
export function ImageUpload({ value, onChange, disabled, shape = 'square', label = 'Image' }) {
  const inputRef = useRef(null)
  const [busy, setBusy] = useState(false)
  const { push } = useToast()

  const pick = () => inputRef.current?.click()

  const onFile = async (e) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    if (!file.type.startsWith('image/')) {
      push('Please choose an image file', { type: 'error' })
      return
    }
    if (file.size > MAX_SOURCE_BYTES) {
      push('Image is too large (max 8MB)', { type: 'error' })
      return
    }
    setBusy(true)
    try {
      const blob = await resizeToBlob(file)
      const form = new FormData()
      form.append('file', blob, 'upload.jpg')
      // Stored on disk and referenced by URL, so the image no longer travels
      // inside every read of the record it belongs to.
      const { url } = await api.upload('/files', form)
      onChange(url)
    } catch (err) {
      push(err instanceof ApiError ? err.message : 'Could not process that image', { type: 'error' })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex items-center gap-3">
      <div
        className={clsx(
          'flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden border border-line bg-surface-subtle',
          shape === 'circle' ? 'rounded-full' : 'rounded',
        )}
      >
        {value ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={assetUrl(value)} alt={label} className="h-full w-full object-cover" />
        ) : (
          <ImageIcon size={20} className="text-ink-faint" />
        )}
      </div>
      {!disabled && (
        <div className="flex flex-col gap-1.5">
          <input ref={inputRef} type="file" accept="image/*" className="hidden" onChange={onFile} />
          <Button type="button" variant="secondary" size="sm" icon={Upload} onClick={pick} loading={busy}>
            {value ? 'Change' : 'Upload'}
          </Button>
          {value && (
            <button
              type="button"
              onClick={() => onChange(null)}
              className="flex items-center gap-1 text-xs text-ink-faint hover:text-state-overdue"
            >
              <X size={11} /> Remove
            </button>
          )}
        </div>
      )}
    </div>
  )
}
