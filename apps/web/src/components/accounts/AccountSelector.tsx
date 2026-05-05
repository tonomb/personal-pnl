import type { AccountWithBenefits } from "@pnl/types";

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

type Props = {
  value: string | null;
  onChange: (accountId: string) => void;
  accounts: AccountWithBenefits[];
};

export function AccountSelector({ value, onChange, accounts }: Props) {
  return (
    <Select value={value ?? ""} onValueChange={(v) => v && onChange(v)}>
      <SelectTrigger className="w-full">
        <SelectValue placeholder="Select account…" />
      </SelectTrigger>
      <SelectContent>
        {accounts.map((a) => (
          <SelectItem key={a.id} value={a.id}>
            <span className="inline-block size-2 shrink-0 rounded-full" style={{ background: a.color }} />
            {a.name}
            {a.institution && <span className="text-muted-foreground"> · {a.institution}</span>}
            {a.last4 && <span className="text-muted-foreground"> ····{a.last4}</span>}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
