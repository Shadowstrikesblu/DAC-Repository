// © 2024–2026 TOURE Arnaud Patrick
// Licensed under the MIT License

//  src/components/ChatWindow.tsx

import {
  Box,
  Paper,
  Typography,
  CircularProgress as Loader,
  Avatar,
  Fade,
  alpha,
  useTheme,
  Button,
} from "@mui/material";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { SmartToy, CheckCircle, Cancel } from "@mui/icons-material";
import { useNavigate } from "react-router-dom";
import { getMessages } from "../../api/axiosClient";
import MessageBubble from "./MessageBubble";
import TaskProgress from "../TaskProgress";
import InstanceSelector from "./InstanceSelector";
import EmptyState from "./EmptyState";
import ErrorState from "./ErrorState";
import { useChatMode } from "../../contexts/ChatModeContext";
import { sortMessagesByDate } from "../../utils/dateUtils";

interface Message {
  id?: string | number;
  sender: "user" | "bot";
  text: string;
  timestamp?: string;
  created_at?: string;
  extra?: any;
}

interface Props {
  chatId: number | null;
  sessionId?: number | string | null;
  isTyping?: boolean;
  reloadTrigger?: boolean;
  messages?: any[]; // Messages du parent (Free Chat)
  setMessages?: (msgs: any) => void; // Setter du parent
  onInstancesSelected?: (selected: number[]) => void;
  onInstanceResponse?: (data: any) => void;
  onCreateNew?: () => void;
  onSend?: (msg: string) => void | Promise<any>; // Challenge 2 — boutons Confirmer/Annuler
}

type LoadingState = "idle" | "loading" | "success" | "empty" | "error";
type ErrorType = "not_found" | "unauthorized" | "network" | "server" | null;

export default function ChatWindow({
  chatId,
  sessionId,
  isTyping,
  reloadTrigger,
  messages: parentMessages,
  setMessages: setParentMessages,
  onInstancesSelected,
  onInstanceResponse,
  onCreateNew,
  onSend,
}: Props) {
  const { chatMode } = useChatMode(); // Récupérer le mode
  const [messages, setMessages] = useState<Message[]>([]);
  // Historique masqué au login : on n'affiche par défaut que les messages postérieurs
  // à la connexion. `revealOlder` passe à true au scroll vers le haut / clic sur la bannière.
  const [revealOlder, setRevealOlder] = useState(false);
  const [loadingState, setLoadingState] = useState<LoadingState>("idle");
  const [errorType, setErrorType] = useState<ErrorType>(null);
  const [errorMessage, setErrorMessage] = useState<string>("");
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const theme = useTheme();
  const navigate = useNavigate();

  //  Fonction utilitaire : scroll vers le bas
  const scrollToBottom = () => {
    requestAnimationFrame(() => {
      if (scrollContainerRef.current) {
        scrollContainerRef.current.scrollTo({
          top: scrollContainerRef.current.scrollHeight,
          behavior: "smooth",
        });
      }
      bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
    });
  };

  //  Mode Free & DAC: utiliser les messages du parent directement (optimistic UI)
  useEffect(() => {
    if (parentMessages && parentMessages.length > 0) {
      setMessages(
        parentMessages.map((msg: any) => ({
          sender: msg.sender === "user" ? "user" : "bot",
          text: msg.text,
          timestamp: msg.created_at,
          extra: msg.loading ? { loading: true } : msg.extra,
        })),
      );
      setLoadingState("success");
      scrollToBottom();
      // Note: En DAC mode, cette affichage optimiste sera suivi par un reload API
      // qui mettra à jour avec la vraie liste persistée
      return;
    }
  }, [parentMessages, chatMode]);

  // Auto-scroll vers le bas quand nouveaux messages ou typing (ton code existant conservé)
  useEffect(() => {
    requestAnimationFrame(() => {
      if (scrollContainerRef.current) {
        scrollContainerRef.current.scrollTo({
          top: scrollContainerRef.current.scrollHeight,
          behavior: "smooth",
        });
      }
    });
  }, [messages, isTyping, chatMode, chatId]);

  //  NEW: auto-scroll fiable après layout + animations Fade (~300ms)
  useLayoutEffect(() => {
    const el = scrollContainerRef.current;
    if (!el) return;

    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    const shouldSnap = distanceFromBottom < 80; // si déjà proche du bas, on recolle

    requestAnimationFrame(() => {
      setTimeout(() => {
        if (shouldSnap) {
          bottomRef.current?.scrollIntoView({
            behavior: "smooth",
            block: "end",
          });
        }
      }, 350); // ~durée Fade (300ms) + marge
    });
  }, [messages, isTyping, chatMode, chatId]);

  //  NEW: suit les changements de hauteur (TaskProgress, images, logs…)
  useEffect(() => {
    const el = scrollContainerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      const distanceFromBottom =
        el.scrollHeight - el.scrollTop - el.clientHeight;
      if (distanceFromBottom < 80) {
        bottomRef.current?.scrollIntoView({ behavior: "auto", block: "end" });
      }
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const loadMessages = async () => {
    setLoadingState("loading");
    setErrorType(null);
    setErrorMessage("");
    setRevealOlder(false); // à l'ouverture d'un chat, l'historique reste masqué

    if (!chatId) return;
    try {
      //  Utilise axiosClient avec baseURL correcte (http://localhost:8000)
      const data = await getMessages(chatId);

      // Si on a déjà des messages locaux, ne pas écraser
      if (parentMessages && parentMessages.length > 0) {
        return;
      }

      // Vérifier si messages est un array
      if (Array.isArray(data.messages)) {
        const msgs: Message[] = data.messages.map((m: any) => ({
          sender: m.sender,
          text: m.text,
          timestamp: m.created_at,
          extra: m.extra,
        }));

        // Chat vide (OK mais aucun message)
        if (msgs.length === 0) {
          setMessages([]);
          setLoadingState("empty");
        } else {
          setMessages(msgs);
          setLoadingState("success");
        }
      } else {
        // Réponse invalide
        setLoadingState("error");
        setErrorType("server");
        setErrorMessage("Format de réponse invalide du serveur");
      }
    } catch (err: any) {
      console.error(" Error loading messages:", err);

      // Axios errors have response property
      if (err.response) {
        const status = err.response.status;

        // 404: Chat not found
        if (status === 404) {
          setLoadingState("error");
          setErrorType("not_found");
          setErrorMessage(
            "Cette conversation n'existe pas ou a été supprimée.",
          );
          return;
        }

        // 401/403: Unauthorized (axios interceptor already handles redirect, but set state anyway)
        if (status === 401 || status === 403) {
          setLoadingState("error");
          setErrorType("unauthorized");
          setErrorMessage("Session expirée. Veuillez vous reconnecter.");
          return;
        }

        // 5xx: Server error
        if (status >= 500) {
          setLoadingState("error");
          setErrorType("server");
          setErrorMessage(
            `Erreur serveur (${status}). Réessayez dans quelques instants.`,
          );
          return;
        }

        // Other HTTP errors
        setLoadingState("error");
        setErrorType("server");
        setErrorMessage(`Erreur HTTP ${status}`);
        return;
      }

      // Network error (fetch failed, no response)
      setLoadingState("error");
      setErrorType("network");
      setErrorMessage(
        err instanceof Error ? err.message : "Erreur de connexion réseau",
      );
    }
  };

  //  Mode Free: utiliser les messages du parent directement
  useEffect(() => {
    if (chatMode === "free" && parentMessages) {
      setMessages(
        parentMessages.map((msg: any) => ({
          sender: msg.sender === "user" ? "user" : "bot",
          text: msg.text,
          timestamp: msg.created_at,
          extra: msg.loading ? { loading: true } : undefined,
        })),
      );
      setLoadingState(parentMessages.length > 0 ? "success" : "empty");
      return;
    }
  }, [parentMessages, chatMode]);

  // FORCE RELOAD when reloadTrigger changes (DAC mode only)
  useEffect(() => {
    //  Mode DAC: charger depuis l'API uniquement si on n'a pas de messages locaux
    if (chatMode !== "free" && chatId) {
      if (!parentMessages || parentMessages.length === 0) {
        loadMessages();
        scrollToBottom(); // Auto-scroll après changement de chat
      }
    }
  }, [chatId, reloadTrigger, chatMode, parentMessages]); //  reload when needed

  return (
    <Box
      key={chatId}
      sx={{
        display: "flex",
        flexDirection: "column",
        flex: 1,
        minHeight: 0, //  NEW: nécessaire pour que le scroll fonctionne en flex
        overflow: "hidden",
        position: "relative",
      }}
    >
      <Box
        ref={scrollContainerRef}
        onScroll={() => {
          // Révéler l'historique masqué quand on scrolle vers le haut.
          const el = scrollContainerRef.current;
          if (!el || revealOlder) return;
          // On ne déclenche que sur un vrai scroll vers le haut (contenu scrollable réel),
          // pour éviter un déclenchement au scroll-to-bottom automatique sur vue vide.
          const hasScrollableContent = el.scrollHeight > el.clientHeight + 50;
          if (hasScrollableContent && el.scrollTop <= 24) {
            const cutoffStr = localStorage.getItem("dac_login_at");
            const cutoff = cutoffStr ? new Date(cutoffStr).getTime() : 0;
            const hasOlder = messages.some(
              (m) =>
                (m.timestamp ? new Date(m.timestamp).getTime() : 0) < cutoff,
            );
            if (hasOlder) setRevealOlder(true);
          }
        }}
        sx={{
          flex: 1,
          minHeight: 0, //  NEW
          overflow: "auto",
          overflowAnchor: "none", //  NEW: évite le scroll-anchoring natif
          px: { xs: 2, sm: 3, md: 4 },
          py: 3,
          display: "flex",
          flexDirection: "column",
          gap: 3,
          "&::-webkit-scrollbar": {
            width: "6px",
          },
          "&::-webkit-scrollbar-track": {
            bgcolor: alpha(theme.palette.background.paper, 0.1),
          },
          "&::-webkit-scrollbar-thumb": {
            bgcolor: alpha(theme.palette.text.secondary, 0.3),
            borderRadius: "3px",
            "&:hover": {
              bgcolor: alpha(theme.palette.text.secondary, 0.5),
            },
          },
        }}
      >
        {/* Loading state */}
        {loadingState === "loading" && (
          <Box
            display="flex"
            justifyContent="center"
            alignItems="center"
            minHeight="300px"
          >
            <Box
              display="flex"
              flexDirection="column"
              alignItems="center"
              gap={3}
            >
              <Box sx={{ position: "relative" }}>
                <Loader
                  size={40}
                  thickness={3}
                  sx={{
                    color: "primary.main",
                    animation: "spin 1.5s linear infinite",
                    "@keyframes spin": {
                      "0%": { transform: "rotate(0deg)" },
                      "100%": { transform: "rotate(360deg)" },
                    },
                  }}
                />
                <Box
                  sx={{
                    position: "absolute",
                    top: "50%",
                    left: "50%",
                    transform: "translate(-50%, -50%)",
                    width: 12,
                    height: 12,
                    borderRadius: "50%",
                    bgcolor: "secondary.main",
                    animation: "pulse 2s infinite",
                    "@keyframes pulse": {
                      "0%, 100%": { opacity: 0.3 },
                      "50%": { opacity: 1 },
                    },
                  }}
                />
              </Box>
              <Typography
                variant="body1"
                color="text.secondary"
                fontWeight={500}
              >
                Chargement de la conversation...
              </Typography>
            </Box>
          </Box>
        )}

        {/* Empty state - Chat sans messages */}
        {loadingState === "empty" && <EmptyState onCreateNew={onCreateNew} />}

        {/* Error state - Gestion des erreurs */}
        {loadingState === "error" && errorType && (
          <ErrorState
            errorType={errorType}
            message={errorMessage}
            onRetry={loadMessages}
            onCreateNew={onCreateNew}
            onLogin={() => {
              localStorage.removeItem("access_token");
              navigate("/");
            }}
          />
        )}

        {/* Success state - Messages */}
        {loadingState === "success" && (() => {
          const sortedAll = sortMessagesByDate(messages);
          // Masquage de l'historique au login : on n'affiche que les messages postérieurs
          // à la connexion, sauf si l'utilisateur a demandé à voir l'historique.
          const cutoffStr = localStorage.getItem("dac_login_at");
          const cutoff = cutoffStr ? new Date(cutoffStr).getTime() : 0;
          const display = revealOlder
            ? sortedAll
            : sortedAll.filter((m) => {
                const t = m.timestamp ? new Date(m.timestamp).getTime() : 0;
                return t >= cutoff;
              });
          const hiddenCount = sortedAll.length - display.length;
          return (
          <>
            {hiddenCount > 0 && (
              <Box
                onClick={() => setRevealOlder(true)}
                sx={{
                  alignSelf: "center",
                  cursor: "pointer",
                  px: 2,
                  py: 0.8,
                  mb: 2,
                  borderRadius: 999,
                  fontSize: "0.8rem",
                  color: "text.secondary",
                  bgcolor: alpha(theme.palette.secondary.main, 0.08),
                  border: `1px solid ${alpha(theme.palette.secondary.main, 0.2)}`,
                  "&:hover": {
                    bgcolor: alpha(theme.palette.secondary.main, 0.16),
                  },
                }}
              >
                ⬆ Afficher les {hiddenCount} message
                {hiddenCount > 1 ? "s" : ""} précédent
                {hiddenCount > 1 ? "s" : ""}
              </Box>
            )}
            {display.map((msg, idx) => {
              const sortedMessages = display;
              const isConsecutive =
                idx > 0 && sortedMessages[idx - 1].sender === msg.sender;

              // Détecter les task_id dans les messages du bot :
              // 1) dans le texte (`ID de tâche: ...`), 2) dans extra.task_id (création Terraform).
              const taskIdMatch =
                msg.sender !== "user" &&
                msg.text.match(/ID de tâche: `([a-f0-9\-]{36})`/);
              const taskId =
                msg.sender !== "user"
                  ? taskIdMatch
                    ? taskIdMatch[1]
                    : msg.extra?.task_id || null
                  : null;

              return (
                <Fade in key={idx} timeout={300 + idx * 50}>
                  <Box>
                    <MessageBubble
                      message={msg}
                      isConsecutive={isConsecutive}
                    />

                    {/* Afficher TaskProgress si un task_id est détecté */}
                    {taskId && (
                      <Box sx={{ ml: 6, mt: 2 }}>
                        <TaskProgress
                          taskId={taskId}
                          onComplete={(result) => {
                            void result;
                          }}
                          onError={(error) => {
                            console.error("Task error:", error);
                          }}
                          showLogs={true}
                          compact={false}
                        />
                      </Box>
                    )}

                    {/* Challenge 2 — Boutons Confirmer / Annuler sur la dernière proposition d'action */}
                    {onSend &&
                      msg.sender !== "user" &&
                      idx === sortedMessages.length - 1 &&
                      (msg.extra?.type === "proposal" ||
                        /confirm/i.test(String(msg.extra?.state || ""))) && (
                        <Box sx={{ ml: 6, mt: 1.5, display: "flex", gap: 1.5 }}>
                          <Button
                            variant="contained"
                            color="success"
                            size="small"
                            startIcon={<CheckCircle />}
                            onClick={() => onSend("oui")}
                          >
                            Confirmer
                          </Button>
                          <Button
                            variant="outlined"
                            color="error"
                            size="small"
                            startIcon={<Cancel />}
                            onClick={() => onSend("non")}
                          >
                            Annuler
                          </Button>
                        </Box>
                      )}

                    {/* OK AuditProgressWidget est rendu au niveau Chat.tsx avec useExecutionStream hook */}

                    {/* Afficher InstanceSelector si available_instances sont présentes ET state requiert sélection */}
                    {msg.extra?.available_instances &&
                      Array.isArray(msg.extra.available_instances) &&
                      msg.extra.available_instances.length > 0 &&
                      msg.extra?.state &&
                      [
                        "awaiting_instance_selection",
                        "awaiting_audit_instance_selection",
                        "awaiting_monitoring_instance_selection",
                      ].includes(msg.extra.state) && (
                        <Box sx={{ ml: 6, mt: 2 }}>
                          <InstanceSelector
                            instances={msg.extra.available_instances}
                            onConfirm={(selected) => {
                              if (onInstancesSelected) {
                                onInstancesSelected(selected);
                              }
                            }}
                            onResponse={onInstanceResponse}
                            originalText={msg.text}
                            state={msg.extra.state}
                            sessionId={
                              sessionId ? Number(sessionId) : undefined
                            }
                            chatId={chatId ? Number(chatId) : undefined}
                          />
                        </Box>
                      )}
                  </Box>
                </Fade>
              );
            })}

            {/* Typing indicator */}
            {isTyping && (
              <Fade in>
                <Box
                  sx={{
                    display: "flex",
                    alignItems: "center",
                    gap: 1.5,
                    mt: 2,
                  }}
                >
                  <Avatar
                    sx={{
                      width: 36,
                      height: 36,
                      background:
                        "linear-gradient(135deg, #10b981 0%, #34d399 100%)",
                      boxShadow: theme.shadows[2],
                    }}
                  >
                    <SmartToy />
                  </Avatar>
                  <Paper
                    elevation={0}
                    sx={{
                      bgcolor: alpha(theme.palette.secondary.main, 0.05),
                      border: `1px solid ${alpha(theme.palette.secondary.main, 0.1)}`,
                      px: 2.5,
                      py: 1.5,
                      borderRadius: "18px 18px 18px 4px",
                      display: "flex",
                      alignItems: "center",
                      gap: 1.5,
                    }}
                  >
                    <Loader size={16} sx={{ color: "secondary.main" }} />
                    <Typography variant="body2" color="text.secondary">
                      L'assistant DevOps réfléchit...
                    </Typography>
                  </Paper>
                </Box>
              </Fade>
            )}
          </>
          );
        })()}

        {/* Typing indicator même quand pas de messages (empty state + typing) */}
        {loadingState === "empty" && isTyping && (
          <Fade in>
            <Box
              sx={{
                display: "flex",
                alignItems: "center",
                gap: 1.5,
                mt: 2,
              }}
            >
              <Avatar
                sx={{
                  width: 36,
                  height: 36,
                  background:
                    "linear-gradient(135deg, #10b981 0%, #34d399 100%)",
                  boxShadow: theme.shadows[2],
                }}
              >
                <SmartToy />
              </Avatar>
              <Paper
                elevation={0}
                sx={{
                  bgcolor: alpha(theme.palette.secondary.main, 0.05),
                  border: `1px solid ${alpha(theme.palette.secondary.main, 0.1)}`,
                  px: 2.5,
                  py: 1.5,
                  borderRadius: "18px 18px 18px 4px",
                  display: "flex",
                  alignItems: "center",
                  gap: 1.5,
                }}
              >
                <Loader size={16} sx={{ color: "secondary.main" }} />
                <Typography variant="body2" color="text.secondary">
                  L'assistant DevOps réfléchit...
                </Typography>
              </Paper>
            </Box>
          </Fade>
        )}

        {/*  Sentinel pour ancrer le scroll au bas */}
        <div ref={bottomRef} />
      </Box>
    </Box>
  );
}
