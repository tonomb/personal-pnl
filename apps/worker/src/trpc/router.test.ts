import { env } from 'cloudflare:test'
import { drizzle } from 'drizzle-orm/d1'
import { beforeEach, describe, expect, it } from 'vitest'

import * as schema from '@pnl/types'
import { columnMappings, transactions } from '@pnl/types'

import { appRouter } from './router'

function makeDb() {
	return drizzle(env.DB, { schema })
}

function makeCaller() {
	return appRouter.createCaller({ db: makeDb() })
}

beforeEach(async () => {
	const db = makeDb()
	await db.delete(transactions)
	await db.delete(columnMappings)
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

		expect(result).toEqual({ inserted: 2, duplicates: 0 })
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

		expect(result).toEqual({ inserted: 0, duplicates: 2 })
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
