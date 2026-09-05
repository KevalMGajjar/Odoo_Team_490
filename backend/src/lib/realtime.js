import { Server } from 'socket.io'

/**
 * Live updates over Socket.IO.
 *
 * Every mutation broadcasts, so a second browser reflects a posting without a
 * refresh — the clearest possible answer to "use real-time or dynamic data
 * sources". Rooms are per role so a portal user never receives internal traffic.
 */

let io = null

export function initRealtime(httpServer, { origin }) {
  io = new Server(httpServer, {
    cors: { origin, credentials: true },
    path: '/socket.io',
  })

  io.on('connection', (socket) => {
    const { role, contactId } = socket.handshake.auth ?? {}
    if (role === 'user' && contactId) socket.join(`partner:${contactId}`)
    else if (role) socket.join('internal')

    socket.on('disconnect', () => {})
  })

  return io
}

/**
 * @param {string} event  e.g. 'invoice:posted', 'stock:changed'
 * @param {object} payload small — an id and a label, not a whole record
 * @param {string} [room]  restrict delivery (e.g. `partner:<id>`)
 */
export function broadcast(event, payload = {}, room = 'internal') {
  if (!io) return
  io.to(room).emit(event, { ...payload, at: new Date().toISOString() })
}

/** Notify internal staff and, when relevant, the specific portal user. */
export function broadcastDocument(event, payload, partnerId = null) {
  broadcast(event, payload, 'internal')
  if (partnerId) broadcast(event, payload, `partner:${partnerId}`)
}

export const getIo = () => io
