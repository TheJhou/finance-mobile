import { EditModal } from "@/components/account/edit-modal";
import { DatePicker } from "@/components/date-picker";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { GOAL_COLORS, GOAL_ICONS, type GoalForm, type GoalFormErrors } from "@/lib/goals";
import { colors, radius, spacing } from "@/lib/theme";
import { useThemedStyles } from "@/lib/theme-context";
import { toDateInputValue } from "@/lib/utils";
import { Ionicons } from "@expo/vector-icons";
import { Pressable, StyleSheet, Text, View } from "react-native";

interface Props {
  visible: boolean;
  mode: "create" | "edit";
  form: GoalForm;
  errors: GoalFormErrors;
  saving: boolean;
  onChange: (form: GoalForm) => void;
  onSave: () => void;
  onDelete?: () => void;
  onClose: () => void;
}

export function GoalFormModal({ visible, mode, form, errors, saving, onChange, onSave, onDelete, onClose }: Readonly<Props>) {
  const styles = useThemedStyles(createStyles);
  const set = <K extends keyof GoalForm>(key: K, value: GoalForm[K]) => onChange({ ...form, [key]: value });

  return (
    <EditModal
      visible={visible}
      title={mode === "create" ? "Nova meta" : "Editar meta"}
      onClose={onClose}
      footer={
        <>
          <Button title={mode === "create" ? "Criar meta" : "Salvar"} onPress={onSave} loading={saving} />
          {mode === "edit" && onDelete ? (
            <Button title="Excluir meta" variant="danger" onPress={onDelete} disabled={saving} />
          ) : null}
          <Button title="Cancelar" variant="ghost" onPress={onClose} disabled={saving} />
        </>
      }
    >
      <Input
        label="Nome"
        value={form.name}
        onChangeText={(name) => set("name", name)}
        placeholder="Ex.: Viagem, Reserva de emergência"
        maxLength={100}
        error={errors.name}
      />
      <Input
        label="Valor da meta (R$)"
        value={form.target}
        onChangeText={(target) => set("target", target)}
        keyboardType="decimal-pad"
        placeholder="0,00"
        error={errors.target}
      />
      <Input
        label={mode === "create" ? "Já guardado (opcional)" : "Valor guardado"}
        value={form.saved}
        onChangeText={(saved) => set("saved", saved)}
        keyboardType="decimal-pad"
        placeholder="0,00"
        error={errors.saved}
      />

      <View style={{ gap: 6 }}>
        <DatePicker
          label="Prazo (opcional)"
          placeholder="Sem prazo"
          value={form.deadline}
          onChange={(deadline) => set("deadline", deadline)}
          minDate={toDateInputValue(new Date())}
        />
        {form.deadline ? (
          <Pressable onPress={() => set("deadline", "")} hitSlop={8}>
            <Text style={styles.link}>Remover prazo</Text>
          </Pressable>
        ) : null}
        {errors.deadline ? <Text style={styles.error}>{errors.deadline}</Text> : null}
      </View>

      <View style={{ gap: 8 }}>
        <Text style={styles.label}>Cor</Text>
        <View style={styles.chips}>
          {GOAL_COLORS.map((color) => (
            <Pressable
              key={color}
              onPress={() => set("color", color)}
              style={[styles.colorChip, { backgroundColor: color }, form.color === color && styles.chipSelected]}
            >
              {form.color === color ? <Ionicons name="checkmark" size={16} color="#fff" /> : null}
            </Pressable>
          ))}
        </View>
      </View>

      <View style={{ gap: 8 }}>
        <Text style={styles.label}>Ícone</Text>
        <View style={styles.chips}>
          {GOAL_ICONS.map((icon) => {
            const selected = form.icon === icon;
            return (
              <Pressable
                key={icon}
                onPress={() => set("icon", icon)}
                style={[styles.iconChip, selected && { borderColor: form.color, backgroundColor: form.color + "22" }]}
              >
                <Ionicons name={icon} size={20} color={selected ? form.color : colors.textSecondary} />
              </Pressable>
            );
          })}
        </View>
      </View>
    </EditModal>
  );
}

function createStyles() {
  return StyleSheet.create({
    label: { fontSize: 13, fontWeight: "500", color: colors.textSecondary },
    link: { fontSize: 13, fontWeight: "600", color: colors.primary },
    error: { fontSize: 12, color: colors.danger },
    chips: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
    colorChip: { width: 34, height: 34, borderRadius: 17, alignItems: "center", justifyContent: "center" },
    chipSelected: { borderWidth: 2, borderColor: colors.textPrimary },
    iconChip: {
      width: 44,
      height: 44,
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surface,
      alignItems: "center",
      justifyContent: "center",
    },
  });
}
