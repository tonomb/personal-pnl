import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { CfWorkerJsonSchemaValidator } from "@modelcontextprotocol/sdk/validation/cfworker";
import { McpAgent } from "agents/mcp";
import { drizzle } from "drizzle-orm/d1";
import * as schema from "@pnl/types";

const validator = new CfWorkerJsonSchemaValidator();

export class PnLMcp extends McpAgent<Env> {
  server = new McpServer({ name: "pnl-mcp-worker", version: "0.1.0" }, { jsonSchemaValidator: validator });

  async init() {
    this.server.registerTool(
      "ping",
      {
        description: "Liveness probe: confirms the MCP worker can reach its D1 binding and read the shared schema."
      },
      async () => {
        const db = drizzle(this.env.DB, { schema });
        const count = await db.$count(schema.categories);
        return {
          content: [{ type: "text", text: `pong (categories=${count})` }]
        };
      }
    );
  }
}

export default {
  fetch(request: Request, env: Env, ctx: ExecutionContext) {
    const url = new URL(request.url);

    if (url.pathname === "/health") {
      return Response.json({ ok: true, name: "pnl-mcp-worker" });
    }
    if (url.pathname.startsWith("/sse")) {
      return PnLMcp.serveSSE("/sse").fetch(request, env, ctx);
    }
    if (url.pathname.startsWith("/mcp")) {
      return PnLMcp.serve("/mcp").fetch(request, env, ctx);
    }
    return new Response("Not found", { status: 404 });
  }
};
