import { createFileRoute } from "@tanstack/react-router";
import { PencilIcon, PlusIcon, Trash2Icon, XIcon } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import type { Account, AccountWithBenefits, CardBenefit } from "@pnl/types";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { TAG_PRESET_COLORS } from "@/lib/color";
import { trpc } from "@/lib/trpc";

export const Route = createFileRoute("/accounts")({
  component: AccountsPage
});

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const ACCOUNT_TYPES = ["CHECKING", "SAVINGS", "CREDIT"] as const;
const CATEGORY_GROUPS = ["INCOME", "FIXED", "VARIABLE", "IGNORED"] as const;

const TYPE_LABELS: Record<string, string> = {
  CHECKING: "Checking",
  SAVINGS: "Savings",
  CREDIT: "Credit"
};

// ---------------------------------------------------------------------------
// Add Account Form
// ---------------------------------------------------------------------------

type AccountFormState = {
  name: string;
  institution: string;
  type: "CHECKING" | "SAVINGS" | "CREDIT";
  last4: string;
  color: string;
};

const DEFAULT_FORM: AccountFormState = {
  name: "",
  institution: "",
  type: "CREDIT",
  last4: "",
  color: TAG_PRESET_COLORS[5]
};

function AddAccountForm({ onDone }: { onDone: () => void }) {
  const [form, setForm] = useState<AccountFormState>(DEFAULT_FORM);
  const utils = trpc.useUtils();

  const createMutation = trpc.accounts.create.useMutation({
    onMutate: async (input) => {
      await utils.accounts.list.cancel();
      const snapshot = utils.accounts.list.getData();
      utils.accounts.list.setData(undefined, (old) => [
        ...(old ?? []),
        {
          id: "optimistic-" + Date.now(),
          name: input.name,
          institution: input.institution,
          type: input.type as Account["type"],
          last4: input.last4 ?? null,
          color: input.color ?? TAG_PRESET_COLORS[5],
          createdAt: new Date().toISOString(),
          benefits: [] as CardBenefit[]
        } satisfies AccountWithBenefits
      ]);
      return { snapshot };
    },
    onError: (_err, _input, ctx) => {
      utils.accounts.list.setData(undefined, ctx?.snapshot);
      toast.error("Failed to create account");
    },
    onSuccess: () => {
      toast("Account created");
      onDone();
    },
    onSettled: () => void utils.accounts.list.invalidate()
  });

  function setField<K extends keyof AccountFormState>(key: K, value: AccountFormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim() || !form.institution.trim()) return;
    createMutation.mutate({
      name: form.name.trim(),
      institution: form.institution.trim(),
      type: form.type,
      last4: form.last4.trim() || null,
      color: form.color
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4 rounded-xl border bg-muted/30 p-4">
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <label className="text-xs font-medium text-muted-foreground">Name</label>
          <Input
            placeholder="Chase Sapphire"
            value={form.name}
            onChange={(e) => setField("name", e.target.value)}
            required
          />
        </div>
        <div className="space-y-1">
          <label className="text-xs font-medium text-muted-foreground">Institution</label>
          <Input
            placeholder="Chase"
            value={form.institution}
            onChange={(e) => setField("institution", e.target.value)}
            required
          />
        </div>
        <div className="space-y-1">
          <label className="text-xs font-medium text-muted-foreground">Type</label>
          <Select value={form.type} onValueChange={(v) => setField("type", v as AccountFormState["type"])}>
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {ACCOUNT_TYPES.map((t) => (
                <SelectItem key={t} value={t}>
                  {TYPE_LABELS[t]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <label className="text-xs font-medium text-muted-foreground">Last 4 digits (optional)</label>
          <Input
            placeholder="1234"
            value={form.last4}
            maxLength={4}
            onChange={(e) => setField("last4", e.target.value.replace(/\D/g, ""))}
          />
        </div>
      </div>

      <div className="space-y-1">
        <label className="text-xs font-medium text-muted-foreground">Color</label>
        <ColorPicker value={form.color} onChange={(c) => setField("color", c)} />
      </div>

      <div className="flex gap-2">
        <Button type="submit" size="sm" disabled={createMutation.isPending}>
          Save
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={onDone}>
          Cancel
        </Button>
      </div>
    </form>
  );
}

// ---------------------------------------------------------------------------
// Color picker
// ---------------------------------------------------------------------------

function ColorPicker({ value, onChange }: { value: string; onChange: (hex: string) => void }) {
  return (
    <div className="flex items-center gap-2">
      {TAG_PRESET_COLORS.map((c) => (
        <button
          key={c}
          type="button"
          className="size-6 rounded-full border-2 transition-transform hover:scale-110"
          style={{
            background: c,
            borderColor: value === c ? "hsl(var(--ring))" : "transparent"
          }}
          onClick={() => onChange(c)}
          aria-label={c}
        />
      ))}
      <input
        type="color"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="size-6 cursor-pointer rounded border-0 bg-transparent p-0"
        title="Custom color"
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Card benefits inline table
// ---------------------------------------------------------------------------

type BenefitRowEditState = {
  categoryGroup: (typeof CATEGORY_GROUPS)[number];
  rewardType: string;
  rewardRate: string; // displayed as %, stored as decimal
};

function BenefitsTable({ account }: { account: AccountWithBenefits }) {
  const utils = trpc.useUtils();
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editState, setEditState] = useState<BenefitRowEditState>({
    categoryGroup: "VARIABLE",
    rewardType: "",
    rewardRate: ""
  });

  const addMutation = trpc.accounts.addBenefit.useMutation({
    onMutate: async (input) => {
      await utils.accounts.list.cancel();
      const snapshot = utils.accounts.list.getData();
      utils.accounts.list.setData(undefined, (old) =>
        old?.map((a) =>
          a.id === input.accountId
            ? {
                ...a,
                benefits: [
                  ...a.benefits,
                  {
                    id: "optimistic-" + Date.now(),
                    accountId: input.accountId,
                    categoryGroup: input.categoryGroup as CardBenefit["categoryGroup"],
                    rewardType: input.rewardType as CardBenefit["rewardType"],
                    rewardRate: input.rewardRate,
                    notes: null,
                    createdAt: new Date().toISOString()
                  } satisfies CardBenefit
                ]
              }
            : a
        )
      );
      return { snapshot };
    },
    onError: (_err, _input, ctx) => {
      utils.accounts.list.setData(undefined, ctx?.snapshot);
      toast.error("Failed to add benefit");
    },
    onSuccess: () => setAdding(false),
    onSettled: () => void utils.accounts.list.invalidate()
  });

  const updateMutation = trpc.accounts.updateBenefit.useMutation({
    onMutate: async (input) => {
      await utils.accounts.list.cancel();
      const snapshot = utils.accounts.list.getData();
      utils.accounts.list.setData(undefined, (old) =>
        old?.map((a) => ({
          ...a,
          benefits: a.benefits.map((b) =>
            b.id === input.id
              ? {
                  ...b,
                  ...(input.categoryGroup !== undefined && {
                    categoryGroup: input.categoryGroup as CardBenefit["categoryGroup"]
                  }),
                  ...(input.rewardType !== undefined && {
                    rewardType: input.rewardType as CardBenefit["rewardType"]
                  }),
                  ...(input.rewardRate !== undefined && { rewardRate: input.rewardRate })
                }
              : b
          )
        }))
      );
      return { snapshot };
    },
    onError: (_err, _input, ctx) => {
      utils.accounts.list.setData(undefined, ctx?.snapshot);
      toast.error("Failed to update benefit");
    },
    onSuccess: () => setEditingId(null),
    onSettled: () => void utils.accounts.list.invalidate()
  });

  const deleteMutation = trpc.accounts.deleteBenefit.useMutation({
    onMutate: async (input) => {
      await utils.accounts.list.cancel();
      const snapshot = utils.accounts.list.getData();
      utils.accounts.list.setData(undefined, (old) =>
        old?.map((a) => ({ ...a, benefits: a.benefits.filter((b) => b.id !== input.id) }))
      );
      return { snapshot };
    },
    onError: (_err, _input, ctx) => {
      utils.accounts.list.setData(undefined, ctx?.snapshot);
      toast.error("Failed to delete benefit");
    },
    onSettled: () => void utils.accounts.list.invalidate()
  });

  function startEdit(b: CardBenefit) {
    setEditingId(b.id);
    setEditState({
      categoryGroup: b.categoryGroup as (typeof CATEGORY_GROUPS)[number],
      rewardType: b.rewardType,
      rewardRate: String(+(b.rewardRate * 100).toFixed(4))
    });
  }

  function commitEdit(id: string) {
    const rate = parseFloat(editState.rewardRate) / 100;
    if (isNaN(rate) || rate < 0 || rate > 1) return;
    updateMutation.mutate({
      id,
      categoryGroup: editState.categoryGroup,
      rewardType: editState.rewardType,
      rewardRate: rate
    });
  }

  function commitAdd() {
    const rate = parseFloat(editState.rewardRate) / 100;
    if (!editState.rewardType.trim() || isNaN(rate) || rate < 0 || rate > 1) return;
    addMutation.mutate({
      accountId: account.id,
      categoryGroup: editState.categoryGroup,
      rewardType: editState.rewardType.trim(),
      rewardRate: rate
    });
  }

  const noMutationPending = !addMutation.isPending && !updateMutation.isPending && !deleteMutation.isPending;

  return (
    <div className="space-y-2">
      {account.benefits.length > 0 || adding ? (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-32">Category Group</TableHead>
              <TableHead>Reward Type</TableHead>
              <TableHead className="w-24">Rate</TableHead>
              <TableHead className="w-16" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {account.benefits.map((b) =>
              editingId === b.id ? (
                <TableRow key={b.id}>
                  <TableCell>
                    <BenefitGroupSelect
                      value={editState.categoryGroup}
                      onChange={(v) => setEditState((s) => ({ ...s, categoryGroup: v }))}
                    />
                  </TableCell>
                  <TableCell>
                    <Input
                      className="h-7 text-sm"
                      value={editState.rewardType}
                      onChange={(e) => setEditState((s) => ({ ...s, rewardType: e.target.value }))}
                    />
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1">
                      <Input
                        className="h-7 w-16 text-sm"
                        type="number"
                        min={0}
                        max={100}
                        step={0.1}
                        value={editState.rewardRate}
                        onChange={(e) => setEditState((s) => ({ ...s, rewardRate: e.target.value }))}
                      />
                      <span className="text-muted-foreground text-xs">%</span>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex gap-1">
                      <Button
                        size="icon-xs"
                        variant="ghost"
                        onClick={() => commitEdit(b.id)}
                        disabled={!noMutationPending}
                      >
                        ✓
                      </Button>
                      <Button size="icon-xs" variant="ghost" onClick={() => setEditingId(null)}>
                        <XIcon className="size-3" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ) : (
                <TableRow key={b.id}>
                  <TableCell className="text-xs capitalize">{b.categoryGroup.toLowerCase()}</TableCell>
                  <TableCell className="text-sm">{b.rewardType}</TableCell>
                  <TableCell className="text-sm">{+(b.rewardRate * 100).toFixed(2)}%</TableCell>
                  <TableCell>
                    <div className="flex gap-1">
                      <Button size="icon-xs" variant="ghost" onClick={() => startEdit(b)}>
                        <PencilIcon className="size-3" />
                      </Button>
                      <Button
                        size="icon-xs"
                        variant="ghost"
                        className="text-destructive hover:text-destructive"
                        onClick={() => deleteMutation.mutate({ id: b.id })}
                        disabled={!noMutationPending}
                      >
                        <Trash2Icon className="size-3" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              )
            )}
            {adding && (
              <TableRow>
                <TableCell>
                  <BenefitGroupSelect
                    value={editState.categoryGroup}
                    onChange={(v) => setEditState((s) => ({ ...s, categoryGroup: v }))}
                  />
                </TableCell>
                <TableCell>
                  <Input
                    autoFocus
                    className="h-7 text-sm"
                    placeholder="cashback"
                    value={editState.rewardType}
                    onChange={(e) => setEditState((s) => ({ ...s, rewardType: e.target.value }))}
                  />
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-1">
                    <Input
                      className="h-7 w-16 text-sm"
                      type="number"
                      min={0}
                      max={100}
                      step={0.1}
                      placeholder="3"
                      value={editState.rewardRate}
                      onChange={(e) => setEditState((s) => ({ ...s, rewardRate: e.target.value }))}
                    />
                    <span className="text-muted-foreground text-xs">%</span>
                  </div>
                </TableCell>
                <TableCell>
                  <div className="flex gap-1">
                    <Button size="icon-xs" variant="ghost" onClick={commitAdd} disabled={!noMutationPending}>
                      ✓
                    </Button>
                    <Button
                      size="icon-xs"
                      variant="ghost"
                      onClick={() => {
                        setAdding(false);
                        setEditState({ categoryGroup: "VARIABLE", rewardType: "", rewardRate: "" });
                      }}
                    >
                      <XIcon className="size-3" />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      ) : (
        <p className="text-muted-foreground text-xs">No card benefits configured.</p>
      )}

      {!adding && (
        <Button
          size="xs"
          variant="ghost"
          onClick={() => {
            setAdding(true);
            setEditState({ categoryGroup: "VARIABLE", rewardType: "", rewardRate: "" });
          }}
        >
          <PlusIcon className="size-3" />
          Add benefit
        </Button>
      )}
    </div>
  );
}

function BenefitGroupSelect({
  value,
  onChange
}: {
  value: (typeof CATEGORY_GROUPS)[number];
  onChange: (v: (typeof CATEGORY_GROUPS)[number]) => void;
}) {
  return (
    <Select value={value} onValueChange={(v) => onChange(v as (typeof CATEGORY_GROUPS)[number])}>
      <SelectTrigger className="h-7 text-xs">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {CATEGORY_GROUPS.map((g) => (
          <SelectItem key={g} value={g} className="text-xs capitalize">
            {g.charAt(0) + g.slice(1).toLowerCase()}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

// ---------------------------------------------------------------------------
// Account card
// ---------------------------------------------------------------------------

function AccountCard({ account }: { account: AccountWithBenefits }) {
  const utils = trpc.useUtils();

  const deleteMutation = trpc.accounts.delete.useMutation({
    onMutate: async (input) => {
      await utils.accounts.list.cancel();
      const snapshot = utils.accounts.list.getData();
      utils.accounts.list.setData(undefined, (old) => old?.filter((a) => a.id !== input.id));
      return { snapshot };
    },
    onError: (_err, _input, ctx) => {
      utils.accounts.list.setData(undefined, ctx?.snapshot);
      toast.error("Failed to delete account");
    },
    onSuccess: () => toast("Account deleted"),
    onSettled: () => void utils.accounts.list.invalidate()
  });

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="size-3 rounded-full shrink-0" style={{ background: account.color }} />
            <span className="text-sm font-semibold">{account.name}</span>
            <Badge variant="outline" className="text-xs">
              {TYPE_LABELS[account.type]}
            </Badge>
            <span className="text-muted-foreground text-xs">{account.institution}</span>
            {account.last4 && <span className="text-muted-foreground text-xs">····{account.last4}</span>}
          </div>
          <Button
            size="icon-xs"
            variant="ghost"
            className="text-destructive hover:text-destructive"
            onClick={() => deleteMutation.mutate({ id: account.id })}
            disabled={deleteMutation.isPending}
          >
            <Trash2Icon className="size-3.5" />
          </Button>
        </div>
        <CardTitle>Card Benefits</CardTitle>
      </CardHeader>
      <CardContent>
        <BenefitsTable account={account} />
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

function AccountsPage() {
  const { data, isLoading } = trpc.accounts.list.useQuery();
  const [showForm, setShowForm] = useState(false);
  const accounts = data ?? [];

  return (
    <main className="mx-auto max-w-3xl space-y-6 p-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Accounts</h1>
          <p className="text-muted-foreground">Configure your bank accounts and credit cards.</p>
        </div>
        {!showForm && (
          <Button size="sm" onClick={() => setShowForm(true)}>
            <PlusIcon className="mr-1.5 size-4" />
            Add Account
          </Button>
        )}
      </div>

      {showForm && <AddAccountForm onDone={() => setShowForm(false)} />}

      {isLoading ? (
        <div className="text-muted-foreground text-sm">Loading…</div>
      ) : accounts.length === 0 && !showForm ? (
        <div className="rounded-xl border border-dashed p-8 text-center">
          <p className="text-muted-foreground text-sm">No accounts yet. Add one to get started.</p>
        </div>
      ) : (
        <ul className="space-y-4">
          {accounts.map((account) => (
            <li key={account.id}>
              <AccountCard account={account} />
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
