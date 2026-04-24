import { createTRPCReact } from "@trpc/react-query";
import type { AppRouter } from "@pnl/types";

export const trpc = createTRPCReact<AppRouter>();
