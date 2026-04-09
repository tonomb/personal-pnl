function hashString(s: string): string {
	let h = 0
	for (let i = 0; i < s.length; i++) {
		h = (Math.imul(31, h) + s.charCodeAt(i)) | 0
	}
	return Math.abs(h).toString(36)
}

export function generateFingerprint(headers: string[]): string {
	return hashString([...headers].sort().join(','))
}

export function generateTransactionId(date: string, description: string, amount: number): string {
	return hashString(`${date}|${description}|${amount}`)
}

export function parseAmount(raw: string): { amount: number; type: 'DEBIT' | 'CREDIT' } {
	const cleaned = raw.replace(/[$,\s]/g, '')
	const isNegative = cleaned.startsWith('(') || cleaned.startsWith('-')
	const numeric = parseFloat(cleaned.replace(/[()]/g, ''))
	return {
		amount: Math.abs(numeric),
		type: isNegative ? 'DEBIT' : 'CREDIT',
	}
}
