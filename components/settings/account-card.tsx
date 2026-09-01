"use client";

import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { SignIn, SignOut, UserCircle } from "@phosphor-icons/react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useSession } from "@/components/session-provider";
import { api } from "@/lib/api/client";
import { MIN_PASSWORD_LENGTH } from "@/lib/auth/credentials";
import { ROLE_DESCRIPTION, ROLE_LABEL } from "@/lib/auth/permissions";

/** Who you are signed in as, and the two things you can do about it. */
export function AccountCard() {
  const { user, role, source } = useSession();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");

  const logout = useMutation({
    mutationFn: () => api.logout(),
    meta: { action: "Signing out" },
    onSuccess: () => {
      toast.success("Signed out");
      // A full reload is the honest way back to the gate: AuthGate decides at
      // mount, so re-rendering in place would leave the panel open.
      window.location.reload();
    },
  });

  /**
   * Signing in from inside the panel.
   *
   * `AuthGate` only offers a login form to a browser with no identity at all,
   * so a device inside `PANEL_TRUSTED_CIDRS` gets viewer access and no way to
   * become anything else — it is already "in", and every route that needed
   * more just answered 403 with no explanation. This is that missing door.
   */
  const login = useMutation({
    mutationFn: () => api.login(username.trim(), password),
    meta: { action: "Signing in" },
    onSuccess: () => {
      // Same reason as signing out: the gate and the nav both decide at mount.
      window.location.reload();
    },
  });

  const changePassword = useMutation({
    mutationFn: () => api.changeOwnPassword(current, next),
    meta: { action: "Changing your password" },
    onSuccess: () => {
      toast.success("Password changed", {
        description: "Your other browsers have been signed out.",
      });
      setCurrent("");
      setNext("");
    },
  });

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <UserCircle className="h-4 w-4" />
          Your account
        </CardTitle>
        <CardDescription>
          {role ? ROLE_DESCRIPTION[role] : "You are not signed in."}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4 text-sm">
        <div className="flex items-center justify-between gap-3">
          <span className="text-muted-foreground">Signed in as</span>
          <span className="flex items-center gap-2">
            {user ? (
              <span className="font-medium">{user.username}</span>
            ) : (
              <span className="text-muted-foreground">No account</span>
            )}
            {role && <Badge variant="outline">{ROLE_LABEL[role]}</Badge>}
          </span>
        </div>

        {source === "trusted-peer" && (
          <p className="text-xs text-muted-foreground">
            You are reading this as a viewer because this device&apos;s address is in{" "}
            <code className="font-mono">PANEL_TRUSTED_CIDRS</code>, not because you
            signed in. Sign in with an account to run the match. Note that behind a
            reverse proxy the matched address is the proxy&apos;s, so everything
            reaching it would be trusted.
          </p>
        )}
        {source === "token" && (
          <p className="text-xs text-muted-foreground">
            You are authenticated with <code className="font-mono">PANEL_ADMIN_TOKEN</code>,
            the break-glass credential. It has no account, so there is no password to
            change here.
          </p>
        )}

        {!user && (
          <form
            className="space-y-3 border-t pt-4"
            onSubmit={(e) => {
              e.preventDefault();
              login.mutate();
            }}
          >
            <p className="font-medium">Sign in</p>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="signin-username">Username</Label>
                <Input
                  id="signin-username"
                  autoComplete="username"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="signin-password">Password</Label>
                <Input
                  id="signin-password"
                  type="password"
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </div>
            </div>
            <Button
              type="submit"
              size="sm"
              disabled={login.isPending || !username.trim() || !password}
            >
              <SignIn className="h-4 w-4" />
              {login.isPending ? "Signing in…" : "Sign in"}
            </Button>
          </form>
        )}

        {user && (
          <form
            className="space-y-3 border-t pt-4"
            onSubmit={(e) => {
              e.preventDefault();
              changePassword.mutate();
            }}
          >
            <p className="font-medium">Change your password</p>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="current-password">Current password</Label>
                <Input
                  id="current-password"
                  type="password"
                  autoComplete="current-password"
                  value={current}
                  onChange={(e) => setCurrent(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="next-password">New password</Label>
                <Input
                  id="next-password"
                  type="password"
                  autoComplete="new-password"
                  value={next}
                  onChange={(e) => setNext(e.target.value)}
                  aria-describedby="next-password-hint"
                />
              </div>
            </div>
            <p id="next-password-hint" className="text-xs text-muted-foreground">
              At least {MIN_PASSWORD_LENGTH} characters. This signs out your other
              browsers.
            </p>
            <Button
              type="submit"
              size="sm"
              variant="outline"
              disabled={
                changePassword.isPending || !current || next.length < MIN_PASSWORD_LENGTH
              }
            >
              {changePassword.isPending ? "Changing…" : "Change password"}
            </Button>
          </form>
        )}

        {source === "session" && (
          <div className="border-t pt-4">
            <Button
              variant="outline"
              size="sm"
              disabled={logout.isPending}
              onClick={() => logout.mutate()}
            >
              <SignOut className="h-4 w-4" />
              Sign out of this browser
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
