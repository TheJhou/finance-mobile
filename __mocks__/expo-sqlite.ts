// Mock in-memory SQLite for unit testing
// Supports basic INSERT, SELECT, UPDATE, DELETE operations

interface Row {
  [key: string]: unknown;
}

class InMemoryDatabase {
  private tables: Map<string, Row[]> = new Map();
  private indexes: Map<string, Set<string>> = new Map();

  private getTable(name: string): Row[] {
    if (!this.tables.has(name)) {
      this.tables.set(name, []);
    }
    return this.tables.get(name)!;
  }

  private parseWhere(sql: string, params: unknown[]): ((row: Row) => boolean) | null {
    const whereMatch = sql.match(/WHERE\s+(.+?)(?:ORDER|GROUP|LIMIT|$)/i);
    if (!whereMatch) return null;

    const conditions: ((row: Row) => boolean)[] = [];
    let paramIndex = 0;

    // Extract table alias (e.g., "t." or "r.")
    const tableAlias = sql.match(/FROM\s+\w+\s+(\w)\./i)?.[1];

    const whereClause = whereMatch[1].trim();
    const parts = whereClause.split(/\s+AND\s+/i);

    for (const part of parts) {
      const eqMatch = part.match(/(\w+)(?:\.(\w+))?\s*=\s*\?/);
      const ltMatch = part.match(/(\w+)(?:\.(\w+))?\s*<\s*\?/);
      const gtMatch = part.match(/(\w+)(?:\.(\w+))?\s*>\s*\?/);
      const lteMatch = part.match(/(\w+)(?:\.(\w+))?\s*<=\s*\?/);
      const gteMatch = part.match(/(\w+)(?:\.(\w+))?\s*>=\s*\?/);
      const inMatch = part.match(/(\w+)\s+IN\s*\(([^)]+)\)/i);

      if (eqMatch) {
        const col = eqMatch[2] || eqMatch[1];
        const value = params[paramIndex++];
        conditions.push((row) => row[col] === value);
      } else if (lteMatch) {
        const col = lteMatch[2] || lteMatch[1];
        const value = params[paramIndex++];
        conditions.push((row) => {
          const v = row[col];
          return typeof v === "number" && typeof value === "number" ? v <= value : String(v) <= String(value);
        });
      } else if (gteMatch) {
        const col = gteMatch[2] || gteMatch[1];
        const value = params[paramIndex++];
        conditions.push((row) => {
          const v = row[col];
          return typeof v === "number" && typeof value === "number" ? v >= value : String(v) >= String(value);
        });
      } else if (ltMatch) {
        const col = ltMatch[2] || ltMatch[1];
        const value = params[paramIndex++];
        conditions.push((row) => {
          const v = row[col];
          return typeof v === "number" && typeof value === "number" ? v < value : String(v) < String(value);
        });
      } else if (gtMatch) {
        const col = gtMatch[2] || gtMatch[1];
        const value = params[paramIndex++];
        conditions.push((row) => {
          const v = row[col];
          return typeof v === "number" && typeof value === "number" ? v > value : String(v) > String(value);
        });
      } else if (inMatch) {
        const col = inMatch[1];
        const values = inMatch[2].split(",").map((v) => v.trim().replace(/'/g, ""));
        conditions.push((row) => values.includes(String(row[col])));
      }
    }

    return (row) => conditions.every((fn) => fn(row));
  }

  private parseTable(sql: string): string {
    const fromMatch = sql.match(/FROM\s+(\w+)/i);
    if (fromMatch) return fromMatch[1];
    const intoMatch = sql.match(/INTO\s+(\w+)/i);
    if (intoMatch) return intoMatch[1];
    const updateMatch = sql.match(/UPDATE\s+(\w+)/i);
    if (updateMatch) return updateMatch[1];
    const deleteMatch = sql.match(/FROM\s+(\w+)/i);
    if (deleteMatch) return deleteMatch[1];
    return "";
  }

  private parseColumns(sql: string): string[] {
    const match = sql.match(/INSERT\s+INTO\s+\w+\s*\(([^)]+)\)/i);
    if (!match) return [];
    return match[1].split(",").map((c) => c.trim());
  }

  private parseValues(sql: string): number {
    const match = sql.match(/VALUES\s*\(([^)]+)\)/i);
    if (!match) return 0;
    return match[1].split(",").filter((v) => v.trim() === "?").length;
  }

  private parseSet(sql: string): { col: string; paramIndex: number }[] {
    const match = sql.match(/SET\s+(.+?)\s+WHERE/i);
    if (!match) return [];
    const parts = match[1].split(",").map((p) => p.trim());
    return parts.map((p) => {
      const colMatch = p.match(/(\w+)\s*=\s*\?/);
      return { col: colMatch ? colMatch[1] : "", paramIndex: -1 };
    });
  }

  async getAllAsync<T>(sql: string, params?: unknown[]): Promise<T[]> {
    const table = this.parseTable(sql);
    const data = this.getTable(table);
    const where = params ? this.parseWhere(sql, params) : null;

    let results = where ? data.filter(where) : [...data];

    // Handle ORDER BY
    const orderMatch = sql.match(/ORDER\s+BY\s+(\w+)(?:\.(\w+))?\s*(ASC|DESC)?/i);
    if (orderMatch) {
      const col = orderMatch[2] || orderMatch[1];
      const dir = orderMatch[3]?.toUpperCase() || "ASC";
      results.sort((a, b) => {
        const av = a[col];
        const bv = b[col];
        if (av == null) return dir === "ASC" ? 1 : -1;
        if (bv == null) return dir === "ASC" ? -1 : 1;
        if (typeof av === "number" && typeof bv === "number") {
          return dir === "ASC" ? av - bv : bv - av;
        }
        return dir === "ASC" ? String(av).localeCompare(String(bv)) : String(bv).localeCompare(String(av));
      });
    }

    // Handle GROUP BY
    const groupMatch = sql.match(/GROUP\s+BY\s+(.+?)(?:ORDER|LIMIT|$)/i);
    if (groupMatch) {
      const groupCol = groupMatch[1].trim();
      const grouped: Record<string, Row> = {};
      for (const row of results) {
        const key = String(row[groupCol]);
        if (!grouped[key]) {
          grouped[key] = { ...row };
        } else {
          // SUM aggregation
          const aggMatch = sql.match(/SUM\(([^)]+)\)/i);
          if (aggMatch) {
            const sumCol = aggMatch[1].includes(".") ? aggMatch[1].split(".")[1] : aggMatch[1];
            const existing = Number(grouped[key][sumCol] || 0);
            grouped[key][sumCol] = existing + Number(row[sumCol] || 0);
          }
          // COUNT aggregation
          const countMatch = sql.match(/COUNT\(\*\)/i);
          if (countMatch) {
            grouped[key]["count"] = (Number(grouped[key]["count"] || 0)) + 1;
          }
        }
      }
      results = Object.values(grouped);
    }

    // Handle LIMIT
    const limitMatch = sql.match(/LIMIT\s+(\d+)/i);
    if (limitMatch) {
      results = results.slice(0, parseInt(limitMatch[1]));
    }

    return results as T[];
  }

  async getFirstAsync<T>(sql: string, params?: unknown[]): Promise<T | null> {
    const results = await this.getAllAsync<T>(sql, params);
    return results[0] || null;
  }

  async runAsync(sql: string, params?: unknown[]): Promise<void> {
    const table = this.parseTable(sql);
    const data = this.getTable(table);

    if (sql.trim().toUpperCase().startsWith("INSERT")) {
      const columns = this.parseColumns(sql);
      const row: Row = {};
      if (params) {
        columns.forEach((col, i) => {
          row[col] = params[i];
        });
      }
      data.push(row);
    } else if (sql.trim().toUpperCase().startsWith("UPDATE")) {
      const where = params ? this.parseWhere(sql, params) : null;
      const setMatch = sql.match(/SET\s+(.+?)\s+WHERE/i);
      if (setMatch) {
        const setParts = setMatch[1].split(",").map((p) => p.trim());
        let paramIdx = 0;
        const updates: Record<string, unknown> = {};
        for (const part of setParts) {
          const colMatch = part.match(/(\w+)\s*=\s*\?/);
          if (colMatch && params) {
            updates[colMatch[1]] = params[paramIdx++];
          }
        }
        // The last param after SET columns is the id for WHERE
        const whereParam = params ? params[params.length - 1] : undefined;
        for (const row of data) {
          if (where ? where(row) : row.id === whereParam) {
            Object.assign(row, updates);
          }
        }
      }
    } else if (sql.trim().toUpperCase().startsWith("DELETE")) {
      const where = params ? this.parseWhere(sql, params) : null;
      const filtered = data.filter((row) => !(where ? where(row) : false));
      this.tables.set(table, filtered);
    }
  }

  async execAsync(sql: string): Promise<void> {
    // Handle CREATE TABLE
    const createMatch = sql.match(/CREATE\s+TABLE\s+IF\s+NOT\s+EXISTS\s+(\w+)/i);
    if (createMatch) {
      this.getTable(createMatch[1]);
    }
    // Handle CREATE INDEX
    const indexMatch = sql.match(/CREATE\s+INDEX\s+IF\s+NOT\s+EXISTS\s+(\w+)\s+ON\s+(\w+)/i);
    if (indexMatch) {
      this.indexes.set(indexMatch[1], new Set());
    }
    // Handle DELETE without WHERE (cleanup)
    const deleteMatch = sql.match(/DELETE\s+FROM\s+(\w+)/i);
    if (deleteMatch && !sql.includes("WHERE")) {
      this.tables.set(deleteMatch[1], []);
    }
    // Handle ALTER TABLE
    const alterMatch = sql.match(/ALTER\s+TABLE\s+(\w+)\s+ADD\s+COLUMN\s+(\w+)/i);
    if (alterMatch) {
      const [, tname, colName] = alterMatch;
      const rows = this.getTable(tname);
      for (const row of rows) {
        if (!(colName in row)) {
          row[colName] = null;
        }
      }
    }
    // Handle PRAGMA - ignore
  }
}

let mockDb: InMemoryDatabase | null = null;

export function openDatabaseAsync(_name: string): Promise<InMemoryDatabase> {
  if (!mockDb) {
    mockDb = new InMemoryDatabase();
  }
  return Promise.resolve(mockDb);
}

export function resetMockDatabase(): void {
  mockDb = new InMemoryDatabase();
}
