import { integer, primaryKey, real, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { z } from "zod";

// ---------------------------------------------------------------------------
// Tables
// ---------------------------------------------------------------------------

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

export const insertCategorySchema = createInsertSchema(categories);
export const selectCategorySchema = createSelectSchema(categories);

export const insertTransactionSchema = createInsertSchema(transactions);
export const selectTransactionSchema = createSelectSchema(transactions);

export const transactionInputSchema = insertTransactionSchema.extend({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be YYYY-MM-DD"),
  amount: z.number().positive("Amount must be positive")
});

export const insertColumnMappingSchema = createInsertSchema(columnMappings);
export const selectColumnMappingSchema = createSelectSchema(columnMappings);

export const insertTagSchema = createInsertSchema(tags);
export const selectTagSchema = createSelectSchema(tags);

export const insertTransactionTagSchema = createInsertSchema(transactionTags);
export const selectTransactionTagSchema = createSelectSchema(transactionTags);

// ---------------------------------------------------------------------------
// tRPC input schemas (shared with frontend form validation)
// ---------------------------------------------------------------------------

export const monthFilterSchema = z.string().regex(/^\d{4}-\d{2}$/, "Month must be YYYY-MM");

export const transactionFilterSchema = z.object({
  month: monthFilterSchema.optional(),
  categoryId: z.number().int().optional(),
  uncategorized: z.boolean().optional()
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
