import { integer, real, sqliteTable, text } from 'drizzle-orm/sqlite-core'
import { createInsertSchema, createSelectSchema } from 'drizzle-zod'

// ---------------------------------------------------------------------------
// Tables
// ---------------------------------------------------------------------------

export const categories = sqliteTable('categories', {
	id: integer('id').primaryKey({ autoIncrement: true }),
	name: text('name').notNull(),
	type: text('type', { enum: ['income', 'expense'] }).notNull(),
	createdAt: integer('created_at', { mode: 'timestamp' }).$defaultFn(() => new Date()).notNull(),
})

export const transactions = sqliteTable('transactions', {
	id: integer('id').primaryKey({ autoIncrement: true }),
	date: text('date').notNull(), // ISO date string (YYYY-MM-DD)
	description: text('description').notNull(),
	amount: real('amount').notNull(), // positive for income, negative for expenses
	categoryId: integer('category_id').references(() => categories.id),
	source: text('source', { enum: ['csv', 'manual'] }).default('csv').notNull(),
	createdAt: integer('created_at', { mode: 'timestamp' }).$defaultFn(() => new Date()).notNull(),
})

export const columnMappings = sqliteTable('column_mappings', {
	id: integer('id').primaryKey({ autoIncrement: true }),
	bankName: text('bank_name').notNull(),
	dateColumn: text('date_column').notNull(),
	descriptionColumn: text('description_column').notNull(),
	amountColumn: text('amount_column').notNull(),
	createdAt: integer('created_at', { mode: 'timestamp' }).$defaultFn(() => new Date()).notNull(),
})

// ---------------------------------------------------------------------------
// Zod schemas (derived from Drizzle)
// ---------------------------------------------------------------------------

export const insertCategorySchema = createInsertSchema(categories)
export const selectCategorySchema = createSelectSchema(categories)

export const insertTransactionSchema = createInsertSchema(transactions)
export const selectTransactionSchema = createSelectSchema(transactions)

export const insertColumnMappingSchema = createInsertSchema(columnMappings)
export const selectColumnMappingSchema = createSelectSchema(columnMappings)

// ---------------------------------------------------------------------------
// TypeScript types (inferred from Drizzle)
// ---------------------------------------------------------------------------

export type Category = typeof categories.$inferSelect
export type NewCategory = typeof categories.$inferInsert

export type Transaction = typeof transactions.$inferSelect
export type NewTransaction = typeof transactions.$inferInsert

export type ColumnMapping = typeof columnMappings.$inferSelect
export type NewColumnMapping = typeof columnMappings.$inferInsert
