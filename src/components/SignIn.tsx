import { useMsal } from "@azure/msal-react";
import { loginRequest, isConfigured } from "../authConfig";

export default function SignIn() {
  const { instance, accounts } = useMsal();

  if (!isConfigured) {
    return (
      <div className="panel">
        <strong>Setup needed:</strong> add your Microsoft app client ID.
        <pre className="setup">{`Create an app registration at
https://portal.azure.com -> Microsoft Entra ID ->
App registrations -> New registration
  - Account type: Personal Microsoft accounts
  - Redirect URI (SPA): http://localhost:5173
  - API permissions: Files.Read, Files.Read.All, User.Read

Then create a .env file in this project:
  VITE_CLIENT_ID=<your-client-id>
and run: npm run dev`}</pre>
      </div>
    );
  }

  if (accounts.length === 0) {
    return (
      <div className="panel">
        <h2 style={{ marginTop: 0 }}>Connect your OneDrive</h2>
        <p className="muted">
          Sign in with Microsoft to read your photos. This app runs entirely on
          your machine and uses <strong>read-only</strong> access — it cannot
          modify or delete any of your files.
        </p>
        <button
          onClick={() =>
            instance.loginPopup({ ...loginRequest }).catch((e) => {
              alert("Sign-in failed: " + (e?.message || e));
            })
          }
        >
          Sign in with Microsoft
        </button>
      </div>
    );
  }

  const name = accounts[0].name || accounts[0].username;
  return (
    <div className="row" style={{ flex: 0, flexWrap: "nowrap", gap: 10 }}>
      <span className="badge ro" title="Read-only access">
        🔒 Read-only
      </span>
      <span className="badge">{name}</span>
      <button
        className="secondary"
        onClick={() => instance.logoutPopup().catch(() => {})}
      >
        Sign out
      </button>
    </div>
  );
}
