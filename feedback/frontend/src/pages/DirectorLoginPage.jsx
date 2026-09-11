import { useState } from "react";
import { toast } from "sonner";
import { fetchDirectorByCredentials } from "../lib/supabase";

export default function DirectorLoginPage({ onLogin }) {
  const [username, setUsername] = useState("");
  const [passcode, setPasscode] = useState("");
  const [loading, setLoading] = useState(false);

  const onSubmit = async () => {
    if (!username.trim() || !passcode.trim()) {
      toast.error("Please enter both username and passcode.");
      return;
    }
    setLoading(true);
    try {
      const director = await fetchDirectorByCredentials(username.trim(), passcode.trim());
      if (!director) {
        toast.error("Invalid username or passcode.");
        return;
      }
      onLogin(director);
    } catch (e) {
      toast.error(`Login failed: ${e.message}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-[var(--bg)] px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <h1 className="font-display text-3xl font-semibold text-[var(--ink)]">Program Director Login</h1>
          {/* <p className="text-sm text-[var(--muted)] mt-2">Sign in to view your program feedback</p> */}
        </div>

        <div className="bg-[var(--card)] rounded-2xl p-8 space-y-5">
          <div>
            <label className="block text-[15px] font-medium mb-2">Username</label>
            <input
              type="text"
              className="field"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && onSubmit()}
              placeholder="Enter your username"
              autoComplete="username"
            />
          </div>
          <div>
            <label className="block text-[15px] font-medium mb-2">Passcode</label>
            <input
              type="password"
              className="field"
              value={passcode}
              onChange={(e) => setPasscode(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && onSubmit()}
              placeholder="Enter your passcode"
              autoComplete="current-password"
            />
          </div>
          <button
            type="button"
            className="btn-primary w-full"
            onClick={onSubmit}
            disabled={loading}
          >
            {loading ? "Signing in..." : "Sign in"}
          </button>
        </div>
      </div>
    </div>
  );
}
