import { colors, radius, spacing } from "@/lib/theme";

describe("theme tokens", () => {
  describe("colors", () => {
    it("has primary palette", () => {
      expect(colors.primary).toBe("#a78bfa");
      expect(colors.primaryDark).toBe("#7c3aed");
      expect(colors.primaryLight).toBe("#c4b5fd");
    });

    it("has semantic status colors", () => {
      expect(colors.success).toBe("#34d399");
      expect(colors.danger).toBe("#f87171");
      expect(colors.warning).toBe("#fbbf24");
      expect(colors.info).toBe("#60a5fa");
    });

    it("has background and surface colors", () => {
      expect(colors.background).toBeDefined();
      expect(colors.surface).toBeDefined();
      expect(colors.surfaceElevated).toBeDefined();
    });

    it("has text colors", () => {
      expect(colors.textPrimary).toBeDefined();
      expect(colors.textSecondary).toBeDefined();
      expect(colors.textMuted).toBeDefined();
      expect(colors.textInverse).toBeDefined();
    });

    it("has income and expense colors", () => {
      expect(colors.incomeBg).toBeDefined();
      expect(colors.incomeFg).toBeDefined();
      expect(colors.expenseBg).toBeDefined();
      expect(colors.expenseFg).toBeDefined();
    });

    it("has chart colors", () => {
      expect(colors.chartLine).toBeDefined();
      expect(colors.chartBar1).toBeDefined();
      expect(colors.chartBar2).toBeDefined();
      expect(colors.chartBar3).toBeDefined();
      expect(colors.chartBar4).toBeDefined();
    });

  });


  describe("spacing", () => {
    it("has ascending spacing values", () => {
      expect(spacing.xs).toBe(4);
      expect(spacing.sm).toBe(8);
      expect(spacing.md).toBe(12);
      expect(spacing.lg).toBe(16);
      expect(spacing.xl).toBe(20);
      expect(spacing["2xl"]).toBe(24);
      expect(spacing["3xl"]).toBe(32);
    });

  });


  describe("radius", () => {
    it("has standard radius values", () => {
      expect(radius.sm).toBe(6);
      expect(radius.md).toBe(10);
      expect(radius.lg).toBe(14);
      expect(radius.xl).toBe(20);
      expect(radius.full).toBe(9999);
    });
  });
});
