import { initTRPC } from "@trpc/server";

import type {
  Account,
  CardBenefit,
  Category,
  ColumnMapping,
  NewColumnMapping,
  NewTransaction,
  Tag,
  Transaction
} from "./schema";

export type UpsertCardBenefitInput = {
  accountId: string;
  categoryGroup: "INCOME" | "FIXED" | "VARIABLE" | "IGNORED";
  rewardType: "CASHBACK" | "POINTS";
  rewardRate: number;
  notes?: string | null;
};

export type AccountWithBenefits = Account & { benefits: CardBenefit[] };

export type TransactionWithCategory = Transaction & {
  categoryName: string | null;
  categoryGroupType: string | null;
  categoryColor: string | null;
  tags: Tag[];
};

export type TagWithCount = Tag & { transactionCount: number };

export type TagReportCategoryBreakdown = {
  categoryId: number;
  categoryName: string;
  groupType: "INCOME" | "FIXED" | "VARIABLE";
  total: number;
};

export type TagReportTransaction = Transaction & { tags: Tag[] };

export type TagReport = {
  tag: Tag;
  totalIncome: number;
  totalSpend: number;
  net: number;
  byCategory: TagReportCategoryBreakdown[];
  transactions: TagReportTransaction[];
  dateRange: { from: string; to: string } | null;
};

export type GroupedTransaction = {
  description: string;
  count: number;
  totalAmount: number;
  categoryId: number | null;
  categoryName: string | null;
  categoryGroupType: string | null;
  categoryColor: string | null;
};

export type TransactionListFilter = {
  month?: string;
  categoryId?: number;
  uncategorized?: boolean;
};

export type TransactionListInput = TransactionListFilter & {
  limit?: number;
  offset?: number;
};

export type TransactionListResult = {
  rows: TransactionWithCategory[];
  total: number;
};

export type CategoryTotal = {
  categoryId: number;
  categoryName: string;
  total: number;
};

export type MonthGroup = {
  total: number;
  items: CategoryTotal[];
};

export type MonthlyPnL = {
  month: string;
  income: MonthGroup;
  fixed: MonthGroup;
  variable: MonthGroup;
  ignored: MonthGroup;
  net: number;
  savingsRate: number | null;
};

export type PnLReport = {
  months: MonthlyPnL[];
  ytdIncome: number;
  ytdExpenses: number;
  ytdNet: number;
  avgMonthlySavingsRate: number | null;
  uncategorizedCount: number;
};

export type KpiSummary = {
  month: string;
  net: number;
  netLabel: "IN_THE_GREEN" | "IN_THE_RED" | "NEUTRAL";
  savingsRate: number | null;
  savingsLabel: "HEALTHY" | "WATCH" | "DANGER" | null;
  biggestExpense: { name: string; total: number } | null;
  vsLastMonth: { delta: number; label: "BETTER" | "WORSE" | "SAME" } | null;
};

const t = initTRPC.create();

const router = t.router;
const publicProcedure = t.procedure;

export const appRouter = router({
  health: router({
    ping: publicProcedure.query(() => ({ pong: true as const }))
  }),
  categories: router({
    list: publicProcedure
      .input((v: unknown) => v as void)
      .query(
        (): { INCOME: Category[]; FIXED: Category[]; VARIABLE: Category[]; IGNORED: Category[] } =>
          null as unknown as {
            INCOME: Category[];
            FIXED: Category[];
            VARIABLE: Category[];
            IGNORED: Category[];
          }
      ),
    create: publicProcedure
      .input((v: unknown) => v as { name: string; groupType: string; color?: string | null })
      .mutation((): Category => null as unknown as Category),
    update: publicProcedure
      .input(
        (v: unknown) =>
          v as {
            id: number;
            name?: string;
            groupType?: "INCOME" | "FIXED" | "VARIABLE" | "IGNORED";
            color?: string | null;
            sortOrder?: number;
          }
      )
      .mutation((): Category => null as unknown as Category),
    delete: publicProcedure
      .input((v: unknown) => v as { id: number })
      .mutation((): { deletedId: number } => ({ deletedId: 0 }))
  }),
  tags: router({
    list: publicProcedure
      .input((v: unknown) => v as void)
      .query((): TagWithCount[] => null as unknown as TagWithCount[]),
    create: publicProcedure
      .input((v: unknown) => v as { name: string; color: string })
      .mutation((): Tag => null as unknown as Tag),
    delete: publicProcedure
      .input((v: unknown) => v as { id: string })
      .mutation((): { deletedId: string } => ({ deletedId: "" })),
    assignToTransactions: publicProcedure
      .input((v: unknown) => v as { tagId: string; transactionIds: string[] })
      .mutation((): { assigned: number } => ({ assigned: 0 })),
    removeFromTransactions: publicProcedure
      .input((v: unknown) => v as { tagId: string; transactionIds: string[] })
      .mutation((): { removed: number } => ({ removed: 0 })),
    getReport: publicProcedure
      .input((v: unknown) => v as { tagId: string })
      .query((): TagReport => null as unknown as TagReport),
    getReportByName: publicProcedure
      .input((v: unknown) => v as { name: string })
      .query((): TagReport => null as unknown as TagReport)
  }),
  transactions: router({
    list: publicProcedure
      .input((v: unknown) => v as TransactionListInput)
      .query((): TransactionListResult => null as unknown as TransactionListResult),
    grouped: publicProcedure
      .input((v: unknown) => v as TransactionListFilter | undefined)
      .query((): GroupedTransaction[] => null as unknown as GroupedTransaction[]),
    categorize: publicProcedure
      .input((v: unknown) => v as { ids: string[]; categoryId: number | null })
      .mutation((): { updated: number } => ({ updated: 0 })),
    getMapping: publicProcedure
      .input((v: unknown) => v as { fingerprint: string })
      .query((): ColumnMapping | null => null as unknown as ColumnMapping | null),
    upload: publicProcedure
      .input(
        (v: unknown) =>
          v as {
            transactions: NewTransaction[];
            sourceFile: string;
            mapping: NewColumnMapping;
            accountId: string;
          }
      )
      .mutation((): { inserted: number; duplicates: number } => ({ inserted: 0, duplicates: 0 }))
  }),
  cardBenefits: router({
    list: publicProcedure.input((v: unknown) => v as void).query((): CardBenefit[] => null as unknown as CardBenefit[]),
    upsert: publicProcedure
      .input((v: unknown) => v as UpsertCardBenefitInput)
      .mutation((): CardBenefit => null as unknown as CardBenefit)
  }),
  accounts: router({
    list: publicProcedure
      .input((v: unknown) => v as void)
      .query((): AccountWithBenefits[] => null as unknown as AccountWithBenefits[]),
    create: publicProcedure
      .input(
        (v: unknown) => v as { name: string; institution: string; type: string; last4?: string | null; color?: string }
      )
      .mutation((): AccountWithBenefits => null as unknown as AccountWithBenefits),
    update: publicProcedure
      .input(
        (v: unknown) =>
          v as { id: string; name?: string; institution?: string; type?: string; last4?: string | null; color?: string }
      )
      .mutation((): Account => null as unknown as Account),
    delete: publicProcedure
      .input((v: unknown) => v as { id: string })
      .mutation((): { deletedId: string } => ({ deletedId: "" })),
    addBenefit: publicProcedure
      .input((v: unknown) => v as { accountId: string; categoryGroup: string; rewardType: string; rewardRate: number })
      .mutation((): CardBenefit => null as unknown as CardBenefit),
    updateBenefit: publicProcedure
      .input((v: unknown) => v as { id: string; categoryGroup?: string; rewardType?: string; rewardRate?: number })
      .mutation((): CardBenefit => null as unknown as CardBenefit),
    deleteBenefit: publicProcedure
      .input((v: unknown) => v as { id: string })
      .mutation((): { deletedId: string } => ({ deletedId: "" }))
  }),
  pnl: router({
    getReport: publicProcedure
      .input((v: unknown) => v as { year: number })
      .query((): PnLReport => null as unknown as PnLReport),
    getMonth: publicProcedure
      .input((v: unknown) => v as { month: string })
      .query((): MonthlyPnL => null as unknown as MonthlyPnL),
    getKpis: publicProcedure
      .input((v: unknown) => v as { month: string })
      .query((): KpiSummary => null as unknown as KpiSummary)
  })
});

export type AppRouter = typeof appRouter;
