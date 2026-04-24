import { defineConfig } from "drizzle-kit";

export default defineConfig({
  dialect: "sqlite",
  schema: "./src/schema.ts",
  out: "./drizzle",
  driver: "d1-http",
  dbCredentials: {
    accountId: process.env.CLOUDFLARE_ACCOUNT_ID!,
    databaseId: process.env.CLOUDFLARE_DATABASE_ID ?? "64155aee-5a3e-4e8d-8f08-2fcfce25bf9f",
    token: process.env.CLOUDFLARE_API_TOKEN!
  }
});
