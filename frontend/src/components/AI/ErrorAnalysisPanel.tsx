// © 2024–2026 TOURE Arnaud Patrick
// Licensed under the MIT License

// frontend/src/components/AI/ErrorAnalysisPanel.tsx
/**
 * Composant pour afficher les analyses IA d'erreurs d'exécution.
 * 
 * Affiché dans le chat quand une exécution échoue et qu'une analyse est disponible.
 */

import React, { useEffect, useState } from 'react';
import {
  Box,
  Card,
  CardContent,
  CardHeader,
  Collapse,
  Button,
  Chip,
  List,
  ListItem,
  ListItemText,
  Typography,
  Alert,
  CircularProgress,
  IconButton,
  Tooltip,
} from '@mui/material';
import {
  ExpandMore as ExpandMoreIcon,
  ContentCopy as ContentCopyIcon,
  ThumbUp as ThumbUpIcon,
  ThumbDown as ThumbDownIcon,
  ErrorOutline as ErrorOutlineIcon,
  LightbulbOutlined as LightbulbIcon,
} from '@mui/icons-material';
import axios from 'axios';

interface Recommendation {
  action: string;
  priority: 'immediate' | 'high' | 'normal';
  commands: string[];
  risk: 'low' | 'medium' | 'high';
  estimated_time_minutes: number;
}

interface Analysis {
  root_cause: string;
  explanation: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  affected_components: string[];
  recommendations: Recommendation[];
}

interface AIAnalysisResponse {
  id: number;
  execution_id: number;
  raw_error: string;
  error_type: string;
  analysis: Analysis;
  created_at: string;
  user_feedback: string | null;
}

interface ErrorAnalysisPanelProps {
  executionId: number;
  onAnalysisReady?: (analysis: AIAnalysisResponse) => void;
}

const getSeverityColor = (severity: string) => {
  switch (severity) {
    case 'critical':
      return '#d32f2f';
    case 'high':
      return '#f57c00';
    case 'medium':
      return '#fbc02d';
    case 'low':
      return '#388e3c';
    default:
      return '#1976d2';
  }
};

const getPriorityColor = (priority: string) => {
  switch (priority) {
    case 'immediate':
      return '#d32f2f';
    case 'high':
      return '#f57c00';
    case 'normal':
      return '#1976d2';
    default:
      return '#757575';
  }
};

export const ErrorAnalysisPanel: React.FC<ErrorAnalysisPanelProps> = ({
  executionId,
  onAnalysisReady,
}) => {
  const [analysis, setAnalysis] = useState<AIAnalysisResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [feedbackSubmitted, setFeedbackSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchAnalysis();
    // Poll toutes les 3 secondes jusqu'à ce que l'analyse soit disponible
    const interval = setInterval(() => {
      if (!analysis && !error) {
        fetchAnalysis();
      }
    }, 3000);

    return () => clearInterval(interval);
  }, [executionId]);

  const fetchAnalysis = async () => {
    try {
      const response = await axios.get<AIAnalysisResponse>(
        `/api/ai/analyses/${executionId}`,
        {
          headers: {
            Authorization: `Bearer ${localStorage.getItem('token')}`,
          },
        }
      );
      setAnalysis(response.data);
      setLoading(false);
      setError(null);
      if (onAnalysisReady) {
        onAnalysisReady(response.data);
      }
    } catch (err: any) {
      if (err.response?.status === 404) {
        // Analyse pas encore disponible
        if (loading) {
          setError('Analyse IA en cours de génération...');
        }
      } else {
        setLoading(false);
        setError('Erreur lors de la récupération de l\'analyse');
      }
    }
  };

  const handleCopyCommand = (command: string) => {
    navigator.clipboard.writeText(command);
    // Toast notification (optionnel)
  };

  const submitFeedback = async (feedbackType: string) => {
    if (!analysis) return;

    try {
      await axios.post(
        `/api/ai/analyses/${analysis.id}/feedback`,
        { feedback: feedbackType },
        {
          headers: {
            Authorization: `Bearer ${localStorage.getItem('token')}`,
          },
        }
      );
      setFeedback(feedbackType);
      setFeedbackSubmitted(true);
      setTimeout(() => setFeedbackSubmitted(false), 3000);
    } catch (err) {
      console.error('Erreur lors de la soumission du feedback', err);
    }
  };

  if (loading && !analysis) {
    return (
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, my: 2 }}>
        <CircularProgress size={20} />
        <Typography variant="caption" color="textSecondary">
          Analyse IA en cours...
        </Typography>
      </Box>
    );
  }

  if (error && !analysis) {
    return (
      <Box sx={{ my: 2 }}>
        <Typography variant="caption" color="textSecondary">
          {error}
        </Typography>
      </Box>
    );
  }

  if (!analysis) {
    return null;
  }

  const { analysis: aiAnalysis } = analysis;

  return (
    <Card
      sx={{
        my: 2,
        border: `2px solid ${getSeverityColor(aiAnalysis.severity)}`,
        backgroundColor: '#fafafa',
      }}
    >
      <CardHeader
        avatar={<LightbulbIcon sx={{ color: '#fbc02d' }} />}
        title={
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <Typography variant="h6">Analyse IA</Typography>
            <Chip
              label={aiAnalysis.severity.toUpperCase()}
              size="small"
              sx={{
                backgroundColor: getSeverityColor(aiAnalysis.severity),
                color: 'white',
                fontWeight: 'bold',
              }}
            />
          </Box>
        }
        action={
          <IconButton
            onClick={() => setExpanded(!expanded)}
            aria-expanded={expanded}
          >
            <ExpandMoreIcon
              sx={{
                transform: expanded ? 'rotate(180deg)' : 'rotate(0deg)',
                transition: 'transform 150ms cubic-bezier(0.4, 0, 0.2, 1) 0ms',
              }}
            />
          </IconButton>
        }
      />

      <Collapse in={expanded} timeout="auto" unmountOnExit>
        <CardContent sx={{ pt: 0 }}>
          {/* Avertissement sécurité */}
          <Alert severity="warning" sx={{ mb: 2 }}>
            <Typography variant="caption">
              ⚠️ Cette analyse est générée par IA. Vérifiez avant d'appliquer les recommandations.
              Les secrets ont été redactés.
            </Typography>
          </Alert>

          {/* Cause racine */}
          <Box sx={{ mb: 3 }}>
            <Typography variant="subtitle2" sx={{ fontWeight: 'bold', mb: 1 }}>
              🔴 Cause racine
            </Typography>
            <Typography variant="body2" sx={{ mb: 1 }}>
              {aiAnalysis.root_cause}
            </Typography>
            <Typography variant="body2" color="textSecondary">
              {aiAnalysis.explanation}
            </Typography>
          </Box>

          {/* Composants affectés */}
          {aiAnalysis.affected_components.length > 0 && (
            <Box sx={{ mb: 3 }}>
              <Typography variant="subtitle2" sx={{ fontWeight: 'bold', mb: 1 }}>
                📊 Composants affectés
              </Typography>
              <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
                {aiAnalysis.affected_components.map((component, idx) => (
                  <Chip
                    key={idx}
                    label={component}
                    variant="outlined"
                    size="small"
                  />
                ))}
              </Box>
            </Box>
          )}

          {/* Recommandations */}
          <Box sx={{ mb: 3 }}>
            <Typography variant="subtitle2" sx={{ fontWeight: 'bold', mb: 1 }}>
              ✅ Actions correctives ({aiAnalysis.recommendations.length})
            </Typography>

            <List sx={{ width: '100%', p: 0 }}>
              {aiAnalysis.recommendations.map((rec, idx) => (
                <ListItem
                  key={idx}
                  sx={{
                    flexDirection: 'column',
                    alignItems: 'flex-start',
                    mb: 2,
                    p: 1.5,
                    border: '1px solid #e0e0e0',
                    borderRadius: 1,
                  }}
                >
                  <Box sx={{ display: 'flex', alignItems: 'center', width: '100%', mb: 1 }}>
                    <Typography variant="body2" sx={{ fontWeight: 'bold' }}>
                      {idx + 1}. {rec.action}
                    </Typography>
                    <Box sx={{ ml: 'auto', display: 'flex', gap: 1 }}>
                      <Chip
                        label={rec.priority.toUpperCase()}
                        size="small"
                        sx={{
                          backgroundColor: getPriorityColor(rec.priority),
                          color: 'white',
                          fontSize: '0.7rem',
                        }}
                      />
                      <Chip
                        label={`Risque: ${rec.risk}`}
                        size="small"
                        variant="outlined"
                      />
                      <Chip
                        label={`${rec.estimated_time_minutes} min`}
                        size="small"
                        variant="outlined"
                      />
                    </Box>
                  </Box>

                  {rec.commands.length > 0 && (
                    <Box sx={{ width: '100%', mt: 1 }}>
                      <Typography variant="caption" sx={{ fontWeight: 'bold', mb: 0.5 }}>
                        Commandes :
                      </Typography>
                      {rec.commands.map((cmd, cmdIdx) => (
                        <Box
                          key={cmdIdx}
                          sx={{
                            backgroundColor: '#f5f5f5',
                            p: 1,
                            borderRadius: 1,
                            mb: 1,
                            fontFamily: 'monospace',
                            fontSize: '0.85rem',
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'flex-start',
                          }}
                        >
                          <Typography
                            variant="caption"
                            sx={{
                              fontFamily: 'monospace',
                              wordBreak: 'break-all',
                              flex: 1,
                            }}
                          >
                            {cmd}
                          </Typography>
                          <Tooltip title="Copier">
                            <IconButton
                              size="small"
                              onClick={() => handleCopyCommand(cmd)}
                              sx={{ ml: 1 }}
                            >
                              <ContentCopyIcon fontSize="small" />
                            </IconButton>
                          </Tooltip>
                        </Box>
                      ))}
                    </Box>
                  )}
                </ListItem>
              ))}
            </List>
          </Box>

          {/* Feedback */}
          <Box sx={{ mt: 3, pt: 2, borderTop: '1px solid #e0e0e0' }}>
            <Typography variant="caption" sx={{ fontWeight: 'bold', mb: 1 }}>
              👍 Cette analyse était-elle utile ?
            </Typography>
            <Box sx={{ display: 'flex', gap: 1, mt: 1 }}>
              <Button
                size="small"
                variant={feedback === 'helpful' ? 'contained' : 'outlined'}
                startIcon={<ThumbUpIcon />}
                onClick={() => submitFeedback('helpful')}
                disabled={feedbackSubmitted}
              >
                Utile
              </Button>
              <Button
                size="small"
                variant={feedback === 'incorrect' ? 'contained' : 'outlined'}
                startIcon={<ThumbDownIcon />}
                onClick={() => submitFeedback('incorrect')}
                disabled={feedbackSubmitted}
              >
                Incorrect
              </Button>
              <Button
                size="small"
                variant={feedback === 'incomplete' ? 'contained' : 'outlined'}
                startIcon={<ErrorOutlineIcon />}
                onClick={() => submitFeedback('incomplete')}
                disabled={feedbackSubmitted}
              >
                Incomplet
              </Button>
            </Box>
            {feedbackSubmitted && (
              <Typography variant="caption" color="success" sx={{ mt: 1 }}>
                ✓ Feedback enregistré
              </Typography>
            )}
          </Box>
        </CardContent>
      </Collapse>
    </Card>
  );
};

export default ErrorAnalysisPanel;
