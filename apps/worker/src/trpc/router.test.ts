import { env } from 'cloudflare:test'
import { drizzle } from 'drizzle-orm/d1'
import { eq } from 'drizzle-orm'
import { beforeEach, describe, expect, it } from 'vitest'

import * as schema from '@pnl/types'
import { categories, columnMappings, transactionInputSchema, transactions } from '@pnl/types'

import { appRouter } from './router'

function makeDb() {
	return drizzle(env.DB, { schema })
}

function makeCaller() {
	return appRouter.createCaller({ db: makeDb() }, { onError: () => {} })
}

beforeEach(async () => {
	const db = makeDb()
	await db.delete(transactions)
	await db.delete(columnMappings)
	await db.delete(categories)
})

describe('transactions.getMapping', () => {
	it('returns null for unknown fingerprint', async () => {
		const result = await makeCaller().transactions.getMapping({ fingerprint: 'unknown' })
		expect(result).toBeNull()
	})

	it('returns saved mapping when fingerprint matches', async () => {
		await makeDb().insert(columnMappings).values({
			fileFingerprint: 'test-fp',
			dateCol: 'Date',
			descriptionCol: 'Description',
			amountCol: 'Amount',
		})

		const result = await makeCaller().transactions.getMapping({ fingerprint: 'test-fp' })
		expect(result).not.toBeNull()
		expect(result?.dateCol).toBe('Date')
		expect(result?.descriptionCol).toBe('Description')
		expect(result?.amountCol).toBe('Amount')
	})
})

describe('transactions.upload', () => {
	const aMapping = {
		fileFingerprint: 'bank-fp',
		dateCol: 'Date',
		descriptionCol: 'Description',
		amountCol: 'Amount',
	}

	const tx1 = {
		id: 'hash-1',
		date: '2024-01-01',
		description: 'Coffee',
		amount: 4.5,
		type: 'DEBIT' as const,
		sourceFile: 'bank.csv',
		rawRow: JSON.stringify({ Date: '2024-01-01', Description: 'Coffee', Amount: '-4.50' }),
		createdAt: new Date().toISOString(),
	}

	const tx2 = {
		id: 'hash-2',
		date: '2024-01-02',
		description: 'Salary',
		amount: 1000,
		type: 'CREDIT' as const,
		sourceFile: 'bank.csv',
		rawRow: JSON.stringify({ Date: '2024-01-02', Description: 'Salary', Amount: '1000.00' }),
		createdAt: new Date().toISOString(),
	}

	it('inserts new transactions and returns correct count', async () => {
		const result = await makeCaller().transactions.upload({
			transactions: [tx1, tx2],
			sourceFile: 'bank.csv',
			mapping: aMapping,
		})

		expect(result).toEqual({ inserted: 2, duplicates: 0, total: 2 })
	})

	it('skips duplicates on second upload and returns correct count', async () => {
		const caller = makeCaller()
		await caller.transactions.upload({
			transactions: [tx1, tx2],
			sourceFile: 'bank.csv',
			mapping: aMapping,
		})

		const result = await caller.transactions.upload({
			transactions: [tx1, tx2],
			sourceFile: 'bank.csv',
			mapping: aMapping,
		})

		expect(result).toEqual({ inserted: 0, duplicates: 2, total: 2 })
	})

	it('upserts column mapping when fingerprint already exists', async () => {
		const caller = makeCaller()
		await caller.transactions.upload({
			transactions: [],
			sourceFile: 'bank.csv',
			mapping: { ...aMapping, amountCol: 'Amount' },
		})

		await caller.transactions.upload({
			transactions: [],
			sourceFile: 'bank.csv',
			mapping: { ...aMapping, amountCol: 'Monto' },
		})

		const saved = await caller.transactions.getMapping({ fingerprint: 'bank-fp' })
		expect(saved?.amountCol).toBe('Monto')
	})
})

describe('transactionInputSchema', () => {
	const validTx = {
		id: 'hash-1',
		date: '2024-01-01',
		description: 'Coffee',
		amount: 4.5,
		type: 'DEBIT' as const,
		sourceFile: 'bank.csv',
	}

	it('rejects date not matching YYYY-MM-DD', () => {
		const result = transactionInputSchema.safeParse({ ...validTx, date: '01-01-2024' })
		expect(result.success).toBe(false)
	})

	it('rejects negative amount', () => {
		const result = transactionInputSchema.safeParse({ ...validTx, amount: -4.5 })
		expect(result.success).toBe(false)
	})

	it('rejects zero amount', () => {
		const result = transactionInputSchema.safeParse({ ...validTx, amount: 0 })
		expect(result.success).toBe(false)
	})

	it('accepts valid transaction', () => {
		const result = transactionInputSchema.safeParse(validTx)
		expect(result.success).toBe(true)
	})
})

describe('transactions.categorize', () => {
	const tx = {
		id: 'tx-cat-1', date: '2024-01-15', description: 'Coffee', amount: 4.5, type: 'DEBIT' as const,
		sourceFile: 'bank.csv', rawRow: '{}', createdAt: new Date().toISOString(),
	}

	it('assigns a category to a transaction', async () => {
		const db = makeDb()
		const [cat] = await db.insert(categories).values({ name: 'Food', groupType: 'VARIABLE' }).returning()
		await db.insert(transactions).values(tx)

		await makeCaller().transactions.categorize({ ids: [tx.id], categoryId: cat!.id })

		const [updated] = await db.select().from(transactions).where(eq(transactions.id, tx.id))
		expect(updated!.categoryId).toBe(cat!.id)
	})

	it('assigns category to multiple transactions and returns count', async () => {
		const db = makeDb()
		const [cat] = await db.insert(categories).values({ name: 'Food', groupType: 'VARIABLE' }).returning()
		const tx2 = { ...tx, id: 'tx-cat-2', date: '2024-01-16' }
		await db.insert(transactions).values([tx, tx2])

		const result = await makeCaller().transactions.categorize({ ids: [tx.id, tx2.id], categoryId: cat!.id })

		expect(result.updated).toBe(2)
		const rows = await db.select().from(transactions)
		expect(rows.every((r) => r.categoryId === cat!.id)).toBe(true)
	})

	it('removes category by setting categoryId to null', async () => {
		const db = makeDb()
		const [cat] = await db.insert(categories).values({ name: 'Food', groupType: 'VARIABLE' }).returning()
		await db.insert(transactions).values({ ...tx, categoryId: cat!.id })

		await makeCaller().transactions.categorize({ ids: [tx.id], categoryId: null })

		const [updated] = await db.select().from(transactions).where(eq(transactions.id, tx.id))
		expect(updated!.categoryId).toBeNull()
	})
})

describe('transactions.list', () => {
	const aMapping = { fileFingerprint: 'fp', dateCol: 'Date', descriptionCol: 'Desc', amountCol: 'Amount' }

	const tx1 = {
		id: 'tx-1', date: '2024-01-15', description: 'Coffee', amount: 4.5, type: 'DEBIT' as const,
		sourceFile: 'bank.csv', rawRow: '{}', createdAt: new Date().toISOString(),
	}
	const tx2 = {
		id: 'tx-2', date: '2024-02-10', description: 'Salary', amount: 1000, type: 'CREDIT' as const,
		sourceFile: 'bank.csv', rawRow: '{}', createdAt: new Date().toISOString(),
	}

	it('returns empty rows and zero total when no transactions exist', async () => {
		const result = await makeCaller().transactions.list({})
		expect(result).toEqual({ rows: [], total: 0 })
	})

	it('returns all transactions ordered by date desc', async () => {
		await makeDb().insert(transactions).values([tx1, tx2])

		const result = await makeCaller().transactions.list({})

		expect(result.rows).toHaveLength(2)
		expect(result.total).toBe(2)
		expect(result.rows[0]!.id).toBe('tx-2')
		expect(result.rows[1]!.id).toBe('tx-1')
	})

	it('filters transactions by month', async () => {
		await makeDb().insert(transactions).values([tx1, tx2])

		const result = await makeCaller().transactions.list({ month: '2024-01' })

		expect(result.rows).toHaveLength(1)
		expect(result.total).toBe(1)
		expect(result.rows[0]!.id).toBe('tx-1')
	})

	it('joins category name and groupType when categoryId is set', async () => {
		const db = makeDb()
		const [cat] = await db.insert(categories).values({ name: 'Groceries', groupType: 'VARIABLE' }).returning()
		await db.insert(transactions).values({ ...tx1, categoryId: cat!.id })

		const result = await makeCaller().transactions.list({})

		expect(result.rows[0]!.categoryName).toBe('Groceries')
		expect(result.rows[0]!.categoryGroupType).toBe('VARIABLE')
	})

	it('returns null category fields for uncategorized transactions', async () => {
		await makeDb().insert(transactions).values(tx1)

		const result = await makeCaller().transactions.list({})

		expect(result.rows[0]!.categoryName).toBeNull()
		expect(result.rows[0]!.categoryId).toBeNull()
	})

	it('filters to only uncategorized transactions when uncategorized=true', async () => {
		const db = makeDb()
		const [food] = await db.insert(categories).values({ name: 'Food', groupType: 'VARIABLE' }).returning()
		await db.insert(transactions).values([
			{ ...tx1, categoryId: food!.id },
			tx2,
		])

		const result = await makeCaller().transactions.list({ uncategorized: true })

		expect(result.rows).toHaveLength(1)
		expect(result.rows[0]!.id).toBe('tx-2')
	})

	it('filters transactions by categoryId', async () => {
		const db = makeDb()
		const [food] = await db.insert(categories).values({ name: 'Food', groupType: 'VARIABLE' }).returning()
		const [pay] = await db.insert(categories).values({ name: 'Pay', groupType: 'INCOME' }).returning()
		await db.insert(transactions).values([
			{ ...tx1, categoryId: food!.id },
			{ ...tx2, categoryId: pay!.id },
		])

		const result = await makeCaller().transactions.list({ categoryId: food!.id })

		expect(result.rows).toHaveLength(1)
		expect(result.rows[0]!.id).toBe('tx-1')
	})

	it('paginates with limit and offset, and returns unfiltered-by-page total', async () => {
		const db = makeDb()
		const rows = Array.from({ length: 5 }).map((_, i) => ({
			id: `tx-p-${i}`,
			date: `2024-03-0${i + 1}`,
			description: `d${i}`,
			amount: 1 + i,
			type: 'DEBIT' as const,
			sourceFile: 'bank.csv',
			rawRow: '{}',
			createdAt: new Date().toISOString(),
		}))
		await db.insert(transactions).values(rows)

		const page1 = await makeCaller().transactions.list({ limit: 2, offset: 0 })
		const page2 = await makeCaller().transactions.list({ limit: 2, offset: 2 })

		expect(page1.rows).toHaveLength(2)
		expect(page1.total).toBe(5)
		expect(page1.rows[0]!.id).toBe('tx-p-4')
		expect(page2.rows).toHaveLength(2)
		expect(page2.rows[0]!.id).toBe('tx-p-2')
	})

	it('total reflects filters, not pagination', async () => {
		const db = makeDb()
		await db.insert(transactions).values([tx1, tx2])

		const result = await makeCaller().transactions.list({ month: '2024-01', limit: 100 })

		expect(result.rows).toHaveLength(1)
		expect(result.total).toBe(1)
	})
})

describe('categories.create', () => {
	it('creates a category with name and groupType', async () => {
		const created = await makeCaller().categories.create({ name: 'Food', groupType: 'VARIABLE' })
		expect(created.name).toBe('Food')
		expect(created.groupType).toBe('VARIABLE')
	})

	it('creates a category with an optional color', async () => {
		const created = await makeCaller().categories.create({ name: 'Food', groupType: 'VARIABLE', color: '#ff00ff' })
		expect(created.color).toBe('#ff00ff')
	})
})

describe('categories.update', () => {
	it('renames a category', async () => {
		const [cat] = await makeDb().insert(categories).values({ name: 'Old', groupType: 'VARIABLE' }).returning()

		const updated = await makeCaller().categories.update({ id: cat!.id, name: 'New' })

		expect(updated.name).toBe('New')
		expect(updated.id).toBe(cat!.id)
	})

	it('updates color, groupType, and sortOrder', async () => {
		const [cat] = await makeDb().insert(categories).values({ name: 'X', groupType: 'VARIABLE' }).returning()

		const updated = await makeCaller().categories.update({
			id: cat!.id,
			color: '#123456',
			groupType: 'FIXED',
			sortOrder: 7,
		})

		expect(updated.color).toBe('#123456')
		expect(updated.groupType).toBe('FIXED')
		expect(updated.sortOrder).toBe(7)
	})

	it('leaves unspecified fields unchanged', async () => {
		const [cat] = await makeDb().insert(categories).values({ name: 'X', groupType: 'VARIABLE', color: '#abc' }).returning()

		const updated = await makeCaller().categories.update({ id: cat!.id, name: 'Y' })

		expect(updated.color).toBe('#abc')
		expect(updated.groupType).toBe('VARIABLE')
	})

	it('throws when the category does not exist', async () => {
		await expect(
			makeCaller().categories.update({ id: 99999, name: 'Ghost' }),
		).rejects.toThrow()
	})
})

describe('categories.delete', () => {
	it('removes a category', async () => {
		const [cat] = await makeDb().insert(categories).values({ name: 'Gone', groupType: 'VARIABLE' }).returning()

		await makeCaller().categories.delete({ id: cat!.id })

		const rows = await makeDb().select().from(categories).where(eq(categories.id, cat!.id))
		expect(rows).toHaveLength(0)
	})

	it('leaves transactions orphaned with null categoryId when their category is deleted', async () => {
		const db = makeDb()
		const [cat] = await db.insert(categories).values({ name: 'Temp', groupType: 'VARIABLE' }).returning()
		await db.insert(transactions).values({
			id: 'tx-d-1',
			date: '2024-01-01',
			description: 'x',
			amount: 1,
			type: 'DEBIT',
			sourceFile: 'bank.csv',
			rawRow: '{}',
			createdAt: new Date().toISOString(),
			categoryId: cat!.id,
		})

		await makeCaller().categories.delete({ id: cat!.id })

		const [tx] = await db.select().from(transactions).where(eq(transactions.id, 'tx-d-1'))
		expect(tx).toBeDefined()
		expect(tx!.categoryId).toBeNull()
	})

	it('throws when the category does not exist', async () => {
		await expect(
			makeCaller().categories.delete({ id: 99999 }),
		).rejects.toThrow()
	})
})

describe('transactions.grouped', () => {
	const baseTx = (overrides: Partial<{ id: string; description: string; amount: number; date: string; categoryId: number | null }>) => ({
		id: 'tx-g-1',
		date: '2024-01-01',
		description: 'Uber',
		amount: 10,
		type: 'DEBIT' as const,
		sourceFile: 'bank.csv',
		rawRow: '{}',
		createdAt: new Date().toISOString(),
		categoryId: null as number | null,
		...overrides,
	})

	it('returns empty array when no transactions exist', async () => {
		const result = await makeCaller().transactions.grouped({})
		expect(result).toEqual([])
	})

	it('groups by description with count and total amount', async () => {
		await makeDb().insert(transactions).values([
			baseTx({ id: 'g-1', description: 'Uber', amount: 10 }),
			baseTx({ id: 'g-2', description: 'Uber', amount: 15 }),
			baseTx({ id: 'g-3', description: 'Coffee', amount: 4 }),
		])

		const result = await makeCaller().transactions.grouped({})

		const uber = result.find((g) => g.description === 'Uber')
		const coffee = result.find((g) => g.description === 'Coffee')
		expect(uber).toEqual(expect.objectContaining({ count: 2, totalAmount: 25 }))
		expect(coffee).toEqual(expect.objectContaining({ count: 1, totalAmount: 4 }))
	})

	it('returns the most-common category for a merchant', async () => {
		const db = makeDb()
		const [food] = await db.insert(categories).values({ name: 'Food', groupType: 'VARIABLE', color: '#f00' }).returning()
		const [transport] = await db.insert(categories).values({ name: 'Transport', groupType: 'VARIABLE', color: '#0f0' }).returning()
		await db.insert(transactions).values([
			baseTx({ id: 'mc-1', description: 'Uber', categoryId: transport!.id }),
			baseTx({ id: 'mc-2', description: 'Uber', categoryId: transport!.id }),
			baseTx({ id: 'mc-3', description: 'Uber', categoryId: food!.id }),
		])

		const result = await makeCaller().transactions.grouped({})
		const uber = result.find((g) => g.description === 'Uber')!

		expect(uber.categoryId).toBe(transport!.id)
		expect(uber.categoryName).toBe('Transport')
		expect(uber.categoryGroupType).toBe('VARIABLE')
		expect(uber.categoryColor).toBe('#0f0')
	})

	it('returns null category when merchant has no categorized transactions', async () => {
		await makeDb().insert(transactions).values([
			baseTx({ id: 'n-1', description: 'Mystery', categoryId: null }),
		])

		const result = await makeCaller().transactions.grouped({})
		const mystery = result.find((g) => g.description === 'Mystery')!

		expect(mystery.categoryId).toBeNull()
		expect(mystery.categoryName).toBeNull()
	})

	it('returns null category when categories are tied', async () => {
		const db = makeDb()
		const [a] = await db.insert(categories).values({ name: 'A', groupType: 'VARIABLE' }).returning()
		const [b] = await db.insert(categories).values({ name: 'B', groupType: 'VARIABLE' }).returning()
		await db.insert(transactions).values([
			baseTx({ id: 't-1', description: 'Ambig', categoryId: a!.id }),
			baseTx({ id: 't-2', description: 'Ambig', categoryId: b!.id }),
		])

		const result = await makeCaller().transactions.grouped({})
		const ambig = result.find((g) => g.description === 'Ambig')!

		expect(ambig.categoryId).toBeNull()
	})

	it('filters grouped results by month', async () => {
		await makeDb().insert(transactions).values([
			baseTx({ id: 'f-1', description: 'Uber', date: '2024-01-05', amount: 10 }),
			baseTx({ id: 'f-2', description: 'Uber', date: '2024-02-05', amount: 20 }),
		])

		const result = await makeCaller().transactions.grouped({ month: '2024-01' })
		const uber = result.find((g) => g.description === 'Uber')!

		expect(uber.count).toBe(1)
		expect(uber.totalAmount).toBe(10)
	})

	it('filters grouped results to uncategorized only', async () => {
		const db = makeDb()
		const [food] = await db.insert(categories).values({ name: 'Food', groupType: 'VARIABLE' }).returning()
		await db.insert(transactions).values([
			baseTx({ id: 'fu-1', description: 'Coffee', categoryId: food!.id }),
			baseTx({ id: 'fu-2', description: 'Mystery', categoryId: null }),
		])

		const result = await makeCaller().transactions.grouped({ uncategorized: true })

		expect(result).toHaveLength(1)
		expect(result[0]!.description).toBe('Mystery')
	})

	it('filters grouped results by categoryId', async () => {
		const db = makeDb()
		const [food] = await db.insert(categories).values({ name: 'Food', groupType: 'VARIABLE' }).returning()
		const [pay] = await db.insert(categories).values({ name: 'Pay', groupType: 'INCOME' }).returning()
		await db.insert(transactions).values([
			baseTx({ id: 'fc-1', description: 'Coffee', categoryId: food!.id }),
			baseTx({ id: 'fc-2', description: 'Salary', categoryId: pay!.id }),
		])

		const result = await makeCaller().transactions.grouped({ categoryId: food!.id })

		expect(result).toHaveLength(1)
		expect(result[0]!.description).toBe('Coffee')
	})

	it('ignores uncategorized transactions when computing most-common', async () => {
		const db = makeDb()
		const [food] = await db.insert(categories).values({ name: 'Food', groupType: 'VARIABLE' }).returning()
		await db.insert(transactions).values([
			baseTx({ id: 'u-1', description: 'Shop', categoryId: food!.id }),
			baseTx({ id: 'u-2', description: 'Shop', categoryId: null }),
			baseTx({ id: 'u-3', description: 'Shop', categoryId: null }),
		])

		const result = await makeCaller().transactions.grouped({})
		const shop = result.find((g) => g.description === 'Shop')!

		expect(shop.categoryId).toBe(food!.id)
	})
})
