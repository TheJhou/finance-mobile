import { generateId, getDb } from "@/lib/db";
import type { Category } from "@/lib/types";

interface CategoryRow {
  id: string;
  name: string;
  color: string;
  icon: string;
  is_default: number;
}

function mapCategory(row: CategoryRow): Category {
  return {
    id: row.id,
    name: row.name,
    color: row.color,
    icon: row.icon,
    isDefault: row.is_default === 1,
  };
}

export async function listCategories(): Promise<Category[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<CategoryRow>(
    "SELECT id, name, color, icon, is_default FROM categories ORDER BY is_default DESC, name"
  );
  return rows.map(mapCategory);
}

export async function getCategory(id: string): Promise<Category | null> {
  const db = await getDb();
  const row = await db.getFirstAsync<CategoryRow>(
    "SELECT id, name, color, icon, is_default FROM categories WHERE id = ?",
    [id]
  );
  return row ? mapCategory(row) : null;
}

export async function createCategory(data: {
  name: string;
  color?: string;
  icon?: string;
}): Promise<Category> {
  const db = await getDb();
  const id = generateId();
  await db.runAsync(
    "INSERT INTO categories (id, name, color, icon, is_default) VALUES (?, ?, ?, ?, 0)",
    [id, data.name, data.color ?? "#6366f1", data.icon ?? "tag"]
  );
  const row = await db.getFirstAsync<CategoryRow>(
    "SELECT id, name, color, icon, is_default FROM categories WHERE id = ?",
    [id]
  );
  if (!row) throw new Error("Failed to create category");
  return mapCategory(row);
}

export async function updateCategory(
  id: string,
  data: { name?: string; color?: string; icon?: string }
): Promise<void> {
  const db = await getDb();
  const sets: string[] = [];
  const params: unknown[] = [];
  if (data.name !== undefined) {
    sets.push("name = ?");
    params.push(data.name);
  }
  if (data.color !== undefined) {
    sets.push("color = ?");
    params.push(data.color);
  }
  if (data.icon !== undefined) {
    sets.push("icon = ?");
    params.push(data.icon);
  }
  if (sets.length === 0) return;
  sets.push("updated_at = datetime('now')");
  params.push(id);
  await db.runAsync(
    `UPDATE categories SET ${sets.join(", ")} WHERE id = ?`,
    params as SQLiteBindParams
  );
}

export async function deleteCategory(id: string): Promise<void> {
  const db = await getDb();
  await db.runAsync("DELETE FROM categories WHERE id = ?", [id]);
}

type SQLiteBindParams = (string | number | null | boolean | Uint8Array)[];
