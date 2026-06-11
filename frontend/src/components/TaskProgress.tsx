// src/components/TaskProgress.tsx
// CHALLENGE 5 — Affichage progressif des étapes avec niveaux de log colorés

import React from 'react';
import {
  Box,
  LinearProgress,
  Typography,
  Card,
  CardContent,
  List,
  ListItem,
  ListItemText,
  Chip,
  Alert,
  Button,
  Collapse,
  IconButton,
  Stepper,
  Step,
  StepLabel,
  Skeleton,
  Fade,
  Grow,
  Tooltip,    // CHALLENGE 5 — tooltip sur les étapes
} from '@mui/material';
import {
  CheckCircle as CheckCircleIcon,
  Error as ErrorIcon,
  Pending as PendingIcon,
  PlayArrow as PlayArrowIcon,
  ExpandLess as ExpandLessIcon,
  Refresh as RefreshIcon,
  Circle as CircleIcon,
  Warning as WarningIcon,   // CHALLENGE 5 — icône warning
  Info as InfoIcon,          // CHALLENGE 5 — icône info
} from '@mui/icons-material';
import { useTaskPolling, type TaskLog } from '../hooks/useTaskPolling';
import {
  AWS_DEPLOYMENT_STEPS,
  getCurrentStep,
  getCurrentStepIndex,
  getStepProgress,
  mapBackendMessageToStep
} from '../utils/deploymentSteps';

interface TaskProgressProps {
  taskId: string;
  onComplete?: (result: any) => void;
  onError?: (error: string) => void;
  showLogs?: boolean;
  compact?: boolean;
}

// CHALLENGE 5 — Configuration des niveaux de log (couleurs + icônes + libellés)
const LOG_LEVEL_CONFIG: Record<string, {
  color: string;
  bgColor: string;
  label: string;
  icon: React.ReactNode;
}> = {
  error: {
    color: '#d32f2f',
    bgColor: '#ffebee',
    label: 'ERREUR',
    icon: <ErrorIcon sx={{ fontSize: 14 }} />,
  },
  warning: {
    color: '#e65100',
    bgColor: '#fff3e0',
    label: 'AVERT.',
    icon: <WarningIcon sx={{ fontSize: 14 }} />,
  },
  success: {
    color: '#2e7d32',
    bgColor: '#e8f5e9',
    label: 'OK',
    icon: <CheckCircleIcon sx={{ fontSize: 14 }} />,
  },
  info: {
    color: '#1565c0',
    bgColor: '#e3f2fd',
    label: 'INFO',
    icon: <InfoIcon sx={{ fontSize: 14 }} />,
  },
};

const TaskProgress: React.FC<TaskProgressProps> = ({
  taskId,
  onComplete,
  onError,
  showLogs = true,
  compact = false
}) => {
  const [showDetailedLogs, setShowDetailedLogs] = React.useState(true);
  // CHALLENGE 5 — ref pour auto-scroll vers le dernier log
  const logsEndRef = React.useRef<HTMLDivElement>(null);

  const {
    taskStatus,
    timeoutReached,
    progressPercentage,
    currentStep,
    logs,
    refreshStatus,
    connectionState
  } = useTaskPolling(taskId, {
    onComplete,
    onError,
    onStatusChange: (status) => {
      console.log('Task status updated:', status);
    }
  });

  // CHALLENGE 5 — auto-scroll vers le dernier log à chaque nouveau log
  React.useEffect(() => {
    if (showDetailedLogs && logsEndRef.current) {
      logsEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [logs.length, showDetailedLogs]);

  // Fonction pour obtenir l'icône selon le statut global
  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'pending':   return <PendingIcon color="warning" />;
      case 'running':   return <PlayArrowIcon color="primary" />;
      case 'completed': return <CheckCircleIcon color="success" />;
      case 'failed':    return <ErrorIcon color="error" />;
      case 'cancelled': return <ErrorIcon color="disabled" />;
      default:          return <PendingIcon />;
    }
  };

  // Fonction pour obtenir la couleur selon le statut
  const getStatusColor = (status: string) => {
    switch (status) {
      case 'pending':   return 'warning';
      case 'running':   return 'primary';
      case 'completed': return 'success';
      case 'failed':    return 'error';
      case 'cancelled': return 'default';
      default:          return 'default';
    }
  };

  // Fonction pour formater le timestamp
  const formatTimestamp = (timestamp: string) => {
    return new Date(timestamp).toLocaleTimeString('fr-FR');
  };

  // CHALLENGE 5 — Remplace getLogColor() par LOG_LEVEL_CONFIG pour cohérence
  const getLevelConfig = (level: string) =>
    LOG_LEVEL_CONFIG[level] ?? LOG_LEVEL_CONFIG['info'];

  // CHALLENGE 5 — Comptage des logs par niveau (résumé rapide)
  const logCounts = React.useMemo(() => {
    return logs.reduce<Record<string, number>>((acc, log) => {
      const lvl = log.level || 'info';
      acc[lvl] = (acc[lvl] ?? 0) + 1;
      return acc;
    }, {});
  }, [logs]);

  // Composant pour l'état de chargement initial uniquement
  const LoadingState = () => (
    <Card variant="outlined" sx={{ mb: 2 }}>
      <CardContent>
        <Box display="flex" alignItems="center" gap={2} mb={2}>
          <Skeleton variant="circular" width={40} height={40} />
          <Box flex={1}>
            <Skeleton variant="text" width="60%" height={28} />
            <Skeleton variant="text" width="40%" height={20} />
          </Box>
        </Box>
        <Skeleton variant="rectangular" height={8} sx={{ borderRadius: 1 }} />
      </CardContent>
    </Card>
  );

  if (!taskStatus) {
    return <LoadingState />;
  }

  if (compact) {
    return (
      <Box display="flex" alignItems="center" gap={1} py={1}>
        {getStatusIcon(taskStatus.status || '')}
        <Box flex={1}>
          <Typography variant="body2">{currentStep}</Typography>
          <LinearProgress
            variant="determinate"
            value={progressPercentage}
            color={getStatusColor(taskStatus.status || '') as any}
            sx={{ mt: 0.5 }}
          />
        </Box>
        <Typography variant="caption" color="textSecondary">
          {Math.round(progressPercentage)}%
        </Typography>
      </Box>
    );
  }

  return (
    <Card
      variant="outlined"
      sx={{
        mb: 2,
        transition: 'all 0.3s ease-in-out',
        '&:hover': { boxShadow: 2 },
        '@keyframes slideIn': {
          '0%':   { opacity: 0, transform: 'translateY(10px)' },
          '100%': { opacity: 1, transform: 'translateY(0)' },
        },
        animation: 'slideIn 0.4s ease-out',
      }}
    >
      <CardContent>
        {/* Header avec statut */}
        <Box display="flex" alignItems="center" justifyContent="space-between" mb={2}>
          <Box display="flex" alignItems="center" gap={2}>
            {getStatusIcon(taskStatus.status || '')}
            <Box>
              <Typography variant="h6" fontWeight={700}>
                Tâche {taskStatus.task_type}
              </Typography>
              <Box display="flex" alignItems="center" gap={1} mt={0.5}>
                <Chip
                  label={taskStatus.status?.toUpperCase() || 'UNKNOWN'}
                  color={getStatusColor(taskStatus.status || '') as any}
                  size="small"
                />
                {taskStatus.status === 'running' && (
                  <Typography variant="caption" color="text.secondary">
                    • Durée estimée: 2-3 minutes
                  </Typography>
                )}
                {taskStatus.status === 'pending' && (
                  <Typography variant="caption" color="text.secondary">
                    • Démarrage imminent...
                  </Typography>
                )}
              </Box>
            </Box>
          </Box>

          <Box display="flex" alignItems="center" gap={1}>
            <Button
              size="small"
              onClick={refreshStatus}
              startIcon={<RefreshIcon />}
              sx={{ minWidth: 'auto' }}
              disabled={connectionState === 'connecting'}
            >
              Actualiser
            </Button>
          </Box>
        </Box>

        {/* Stepper AWS (uniquement en cours d'exécution) */}
        {taskStatus.status === 'running' && (
          <Fade in={true}>
            <Box mb={3}>
              <Stepper activeStep={getCurrentStepIndex(progressPercentage)} alternativeLabel sx={{ mb: 3 }}>
                {AWS_DEPLOYMENT_STEPS.map((step) => {
                  const isActive    = progressPercentage >= step.progressRange[0] && progressPercentage <= step.progressRange[1];
                  const isCompleted = progressPercentage > step.progressRange[1];
                  const StepIcon    = step.icon;

                  return (
                    <Step key={step.id} completed={isCompleted}>
                      <StepLabel
                        icon={
                          isCompleted ? (
                            <CheckCircleIcon color="success" sx={{ fontSize: 24 }} />
                          ) : isActive ? (
                            <StepIcon color="primary" sx={{ fontSize: 24 }} />
                          ) : (
                            <CircleIcon color="disabled" sx={{ fontSize: 24 }} />
                          )
                        }
                        sx={{
                          '& .MuiStepLabel-label': {
                            fontSize: '0.75rem',
                            fontWeight: isActive ? 600 : 400,
                            color: isActive ? 'primary.main' : isCompleted ? 'success.main' : 'text.secondary',
                          },
                        }}
                      >
                        {step.label}
                        {isActive && (
                          <Typography variant="caption" display="block" color="text.secondary">
                            {step.estimatedDuration}
                          </Typography>
                        )}
                      </StepLabel>
                    </Step>
                  );
                })}
              </Stepper>

              {/* Détail de l'étape courante */}
              {(() => {
                const currentStepData = getCurrentStep(progressPercentage) || mapBackendMessageToStep(currentStep, '');
                if (currentStepData) {
                  const stepProgress = getStepProgress(progressPercentage, currentStepData);
                  const StepIcon = currentStepData.icon;

                  return (
                    <Grow in={true}>
                      <Card variant="outlined" sx={{ bgcolor: 'primary.50', borderColor: 'primary.200' }}>
                        <CardContent sx={{ py: 2 }}>
                          <Box display="flex" alignItems="center" gap={2} mb={2}>
                            <StepIcon color="primary" sx={{ fontSize: 28 }} />
                            <Box flex={1}>
                              <Typography variant="h6" color="primary.main" fontWeight={700}>
                                {currentStepData.label}
                              </Typography>
                              <Typography variant="body2" color="text.secondary">
                                {currentStepData.description}
                              </Typography>
                              {currentStepData.estimatedDuration && (
                                <Typography variant="caption" color="text.secondary">
                                  Durée estimée: {currentStepData.estimatedDuration}
                                </Typography>
                              )}
                            </Box>
                            <Box textAlign="right">
                              <Typography variant="h5" color="primary.main" fontWeight={700}>
                                {Math.round(progressPercentage)}%
                              </Typography>
                              <Typography variant="caption" color="text.secondary">
                                Étape: {Math.round(stepProgress)}%
                              </Typography>
                            </Box>
                          </Box>

                          <Box display="flex" gap={1}>
                            <LinearProgress
                              variant="determinate"
                              value={progressPercentage}
                              color="primary"
                              sx={{
                                flex: 1,
                                height: 6,
                                borderRadius: 3,
                                bgcolor: 'primary.100',
                                '& .MuiLinearProgress-bar': {
                                  borderRadius: 3,
                                  transition: 'transform 0.8s ease-in-out',
                                },
                              }}
                            />
                          </Box>

                          {currentStep && (
                            <Typography variant="body2" color="text.secondary" sx={{ mt: 1, fontStyle: 'italic' }}>
                              "{currentStep}"
                            </Typography>
                          )}
                        </CardContent>
                      </Card>
                    </Grow>
                  );
                }
                return null;
              })()}
            </Box>
          </Fade>
        )}

        {/* Progress simple pour les états non-running */}
        {taskStatus.status !== 'running' && (
          <Box mb={2}>
            <Box display="flex" justifyContent="space-between" mb={1}>
              <Typography variant="body2" color="textSecondary">
                {currentStep || 'En attente...'}
              </Typography>
              <Typography variant="body2" color="textSecondary">
                {Math.round(progressPercentage)}%
              </Typography>
            </Box>
            <LinearProgress
              variant="determinate"
              value={progressPercentage}
              color={getStatusColor(taskStatus.status || '') as any}
              sx={{
                height: 8,
                borderRadius: 4,
                '& .MuiLinearProgress-bar': { transition: 'transform 0.5s ease-in-out' },
              }}
            />
          </Box>
        )}

        {/* Erreur de tâche */}
        {taskStatus.error_message && (
          <Alert severity="error" sx={{ mb: 2 }}>
            <Typography variant="body2" fontWeight={600}>
              Erreur pendant l'exécution
            </Typography>
            <Typography variant="body2">{taskStatus.error_message}</Typography>
          </Alert>
        )}

        {/* Timeout */}
        {timeoutReached && (
          <Alert severity="warning" sx={{ mb: 2 }}>
            Timeout atteint. La tâche continue en arrière-plan.
          </Alert>
        )}

        {/* Timestamps */}
        <Box display="flex" gap={2} mb={2}>
          {taskStatus.created_at && (
            <Typography variant="caption" color="textSecondary">
              Créée: {formatTimestamp(taskStatus.created_at)}
            </Typography>
          )}
          {taskStatus.started_at && (
            <Typography variant="caption" color="textSecondary">
              Démarrée: {formatTimestamp(taskStatus.started_at)}
            </Typography>
          )}
          {taskStatus.completed_at && (
            <Typography variant="caption" color="textSecondary">
              Terminée: {formatTimestamp(taskStatus.completed_at)}
            </Typography>
          )}
        </Box>

        {/* Journal d'exécution — CHALLENGE 5 */}
        {showLogs && (
          <Box>
            {/* En-tête du journal avec résumé des niveaux */}
            <Box display="flex" alignItems="center" justifyContent="space-between" mb={1}>
              <Box display="flex" alignItems="center" gap={1} flexWrap="wrap">
                <Typography variant="subtitle2" fontWeight={600}>
                  Journal d'exécution
                </Typography>

                {/* CHALLENGE 5 — compteur total */}
                {logs.length > 0 && (
                  <Chip
                    label={`${logs.length} entrée${logs.length > 1 ? 's' : ''}`}
                    size="small"
                    variant="outlined"
                    color="info"
                  />
                )}

                {/* CHALLENGE 5 — badges par niveau (erreurs et warnings seulement) */}
                {(logCounts['error'] ?? 0) > 0 && (
                  <Tooltip title={`${logCounts['error']} erreur(s)`}>
                    <Chip
                      label={logCounts['error']}
                      size="small"
                      icon={<ErrorIcon style={{ fontSize: 12 }} />}
                      sx={{
                        bgcolor: LOG_LEVEL_CONFIG.error.bgColor,
                        color: LOG_LEVEL_CONFIG.error.color,
                        fontWeight: 700,
                        height: 22,
                      }}
                    />
                  </Tooltip>
                )}
                {(logCounts['warning'] ?? 0) > 0 && (
                  <Tooltip title={`${logCounts['warning']} avertissement(s)`}>
                    <Chip
                      label={logCounts['warning']}
                      size="small"
                      icon={<WarningIcon style={{ fontSize: 12 }} />}
                      sx={{
                        bgcolor: LOG_LEVEL_CONFIG.warning.bgColor,
                        color: LOG_LEVEL_CONFIG.warning.color,
                        fontWeight: 700,
                        height: 22,
                      }}
                    />
                  </Tooltip>
                )}
              </Box>

              <IconButton
                size="small"
                onClick={() => setShowDetailedLogs(!showDetailedLogs)}
                sx={{
                  transform: showDetailedLogs ? 'rotate(0deg)' : 'rotate(180deg)',
                  transition: 'transform 0.3s ease-in-out',
                }}
              >
                <ExpandLessIcon />
              </IconButton>
            </Box>

            <Collapse in={showDetailedLogs}>
              <Box
                sx={{
                  bgcolor: '#0d1117',       // CHALLENGE 5 — fond sombre style terminal
                  border: '1px solid',
                  borderColor: 'divider',
                  borderRadius: 2,
                  overflow: 'hidden',
                  fontFamily: 'monospace',
                }}
              >
                {logs.length > 0 ? (
                  <List
                    dense
                    sx={{
                      maxHeight: 300,      // CHALLENGE 5 — hauteur fixe avec scroll
                      overflow: 'auto',
                      py: 0.5,
                    }}
                  >
                    {logs.map((log: TaskLog, index) => {
                      const cfg = getLevelConfig(log.level);
                      return (
                        // CHALLENGE 5 — chaque entrée de log colorée selon son niveau
                        <ListItem
                          key={`log-${log.timestamp}-${index}`}
                          sx={{
                            py: 0.5,
                            px: 2,
                            borderLeft: `3px solid ${cfg.color}`,
                            mb: 0.5,
                            bgcolor: index % 2 === 0 ? 'rgba(255,255,255,0.03)' : 'transparent',
                            transition: 'background 0.15s',
                            '&:hover': { bgcolor: 'rgba(255,255,255,0.07)' },
                          }}
                        >
                          <ListItemText
                            primary={
                              <Box display="flex" alignItems="center" gap={1}>
                                {/* CHALLENGE 5 — badge de niveau */}
                                <Chip
                                  label={cfg.label}
                                  size="small"
                                  icon={cfg.icon as any}
                                  sx={{
                                    bgcolor: cfg.bgColor,
                                    color: cfg.color,
                                    fontWeight: 700,
                                    fontSize: '0.65rem',
                                    height: 20,
                                    minWidth: 58,
                                    '& .MuiChip-icon': { fontSize: '12px !important', color: `${cfg.color} !important` },
                                  }}
                                />

                                {/* CHALLENGE 5 — nom de l'étape si disponible */}
                                {log.step_name && (
                                  <Chip
                                    label={log.step_name}
                                    size="small"
                                    variant="outlined"
                                    sx={{
                                      height: 18,
                                      fontSize: '0.6rem',
                                      color: 'rgba(255,255,255,0.5)',
                                      borderColor: 'rgba(255,255,255,0.2)',
                                    }}
                                  />
                                )}

                                {/* Message principal */}
                                <Typography
                                  variant="body2"
                                  sx={{
                                    flex: 1,
                                    color: cfg.color,
                                    fontFamily: 'monospace',
                                    fontSize: '0.78rem',
                                    wordBreak: 'break-all',
                                  }}
                                >
                                  {log.message}
                                </Typography>

                                {/* CHALLENGE 5 — pourcentage si disponible */}
                                {log.progress_percentage != null && (
                                  <Chip
                                    label={`${Math.round(log.progress_percentage)}%`}
                                    size="small"
                                    variant="outlined"
                                    sx={{
                                      height: 18,
                                      fontSize: '0.65rem',
                                      color: 'rgba(255,255,255,0.6)',
                                      borderColor: 'rgba(255,255,255,0.2)',
                                    }}
                                  />
                                )}
                              </Box>
                            }
                            secondary={
                              // CHALLENGE 5 — timestamp discret
                              <Typography
                                variant="caption"
                                sx={{ color: 'rgba(255,255,255,0.3)', fontFamily: 'monospace', fontSize: '0.65rem' }}
                              >
                                {formatTimestamp(log.timestamp)}
                              </Typography>
                            }
                          />
                        </ListItem>
                      );
                    })}
                    {/* CHALLENGE 5 — ancre pour auto-scroll */}
                    <div ref={logsEndRef} />
                  </List>
                ) : (
                  <Box py={4} textAlign="center">
                    <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.4)', fontFamily: 'monospace' }}>
                      {taskStatus?.status === 'pending'
                        ? '⏳ En attente du démarrage de la tâche...'
                        : '— Aucun log disponible —'}
                    </Typography>
                  </Box>
                )}
              </Box>
            </Collapse>
          </Box>
        )}
      </CardContent>
    </Card>
  );
};

export default TaskProgress;
