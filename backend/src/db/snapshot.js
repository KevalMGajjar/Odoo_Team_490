import 'dotenv/config'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { existsSync, mkdirSync } from 'node:fs'
import path from 'node:path'

/**
 * Demo-day insurance.
 *
 *   npm run snapshot          dump the whole database to backend/snapshots/latest.dump
 *   npm run snapshot -- name  dump to backend/snapshots/name.dump
 *   npm run restore           restore backend/snapshots/latest.dump
 *   npm run restore -- name   restore backend/snapshots/name.dump
 *
 * Uses pg_dump/pg_restore directly rather than hand-rolling a JSON export —
 * getting every Decimal, Date and enum round-trip exactly right by hand isn't
 * worth it when Postgres's own tools already do it correctly. If the database
 * corrupts or a live demo goes sideways at 3am, this is twenty seconds from a
 * known-good state.
 */

const execFileAsync = promisify(execFile)

const SNAPSHOT_DIR = path.resolve(import.meta.dirname, '../../snapshots')
const mode = process.argv[2] // 'dump' | 'restore'
const name = process.argv[3] || 'latest'

function parseDatabaseUrl(url) {
  const u = new URL(url)
  return {
    host: u.hostname,
    port: u.port || '5432',
    user: decodeURIComponent(u.username),
    password: decodeURIComponent(u.password),
    database: u.pathname.replace(/^\//, ''),
  }
}

async function run(bin, args, { password }) {
  const { stdout, stderr } = await execFileAsync(bin, args, {
    env: { ...process.env, PGPASSWORD: password },
    maxBuffer: 1024 * 1024 * 100,
  })
  if (stdout?.trim()) console.log(stdout.trim())
  if (stderr?.trim()) console.error(stderr.trim())
}

async function dump(conn) {
  if (!existsSync(SNAPSHOT_DIR)) mkdirSync(SNAPSHOT_DIR, { recursive: true })
  const file = path.join(SNAPSHOT_DIR, `${name}.dump`)

  console.log(`\n  dumping ${conn.database} → ${file}`)
  await run('pg_dump', [
    '-h', conn.host, '-p', conn.port, '-U', conn.user,
    '-Fc', // custom format: compressed, restorable with pg_restore, table order handled automatically
    '-f', file,
    conn.database,
  ], conn)
  console.log(`  done\n`)
}

async function restore(conn) {
  const file = path.join(SNAPSHOT_DIR, `${name}.dump`)
  if (!existsSync(file)) {
    console.error(`\n  \x1b[31mNo snapshot found at ${file}\x1b[0m`)
    console.error(`  Run \`npm run snapshot\` first, or pass the right name.\n`)
    process.exit(1)
  }

  console.log(`\n  restoring ${file} → ${conn.database}`)
  console.log('  dropping and recreating the schema first...')
  await run('psql', [
    '-h', conn.host, '-p', conn.port, '-U', conn.user, '-d', conn.database,
    '-c', 'DROP SCHEMA public CASCADE; CREATE SCHEMA public;',
  ], conn)

  await run('pg_restore', [
    '-h', conn.host, '-p', conn.port, '-U', conn.user,
    '-d', conn.database,
    '--no-owner', '--no-privileges',
    file,
  ], conn)
  console.log(`  done — restored to the state at snapshot time\n`)
}

async function main() {
  if (!['dump', 'restore'].includes(mode)) {
    console.error('Usage: node src/db/snapshot.js <dump|restore> [name]')
    process.exit(1)
  }
  const conn = parseDatabaseUrl(process.env.DATABASE_URL)
  if (mode === 'dump') await dump(conn)
  else await restore(conn)
}

main().catch((err) => {
  console.error('\n\x1b[31mSnapshot operation failed:\x1b[0m', err.message)
  process.exit(1)
})
