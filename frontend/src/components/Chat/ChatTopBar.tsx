// © 2024–2026 TOURE Arnaud Patrick
// Licensed under the MIT License

import React, { useState } from "react";
import {
  Box,
  AppBar,
  Toolbar,
  Typography,
  IconButton,
  Avatar,
  Menu,
  MenuItem,
  Divider,
  Tooltip,
  alpha,
  useTheme,
} from "@mui/material";
import {
  AccountCircle,
  Settings,
  Logout,
  LightMode,
  DarkMode,
  MenuOpen,
  Menu as MenuHamburger,
  UnfoldLess,
  UnfoldMore,
} from "@mui/icons-material";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { useColorMode } from "../../context/ColorModeContext";

interface ChatTopBarProps {
  onToggleSidebar?: () => void;
  sidebarOpen?: boolean;
  onToggleHeader?: () => void;
  headerOpen?: boolean;
}

const ChatTopBar: React.FC<ChatTopBarProps> = ({
  onToggleSidebar,
  sidebarOpen,
  onToggleHeader,
  headerOpen,
}) => {
  const theme = useTheme();
  const navigate = useNavigate();
  const { logout, user } = useAuth();
  const { mode, toggleColorMode } = useColorMode();
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);

  const handleProfileMenuOpen = (event: React.MouseEvent<HTMLElement>) => {
    setAnchorEl(event.currentTarget);
  };

  const handleProfileMenuClose = () => {
    setAnchorEl(null);
  };

  const handleLogout = () => {
    logout();
    navigate("/");
    handleProfileMenuClose();
  };

  const handleNavigate = (path: string) => {
    navigate(path);
    handleProfileMenuClose();
  };

  return (
    <AppBar
      position="static"
      elevation={0}
      sx={{
        bgcolor: alpha(theme.palette.background.paper, 0.8),
        backdropFilter: "blur(20px)",
        borderBottom: `1px solid ${theme.palette.divider}`,
        boxShadow: "none",
      }}
    >
      <Toolbar
        variant="dense"
        sx={{ justifyContent: "space-between", gap: 0.5, px: { xs: 1, sm: 2 }, minHeight: { xs: 44, sm: 48 } }}
      >
        {/* Groupe gauche : replier sidebar + replier header */}
        <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
          {onToggleSidebar && (
            <Tooltip title={sidebarOpen ? "Replier le menu" : "Déplier le menu"} arrow>
              <IconButton
                onClick={onToggleSidebar}
                color="inherit"
                sx={{ color: "text.primary" }}
                aria-label="replier le menu latéral"
              >
                {sidebarOpen ? <MenuOpen fontSize="small" /> : <MenuHamburger fontSize="small" />}
              </IconButton>
            </Tooltip>
          )}
          {onToggleHeader && (
            <Tooltip title={headerOpen ? "Replier l'en-tête" : "Déplier l'en-tête"} arrow>
              <IconButton
                onClick={onToggleHeader}
                color="inherit"
                sx={{ color: "text.primary" }}
                aria-label="replier l'en-tête"
              >
                {headerOpen ? <UnfoldLess fontSize="small" /> : <UnfoldMore fontSize="small" />}
              </IconButton>
            </Tooltip>
          )}
        </Box>

        <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
        {/* Bascule thème clair / sombre */}
        <Tooltip title={mode === "dark" ? "Passer en clair" : "Passer en sombre"} arrow>
          <IconButton
            onClick={toggleColorMode}
            color="inherit"
            sx={{ color: "text.primary" }}
            aria-label="basculer le thème"
          >
            {mode === "dark" ? <LightMode fontSize="small" /> : <DarkMode fontSize="small" />}
          </IconButton>
        </Tooltip>

        {/* Profile Menu Button */}
        <IconButton
          size="large"
          edge="end"
          onClick={handleProfileMenuOpen}
          color="inherit"
          sx={{ color: "text.primary" }}
          aria-label="profile menu"
        >
          <Avatar
            sx={{
              width: 32,
              height: 32,
              background: "linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)",
              fontSize: "0.875rem",
            }}
          >
            {user?.email?.[0]?.toUpperCase() || "U"}
          </Avatar>
        </IconButton>
        </Box>

        {/* Profile Menu */}
        <Menu
          anchorEl={anchorEl}
          anchorOrigin={{
            vertical: "bottom",
            horizontal: "right",
          }}
          keepMounted
          transformOrigin={{
            vertical: "top",
            horizontal: "right",
          }}
          open={Boolean(anchorEl)}
          onClose={handleProfileMenuClose}
          PaperProps={{
            sx: {
              bgcolor: alpha(theme.palette.background.paper, 0.95),
              backdropFilter: "blur(20px)",
              border: `1px solid ${theme.palette.divider}`,
            },
          }}
        >
          <MenuItem disabled sx={{ color: "text.secondary" }}>
            <Typography variant="body2">
              {user?.email || "Utilisateur"}
            </Typography>
          </MenuItem>
          <Divider />
          <MenuItem
            onClick={() => handleNavigate("/profile")}
            sx={{
              gap: 1.5,
              "& svg": { fontSize: "1.25rem" },
            }}
          >
            <AccountCircle fontSize="inherit" />
            <Typography variant="body2">Profil</Typography>
          </MenuItem>
          <MenuItem
            onClick={() => handleNavigate("/settings")}
            sx={{
              gap: 1.5,
              "& svg": { fontSize: "1.25rem" },
            }}
          >
            <Settings fontSize="inherit" />
            <Typography variant="body2">Paramètres</Typography>
          </MenuItem>
          <Divider />
          <MenuItem
            onClick={handleLogout}
            sx={{
              gap: 1.5,
              color: "error.main",
              "& svg": { fontSize: "1.25rem" },
            }}
          >
            <Logout fontSize="inherit" />
            <Typography variant="body2">Déconnexion</Typography>
          </MenuItem>
        </Menu>
      </Toolbar>
    </AppBar>
  );
};

export default ChatTopBar;
