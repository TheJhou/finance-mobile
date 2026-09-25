import { AccountRow } from "@/components/account/account-row";
import { AccountSection } from "@/components/account/account-section";
import { RowSeparator } from "@/components/account/row-separator";
import { ScreenLayout } from "@/components/account/screen-layout";
import { useAppDialog } from "@/hooks/use-app-dialog";
import { suspendAutoLockFor } from "@/lib/biometric";
import {
  buildUnrecognizedSamples,
  drainInbox,
  getNotificationLogStats,
  type NotificationLogStats,
} from "@/lib/notification-inbox";
import { colors, spacing } from "@/lib/theme";
import { useThemedStyles } from "@/lib/theme-context";
import BankNotifications, { type ListenerStatus } from "@/modules/bank-notifications";
import { useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";
import { Share, StyleSheet, Text, View } from "react-native";

interface Diagnostics {
  granted: boolean;
  status: ListenerStatus | null;
  batteryIgnored: boolean;
  monitoredCount: number;
  stats: NotificationLogStats;
}

const EMPTY_STATS: NotificationLogStats = { QUEUED: 0, IGNORED: 0, UNRECOGNIZED: 0, DUPLICATE: 0 };

function formatMoment(timestamp: number | undefined): string {
  if (!timestamp) return "Nunca";
  const date = new Date(timestamp);
  return `${date.toLocaleDateString("pt-BR")} ${date.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}`;
}

/** Estado da captura de notificações bancárias e ferramentas para corrigir falhas. */
export default function NotificationDiagnosticsScreen() {
  const styles = useThemedStyles(createStyles);
  const { alert, confirm, dialog } = useAppDialog();
  const [data, setData] = useState<Diagnostics | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const native = BankNotifications;
    const stats = await getNotificationLogStats(7).catch(() => EMPTY_STATS);
    if (!native) {
      setData({ granted: false, status: null, batteryIgnored: false, monitoredCount: 0, stats });
      return;
    }
    setData({
      granted: native.isPermissionGranted(),
      status: native.getListenerStatus(),
      batteryIgnored: native.isBatteryOptimizationIgnored(),
      monitoredCount: native.getMonitoredPackages().length,
      stats,
    });
  }, []);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load])
  );

  const repair = () => {
    if (!BankNotifications) return;
    setBusy(true);
    BankNotifications.repairConnection();
    // O sistema leva alguns segundos para religar o serviço
    setTimeout(() => {
      void load().finally(() => setBusy(false));
      const connected = BankNotifications?.isListenerConnected() ?? false;
      alert(
        connected ? "Captura reconectada" : "Ainda desconectado",
        connected
          ? "O serviço de leitura de notificações voltou a funcionar."
          : "Desative e ative novamente o acesso às notificações do Kilun nas configurações do Android.",
        { variant: connected ? "success" : "warning" }
      );
    }, 4000);
  };

  const processNow = async () => {
    setBusy(true);
    try {
      const summary = await drainInbox();
      await load();
      alert(
        "Fila processada",
        summary.processed === 0
          ? "Não havia notificações aguardando."
          : `${summary.processed} notificação(ões) processada(s), ${summary.queued} para aprovação.`
      );
    } catch (error) {
      alert("Falha ao processar", error instanceof Error ? error.message : "Tente novamente.", { variant: "danger" });
    } finally {
      setBusy(false);
    }
  };

  const shareSamples = () => {
    confirm(
      "Compartilhar exemplos",
      "Serão enviados os textos das notificações não reconhecidas, com CPF, cartão, conta e telefone ocultos. Nomes de pessoas e lojas continuam visíveis: revise antes de enviar.",
      {
        confirmText: "Continuar",
        onConfirm: async () => {
          const samples = await buildUnrecognizedSamples();
          if (!samples) {
            alert("Nada para compartilhar", "Não há notificações não reconhecidas.");
            return;
          }
          suspendAutoLockFor(5 * 60_000);
          await Share.share({ message: `Exemplos de notificações não reconhecidas (Kilun):\n\n${samples}` });
        },
      }
    );
  };

  const openSettings = () => {
    suspendAutoLockFor(5 * 60_000);
    BankNotifications?.openPermissionSettings();
  };

  const requestBattery = () => {
    suspendAutoLockFor(5 * 60_000);
    BankNotifications?.requestIgnoreBatteryOptimizations();
  };

  if (!BankNotifications) {
    return (
      <ScreenLayout title="Diagnóstico da captura">
        <Text style={styles.text}>O leitor de notificações só funciona no app instalado no Android (não no Expo Go).</Text>
      </ScreenLayout>
    );
  }

  const connected = data?.status?.connected ?? false;
  const stats = data?.stats ?? EMPTY_STATS;

  return (
    <ScreenLayout title="Diagnóstico da captura">
      <AccountSection title="Situação">
        <AccountRow
          icon={data?.granted ? "checkmark-circle-outline" : "close-circle-outline"}
          iconColor={data?.granted ? colors.success : colors.danger}
          label="Acesso às notificações"
          value={data?.granted ? "Permitido" : "Negado"}
          onPress={openSettings}
        />
        <RowSeparator />
        <AccountRow
          icon={connected ? "radio-outline" : "alert-circle-outline"}
          iconColor={connected ? colors.success : colors.danger}
          label="Serviço de leitura"
          value={connected ? "Conectado" : "Desconectado"}
          subtitle={`Última conexão: ${formatMoment(data?.status?.lastConnectedAt)}`}
          chevron={false}
        />
        <RowSeparator />
        <AccountRow
          icon="notifications-outline"
          iconColor={colors.info}
          label="Última notificação de banco"
          value={formatMoment(data?.status?.lastNotificationAt)}
          subtitle="Desde a última abertura do serviço"
          chevron={false}
        />
        <RowSeparator />
        <AccountRow
          icon="battery-charging-outline"
          iconColor={data?.batteryIgnored ? colors.success : colors.warning}
          label="Otimização de bateria"
          value={data?.batteryIgnored ? "Desativada" : "Ativa"}
          subtitle={data?.batteryIgnored ? undefined : "O Android pode suspender a captura. Toque para desativar."}
          onPress={data?.batteryIgnored ? undefined : requestBattery}
          chevron={!data?.batteryIgnored}
        />
        <RowSeparator />
        <AccountRow
          icon="business-outline"
          iconColor={colors.primary}
          label="Apps de banco monitorados"
          value={String(data?.monitoredCount ?? 0)}
          chevron={false}
        />
      </AccountSection>

      <AccountSection title="Últimos 7 dias">
        <AccountRow icon="checkmark-done-outline" iconColor={colors.success} label="Enviadas para aprovação" value={String(stats.QUEUED)} chevron={false} />
        <RowSeparator />
        <AccountRow icon="help-circle-outline" iconColor={colors.warning} label="Não reconhecidas" value={String(stats.UNRECOGNIZED)} subtitle="Revise na aba Importar" chevron={false} />
        <RowSeparator />
        <AccountRow icon="remove-circle-outline" iconColor={colors.textMuted} label="Ignoradas (não eram transações)" value={String(stats.IGNORED)} chevron={false} />
        <RowSeparator />
        <AccountRow icon="copy-outline" iconColor={colors.textMuted} label="Repetidas" value={String(stats.DUPLICATE)} chevron={false} />
      </AccountSection>

      <AccountSection title="Ações">
        <AccountRow
          icon="construct-outline"
          iconColor={colors.primary}
          label={busy ? "Aguarde..." : "Reparar conexão"}
          subtitle="Religa o serviço de leitura"
          onPress={busy ? undefined : repair}
        />
        <RowSeparator />
        <AccountRow
          icon="refresh-outline"
          iconColor={colors.primary}
          label="Processar notificações agora"
          onPress={busy ? undefined : () => void processNow()}
        />
        <RowSeparator />
        <AccountRow
          icon="share-outline"
          iconColor={colors.info}
          label="Compartilhar exemplos não reconhecidos"
          subtitle="Ajuda a ensinar o app a ler o seu banco"
          onPress={shareSamples}
        />
      </AccountSection>

      <AccountSection title="Se a captura falhar">
        <View style={styles.tips}>
          <Text style={styles.tip}>
            • Desative a otimização de bateria do Kilun. Em Xiaomi, Samsung e Motorola, permita também o
            &quot;início automático&quot; e desative &quot;suspender apps não usados&quot;.
          </Text>
          <Text style={styles.tip}>
            • Não use &quot;Forçar parada&quot; no Kilun: o Android desliga a leitura de notificações até o app ser
            aberto de novo.
          </Text>
          <Text style={styles.tip}>
            • Android 13 ou superior com o app instalado fora da Play Store: se o acesso às notificações aparecer
            bloqueado, abra Configurações › Apps › Kilun › menu (⋮) › &quot;Permitir configurações restritas&quot;.
          </Text>
          <Text style={styles.tip}>
            • Notificações de banco silenciadas ou desativadas no Android não chegam ao Kilun. Mantenha-as ativas.
          </Text>
        </View>
      </AccountSection>
      {dialog}
    </ScreenLayout>
  );
}

function createStyles() {
  return StyleSheet.create({
    text: { fontSize: 14, color: colors.textSecondary },
    tips: { gap: spacing.sm, paddingVertical: spacing.sm },
    tip: { fontSize: 13, color: colors.textSecondary, lineHeight: 19 },
  });
}
