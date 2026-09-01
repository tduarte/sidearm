"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { DotsThree, Prohibit, Trash, UserPlus, Users } from "@phosphor-icons/react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { useSession } from "@/components/session-provider";
import { api, type PanelUser } from "@/lib/api/client";
import { MIN_PASSWORD_LENGTH } from "@/lib/auth/passwords";
import { ROLE_DESCRIPTION, ROLE_LABEL, ROLES, type Role } from "@/lib/auth/permissions";

const USERS_KEY = ["users"] as const;

/**
 * Account management, admin only.
 *
 * There is no invite email: a self-hosted panel has no mail transport, so the
 * admin sets a password here and hands it over in whatever chat they already
 * use to organise the match.
 */
export function UsersCard() {
  const client = useQueryClient();
  const { user: me } = useSession();
  const [creating, setCreating] = useState(false);

  const users = useQuery({ queryKey: USERS_KEY, queryFn: () => api.listUsers() });
  const invalidate = () => void client.invalidateQueries({ queryKey: USERS_KEY });

  const update = useMutation({
    mutationFn: (input: { id: string; patch: Parameters<typeof api.updateUser>[1] }) =>
      api.updateUser(input.id, input.patch),
    meta: { action: "Updating the account" },
    onSuccess: () => {
      toast.success("Account updated");
      invalidate();
    },
  });

  const remove = useMutation({
    mutationFn: (id: string) => api.deleteUser(id),
    meta: { action: "Deleting the account" },
    onSuccess: () => {
      toast.success("Account deleted");
      invalidate();
    },
  });

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2 text-base">
              <Users className="h-4 w-4" />
              People
            </CardTitle>
            <CardDescription>
              Who can reach this panel, and how much of it.
            </CardDescription>
          </div>
          <Button size="sm" variant="outline" onClick={() => setCreating(true)}>
            <UserPlus className="h-4 w-4" />
            Add person
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {users.isPending ? (
          <div className="space-y-2">
            <Skeleton className="h-12" />
            <Skeleton className="h-12" />
          </div>
        ) : users.data?.users.length ? (
          <ul className="divide-y rounded-md border">
            {users.data.users.map((u) => (
              <UserRow
                key={u.id}
                user={u}
                isSelf={u.id === me?.id}
                onRole={(role) => update.mutate({ id: u.id, patch: { role } })}
                onDisabled={(disabled) => update.mutate({ id: u.id, patch: { disabled } })}
                onPassword={(password) => update.mutate({ id: u.id, patch: { password } })}
                onDelete={() => remove.mutate(u.id)}
              />
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">No accounts yet.</p>
        )}

        <dl className="space-y-1 text-xs text-muted-foreground">
          {ROLES.map((role) => (
            <div key={role} className="flex gap-2">
              <dt className="w-20 shrink-0 font-medium text-foreground">
                {ROLE_LABEL[role]}
              </dt>
              <dd>{ROLE_DESCRIPTION[role]}</dd>
            </div>
          ))}
        </dl>
      </CardContent>

      <CreateUserDialog
        open={creating}
        onOpenChange={setCreating}
        onCreated={() => {
          setCreating(false);
          invalidate();
        }}
      />
    </Card>
  );
}

function UserRow({
  user,
  isSelf,
  onRole,
  onDisabled,
  onPassword,
  onDelete,
}: {
  user: PanelUser;
  isSelf: boolean;
  onRole: (role: Role) => void;
  onDisabled: (disabled: boolean) => void;
  onPassword: (password: string) => void;
  onDelete: () => void;
}) {
  const [resetting, setResetting] = useState(false);
  const [deleting, setDeleting] = useState(false);

  return (
    <li className="flex items-center justify-between gap-3 p-3">
      <div className="min-w-0">
        <p className="flex items-center gap-2 truncate text-sm font-medium">
          {user.username}
          {isSelf && <span className="text-xs text-muted-foreground">(you)</span>}
          {user.disabled && (
            <Badge variant="outline" className="text-xs">
              Disabled
            </Badge>
          )}
        </p>
        <p className="text-xs text-muted-foreground">
          Added {new Date(user.createdAt + "Z").toLocaleDateString()}
        </p>
      </div>

      <div className="flex items-center gap-2">
        <Select value={user.role} onValueChange={(v) => onRole(v as Role)}>
          <SelectTrigger size="sm" className="w-32" aria-label={`Role for ${user.username}`}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {ROLES.map((role) => (
              <SelectItem key={role} value={role}>
                {ROLE_LABEL[role]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" aria-label={`More actions for ${user.username}`}>
              <DotsThree className="h-4 w-4" weight="bold" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onSelect={() => setResetting(true)}>
              Set a new password…
            </DropdownMenuItem>
            {!isSelf && (
              <DropdownMenuItem onSelect={() => onDisabled(!user.disabled)}>
                <Prohibit className="h-4 w-4" />
                {user.disabled ? "Re-enable account" : "Disable account"}
              </DropdownMenuItem>
            )}
            {!isSelf && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  variant="destructive"
                  onSelect={(e) => {
                    e.preventDefault();
                    setDeleting(true);
                  }}
                >
                  <Trash className="h-4 w-4" />
                  Delete account
                </DropdownMenuItem>
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <SetPasswordDialog
        open={resetting}
        onOpenChange={setResetting}
        username={user.username}
        onSubmit={(password) => {
          onPassword(password);
          setResetting(false);
        }}
      />

      {/*
        A plain confirm, not `DangerConfirm`: that one measures blast radius in
        connected players and skips itself on an empty server, which is exactly
        wrong for deleting an account — the cost has nothing to do with who is
        in the match right now.
      */}
      <AlertDialog open={deleting} onOpenChange={setDeleting}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {user.username}?</AlertDialogTitle>
            <AlertDialogDescription>
              They lose access immediately, on every device they are signed in on.
              This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={onDelete}
              className="bg-destructive text-white hover:bg-destructive/90"
            >
              Delete account
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </li>
  );
}

function CreateUserDialog({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: () => void;
}) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<Role>("viewer");

  const create = useMutation({
    mutationFn: () => api.createUser({ username, password, role }),
    meta: { action: "Creating the account" },
    onSuccess: () => {
      toast.success(`${username} can now sign in`, {
        description: "Give them the password you just set — it is not shown again.",
      });
      setUsername("");
      setPassword("");
      setRole("viewer");
      onCreated();
    },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add a person</DialogTitle>
          <DialogDescription>
            Set a password and pass it on yourself; the panel cannot send email.
          </DialogDescription>
        </DialogHeader>
        <form
          id="create-user"
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            create.mutate();
          }}
        >
          <div className="space-y-1.5">
            <Label htmlFor="new-username">Username</Label>
            <Input
              id="new-username"
              value={username}
              autoComplete="off"
              onChange={(e) => setUsername(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="new-password">Password</Label>
            <Input
              id="new-password"
              type="text"
              autoComplete="off"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              aria-describedby="new-password-hint"
            />
            <p id="new-password-hint" className="text-xs text-muted-foreground">
              At least {MIN_PASSWORD_LENGTH} characters. Shown in the clear so you can
              copy it.
            </p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="new-role">Role</Label>
            <Select value={role} onValueChange={(v) => setRole(v as Role)}>
              <SelectTrigger id="new-role">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ROLES.map((r) => (
                  <SelectItem key={r} value={r}>
                    {ROLE_LABEL[r]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">{ROLE_DESCRIPTION[role]}</p>
          </div>
        </form>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            type="submit"
            form="create-user"
            disabled={
              create.isPending || !username || password.length < MIN_PASSWORD_LENGTH
            }
          >
            {create.isPending ? "Creating…" : "Create account"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function SetPasswordDialog({
  open,
  onOpenChange,
  username,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  username: string;
  onSubmit: (password: string) => void;
}) {
  const [password, setPassword] = useState("");

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New password for {username}</DialogTitle>
          <DialogDescription>
            This signs them out everywhere. Give them the new password yourself.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-1.5">
          <Label htmlFor={`reset-${username}`}>Password</Label>
          <Input
            id={`reset-${username}`}
            type="text"
            autoComplete="off"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            disabled={password.length < MIN_PASSWORD_LENGTH}
            onClick={() => {
              onSubmit(password);
              setPassword("");
            }}
          >
            Set password
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
