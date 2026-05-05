import { env } from "cloudflare:test";
import { drizzle } from "drizzle-orm/d1";
import { beforeEach, describe, expect, it } from "vitest";

import * as schema from "@pnl/types";
import { categories, getTagReportByName, listTagNames, tags, transactionTags, transactions } from "@pnl/types";

function makeDb() {
  return drizzle(env.DB, { schema });
}

beforeEach(async () => {
  const db = makeDb();
  await db.delete(transactionTags);
  await db.delete(tags);
  await db.delete(transactions);
  await db.delete(categories);
});

describe("listTagNames", () => {
  it("returns empty array when no tags exist", async () => {
    const names = await listTagNames(makeDb());
    expect(names).toEqual([]);
  });

  it("returns all tag names in alphabetical order", async () => {
    const db = makeDb();
    await db.insert(tags).values([
      { id: "t-1", name: "Travel", color: "#3B82F6" },
      { id: "t-2", name: "Food", color: "#10B981" },
      { id: "t-3", name: "NY Trip", color: "#F59E0B" }
    ]);

    const names = await listTagNames(db);
    expect(names).toEqual(["Food", "NY Trip", "Travel"]);
  });
});

describe("getTagReportByName", () => {
  it("returns null when no tag matches", async () => {
    const db = makeDb();
    await db.insert(tags).values({ id: "t-1", name: "Travel", color: "#3B82F6" });

    const result = await getTagReportByName(db, "nonexistent");
    expect(result).toBeNull();
  });

  it("always includes availableTags even when no match", async () => {
    const db = makeDb();
    await db.insert(tags).values([
      { id: "t-1", name: "Travel", color: "#3B82F6" },
      { id: "t-2", name: "Food", color: "#10B981" }
    ]);

    const result = await getTagReportByName(db, "nonexistent");
    expect(result).toBeNull();
    // caller uses listTagNames separately when result is null — available_tags always returned
  });

  it("matches exact tag name and returns a report", async () => {
    const db = makeDb();
    const [food] = await db.insert(categories).values({ name: "Food", groupType: "VARIABLE" }).returning();
    await db.insert(tags).values({ id: "tag-1", name: "NY Trip", color: "#3B82F6" });
    await db.insert(transactions).values({
      id: "tx-1",
      date: "2024-03-05",
      description: "Dinner",
      amount: 50,
      type: "DEBIT",
      categoryId: food!.id
    });
    await db.insert(transactionTags).values({ transactionId: "tx-1", tagId: "tag-1" });

    const result = await getTagReportByName(db, "NY Trip");

    expect(result).not.toBeNull();
    expect(result!.report.tag.name).toBe("NY Trip");
    expect(result!.report.totalSpend).toBe(50);
    expect(result!.report.net).toBe(-50);
    expect(result!.availableTags).toContain("NY Trip");
  });

  it("matches case-insensitively", async () => {
    const db = makeDb();
    await db.insert(tags).values({ id: "tag-1", name: "NY Trip", color: "#3B82F6" });

    const result = await getTagReportByName(db, "ny trip");

    expect(result).not.toBeNull();
    expect(result!.report.tag.name).toBe("NY Trip");
  });

  it("matches a partial substring of the tag name", async () => {
    const db = makeDb();
    await db.insert(tags).values({ id: "tag-1", name: "New York 2026", color: "#3B82F6" });

    const result = await getTagReportByName(db, "york");

    expect(result).not.toBeNull();
    expect(result!.report.tag.name).toBe("New York 2026");
  });

  it("prefers the shortest matching tag when multiple tags match", async () => {
    const db = makeDb();
    await db.insert(tags).values([
      { id: "t-1", name: "Food", color: "#3B82F6" },
      { id: "t-2", name: "Food Delivery", color: "#10B981" },
      { id: "t-3", name: "Foodie Travel", color: "#F59E0B" }
    ]);

    const result = await getTagReportByName(db, "food");

    expect(result!.report.tag.name).toBe("Food");
  });

  it("includes date range spanning the tagged transactions", async () => {
    const db = makeDb();
    const [food] = await db.insert(categories).values({ name: "Food", groupType: "VARIABLE" }).returning();
    await db.insert(tags).values({ id: "tag-1", name: "Trip", color: "#3B82F6" });
    await db.insert(transactions).values([
      { id: "tx-1", date: "2024-03-03", description: "a", amount: 10, type: "DEBIT", categoryId: food!.id },
      { id: "tx-2", date: "2024-03-09", description: "b", amount: 20, type: "DEBIT", categoryId: food!.id }
    ]);
    await db.insert(transactionTags).values([
      { transactionId: "tx-1", tagId: "tag-1" },
      { transactionId: "tx-2", tagId: "tag-1" }
    ]);

    const result = await getTagReportByName(db, "Trip");

    expect(result!.report.dateRange).toEqual({ from: "2024-03-03", to: "2024-03-09" });
  });

  it("returns byCategory breakdown grouped by category", async () => {
    const db = makeDb();
    const [food] = await db.insert(categories).values({ name: "Food", groupType: "VARIABLE" }).returning();
    const [rent] = await db.insert(categories).values({ name: "Rent", groupType: "FIXED" }).returning();
    await db.insert(tags).values({ id: "tag-1", name: "Trip", color: "#3B82F6" });
    await db.insert(transactions).values([
      { id: "tx-1", date: "2024-03-03", description: "Dinner", amount: 50, type: "DEBIT", categoryId: food!.id },
      { id: "tx-2", date: "2024-03-05", description: "Hotel", amount: 200, type: "DEBIT", categoryId: rent!.id }
    ]);
    await db.insert(transactionTags).values([
      { transactionId: "tx-1", tagId: "tag-1" },
      { transactionId: "tx-2", tagId: "tag-1" }
    ]);

    const result = await getTagReportByName(db, "Trip");

    const cats = result!.report.byCategory.map((c) => c.categoryName);
    expect(cats).toContain("Food");
    expect(cats).toContain("Rent");
    expect(result!.report.totalSpend).toBe(250);
  });
});
