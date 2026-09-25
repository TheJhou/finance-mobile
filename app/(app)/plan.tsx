import { AccountRow } from "@/components/account/account-row";
import { AccountSection } from "@/components/account/account-section";
import { RowSeparator } from "@/components/account/row-separator";
import { ScreenLayout } from "@/components/account/screen-layout";
import { SubscriptionHeroCard } from "@/components/subscription/subscription-hero-card";
import { UsageSection } from "@/components/subscription/usage-section";
import { Button } from "@/components/ui/button";
import { useAppDialog } from "@/hooks/use-app-dialog";
import { useSubscription } from "@/hooks/use-subscription";
import type { PurchaseEvent } from "@/lib/iap";
import { describeSubscription, getCancelDialogMessage } from "@/lib/subscription-display";
import { PLANS, PLAY_STORE_TEXTS, getProOnlyFeatures } from "@/lib/subscription-plans";
import { colors, spacing } from "@/lib/theme";
import { useThemedStyles } from "@/lib/theme-context";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useCallback } from "react";
import { ActivityIndicator, RefreshControl, StyleSheet, Text, View } from "react-native";

export default function SubscriptionScreen() {
  const router = useRouter();
  const styles = useThemedStyles(createStyles);
  const { alert, confirm, dialog } = useAppDialog();

  const showPurchaseResult = useCallback(
    (event: PurchaseEvent) => {
      switch (event.type) {
        case "activated":
          alert("Assinatura ativada", "Bem-vindo ao Kilun Pro!", { variant: "success" });
          break;
        case "pending":
          alert(
            "Pagamento pendente",
            "Sua assinatura será ativada automaticamente assim que a Google Play confirmar o pagamento.",
            { variant: "warning" }
          );
          break;
        case "error":
          alert("Erro na compra", event.message, { variant: "danger" });
          break;
      }
    },
    [alert]
  );

  const { status, loading, refreshing, error, price, purchasing, restoring, refresh, subscribe, openInPlayStore, restore } =
    useSubscription(showPurchaseResult);

  const priceLabel = `${price ?? PLANS.PRO.priceDisplay}/mês`;

  const handleCancel = () => {
    if (!status) return;
    confirm("Cancelar assinatura", getCancelDialogMessage(status), {
      variant: "danger",
      confirmText: "Ir para a Google Play",
      cancelText: "Manter assinatura",
      onConfirm: () => void openInPlayStore(),
    });
  };

  const handleRestore = async () => {
    const result = await restore();
    switch (result.type) {
      case "restored":
        alert("Assinatura restaurada", "Seu Kilun Pro foi vinculado a esta conta.", { variant: "success" });
        break;
      case "pending":
        alert("Pagamento pendente", "A assinatura será ativada quando a Google Play confirmar o pagamento.", { variant: "warning" });
        break;
      case "none":
        alert("Nenhuma assinatura encontrada", "Não há assinatura do Kilun Pro na conta Google deste aparelho.");
        break;
      case "error":
        alert("Não foi possível restaurar", result.message, { variant: "danger" });
        break;
    }
  };

  if (loading) {
    return (
      <ScreenLayout title="Assinatura">
        <ActivityIndicator color={colors.primary} size="large" style={styles.loading} />
      </ScreenLayout>
    );
  }

  if (!status) {
    return (
      <ScreenLayout title="Assinatura">
        <View style={styles.errorBox}>
          <Ionicons name="cloud-offline-outline" size={32} color={colors.textMuted} />
          <Text style={styles.errorText}>{error ?? "Não foi possível carregar a assinatura."}</Text>
          <Button title="Tentar de novo" onPress={refresh} variant="secondary" />
        </View>
      </ScreenLayout>
    );
  }

  const headline = describeSubscription(status);
  const state = status.subscription?.state;
  const documents = (
    <>
      <RowSeparator />
      <AccountRow icon="document-outline" iconColor={colors.primary} label="Termos de Uso" onPress={() => router.push("/terms" as any)} />
      <RowSeparator />
      <AccountRow
        icon="shield-checkmark-outline"
        iconColor={colors.success}
        label="Política de Privacidade"
        onPress={() => router.push("/privacy" as any)}
      />
    </>
  );
  const restoreRow = (
    <AccountRow
      icon="refresh-outline"
      iconColor={colors.info}
      label={restoring ? "Restaurando..." : "Restaurar compra"}
      subtitle="Trocou de aparelho ou reinstalou o app"
      onPress={restoring ? undefined : () => void handleRestore()}
    />
  );

  return (
    <ScreenLayout title="Assinatura" refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} />}>
      <SubscriptionHeroCard headline={headline} priceLabel={priceLabel} />

      {status.offline ? (
        <Button title="Tentar de novo" onPress={refresh} variant="secondary" />
      ) : (
        <UsageSection status={status} />
      )}

      {!headline.isPro && !status.offline && (
        <AccountSection title={`Kilun Pro · ${priceLabel}`}>
          {getProOnlyFeatures().map((feature) => (
            <AccountRow
              key={feature.label}
              icon="checkmark-circle"
              iconColor={colors.success}
              label={feature.label}
              value={typeof feature.pro === "string" ? feature.pro : undefined}
              chevron={false}
            />
          ))}
          <View style={styles.subscribe}>
            <Button title="Assinar Kilun Pro" onPress={() => void subscribe()} loading={purchasing} />
            <Text style={styles.legal}>
              {PLAY_STORE_TEXTS.autoRenewing} Cobrança mensal pela Google Play; cancele quando quiser nas assinaturas da
              Google Play.
            </Text>
          </View>
        </AccountSection>
      )}

      {headline.isPro ? (
        <AccountSection title="Sua assinatura">
          {state === "GRACE" && (
            <>
              <AccountRow
                icon="card-outline"
                iconColor={colors.danger}
                label="Atualizar forma de pagamento"
                subtitle="Na Google Play, para não perder o Pro"
                onPress={() => void openInPlayStore()}
              />
              <RowSeparator />
            </>
          )}
          <AccountRow
            icon="logo-google-playstore"
            iconColor={colors.primary}
            label="Gerenciar na Google Play"
            subtitle="Forma de pagamento, recibos e renovação"
            onPress={() => void openInPlayStore()}
          />
          <RowSeparator />
          {restoreRow}
          {documents}
        </AccountSection>
      ) : (
        <AccountSection title="Ajuda">
          {restoreRow}
          {documents}
        </AccountSection>
      )}

      {headline.isPro && (
        <AccountSection title="Cancelamento">
          {state === "CANCELED_PENDING_END" ? (
            <AccountRow
              icon="refresh-circle-outline"
              iconColor={colors.success}
              label="Reativar assinatura"
              subtitle="Continue com o Pro depois do fim do período"
              onPress={() => void openInPlayStore()}
            />
          ) : (
            <AccountRow
              icon="close-circle-outline"
              iconColor={colors.danger}
              label="Cancelar assinatura"
              subtitle="Feito na Google Play; o Pro continua até o fim do período pago"
              danger
              onPress={handleCancel}
            />
          )}
        </AccountSection>
      )}

      {dialog}
    </ScreenLayout>
  );
}

function createStyles() {
  return StyleSheet.create({
    loading: { marginTop: spacing["3xl"] },
    errorBox: { alignItems: "center", gap: spacing.md, paddingVertical: spacing["3xl"] },
    errorText: { fontSize: 14, color: colors.textSecondary, textAlign: "center" },
    subscribe: { gap: spacing.sm, paddingTop: spacing.md },
    legal: { fontSize: 11, color: colors.textMuted, textAlign: "center", lineHeight: 16 },
  });
}
