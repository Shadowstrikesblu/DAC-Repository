import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import ChatInput from './ChatInput'

describe('ChatInput (Axe 5 — suggestions de saisie)', () => {
  it('affiche les suggestions quand le champ est vide', () => {
    render(<ChatInput onSend={() => {}} />)
    expect(screen.getByText('crée une instance ubuntu sur aws')).toBeInTheDocument()
    expect(screen.getByText('configure nginx sur mon serveur')).toBeInTheDocument()
  })

  it('envoie la suggestion au clic', () => {
    const onSend = vi.fn()
    render(<ChatInput onSend={onSend} />)
    fireEvent.click(screen.getByText('crée une instance ubuntu sur aws'))
    expect(onSend).toHaveBeenCalledWith('crée une instance ubuntu sur aws')
  })

  it('envoie le texte saisi au submit', () => {
    const onSend = vi.fn()
    render(<ChatInput onSend={onSend} />)
    const input = screen.getByPlaceholderText(/Posez vos questions/i)
    fireEvent.change(input, { target: { value: 'installe docker' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(onSend).toHaveBeenCalledWith('installe docker')
  })

  it("n'envoie pas un message vide", () => {
    const onSend = vi.fn()
    render(<ChatInput onSend={onSend} />)
    const input = screen.getByPlaceholderText(/Posez vos questions/i)
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(onSend).not.toHaveBeenCalled()
  })
})
