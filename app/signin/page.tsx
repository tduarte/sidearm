"use client";

import { GateShell, LoginCard } from "@/components/auth-gate";

/**
 * The way in for a browser that already has an identity it did not ask for.
 *
 * `PANEL_TRUSTED_CIDRS` hands every device on the LAN a viewer role, which is
 * the point — a wall display should show the score without an account. But the
 * gate only offers a form to callers with *no* identity, so on that same LAN
 * the operator got the full panel with every control dead and no sign-in
 * anywhere. This route is unreachable through the gate's logic by design: it is
 * listed there as ungated, so it renders whoever asks for it.
 *
 * A full reload rather than a router push, so every cached query — the session
 * above all — is fetched again as the person who just signed in.
 */
export default function SignInPage() {
  return (
    <GateShell>
      <LoginCard onDone={() => (window.location.href = "/")} />
    </GateShell>
  );
}
