import { Configuration } from "@azure/msal-browser";

/**
 * MSAL configuration for a Personal Microsoft account OneDrive.
 * Read-only scopes only — this app cannot modify or delete any photos.
 */
const clientId = import.meta.env.VITE_CLIENT_ID as string | undefined;

if (!clientId) {
  // We don't throw here so the UI can render a helpful setup message.
  // The SignIn component will warn the user.
  console.warn(
    "[authConfig] VITE_CLIENT_ID is not set. Create a .env file (see .env.example)."
  );
}

export const GRAPH_ENDPOINT = "https://graph.microsoft.com/v1.0";

/** Read-only delegated scopes. Files.ReadWrite is intentionally NOT included. */
export const loginRequest = {
  scopes: ["User.Read", "Files.Read", "Files.Read.All"],
};

export const msalConfig: Configuration = {
  auth: {
    clientId: clientId ?? "missing-client-id",
    authority: "https://login.microsoftonline.com/consumers",
    redirectUri: "http://localhost:5173",
  },
  cache: {
    cacheLocation: "localStorage",
    storeAuthStateInCookie: false,
  },
};

export const isConfigured = Boolean(clientId);
