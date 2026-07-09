import { AccountRow } from "@/components/account/account-row";
import { AccountSection } from "@/components/account/account-section";
import { RowSeparator } from "@/components/account/row-separator";
import { ScreenLayout } from "@/components/account/screen-layout";
import { ToggleRow } from "@/components/account/toggle-row";
import { colors } from "@/lib/theme";
import { useTheme } from "@/lib/theme-context";
import { useState } from "react";
import { Alert } from "react-native";

export default function PreferencesScreen() {
  const { isDark, toggleTheme } = useTheme();
  const [notifications, setNotifications] = useState(true);
  const [emails, setEmails] = useState(true);

  return (
    <ScreenLayout title="Preferências">
      <AccountSection title="Aparência">
        <AccountRow
          icon={isDark ? "sunny-outline" : "moon-outline"}
          iconColor={colors.primary}
          label="Tema"
          value={isDark ? "Escuro" : "Claro"}
          onPress={toggleTheme}
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
          onToggle={() => setNotifications((v) => !v)}
        />
        <RowSeparator />
        <ToggleRow
          icon="mail-outline"
          iconColor={colors.info}
          label="Receber e-mails"
          value={emails}
          onToggle={() => setEmails((v) => !v)}
        />
      </AccountSection>
    </ScreenLayout>
  );
}
