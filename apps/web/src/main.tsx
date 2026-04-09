import { QueryClientProvider } from '@tanstack/react-query'
import { RouterProvider, createRouter } from '@tanstack/react-router'
import { httpBatchLink } from '@trpc/client'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'

import { queryClient } from './lib/query-client'
import { trpc } from './lib/trpc'
import { routeTree } from './routeTree.gen'

import './index.css'

const router = createRouter({ routeTree })

declare module '@tanstack/react-router' {
	interface Register {
		router: typeof router
	}
}

const trpcClient = trpc.createClient({
	links: [
		httpBatchLink({
			url: '/trpc',
		}),
	],
})

const root = document.getElementById('root')
if (!root) throw new Error('Root element not found')

createRoot(root).render(
	<StrictMode>
		<trpc.Provider client={trpcClient} queryClient={queryClient}>
			<QueryClientProvider client={queryClient}>
				<RouterProvider router={router} />
			</QueryClientProvider>
		</trpc.Provider>
	</StrictMode>,
)
