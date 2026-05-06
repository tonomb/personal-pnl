import { integer, primaryKey, real, sqliteTable, text, unique } from "drizzle-orm/sqlite-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { z } from "zod";

// ---------------------------------------------------------------------------
// Tables
// ---------------------------------------------------------------------------

export const accounts = sqliteTable("accounts", {
  id: text("id").primaryKey(), // UUID
  name: text("name").notNull(),
  institution: text("institution").notNull(),
  type: text("type", { enum: ["CHECKING", "SAVINGS", "CREDIT"] }).notNull(),
  last4: text("last4"),
  color: text("color").notNull().default("#3b82f6"),
  createdAt: text("created_at")
    .$defaultFn(() => new Date().toISOString())
    .notNull()
});

export const cardBenefits = sqliteTable(
  "card_benefits",
  {
    id: text("id").primaryKey(), // UUID
    accountId: text("account_id")
      .notNull()
      .references(() => accounts.id, { onDelete: "cascade" }),
    categoryGroup: text("category_group", { enum: ["INCOME", "FIXED", "VARIABLE", "IGNORED"] }).notNull(),
    rewardType: text("reward_type", { enum: ["CASHBACK", "POINTS"] }).notNull(),
    rewardRate: real("reward_rate").notNull(), // stored as decimal: 0.03 = 3%, 3.0 = 3x points
    notes: text("notes"),
    createdAt: text("created_at")
      .$defaultFn(() => new Date().toISOString())
      .notNull()
  },
  (table) => [unique("card_benefits_account_category_unq").on(table.accountId, table.categoryGroup)]
);

export const categories = sqliteTable("categories", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  groupType: text("group_type", { enum: ["INCOME", "FIXED", "VARIABLE", "IGNORED"] }).notNull(),
  isDefault: integer("is_default", { mode: "boolean" }).notNull().default(false),
  color: text("color"),
  sortOrder: integer("sort_order").notNull().default(0)
});

export const transactions = sqliteTable("transactions", {
  id: text("id").primaryKey(), // UUID
  date: text("date").notNull(), // YYYY-MM-DD
  description: text("description").notNull(),
  amount: real("amount").notNull(), // always positive
  type: text("type", { enum: ["DEBIT", "CREDIT"] }).notNull(),
  categoryId: integer("category_id").references(() => categories.id, { onDelete: "set null" }),
  accountId: text("account_id")
    .notNull()
    .references(() => accounts.id, { onDelete: "cascade" }),
  sourceFile: text("source_file"),
  rawRow: text("raw_row"), // JSON text
  createdAt: text("created_at")
    .$defaultFn(() => new Date().toISOString())
    .notNull()
});

export const tags = sqliteTable("tags", {
  id: text("id").primaryKey(), // nanoid
  name: text("name").notNull().unique(), // e.g. "New York 2026"
  color: text("color").notNull(), // hex string, e.g. "#3B82F6"
  createdAt: text("created_at")
    .$defaultFn(() => new Date().toISOString())
    .notNull()
});

export const transactionTags = sqliteTable(
  "transaction_tags",
  {
    transactionId: text("transaction_id")
      .notNull()
      .references(() => transactions.id, { onDelete: "cascade" }),
    tagId: text("tag_id")
      .notNull()
      .references(() => tags.id, { onDelete: "cascade" })
  },
  (table) => [primaryKey({ columns: [table.transactionId, table.tagId] })]
);

export const columnMappings = sqliteTable("column_mappings", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  fileFingerprint: text("file_fingerprint").notNull().unique(),
  dateCol: text("date_col").notNull(),
  descriptionCol: text("description_col").notNull(),
  amountCol: text("amount_col"),
  debitCol: text("debit_col"),
  creditCol: text("credit_col")
});

// ---------------------------------------------------------------------------
// Zod schemas (derived from Drizzle)
// ---------------------------------------------------------------------------

export const insertAccountSchema = createInsertSchema(accounts);
export const selectAccountSchema = createSelectSchema(accounts);

export const createAccountInputSchema = z.object({
  name: z.string().trim().min(1, "Name required"),
  institution: z.string().trim().min(1, "Institution required"),
  type: z.enum(["CHECKING", "SAVINGS", "CREDIT"]),
  last4: z
    .string()
    .regex(/^\d{4}$/, "Must be 4 digits")
    .nullable()
    .optional(),
  color: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/, "Color must be #RRGGBB hex")
    .default("#3b82f6")
});

export const updateAccountInputSchema = z.object({
  id: z.string().min(1),
  name: z.string().trim().min(1).optional(),
  institution: z.string().trim().min(1).optional(),
  type: z.enum(["CHECKING", "SAVINGS", "CREDIT"]).optional(),
  last4: z
    .string()
    .regex(/^\d{4}$/)
    .nullable()
    .optional(),
  color: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/)
    .optional()
});

export const deleteAccountInputSchema = z.object({ id: z.string().min(1) });

export const insertCardBenefitSchema = createInsertSchema(cardBenefits);
export const selectCardBenefitSchema = createSelectSchema(cardBenefits);

export const createCardBenefitInputSchema = z.object({
  accountId: z.string().min(1),
  categoryGroup: z.enum(["INCOME", "FIXED", "VARIABLE", "IGNORED"]),
  rewardType: z.enum(["CASHBACK", "POINTS"]),
  rewardRate: z.number().min(0), // 0.03 = 3% cashback, 3.0 = 3x points
  notes: z.string().trim().nullable().optional()
});

export const upsertCardBenefitInputSchema = z.object({
  accountId: z.string().min(1),
  categoryGroup: z.enum(["INCOME", "FIXED", "VARIABLE", "IGNORED"]),
  rewardType: z.enum(["CASHBACK", "POINTS"]),
  rewardRate: z.number().min(0),
  notes: z.string().trim().nullable().optional()
});

export const updateCardBenefitInputSchema = z.object({
  id: z.string().min(1),
  categoryGroup: z.enum(["INCOME", "FIXED", "VARIABLE", "IGNORED"]).optional(),
  rewardType: z.enum(["CASHBACK", "POINTS"]).optional(),
  rewardRate: z.number().min(0).optional(),
  notes: z.string().trim().nullable().optional()
});

export const deleteCardBenefitInputSchema = z.object({ id: z.string().min(1) });

export const insertCategorySchema = createInsertSchema(categories);
export const selectCategorySchema = createSelectSchema(categories);

export const insertTransactionSchema = createInsertSchema(transactions);
export const selectTransactionSchema = createSelectSchema(transactions);

// accountId is omitted — the upload endpoint assigns it from the outer accountId field.
export const transactionInputSchema = insertTransactionSchema.omit({ accountId: true }).extend({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be YYYY-MM-DD"),
  amount: z.number().positive("Amount must be positive")
});

export const insertColumnMappingSchema = createInsertSchema(columnMappings);
export const selectColumnMappingSchema = createSelectSchema(columnMappings);

export const insertTagSchema = createInsertSchema(tags);
export const selectTagSchema = createSelectSchema(tags);

export const insertTransactionTagSchema = createInsertSchema(transactionTags);
export const selectTransactionTagSchema = createSelectSchema(transactionTags);

export const createTagInputSchema = z.object({
  name: z.string().trim().min(1, "Name cannot be empty").max(64, "Name too long"),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/, "Color must be #RRGGBB hex")
});

export const deleteTagInputSchema = z.object({ id: z.string().min(1) });

export const assignTagInputSchema = z.object({
  tagId: z.string().min(1),
  transactionIds: z.array(z.string().min(1)).min(1).max(500)
});

export const removeTagInputSchema = z.object({
  tagId: z.string().min(1),
  transactionIds: z.array(z.string().min(1)).min(1).max(500)
});

export const tagGetReportInputSchema = z.object({ tagId: z.string().min(1) });

export const tagGetReportByNameInputSchema = z.object({
  name: z.string().trim().min(1, "Name cannot be empty")
});

// ---------------------------------------------------------------------------
// tRPC input schemas (shared with frontend form validation)
// ---------------------------------------------------------------------------

export const monthFilterSchema = z.string().regex(/^\d{4}-\d{2}$/, "Month must be YYYY-MM");

export const transactionFilterSchema = z.object({
  month: monthFilterSchema.optional(),
  categoryId: z.number().int().optional(),
  uncategorized: z.boolean().optional(),
  tagId: z.string().optional()
});

export const transactionListInputSchema = transactionFilterSchema.extend({
  limit: z.number().int().min(1).max(500).default(100),
  offset: z.number().int().min(0).default(0)
});

export const transactionGroupedInputSchema = transactionFilterSchema.optional();

// MCP tool input schemas (LAG-15) — capped at 200 rows per tool invocation.
export const mcpGetTransactionsInputSchema = transactionFilterSchema.extend({
  limit: z.number().int().min(1).max(200).default(50)
});

export const mcpSpendingByCategoryInputSchema = z.object({
  month: monthFilterSchema
});

export const mcpTopMerchantsInputSchema = z.object({
  month: monthFilterSchema.optional(),
  limit: z.number().int().min(1).max(200).default(10)
});

export const mcpSearchTransactionsInputSchema = z.object({
  query: z.string().min(1),
  month: monthFilterSchema.optional(),
  limit: z.number().int().min(1).max(200).default(50)
});

// LAG-16 advisor tool input schemas.
export const mcpBudgetVarianceInputSchema = z.object({
  month: monthFilterSchema
});

export const mcpCashflowTrendInputSchema = z.object({
  months: z.number().int().min(1).max(24).default(6)
});

export const categorizeInputSchema = z.object({
  ids: z.array(z.string()).min(1).max(500),
  categoryId: z.number().int().nullable()
});

export const createCategoryInputSchema = insertCategorySchema.pick({
  name: true,
  groupType: true,
  color: true
});

export const updateCategoryInputSchema = z.object({
  id: z.number().int(),
  name: z.string().min(1).optional(),
  groupType: z.enum(["INCOME", "FIXED", "VARIABLE", "IGNORED"]).optional(),
  color: z.string().nullable().optional(),
  sortOrder: z.number().int().optional()
});

export const deleteCategoryInputSchema = z.object({ id: z.number().int() });

export const pnlGetReportInputSchema = z.object({
  year: z.number().int().min(2000).max(2100)
});

export const pnlGetMonthInputSchema = z.object({
  month: monthFilterSchema
});

export const pnlGetKpisInputSchema = z.object({
  month: monthFilterSchema
});

// ---------------------------------------------------------------------------
// TypeScript types (inferred from Drizzle)
// ---------------------------------------------------------------------------

export type Account = typeof accounts.$inferSelect;
export type NewAccount = typeof accounts.$inferInsert;

export type CardBenefit = typeof cardBenefits.$inferSelect;
export type NewCardBenefit = typeof cardBenefits.$inferInsert;

export type Category = typeof categories.$inferSelect;
export type NewCategory = typeof categories.$inferInsert;

export type Transaction = typeof transactions.$inferSelect;
export type NewTransaction = typeof transactions.$inferInsert;

export type ColumnMapping = typeof columnMappings.$inferSelect;
export type NewColumnMapping = typeof columnMappings.$inferInsert;

export type Tag = typeof tags.$inferSelect;
export type NewTag = typeof tags.$inferInsert;

export type TransactionTag = typeof transactionTags.$inferSelect;
export type NewTransactionTag = typeof transactionTags.$inferInsert;
