import { describe, it } from 'vitest'

describe('Master Data: Chart of Accounts Tests', () => {
  for (let i = 1; i <= 8; i++) {
    it.todo(`COA-${String(i).padStart(3, '0')}: description`)
  }
})
