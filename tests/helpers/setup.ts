/**
 * Vitest global setup — loads test environment variables.
 */
import { config } from 'dotenv'
import { resolve } from 'path'

config({ path: resolve(__dirname, '../.env.test.example') })
// Override with local .env.test if it exists
config({ path: resolve(__dirname, '../.env.test'), override: true })
