"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { Crosshair, Lock, SpinnerGap, UserPlus } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { api, UnauthorizedError } from "@/lib/api/client";
import { MIN_PASSWORD_LENGTH } from "@/lib/auth/credentials";

type Screen = "checking" | "ready" | "register" | "login";

/**
 * Decides whether this browser gets the panel, a sign-in form, or the
 * first-run registration that claims an unclaimed install.
 *
 * The check has a real loading screen rather than rendering nothing. Returning
 * null here used to give every cold load a blank page for the length of a round
 * trip, which reads as a broken deployment on exactly the slow connection where
 * it lasts longest.
 */
export function AuthGate({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  // The design explorations read fixture data and touch no API, so gating them
  // behind a login would only ever stop someone looking at a picture.
  const isDesign = pathname?.startsWith("/design") ?? false;
  const [screen, setScreen] = useState<Screen>("checking");
  const [tokenConfigured, setTokenConfigured] = useState(false);

  useEffect(() => {
    if (isDesign) return;
    let cancelled = false;
    (async () => {
      try {
        const status = await api.authStatus();
        if (cancelled) return;
        setTokenConfigured(status.tokenConfigured);
        if (status.firstRun) setScreen("register");
        else if (status.role) setScreen("ready");
        else setScreen("login");
      } catch (err) {
        if (cancelled) return;
        // `/api/auth` is reachable without credentials, so a 401 here means the
        // panel has no accounts yet; anything else is a transport problem and
        // should not trap the operator behind a login form they cannot pass.
        if (err instanceof UnauthorizedError) {
          setScreen(err.code === "first-run" ? "register" : "login");
        } else {
          setScreen("ready");
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isDesign]);

  if (isDesign) return <>{children}</>;
  if (screen === "checking") return <GateSplash />;
  if (screen === "ready") return <>{children}</>;

  return (
    <GateShell>
      {screen === "register" ? (
        <RegisterCard
          tokenConfigured={tokenConfigured}
          onDone={() => window.location.reload()}
        />
      ) : (
        <LoginCard onDone={() => window.location.reload()} />
      )}
    </GateShell>
  );
}

function GateSplash() {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-3">
      <Crosshair className="size-7 text-primary" weight="bold" />
      <p className="flex items-center gap-2 text-sm text-muted-foreground">
        <SpinnerGap className="size-4 animate-spin" />
        Checking your session…
      </p>
    </div>
  );
}

function GateShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh items-center justify-center p-6">
      <div className="w-full max-w-sm space-y-6">
        <div className="flex items-center gap-2.5">
          <span className="flex size-8 items-center justify-center rounded-md bg-primary text-primary-foreground">
            <Crosshair className="size-5" weight="bold" />
          </span>
          <span className="text-lg font-semibold tracking-tight">sidearm</span>
        </div>
        {children}
      </div>
    </div>
  );
}

function FormError({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <p role="alert" className="text-sm text-destructive">
      {message}
    </p>
  );
}

/** First-run: claims the panel and creates its admin. */
function RegisterCard({
  tokenConfigured,
  onDone,
}: {
  tokenConfigured: boolean;
  onDone: () => void;
}) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [setupToken, setSetupToken] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const tooShort = password.length > 0 && password.length < MIN_PASSWORD_LENGTH;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <UserPlus className="size-4" weight="fill" />
          Create your admin account
        </CardTitle>
        <CardDescription>
          Nobody has claimed this panel yet. The first account is the admin, and can
          add moderators and viewers afterwards.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form
          className="space-y-3"
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            setError(null);
            try {
              await api.register({
                username,
                password,
                ...(tokenConfigured ? { setupToken } : {}),
              });
              onDone();
            } catch (err) {
              setError(err instanceof Error ? err.message : "That did not work.");
              setBusy(false);
            }
          }}
        >
          <div className="space-y-1.5">
            <Label htmlFor="reg-username">Username</Label>
            <Input
              id="reg-username"
              autoFocus
              autoComplete="username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="reg-password">Password</Label>
            <Input
              id="reg-password"
              type="password"
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              aria-describedby="reg-password-hint"
            />
            <p id="reg-password-hint" className="text-xs text-muted-foreground">
              At least {MIN_PASSWORD_LENGTH} characters.
            </p>
          </div>
          {tokenConfigured && (
            <div className="space-y-1.5">
              <Label htmlFor="reg-setup-token">Setup token</Label>
              <Input
                id="reg-setup-token"
                type="password"
                value={setupToken}
                onChange={(e) => setSetupToken(e.target.value)}
                aria-describedby="reg-setup-hint"
              />
              <p id="reg-setup-hint" className="text-xs text-muted-foreground">
                This panel already runs with <code>PANEL_ADMIN_TOKEN</code> set. Paste
                that token to prove the install is yours.
              </p>
            </div>
          )}
          <FormError message={error} />
          <Button
            type="submit"
            className="w-full"
            disabled={busy || !username || !password || tooShort || (tokenConfigured && !setupToken)}
          >
            {busy ? "Creating…" : "Create admin account"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

function LoginCard({ onDone }: { onDone: () => void }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Lock className="size-4" weight="fill" />
          Sign in
        </CardTitle>
        <CardDescription>Use the account an admin created for you.</CardDescription>
      </CardHeader>
      <CardContent>
        <form
          className="space-y-3"
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            setError(null);
            try {
              await api.login(username, password);
              onDone();
            } catch (err) {
              setError(err instanceof Error ? err.message : "That did not work.");
              setBusy(false);
            }
          }}
        >
          <div className="space-y-1.5">
            <Label htmlFor="login-username">Username</Label>
            <Input
              id="login-username"
              autoFocus
              autoComplete="username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="login-password">Password</Label>
            <Input
              id="login-password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>
          <FormError message={error} />
          <Button type="submit" className="w-full" disabled={busy || !username || !password}>
            {busy ? "Signing in…" : "Sign in"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
