import { resetMockDatabase } from "@/__mocks__/expo-sqlite";
import { getDb } from "@/lib/db";
import {
  createCategory,
  deleteCategory,
  getCategory,
  listCategories,
  updateCategory,
} from "@/lib/repositories/categories";

describe("categories repository", () => {
  beforeEach(async () => {
    resetMockDatabase();
    const db = await getDb();
    await db.execAsync(`
      CREATE TABLE IF NOT EXISTS categories (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        color TEXT NOT NULL DEFAULT '#6366f1',
        icon TEXT NOT NULL DEFAULT 'tag',
        is_default INTEGER NOT NULL DEFAULT 0,
        created_at TEXT,
        updated_at TEXT
      );
    `);
  });

  describe("createCategory", () => {
    it("creates a category with defaults", async () => {
      const cat = await createCategory({ name: "Pets" });
      expect(cat.name).toBe("Pets");
      expect(cat.color).toBe("#6366f1");
      expect(cat.icon).toBe("tag");
      expect(cat.isDefault).toBe(false);
    });

    it("creates a category with custom color and icon", async () => {
      const cat = await createCategory({ name: "Viagem", color: "#ff0000", icon: "airplane" });
      expect(cat.color).toBe("#ff0000");
      expect(cat.icon).toBe("airplane");
    });
  });

  describe("getCategory", () => {
    it("returns a category by id", async () => {
      const created = await createCategory({ name: "Test" });
      const found = await getCategory(created.id);
      expect(found).not.toBeNull();
      expect(found?.name).toBe("Test");
    });

    it("returns null for non-existent id", async () => {
      const found = await getCategory("non-existent");
      expect(found).toBeNull();
    });
  });

  describe("listCategories", () => {
    it("returns categories ordered by default desc then name", async () => {
      const db = await getDb();
      await db.runAsync(
        "INSERT OR REPLACE INTO categories (id, name, color, icon, is_default) VALUES (?, ?, ?, ?, 1)",
        ["cat-1", "Alimentação", "#ef4444", "restaurant"]
      );
      await createCategory({ name: "Zebra" });
      await createCategory({ name: "Água" });

      const list = await listCategories();
      expect(list[0].name).toBe("Alimentação");
      expect(list[0].isDefault).toBe(true);
    });

    it("returns empty array when no categories exist", async () => {
      const db = await getDb();
      await db.execAsync("DELETE FROM categories");
      const list = await listCategories();
      expect(list).toEqual([]);
    });
  });

  describe("updateCategory", () => {
    it("updates specified fields", async () => {
      const created = await createCategory({ name: "Old" });
      await updateCategory(created.id, { name: "New", color: "#000000" });

      const updated = await getCategory(created.id);
      expect(updated?.name).toBe("New");
      expect(updated?.color).toBe("#000000");
    });

    it("does nothing when no fields are provided", async () => {
      const created = await createCategory({ name: "Test" });
      await updateCategory(created.id, {});

      const updated = await getCategory(created.id);
      expect(updated?.name).toBe("Test");
    });
  });

  describe("deleteCategory", () => {
    it("removes a category", async () => {
      const created = await createCategory({ name: "To delete" });
      await deleteCategory(created.id);

      const found = await getCategory(created.id);
      expect(found).toBeNull();
    });
  });
});
