import { applyD1Migrations, env } from 'cloudflare:test'
import { beforeAll } from 'vitest'

declare module 'cloudflare:test' {
	interface ProvidedEnv extends Env {
		TEST_MIGRATIONS: string
	}
}

beforeAll(async () => {
	const migrations = JSON.parse(env.TEST_MIGRATIONS)
	await applyD1Migrations(env.DB, migrations)
})
