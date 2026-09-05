/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Hides the floating Next.js dev badge — it overlaps the bottom-left of the
  // UI during demos. Development-only; it never shipped in a production build.
  devIndicators: false,
  // The API is called directly cross-origin (see lib/api.js), matching the
  // backend's CORS setup (FRONTEND_URL + credentials: true) and how the
  // Socket.IO client must connect anyway — no rewrite proxy needed.
}

module.exports = nextConfig
