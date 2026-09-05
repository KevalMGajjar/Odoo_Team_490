/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // The API is called directly cross-origin (see lib/api.js), matching the
  // backend's CORS setup (FRONTEND_URL + credentials: true) and how the
  // Socket.IO client must connect anyway — no rewrite proxy needed.
}

module.exports = nextConfig
