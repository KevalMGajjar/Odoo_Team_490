import express from 'express'
import multer from 'multer'
import { verifyJWT, requireRole } from '../middleware/auth.js'
import { badRequest } from '../lib/errors.js'
import { saveBuffer, ALLOWED_MIME, MAX_BYTES } from '../services/fileStore.js'

/**
 * Image uploads.
 *
 * Multipart rather than a base64 JSON field: base64 inflates the payload by
 * about a third, and the bytes only get decoded again on arrival.
 *
 * Uploading requires a session and write permission. Serving is handled by
 * express.static in server.js — see the note there about why the files
 * themselves are not behind auth.
 */

const router = express.Router()

const upload = multer({
  // Kept in memory: the files are small (client-resized thumbnails) and the
  // store hashes the buffer to decide the name, so a temp file on disk would
  // only have to be read back and deleted.
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_BYTES, files: 1 },
  fileFilter: (req, file, cb) => {
    // Reject by *skipping* the file (cb(null, false)) rather than erroring
    // here. Passing an error out of fileFilter abandons the request stream
    // mid-upload: multer stops reading, the client is still sending, and the
    // response never gets written — curl and the browser both just hang.
    // Skipping lets multer drain the body, and the handler below turns the
    // recorded reason into a proper 400.
    if (!ALLOWED_MIME.includes(file.mimetype)) {
      req.rejectedMimeType = file.mimetype
      return cb(null, false)
    }
    cb(null, true)
  },
})

router.post(
  '/',
  verifyJWT,
  requireRole(['admin', 'accountant']),
  (req, res, next) => {
    upload.single('file')(req, res, (err) => {
      // Multer's own errors (size, count) are operational, not bugs — turn
      // them into a clear 400 rather than letting them surface as a 500.
      if (err?.code === 'LIMIT_FILE_SIZE') {
        return next(badRequest(`Image is too large (max ${Math.round(MAX_BYTES / 1024 / 1024)}MB)`))
      }
      if (err) return next(err)
      next()
    })
  },
  async (req, res, next) => {
    try {
      if (req.rejectedMimeType) {
        throw badRequest(`Unsupported image type: ${req.rejectedMimeType}. Use JPEG, PNG or WebP.`)
      }
      if (!req.file) throw badRequest('No file was uploaded')
      const url = await saveBuffer(req.file.buffer, req.file.mimetype)
      res.status(201).json({ url, bytes: req.file.size, contentType: req.file.mimetype })
    } catch (err) { next(err) }
  },
)

export default router
