import { useAppDialog } from "@/hooks/use-app-dialog";
import { exportDreCSV, exportDrePDF, exportDreXLSX } from "@/lib/export";
import { buildPeriodRange, getDreData } from "@/lib/repositories/dre";
import { loadMonthStartDay } from "@/lib/settings";
import { checkProFeature } from "@/lib/subscription";
import { colors, radius, spacing } from "@/lib/theme";
import { useThemedStyles } from "@/lib/theme-context";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useState } from "react";
import {
    ActivityIndicator,
    ScrollView,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

type ExportFormat = "csv" | "xlsx" | "pdf";
type ExportPeriod = "month" | "quarter" | "semester" | "year";

interface FormatOption {
  key: ExportFormat;
  label: string;
  ext: string;
  description: string;
  icon: keyof typeof Ionicons.glyphMap;
  color: string;
}

interface PeriodOption {
  key: ExportPeriod;
  label: string;
  description: string;
}

const FORMAT_OPTIONS: FormatOption[] = [
  {
    key: "pdf",
    label: "PDF",
    ext: ".pdf",
    description: "Relatório formatado para impressão",
    icon: "document-text-outline",
    color: colors.danger,
  },
  {
    key: "xlsx",
    label: "Excel",
    ext: ".xlsx",
    description: "Planilha com gráficos e tabelas",
    icon: "grid-outline",
    color: colors.success,
  },
  {
    key: "csv",
    label: "CSV",
    ext: ".csv",
    description: "Dados brutos para importar",
    icon: "code-outline",
    color: colors.info,
  },
];

const PERIOD_OPTIONS: PeriodOption[] = [
  { key: "month", label: "Este mês", description: "Transações do mês atual" },
  { key: "quarter", label: "Trimestre", description: "Últimos 3 meses" },
  { key: "semester", label: "Semestre", description: "Últimos 6 meses" },
  { key: "year", label: "Ano", description: "Últimos 12 meses" },
];

export default function ExportDataScreen() {
  const router = useRouter();
  const styles = useThemedStyles(createStyles);
  const [selectedFormat, setSelectedFormat] = useState<ExportFormat>("pdf");
  const [selectedPeriod, setSelectedPeriod] = useState<ExportPeriod>("month");
  const [exporting, setExporting] = useState(false);
  const { alert, dialog } = useAppDialog();

  const handleExport = async () => {
    setExporting(true);
    try {
      if (selectedFormat !== "csv") {
        const isPro = await checkProFeature(selectedFormat.toUpperCase());
        if (!isPro) {
          alert(
            "Recurso PRO",
            `Exportar em ${selectedFormat.toUpperCase()} é exclusivo do plano Kilun Pro.\n\nFaça upgrade na aba "Meu Plano" para desbloquear.`,
            { variant: "warning" }
          );
          return;
        }
      }

      const startDay = await loadMonthStartDay();
      const periodRange = buildPeriodRange(selectedPeriod, undefined, undefined, { monthStartDay: startDay });
      const data = await getDreData(periodRange);

      switch (selectedFormat) {
        case "csv":
          await exportDreCSV(data);
          break;
        case "xlsx":
          await exportDreXLSX(data);
          break;
        case "pdf":
          await exportDrePDF(data);
          break;
      }
    } catch (e) {
      alert("Erro ao exportar", "Não foi possível gerar o arquivo. Tente novamente.", { variant: "danger" });
      console.error(e);
    } finally {
      setExporting(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe} edges={["left", "right"]}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Ionicons name="arrow-back" size={24} color={colors.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Exportar Dados</Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {/* Formato */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Formato do arquivo</Text>
          <View style={styles.formatGrid}>
            {FORMAT_OPTIONS.map((fmt) => {
              const selected = selectedFormat === fmt.key;
              return (
                <TouchableOpacity
                  key={fmt.key}
                  style={[styles.formatCard, selected && { borderColor: fmt.color, backgroundColor: fmt.color + "15" }]}
                  onPress={() => setSelectedFormat(fmt.key)}
                  activeOpacity={0.75}
                >
                  <View style={[styles.formatIcon, { backgroundColor: fmt.color + "22" }]}>
                    <Ionicons name={fmt.icon} size={24} color={fmt.color} />
                  </View>
                  <Text style={[styles.formatLabel, selected && { color: fmt.color }]}>{fmt.label}</Text>
                  <Text style={styles.formatExt}>{fmt.ext}</Text>
                  <Text style={styles.formatDesc}>{fmt.description}</Text>
                  {selected && (
                    <View style={[styles.formatCheck, { backgroundColor: fmt.color }]}>
                      <Ionicons name="checkmark" size={12} color="#fff" />
                    </View>
                  )}
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        {/* Período */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Período</Text>
          <View style={styles.periodList}>
            {PERIOD_OPTIONS.map((p) => {
              const selected = selectedPeriod === p.key;
              return (
                <TouchableOpacity
                  key={p.key}
                  style={[styles.periodRow, selected && styles.periodRowSelected]}
                  onPress={() => setSelectedPeriod(p.key)}
                  activeOpacity={0.75}
                >
                  <View style={[styles.radio, selected && styles.radioSelected]}>
                    {selected && <View style={styles.radioDot} />}
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.periodLabel, selected && { color: colors.primary }]}>{p.label}</Text>
                    <Text style={styles.periodDesc}>{p.description}</Text>
                  </View>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        {/* O que está incluído */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>O que está incluído</Text>
          {[
            { icon: "stats-chart-outline" as const, label: "Resumo do DRE (Receitas e Despesas)" },
            { icon: "list-outline" as const, label: "Transações detalhadas do período" },
            { icon: "calendar-outline" as const, label: "Evolução mensal" },
            { icon: "pricetag-outline" as const, label: "Breakdown por categoria" },
          ].map((item, i) => (
            <View key={i} style={styles.includeRow}>
              <View style={styles.includeIcon}>
                <Ionicons name={item.icon} size={16} color={colors.primary} />
              </View>
              <Text style={styles.includeText}>{item.label}</Text>
            </View>
          ))}
        </View>

        {/* Botão exportar */}
        <TouchableOpacity
          style={[styles.exportBtn, exporting && styles.exportBtnDisabled]}
          onPress={handleExport}
          disabled={exporting}
          activeOpacity={0.8}
        >
          {exporting ? (
            <ActivityIndicator color="#fff" size="small" />
          ) : (
            <Ionicons name="share-outline" size={20} color="#fff" />
          )}
          <Text style={styles.exportBtnText}>
            {exporting ? "Gerando arquivo…" : `Exportar ${FORMAT_OPTIONS.find((f) => f.key === selectedFormat)?.label}`}
          </Text>
        </TouchableOpacity>
      </ScrollView>
      {dialog}
    </SafeAreaView>
  );
}

function createStyles() {
  return StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: "700",
    color: colors.textPrimary,
  },
  content: {
    padding: spacing.lg,
    gap: spacing.lg,
    paddingBottom: spacing["3xl"],
  },
  section: {
    backgroundColor: colors.surface,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    gap: spacing.md,
  },
  sectionTitle: {
    fontSize: 12,
    fontWeight: "700",
    color: colors.textMuted,
    textTransform: "uppercase",
    letterSpacing: 0.8,
  },
  formatGrid: {
    flexDirection: "row",
    gap: spacing.sm,
  },
  formatCard: {
    flex: 1,
    alignItems: "center",
    padding: spacing.md,
    borderRadius: radius.lg,
    borderWidth: 1.5,
    borderColor: colors.border,
    backgroundColor: colors.surfaceElevated,
    gap: spacing.xs,
    position: "relative",
  },
  formatIcon: {
    width: 44,
    height: 44,
    borderRadius: radius.md,
    alignItems: "center",
    justifyContent: "center",
  },
  formatLabel: {
    fontSize: 14,
    fontWeight: "700",
    color: colors.textPrimary,
  },
  formatExt: {
    fontSize: 10,
    color: colors.textMuted,
  },
  formatDesc: {
    fontSize: 10,
    color: colors.textMuted,
    textAlign: "center",
    lineHeight: 14,
  },
  formatCheck: {
    position: "absolute",
    top: 8,
    right: 8,
    width: 18,
    height: 18,
    borderRadius: 9,
    alignItems: "center",
    justifyContent: "center",
  },
  periodList: {
    gap: spacing.xs,
  },
  periodRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: "transparent",
  },
  periodRowSelected: {
    borderColor: colors.primary + "44",
    backgroundColor: colors.primary + "0f",
  },
  radio: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
  },
  radioSelected: {
    borderColor: colors.primary,
  },
  radioDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: colors.primary,
  },
  periodLabel: {
    fontSize: 14,
    fontWeight: "600",
    color: colors.textPrimary,
  },
  periodDesc: {
    fontSize: 11,
    color: colors.textMuted,
    marginTop: 1,
  },
  includeRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
  },
  includeIcon: {
    width: 28,
    height: 28,
    borderRadius: radius.sm,
    backgroundColor: colors.primary + "22",
    alignItems: "center",
    justifyContent: "center",
  },
  includeText: {
    fontSize: 13,
    color: colors.textSecondary,
    flex: 1,
  },
  exportBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
    backgroundColor: colors.primary,
    borderRadius: radius.xl,
    paddingVertical: spacing.lg,
    marginTop: spacing.sm,
  },
  exportBtnDisabled: {
    opacity: 0.6,
  },
  exportBtnText: {
    fontSize: 16,
    fontWeight: "700",
    color: "#fff",
  },
  });
}
