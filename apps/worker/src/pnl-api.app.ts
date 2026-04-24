import { trpcServer } from "@hono/trpc-server";
import { Hono } from "hono";
import { useWorkersLogger } from "workers-tagged-logger";

import { withNotFound, withOnError } from "@repo/hono-helpers";

import { createContext } from "./trpc/context";
import { appRouter } from "./trpc/router";

import type { App } from "./context";

const app = new Hono<App>()
  .use("*", (c, next) =>
    useWorkersLogger(c.env.NAME, {
      environment: c.env.ENVIRONMENT,
      release: c.env.SENTRY_RELEASE
    })(c, next)
  )

  .onError(withOnError())
  .notFound(withNotFound())

  .get("/", (c) => c.json({ name: "Personal P&L API" }))
  .get("/health", (c) => c.json({ ok: true, timestamp: new Date().toISOString() }))

  .use(
    "/trpc/*",
    trpcServer({
      router: appRouter,
      createContext: (_opts, c) => createContext(c.env)
    })
  );

export default app;
export type { AppRouter } from "./trpc/router";
