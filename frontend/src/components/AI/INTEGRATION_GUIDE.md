# Frontend Integration Guide - Error Analysis Panel

## Overview

Le composant `ErrorAnalysisPanel` affiche les analyses IA d'erreurs Terraform/Ansible/SSM/Kubernetes directement dans le chat DAC.

## Components

### 1. ErrorAnalysisPanel.tsx

**Localisation** : `frontend/src/components/AI/ErrorAnalysisPanel.tsx`

**Props** :
```typescript
interface ErrorAnalysisPanelProps {
  executionId: number;                    // ID de l'exécution
  onAnalysisReady?: (analysis) => void;   // Callback quand analyse est prête
}
```

**Features** :
- ✅ Polling automatique (3s) jusqu'à analyse disponible
- ✅ Affichage cause racine + explications
- ✅ Liste de recommandations priorisées
- ✅ Commandes copie-colle
- ✅ Feedback utilisateur (helpful/incorrect/incomplete)
- ✅ Avertissement sécurité

### 2. useErrorAnalysis Hook

**Localisation** : `frontend/src/hooks/useErrorAnalysis.ts`

**Usage** :
```typescript
const { showAnalysisPanel, analysis, isLoading } = useErrorAnalysis(executionId);
```

## Integration dans le Chat

### Step 1: Importer le composant et hook

```typescript
// frontend/src/components/Chat/ChatInterface.tsx
import ErrorAnalysisPanel from '../AI/ErrorAnalysisPanel';
import useErrorAnalysis from '../../hooks/useErrorAnalysis';
```

### Step 2: Ajouter le state

```typescript
const [currentExecution, setCurrentExecution] = useState<any | null>(null);
const { showAnalysisPanel, analysis } = useErrorAnalysis(
  currentExecution?.id || null
);
```

### Step 3: Mettre à jour quand une exécution échoue

```typescript
// Quand l'API retourne une erreur d'exécution
if (response.status === "failed") {
  setCurrentExecution(response.execution);
  // Le hook va commencer à poll l'API AI automatiquement
}
```

### Step 4: Afficher le panel

```tsx
{currentExecution?.status === "failed" && showAnalysisPanel && (
  <ErrorAnalysisPanel 
    executionId={currentExecution.id}
    onAnalysisReady={(analysis) => {
      console.log('Analyse reçue', analysis);
    }}
  />
)}
```

## Exemple complet d'intégration

```typescript
// frontend/src/components/Chat/ChatInterface.tsx

import React, { useState } from 'react';
import { Box, Typography } from '@mui/material';
import ErrorAnalysisPanel from '../AI/ErrorAnalysisPanel';
import useErrorAnalysis from '../../hooks/useErrorAnalysis';

export const ChatInterface: React.FC = () => {
  const [messages, setMessages] = useState<any[]>([]);
  const [currentExecution, setCurrentExecution] = useState<any | null>(null);
  
  const { showAnalysisPanel } = useErrorAnalysis(
    currentExecution?.id || null
  );

  const handleExecute = async (prompt: string) => {
    try {
      const response = await api.executeIntent(prompt);
      
      if (response.status === "failed") {
        // Exécution échouée → afficher l'analyse IA
        setCurrentExecution(response.execution);
        
        // Message utilisateur
        setMessages(prev => [...prev, {
          role: 'user',
          content: prompt,
        }]);
        
        // Message assistant (indication que c'est pas bon)
        setMessages(prev => [...prev, {
          role: 'assistant',
          content: `❌ Erreur d'exécution : ${response.error_message}`,
        }]);
      } else {
        // Succès
        setMessages(prev => [...prev, {
          role: 'assistant',
          content: `✅ ${response.summary}`,
        }]);
      }
    } catch (error) {
      console.error('Erreur:', error);
    }
  };

  return (
    <Box>
      {/* Chat Messages */}
      <Box sx={{ mb: 2 }}>
        {messages.map((msg, idx) => (
          <Box key={idx} sx={{ mb: 1 }}>
            <Typography variant="body2">
              {msg.role === 'user' ? '👤' : '🤖'} {msg.content}
            </Typography>
          </Box>
        ))}
      </Box>

      {/* Error Analysis Panel */}
      {currentExecution?.status === "failed" && showAnalysisPanel && (
        <ErrorAnalysisPanel 
          executionId={currentExecution.id}
          onAnalysisReady={(analysis) => {
            console.log('Analyse disponible', analysis);
          }}
        />
      )}

      {/* Input */}
      <input
        type="text"
        onKeyPress={(e) => {
          if (e.key === 'Enter') {
            handleExecute(e.currentTarget.value);
            e.currentTarget.value = '';
          }
        }}
        placeholder="Décris ce que tu veux faire..."
      />
    </Box>
  );
};
```

## Styling

Le composant utilise Material-UI (`@mui/material`). Les couleurs sont basées sur la sévérité :

| Sévérité | Couleur |
|----------|---------|
| critical | 🔴 #d32f2f |
| high | 🟠 #f57c00 |
| medium | 🟡 #fbc02d |
| low | 🟢 #388e3c |

Personnaliser les couleurs via `getSeverityColor()` dans le composant.

## API Calls

Le composant fait des appels à :

```
GET /api/ai/analyses/{execution_id}
```

**Header requis** :
```
Authorization: Bearer {token}
```

**Response** :
```json
{
  "id": 1,
  "execution_id": 123,
  "error_type": "terraform_apply",
  "analysis": {
    "root_cause": "...",
    "explanation": "...",
    "severity": "high",
    "affected_components": [...],
    "recommendations": [...]
  },
  "created_at": "2026-06-12T10:00:00",
  "user_feedback": null
}
```

## Accessibility

- ✅ ARIA labels sur les boutons
- ✅ Keyboard navigation support
- ✅ Contraste sufficient pour WCAG AA
- ✅ Icons + text pour les boutons

## Performance

- ✅ Lazy loading du composant
- ✅ Polling arrête automatiquement si analyse trouvée
- ✅ Memoization des callbacks
- ✅ Pas de re-renders inutiles

## Testing

### Unit Tests

```typescript
// frontend/src/components/AI/__tests__/ErrorAnalysisPanel.test.tsx

import { render, screen, waitFor } from '@testing-library/react';
import ErrorAnalysisPanel from '../ErrorAnalysisPanel';
import * as axios from 'axios';

jest.mock('axios');

describe('ErrorAnalysisPanel', () => {
  it('should display loading state initially', () => {
    render(<ErrorAnalysisPanel executionId={123} />);
    expect(screen.getByText(/Analyse IA en cours/i)).toBeInTheDocument();
  });

  it('should fetch and display analysis', async () => {
    const mockAnalysis = {
      analysis: {
        root_cause: 'Test cause',
        explanation: 'Test explanation',
        severity: 'high',
        affected_components: ['EC2'],
        recommendations: [],
      },
    };

    (axios.get as jest.Mock).mockResolvedValueOnce({
      data: mockAnalysis,
    });

    render(<ErrorAnalysisPanel executionId={123} />);

    await waitFor(() => {
      expect(screen.getByText('Test cause')).toBeInTheDocument();
    });
  });
});
```

### E2E Tests

```typescript
// tests_e2e/chat_ai_analysis.spec.ts

test('should show AI analysis when execution fails', async ({ page }) => {
  // Navigate to chat
  await page.goto('/chat');
  
  // Execute failing command
  await page.fill('[placeholder="Décris..."]', 'invalid command');
  await page.press('[placeholder="Décris..."]', 'Enter');
  
  // Wait for error
  await page.waitForText('Erreur d\'exécution');
  
  // Wait for analysis panel
  await page.waitForText('💡 Analyse IA');
  
  // Click expand
  await page.click('[aria-expanded="false"]');
  
  // Verify content
  await page.waitForText('Cause racine');
  await page.waitForText('Actions correctives');
});
```

## Troubleshooting

### Analysis Panel not appearing

1. Vérifier que l'API retourne une analyse :
```bash
curl -H "Authorization: Bearer TOKEN" \
  http://localhost:8000/api/ai/analyses/123
```

2. Vérifier les logs frontend :
```javascript
console.log('Analysis response:', analysis);
```

3. Vérifier les logs backend :
```bash
tail -f generated_files/api_logs/api_*.log | grep "AI Analysis"
```

### Polling stuck

Le polling arrête automatiquement après 30 secondes si pas de réponse. Forcer un refresh :

```typescript
const { checkForAnalysis } = useErrorAnalysis(executionId);
checkForAnalysis(); // Re-check manually
```

### Token expiration

Si le token expire pendant le polling, le composant affichera une erreur 401. Implémenter un refresh token ou redirection vers login.
