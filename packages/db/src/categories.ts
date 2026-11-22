import { and, count, eq, max, ne, sql } from "drizzle-orm";

import { categories, transactions } from "@pnl/types";

import type { CategoriesByGroup, Category, CreateCategoryInput, UpdateCategoryInput } from "@pnl/types";
import type { PnlDb } from "./client";

/** Gap left between consecutive sortOrder values so a category can be slotted in later. */
const SORT_ORDER_STEP = 10;

export class CategoryNotFoundError extends Error {
  constructor(readonly categoryId: number) {
    super(`Category ${categoryId} not found`);
    this.name = "CategoryNotFoundError";
  }
}

export class CategoryNameTakenError extends Error {
  constructor(readonly categoryName: string) {
    super(`Category name "${categoryName}" already exists`);
    this.name = "CategoryNameTakenError";
  }
}

/** All categories bucketed by Group, each bucket ordered by sortOrder then name. */
export async function listCategories(db: PnlDb): Promise<CategoriesByGroup> {
  const rows = await db.select().from(categories).orderBy(categories.sortOrder, categories.name);
  return {
    INCOME: rows.filter((c) => c.groupType === "INCOME"),
    FIXED: rows.filter((c) => c.groupType === "FIXED"),
    VARIABLE: rows.filter((c) => c.groupType === "VARIABLE"),
    IGNORED: rows.filter((c) => c.groupType === "IGNORED")
  };
}

/**
 * Create a custom (non-default) Category at the end of its Group. Names are
 * unique case-insensitively across all Groups so pickers and the advisor can
 * resolve a Category by name unambiguously.
 */
export async function createCategory(db: PnlDb, input: CreateCategoryInput): Promise<Category> {
  await assertNameAvailable(db, input.name);
  const sortOrder = await nextSortOrder(db, input.groupType);
  const [created] = await db
    .insert(categories)
    .values({
      name: input.name,
      groupType: input.groupType,
      color: input.color ?? null,
      isDefault: false,
      sortOrder
    })
    .returning();
  return created!;
}

/**
 * Patch a Category. Moving it to another Group appends it to the end of that
 * Group unless an explicit sortOrder is given. Changing the Group re-sides every
 * Transaction filed under it (Direction comes from the Group — ADR-0002).
 */
export async function updateCategory(db: PnlDb, input: UpdateCategoryInput): Promise<Category> {
  const { id, ...patch } = input;
  const [existing] = await db.select().from(categories).where(eq(categories.id, id)).limit(1);
  if (!existing) throw new CategoryNotFoundError(id);

  if (patch.name !== undefined) await assertNameAvailable(db, patch.name, id);

  const groupChanged = patch.groupType !== undefined && patch.groupType !== existing.groupType;
  const sortOrder = patch.sortOrder ?? (groupChanged ? await nextSortOrder(db, patch.groupType!) : undefined);

  const set = Object.fromEntries(
    Object.entries({ ...patch, sortOrder }).filter(([, value]) => value !== undefined)
  ) as Partial<Category>;
  if (Object.keys(set).length === 0) return existing;

  const [updated] = await db.update(categories).set(set).where(eq(categories.id, id)).returning();
  return updated!;
}

/**
 * Delete a Category. Its Transactions become Uncategorized (FK is ON DELETE SET
 * NULL); the count is returned so callers can tell the user what to re-file.
 */
export async function deleteCategory(
  db: PnlDb,
  id: number
): Promise<{ deletedId: number; uncategorizedCount: number }> {
  const [{ value: uncategorizedCount } = { value: 0 }] = await db
    .select({ value: count() })
    .from(transactions)
    .where(eq(transactions.categoryId, id));
  const [deleted] = await db.delete(categories).where(eq(categories.id, id)).returning({ id: categories.id });
  if (!deleted) throw new CategoryNotFoundError(id);
  return { deletedId: deleted.id, uncategorizedCount };
}

async function assertNameAvailable(db: PnlDb, name: string, excludeId?: number): Promise<void> {
  const sameName = sql`lower(${categories.name}) = lower(${name})`;
  const [clash] = await db
    .select({ id: categories.id })
    .from(categories)
    .where(excludeId === undefined ? sameName : and(sameName, ne(categories.id, excludeId)))
    .limit(1);
  if (clash) throw new CategoryNameTakenError(name);
}

async function nextSortOrder(db: PnlDb, groupType: Category["groupType"]): Promise<number> {
  const [row] = await db
    .select({ value: max(categories.sortOrder) })
    .from(categories)
    .where(eq(categories.groupType, groupType));
  return (row?.value ?? 0) + SORT_ORDER_STEP;
}
