import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { DropZone } from './DropZone'

function makeFile(name: string, type = 'text/csv') {
	return new File(['col1,col2\nval1,val2'], name, { type })
}

describe('DropZone', () => {
	it('calls onFiles with only CSV files when mixed files are dropped', async () => {
		const onFiles = vi.fn()
		render(<DropZone onFiles={onFiles} />)

		const input = document.querySelector('input[type="file"]') as HTMLInputElement
		const csvFile = makeFile('bank.csv')
		const txtFile = makeFile('notes.txt', 'text/plain')

		await userEvent.upload(input, [csvFile, txtFile])

		expect(onFiles).toHaveBeenCalledOnce()
		const received: File[] = onFiles.mock.calls[0][0]
		expect(received).toHaveLength(1)
		expect(received[0].name).toBe('bank.csv')
	})

	it('passes multiple CSV files to onFiles', async () => {
		const onFiles = vi.fn()
		render(<DropZone onFiles={onFiles} />)

		const input = document.querySelector('input[type="file"]') as HTMLInputElement
		await userEvent.upload(input, [makeFile('a.csv'), makeFile('b.csv')])

		const received: File[] = onFiles.mock.calls[0][0]
		expect(received).toHaveLength(2)
	})

	it('passes .xlsx files to onFiles', async () => {
		const onFiles = vi.fn()
		render(<DropZone onFiles={onFiles} />)

		const input = document.querySelector('input[type="file"]') as HTMLInputElement
		await userEvent.upload(
			input,
			makeFile('statement.xlsx', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'),
		)

		expect(onFiles).toHaveBeenCalledOnce()
		const received: File[] = onFiles.mock.calls[0][0]
		expect(received).toHaveLength(1)
		expect(received[0].name).toBe('statement.xlsx')
	})

	it('passes .xls files to onFiles', async () => {
		const onFiles = vi.fn()
		render(<DropZone onFiles={onFiles} />)

		const input = document.querySelector('input[type="file"]') as HTMLInputElement
		await userEvent.upload(input, makeFile('statement.xls', 'application/vnd.ms-excel'))

		expect(onFiles).toHaveBeenCalledOnce()
		const received: File[] = onFiles.mock.calls[0][0]
		expect(received).toHaveLength(1)
		expect(received[0].name).toBe('statement.xls')
	})

	it('filters out files that are not csv/xlsx/xls', async () => {
		const onFiles = vi.fn()
		render(<DropZone onFiles={onFiles} />)

		const input = document.querySelector('input[type="file"]') as HTMLInputElement
		const xlsx = makeFile('bank.xlsx', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
		const pdf = makeFile('notes.pdf', 'application/pdf')

		await userEvent.upload(input, [xlsx, pdf])

		const received: File[] = onFiles.mock.calls[0][0]
		expect(received).toHaveLength(1)
		expect(received[0].name).toBe('bank.xlsx')
	})

	it('shows instructional text mentioning supported formats', () => {
		render(<DropZone onFiles={vi.fn()} />)
		expect(screen.getByText(/csv|xlsx/i)).toBeInTheDocument()
	})
})
