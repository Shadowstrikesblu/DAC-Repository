import { describe, it, expect } from 'vitest'
import { friendlyNetworkError } from './errorMessage'

describe('friendlyNetworkError (Axe 6 — erreurs réseau claires)', () => {
  it('traduit un timeout axios (ECONNABORTED)', () => {
    const msg = friendlyNetworkError({ code: 'ECONNABORTED', message: 'timeout of 30000ms exceeded' })
    expect(msg).toMatch(/trop de temps/i)
    // Plus de message technique anglais brut renvoyé tel quel
    expect(msg).not.toBe('timeout of 30000ms exceeded')
  })

  it('traduit un timeout détecté via le message', () => {
    const msg = friendlyNetworkError({ message: 'timeout exceeded' })
    expect(msg).toMatch(/trop de temps/i)
  })

  it('gère un serveur injoignable (pas de response)', () => {
    const msg = friendlyNetworkError({ message: 'Network Error' })
    expect(msg).toMatch(/joindre le serveur/i)
  })

  it('gère un 401 (session expirée)', () => {
    const msg = friendlyNetworkError({ response: { status: 401 } })
    expect(msg).toMatch(/session expirée/i)
  })

  it('gère un 403 (non autorisé)', () => {
    const msg = friendlyNetworkError({ response: { status: 403 } })
    expect(msg).toMatch(/non autorisée/i)
  })

  it('gère un 500 avec détail backend', () => {
    const msg = friendlyNetworkError({ response: { status: 500, data: { detail: 'boom' } } })
    expect(msg).toMatch(/erreur serveur/i)
    expect(msg).toContain('boom')
  })

  it('renvoie le détail backend pour une erreur 4xx générique', () => {
    const msg = friendlyNetworkError({ response: { status: 400, data: { detail: 'champ manquant' } } })
    expect(msg).toContain('champ manquant')
  })
})
