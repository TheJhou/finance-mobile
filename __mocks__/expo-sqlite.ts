// Mock in-memory SQLite for unit testing
// Supports: INSERT, SELECT (with JOIN, GROUP BY, ORDER BY, LIMIT, WHERE),
// UPDATE, DELETE, CREATE TABLE/INDEX, ALTER TABLE, PRAGMA

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

  /** Evaluate a single condition part against a row, consuming params. */
  private evalCondition(part: string, row: Row, params: unknown[], paramIndex: { i: number }): boolean {
    // strftime('%Y-%m', date) = '2025-06' or = ?
    const strftimeEq = part.match(/strftime\s*\(\s*['"]([^'"]+)['"]\s*,\s*(\w+)\s*\)\s*=\s*(['"][^'"]*['"]|\?)/i);
    if (strftimeEq) {
      const fmt = strftimeEq[1];
      const col = strftimeEq[2];
      const rawValue = strftimeEq[3];
      let value: string;
      if (rawValue === "?") {
        value = String(params[paramIndex.i++]);
      } else {
        value = rawValue.replace(/['"]/g, "");
      }
      const v = row[col];
      if (fmt === "%Y-%m") {
        return v ? String(v).slice(0, 7) === value : false;
      }
      return v ? String(v) === value : false;
    }

    // col BETWEEN ? AND ?
    const betweenMatch = part.match(/(\w+(?:\.\w+)?)\s+BETWEEN\s+\?\s+AND\s+\?/i);
    if (betweenMatch) {
      const col = betweenMatch[1].includes(".") ? betweenMatch[1].split(".")[1] : betweenMatch[1];
      const minValue = params[paramIndex.i++];
      const maxValue = params[paramIndex.i++];
      const v = row[col];
      const vStr = String(v);
      return vStr >= String(minValue) && vStr <= String(maxValue);
    }

    // col IN ('a','b') or col IN (?,?)
    const inMatch = part.match(/(\w+(?:\.\w+)?)\s+IN\s*\(([^)]+)\)/i);
    if (inMatch) {
      const col = inMatch[1].includes(".") ? inMatch[1].split(".")[1] : inMatch[1];
      const values = inMatch[2].split(",").map((v) => v.trim().replace(/^['"]|['"]$/g, ""));
      const v = row[col];
      return values.includes(String(v));
    }

    // col <= ?, col < ?, col >= ?, col > ?, col = ?, col != ?
    const compMatch = part.match(/(\w+(?:\.\w+)?)\s*(<=|>=|<|>|=|!=)\s*(['"][^'"]*['"]|\?)/i);
    if (compMatch) {
      const col = compMatch[1].includes(".") ? compMatch[1].split(".")[1] : compMatch[1];
      const op = compMatch[2];
      const rawValue = compMatch[3];
      let value: unknown;
      if (rawValue === "?") {
        value = params[paramIndex.i++];
      } else {
        value = rawValue.replace(/^['"]|['"]$/g, "");
      }
      const v = row[col];
      const vs = String(v);
      const vals = String(value);
      switch (op) {
        case "=": return v === value || vs === vals;
        case "!=": return v !== value && vs !== vals;
        case "<=": return vs <= vals;
        case ">=": return vs >= vals;
        case "<": return vs < vals;
        case ">": return vs > vals;
      }
    }

    return true; // unknown condition, allow
  }

  private parseWhere(sql: string, params: unknown[]): ((row: Row) => boolean) | null {
    const whereMatch = sql.match(/WHERE\s+([\s\S]+?)(?:\s+ORDER\s+BY|\s+GROUP\s+BY|\s+LIMIT|$)/i);
    if (!whereMatch) return null;

    return (row: Row) => {
      const paramIndex = { i: 0 };
      // Protect BETWEEN ... AND ... from splitting
      let clause = whereMatch[1];
      const betweens: string[] = [];
      clause = clause.replace(/(\w+(?:\.\w+)?\s+BETWEEN\s+\?\s+AND\s+\?)/gi, (m) => {
        betweens.push(m);
        return `__BETWEEN_${betweens.length - 1}__`;
      });
      const parts = clause.split(/\s+AND\s+/i);
      for (const p of parts) {
        const restored = p.replace(/__BETWEEN_(\d+)__/g, (_, i) => betweens[parseInt(i)]);
        if (!this.evalCondition(restored.trim(), row, params, paramIndex)) {
          return false;
        }
      }
      return true;
    };
  }

  private parseTable(sql: string): string {
    const fromMatch = sql.match(/FROM\s+(\w+)/i);
    if (fromMatch) return fromMatch[1];
    const intoMatch = sql.match(/INTO\s+(\w+)/i);
    if (intoMatch) return intoMatch[1];
    const updateMatch = sql.match(/UPDATE\s+(\w+)/i);
    if (updateMatch) return updateMatch[1];
    return "";
  }

  private parseColumns(sql: string): string[] {
    const match = sql.match(/INSERT(?:\s+OR\s+REPLACE)?\s+INTO\s+\w+\s*\(([^)]+)\)/i);
    if (!match) return [];
    return match[1].split(",").map((c) => c.trim());
  }

  private parseJoin(sql: string): { leftTable: string; rightTable: string; rightTableCol: string; leftTableCol: string } | null {
    const joinMatch = sql.match(/LEFT\s+JOIN\s+(\w+)\s+(\w+)\s+ON\s+(\w+)\.(\w+)\s*=\s*(\w+)\.(\w+)/i);
    if (!joinMatch) return null;
    const [, rightTable, , rightAlias, rightTableCol, leftAlias, leftTableCol] = joinMatch;
    const fromMatch = sql.match(/FROM\s+(\w+)/i);
    if (!fromMatch) return null;
    return { leftTable: fromMatch[1], rightTable, rightTableCol, leftTableCol };
  }

  private parseOrderBy(sql: string): { col: string; dir: "ASC" | "DESC" }[] {
    const match = sql.match(/ORDER\s+BY\s+(.+?)(?:\s+LIMIT|$)/i);
    if (!match) return [];
    return match[1].split(",").map((p) => {
      const parts = p.trim().split(/\s+/);
      const colRaw = parts[0];
      const col = colRaw.includes(".") ? colRaw.split(".")[1] : colRaw;
      const dir = (parts[1]?.toUpperCase() as "ASC" | "DESC") || "ASC";
      return { col, dir };
    });
  }

  private parseSelect(sql: string): { raw: string; alias?: string }[] {
    const match = sql.match(/SELECT\s+([\s\S]+?)\s+FROM/i);
    if (!match) return [];
    return match[1].split(",").map((c) => {
      const trimmed = c.trim();
      const aliasMatch = trimmed.match(/(.+?)\s+as\s+(\w+)/i);
      if (aliasMatch) return { raw: trimmed, alias: aliasMatch[2] };
      return { raw: trimmed };
    });
  }

  async getAllAsync<T>(sql: string, params?: unknown[]): Promise<T[]> {
    const table = this.parseTable(sql);
    const data = this.getTable(table);
    const where = params ? this.parseWhere(sql, params) : null;

    let results = where ? data.filter(where) : [...data];

    // LEFT JOIN
    const joinInfo = this.parseJoin(sql);
    if (joinInfo) {
      const rightData = this.getTable(joinInfo.rightTable);
      const selectCols = this.parseSelect(sql);
      results = results.map((row) => {
        const joined: Row = { ...row };
        const rightRow = rightData.find((r) => r[joinInfo.rightTableCol] === row[joinInfo.leftTableCol]);
        if (rightRow) {
          for (const sc of selectCols) {
            // Match c.name or c.name as category_name
            const m = sc.raw.match(/^(\w+)\.(\w+)(?:\s+as\s+(\w+))?$/i);
            if (m && rightRow[m[2]] !== undefined) {
              const alias = sc.alias || m[3] || m[2];
              joined[alias] = rightRow[m[2]];
            }
          }
        }
        return joined;
      });
    }

    // ORDER BY
    const orderCols = this.parseOrderBy(sql);
    if (orderCols.length > 0) {
      results.sort((a, b) => {
        for (const o of orderCols) {
          const av = a[o.col];
          const bv = b[o.col];
          if (av == null && bv != null) return o.dir === "ASC" ? 1 : -1;
          if (av != null && bv == null) return o.dir === "ASC" ? -1 : 1;
          if (av == null && bv == null) continue;
          const cmp = typeof av === "number" && typeof bv === "number"
            ? (av as number) - (bv as number)
            : String(av).localeCompare(String(bv));
          if (cmp !== 0) return o.dir === "ASC" ? cmp : -cmp;
        }
        return 0;
      });
    }

    // GROUP BY
    const groupMatch = sql.match(/GROUP\s+BY\s+(.+?)(?:\s+ORDER\s+BY|\s+LIMIT|$)/i);
    if (groupMatch) {
      const groupColRaw = groupMatch[1].trim();
      const groupCol = groupColRaw.includes(".") ? groupColRaw.split(".")[1] : groupColRaw;
      const grouped: Record<string, Row> = {};
      const selectCols = this.parseSelect(sql);
      for (const row of results) {
        const key = String(row[groupCol]);
        if (!grouped[key]) {
          // Start with base row, will overwrite aggregated columns
          grouped[key] = { ...row };
        }
        // SUM aggregation
        for (const sc of selectCols) {
          const sumMatch = sc.raw.match(/SUM\(([^)]+)\)/i);
          if (sumMatch) {
            const sumCol = sumMatch[1].includes(".") ? sumMatch[1].split(".")[1] : sumMatch[1];
            const existing = Number(grouped[key][sc.alias || sumCol] || 0);
            grouped[key][sc.alias || sumCol] = existing + Number(row[sumCol] || 0);
          }
          const countMatch = sc.raw.match(/COUNT\(\*\)/i);
          if (countMatch) {
            const existing = Number(grouped[key][sc.alias || "count"] || 0);
            grouped[key][sc.alias || "count"] = existing + 1;
          }
        }
      }
      results = Object.values(grouped);
    }

    // Handle SELECT COUNT(*) - return count instead of rows
    const countSelectMatch = sql.match(/SELECT\s+COUNT\(\*\)\s+as\s+(\w+)/i);
    if (countSelectMatch) {
      const alias = countSelectMatch[1];
      const row: Row = { [alias]: results.length };
      return [row] as T[];
    }

    // Handle aggregate selects like COALESCE(SUM(...), 0) as alias
    // e.g., SELECT COALESCE(SUM(CASE WHEN type = 'INCOME' THEN amount ELSE -amount END), 0) as balance
    const aggSelectMatch = sql.match(/SELECT\s+COALESCE\s*\(\s*SUM\s*\(([^)]+)\)\s*,\s*0\s*\)\s+as\s+(\w+)/i);
    if (aggSelectMatch) {
      const sumExpr = aggSelectMatch[1];
      const alias = aggSelectMatch[2];
      let total = 0;
      for (const row of results) {
        // CASE WHEN type = 'INCOME' THEN amount ELSE -amount END
        const caseMatch = sumExpr.match(/CASE\s+WHEN\s+(\w+)\s*=\s*['"]([^'"]+)['"]\s+THEN\s+(\w+)\s+ELSE\s+-?(\w+)\s+END/i);
        if (caseMatch) {
          const condCol = caseMatch[1];
          const condVal = caseMatch[2];
          const thenCol = caseMatch[3];
          const elseCol = caseMatch[4];
          if (row[condCol] === condVal) {
            total += Number(row[thenCol] || 0);
          } else {
            total -= Number(row[elseCol] || 0);
          }
        } else {
          // Simple SUM(col)
          const simpleCol = sumExpr.trim();
          total += Number(row[simpleCol] || 0);
        }
      }
      const row: Row = { [alias]: total };
      return [row] as T[];
    }

    // Handle SUM(col) as alias
    const sumSelectMatch = sql.match(/SELECT\s+COALESCE\s*\(\s*SUM\s*\((\w+)\)\s*,\s*0\s*\)\s+as\s+(\w+)/i);
    if (sumSelectMatch) {
      const col = sumSelectMatch[1];
      const alias = sumSelectMatch[2];
      let total = 0;
      for (const row of results) {
        total += Number(row[col] || 0);
      }
      const row: Row = { [alias]: total };
      return [row] as T[];
    }

    // LIMIT
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
        columns.forEach((col, i) => { row[col] = params[i]; });
      }
      data.push(row);
    } else if (sql.trim().toUpperCase().startsWith("UPDATE")) {
      const setMatch = sql.match(/SET\s+(.+?)\s+WHERE/i);
      if (setMatch) {
        const setParts = setMatch[1].split(",").map((p) => p.trim());
        const updates: Record<string, unknown> = {};
        const setQ = (setMatch[1].match(/\?/g) || []).length;
        if (params) {
          for (let i = 0; i < setParts.length; i++) {
            const colMatch = setParts[i].match(/(\w+)\s*=\s*\?/);
            if (colMatch) updates[colMatch[1]] = params[i];
          }
        }
        const whereParam = params ? params[setQ] : undefined;
        for (const row of data) {
          if (row.id === whereParam) Object.assign(row, updates);
        }
      }
    } else if (sql.trim().toUpperCase().startsWith("DELETE")) {
      const where = params ? this.parseWhere(sql, params) : null;
      const filtered = data.filter((row) => !(where ? where(row) : false));
      this.tables.set(table, filtered);
    }
  }

  async execAsync(sql: string): Promise<void> {
    const createMatch = sql.match(/CREATE\s+TABLE\s+IF\s+NOT\s+EXISTS\s+(\w+)/i);
    if (createMatch) this.getTable(createMatch[1]);
    const indexMatch = sql.match(/CREATE\s+INDEX\s+IF\s+NOT\s+EXISTS\s+(\w+)\s+ON\s+(\w+)/i);
    if (indexMatch) this.indexes.set(indexMatch[1], new Set());
    const deleteMatch = sql.match(/DELETE\s+FROM\s+(\w+)/i);
    if (deleteMatch && !sql.includes("WHERE")) this.tables.set(deleteMatch[1], []);
    const alterMatch = sql.match(/ALTER\s+TABLE\s+(\w+)\s+ADD\s+COLUMN\s+(\w+)/i);
    if (alterMatch) {
      const [, tname, colName] = alterMatch;
      for (const row of this.getTable(tname)) {
        if (!(colName in row)) row[colName] = null;
      }
    }
  }
}

let mockDb: InMemoryDatabase | null = null;

export function openDatabaseAsync(_name: string): Promise<InMemoryDatabase> {
  if (!mockDb) mockDb = new InMemoryDatabase();
  return Promise.resolve(mockDb);
}

export function resetMockDatabase(): void {
  mockDb = new InMemoryDatabase();
}
