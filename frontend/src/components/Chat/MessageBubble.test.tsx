import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import MessageBubble from './MessageBubble'

describe('MessageBubble (Axe 2 — info / proposition / exécution / erreur)', () => {
  it("affiche le badge Erreur quand extra.type='error'", () => {
    render(
      <MessageBubble
        message={{ sender: 'bot', text: 'Une erreur est survenue', extra: { type: 'error' } }}
        isConsecutive={false}
      />,
    )
    expect(screen.getByText('Erreur')).toBeInTheDocument()
  })

  it("affiche le badge Action exécutée quand extra.type='execution'", () => {
    render(
      <MessageBubble
        message={{ sender: 'bot', text: 'fait', extra: { type: 'execution' } }}
        isConsecutive={false}
      />,
    )
    expect(screen.getByText('Action exécutée')).toBeInTheDocument()
  })

  it("infère le type 'execution' depuis le contenu (déployée)", () => {
    render(
      <MessageBubble
        message={{ sender: 'bot', text: 'Infrastructure déployée avec succès' }}
        isConsecutive={false}
      />,
    )
    expect(screen.getByText('Action exécutée')).toBeInTheDocument()
  })

  it("infère le type 'error' depuis le contenu (échoué)", () => {
    render(
      <MessageBubble
        message={{ sender: 'bot', text: 'La création a échoué' }}
        isConsecutive={false}
      />,
    )
    expect(screen.getByText('Erreur')).toBeInTheDocument()
  })

  it('affiche Information par défaut pour un message neutre', () => {
    render(
      <MessageBubble
        message={{ sender: 'bot', text: 'Voici quelques informations utiles' }}
        isConsecutive={false}
      />,
    )
    expect(screen.getByText('Information')).toBeInTheDocument()
  })

  it("n'affiche aucun badge pour un message utilisateur", () => {
    render(
      <MessageBubble
        message={{ sender: 'user', text: 'crée une instance' }}
        isConsecutive={false}
      />,
    )
    expect(screen.queryByText('Information')).not.toBeInTheDocument()
    expect(screen.queryByText('Erreur')).not.toBeInTheDocument()
    expect(screen.getByText('Vous')).toBeInTheDocument()
  })
})
