import { readdir, stat } from 'node:fs/promises'
import path from 'node:path'
import { prisma } from '../lib/prisma.js'
import { STORAGE_ROOT, PUBLIC_PREFIX } from '../services/fileStore.js'

/**
 * Inventory of the image store.
 *
 * Content-addressed names are unreadable on purpose — the filename is a hash,
 * so the filesystem alone cannot tell you that `44fc56….png` is a contact's
 * photo. This walks the store and joins it back to the records that point at
 * each file, which is the only way to answer "what am I looking at".
 *
 * It also reports the two ways the two halves can disagree: a file nothing
 * references any more (an image replaced, or an upload the user abandoned
 * before saving the form), and a record pointing at a file that is not there
 * (storage restored from a stale backup, or never backed up at all —
 * backend/storage/ is deliberately outside the database dump).
 *
 *   npm run files          list everything
 *   npm run files orphans  only the unreferenced ones
 */

const BASE = process.env.PUBLIC_BASE_URL || `http://localhost:${process.env.PORT || 4000}`
const kb = (n) => `${(n / 1024).toFixed(1)}kB`

async function walk(dir) {
  const out = []
  let entries
  try { entries = await readdir(dir, { withFileTypes: true }) } catch { return out }
  for (const e of entries) {
    const full = path.join(dir, e.name)
    if (e.isDirectory()) out.push(...await walk(full))
    else out.push(full)
  }
  return out
}

/** Every image reference held by any record, as url → who points at it. */
async function references() {
  const map = new Map()
  const add = (url, who) => {
    if (!url) return
    if (!map.has(url)) map.set(url, [])
    map.get(url).push(who)
  }
  const [contacts, products] = await Promise.all([
    prisma.contact.findMany({ where: { profileImage: { not: null } }, select: { name: true, profileImage: true } }),
    prisma.product.findMany({ where: { image: { not: null } }, select: { name: true, image: true } }),
  ])
  for (const c of contacts) add(c.profileImage, `contact “${c.name}”`)
  for (const p of products) add(p.image, `product “${p.name}”`)
  return map
}

async function main() {
  const only = process.argv[2]
  const files = await walk(STORAGE_ROOT)
  const refs = await references()

  const rows = await Promise.all(files.map(async (abs) => {
    const rel = path.relative(STORAGE_ROOT, abs).split(path.sep).join('/')
    const url = `${PUBLIC_PREFIX}/${rel}`
    return { url, bytes: (await stat(abs)).size, usedBy: refs.get(url) ?? [], abs }
  }))

  const shown = only === 'orphans' ? rows.filter((r) => !r.usedBy.length) : rows
  console.log(`\n\x1b[1m${shown.length} file${shown.length === 1 ? '' : 's'}\x1b[0m  in ${STORAGE_ROOT}\n`)

  for (const r of shown.sort((a, b) => b.usedBy.length - a.usedBy.length)) {
    const tag = r.usedBy.length
      ? `\x1b[32m${r.usedBy.join(', ')}\x1b[0m`
      : '\x1b[33munreferenced\x1b[0m'
    console.log(`  ${kb(r.bytes).padStart(8)}  ${tag}`)
    console.log(`            \x1b[2m${BASE}${r.url}\x1b[0m`)
    console.log(`            \x1b[2m${r.abs}\x1b[0m\n`)
  }

  // Records pointing at files that are not on disk. Legacy base64 values are
  // not broken — they carry their own bytes — so they are counted separately.
  const missing = []
  let legacy = 0
  for (const [url, who] of refs) {
    if (url.startsWith('data:')) { legacy += who.length; continue }
    if (!rows.some((r) => r.url === url)) missing.push(`${who.join(', ')} → ${url}`)
  }

  const orphans = rows.filter((r) => !r.usedBy.length).length
  console.log('\x1b[1msummary\x1b[0m')
  console.log(`  ${rows.length} on disk, ${kb(rows.reduce((a, r) => a + r.bytes, 0))} total`)
  console.log(`  ${rows.length - orphans} referenced, ${orphans} unreferenced`)
  if (legacy) console.log(`  \x1b[2m${legacy} record(s) still hold a legacy base64 image, not a file\x1b[0m`)
  if (missing.length) {
    console.log(`  \x1b[31m${missing.length} record(s) point at a file that is not on disk:\x1b[0m`)
    for (const m of missing) console.log(`    ${m}`)
  }
  console.log()
}

main()
  .catch((e) => { console.error(e); process.exitCode = 1 })
  .finally(() => prisma.$disconnect())
