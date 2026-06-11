import '@testing-library/jest-dom'
import { afterEach } from 'vitest'
import { cleanup } from '@testing-library/react'

// Nettoie le DOM après chaque test.
afterEach(() => {
  cleanup()
})
