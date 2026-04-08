import { initTRPC } from '@trpc/server'

import type { TRPCContext } from './context'

const t = initTRPC.context<TRPCContext>().create()

export const router = t.router
export const publicProcedure = t.procedure

export const appRouter = router({
	healthCheck: publicProcedure.query(() => ({ status: 'ok' })),
})

export type AppRouter = typeof appRouter
