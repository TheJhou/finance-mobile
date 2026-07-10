import { AccountRow } from "@/components/account/account-row";
import { AccountSection } from "@/components/account/account-section";
import { RowSeparator } from "@/components/account/row-separator";
import { ScreenLayout } from "@/components/account/screen-layout";
import { ToggleRow } from "@/components/account/toggle-row";
import { getBoolSetting, loadMonthStartDay, setMonthStartDay, setSetting } from "@/lib/settings";
import { colors } from "@/lib/theme";
import { useTheme } from "@/lib/theme-context";
import { useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";
import { Alert } from "react-native";

export default function PreferencesScreen() {
  const { isDark, mode, setTheme, toggleTheme } = useTheme();
  const [notifications, setNotifications] = useState(true);
  const [emails, setEmails] = useState(true);
  const [monthStartDay, setMonthStartDayState] = useState(1);

  useFocusEffect(
    useCallback(() => {
      loadMonthStartDay().then(setMonthStartDayState);
      getBoolSetting("pref_notifications", true).then(setNotifications);
      getBoolSetting("pref_emails", true).then(setEmails);
    }, [])
  );

  const handleToggleNotifications = () => {
    const v = !notifications;
    setNotifications(v);
    setSetting("pref_notifications", String(v)).catch(() => {});
  };

  const handleToggleEmails = () => {
    const v = !emails;
    setEmails(v);
    setSetting("pref_emails", String(v)).catch(() => {});
  };

  const handleMonthStartDay = (day: number) => {
    const clamped = Math.max(1, Math.min(28, day));
    setMonthStartDay(clamped);
    setMonthStartDayState(clamped);
    Alert.alert("Dia de início atualizado", `Seu mês financeiro agora começa no dia ${clamped}.`);
  };

  const showMonthStartDayPicker = () => {
    const days = Array.from({ length: 28 }, (_, i) => i + 1);
    Alert.alert(
      "Dia de início do mês",
      "Escolha o dia em que seu mês financeiro começa (1 a 28):",
      [
        ...days.slice(0, 14).map((d) => ({
          text: `Dia ${d}`,
          onPress: () => handleMonthStartDay(d),
        })),
        { text: "Mais dias →", onPress: () => showMoreDays(days) },
      ]
    );
  };

  const showMoreDays = (days: number[]) => {
    Alert.alert(
      "Dia de início do mês (continuação)",
      "Escolha o dia:",
      [
        ...days.slice(14).map((d) => ({
          text: `Dia ${d}`,
          onPress: () => handleMonthStartDay(d),
        })),
        { text: "← Voltar", onPress: () => showMonthStartDayPicker() },
      ]
    );
  };

  const themeLabel = mode === "system" ? "Sistema" : isDark ? "Escuro" : "Claro";
  const cycleTheme = () => {
    if (mode === "dark") setTheme("light");
    else if (mode === "light") setTheme("system");
    else setTheme("dark");
  };

  return (
    <ScreenLayout title="Preferências">
      <AccountSection title="Aparência">
        <AccountRow
          icon={mode === "system" ? "phone-portrait-outline" : isDark ? "sunny-outline" : "moon-outline"}
          iconColor={colors.primary}
          label="Tema"
          value={themeLabel}
          onPress={cycleTheme}
        />
      </AccountSection>

      <AccountSection title="Mês Financeiro">
        <AccountRow
          icon="calendar-outline"
          iconColor={colors.warning}
          label="Dia de início do mês"
          value={monthStartDay === 1 ? "Dia 1 (padrão)" : `Dia ${monthStartDay}`}
          onPress={showMonthStartDayPicker}
        />
      </AccountSection>

      <AccountSection title="Idioma e Formato">
        <AccountRow
          icon="language-outline"
          iconColor={colors.info}
          label="Idioma"
          value="Português (BR)"
          onPress={() => Alert.alert("Idioma", "Seletor de idioma em desenvolvimento")}
        />
        <RowSeparator />
        <AccountRow
          icon="calendar-outline"
          iconColor={colors.warning}
          label="Formato de data"
          value="DD/MM/AAAA"
          onPress={() => Alert.alert("Formato de data", "Seletor em desenvolvimento")}
        />
        <RowSeparator />
        <AccountRow
          icon="cash-outline"
          iconColor={colors.success}
          label="Formato de moeda"
          value="R$ (BRL)"
          onPress={() => Alert.alert("Moeda", "Seletor em desenvolvimento")}
        />
      </AccountSection>

      <AccountSection title="Notificações">
        <ToggleRow
          icon="notifications-outline"
          iconColor={colors.primary}
          label="Receber notificações"
          value={notifications}
          onToggle={handleToggleNotifications}
        />
        <RowSeparator />
        <ToggleRow
          icon="mail-outline"
          iconColor={colors.info}
          label="Receber e-mails"
          value={emails}
          onToggle={handleToggleEmails}
        />
      </AccountSection>
    </ScreenLayout>
  );
}
