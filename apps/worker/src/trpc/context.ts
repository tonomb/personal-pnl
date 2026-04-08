import type { Env } from '../context'

export type TRPCContext = {
	env: Env
}

export function createContext(env: Env): TRPCContext {
	return { env }
}
