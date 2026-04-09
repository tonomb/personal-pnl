import { initTRPC } from '@trpc/server'

const t = initTRPC.create()

const router = t.router
const publicProcedure = t.procedure

export const appRouter = router({
	health: router({
		ping: publicProcedure.query(() => ({ pong: true as const })),
	}),
})

export type AppRouter = typeof appRouter
