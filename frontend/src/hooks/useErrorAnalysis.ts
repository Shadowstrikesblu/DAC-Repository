// © 2024–2026 TOURE Arnaud Patrick
// Licensed under the MIT License

// frontend/src/hooks/useErrorAnalysis.ts
/**
 * Hook pour gérer le cycle de vie de l'analyse d'erreur IA.
 * 
 * Usage dans le Chat:
 * ```tsx
 * const { showAnalysisPanel, analysis } = useErrorAnalysis(execution.id);
 * 
 * {showAnalysisPanel && <ErrorAnalysisPanel executionId={execution.id} />}
 * ```
 */

import { useState, useCallback } from 'react';
import axios from 'axios';

interface UseErrorAnalysisReturn {
  showAnalysisPanel: boolean;
  analysis: any | null;
  isLoading: boolean;
  error: string | null;
  dismissPanel: () => void;
}

export const useErrorAnalysis = (executionId: number | null): UseErrorAnalysisReturn => {
  const [showAnalysisPanel, setShowAnalysisPanel] = useState(false);
  const [analysis, setAnalysis] = useState<any | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Essayer de récupérer l'analyse
  const checkForAnalysis = useCallback(async () => {
    if (!executionId) return;

    setIsLoading(true);
    try {
      const token = localStorage.getItem('token');
      const response = await axios.get(`/api/ai/analyses/${executionId}`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      setAnalysis(response.data);
      setShowAnalysisPanel(true);
      setError(null);
    } catch (err: any) {
      if (err.response?.status === 404) {
        // Pas encore disponible
        setError(null);
      } else {
        setError('Erreur lors de la récupération de l\'analyse');
      }
    } finally {
      setIsLoading(false);
    }
  }, [executionId]);

  const dismissPanel = useCallback(() => {
    setShowAnalysisPanel(false);
  }, []);

  return {
    showAnalysisPanel,
    analysis,
    isLoading,
    error,
    dismissPanel,
  };
};

export default useErrorAnalysis;
