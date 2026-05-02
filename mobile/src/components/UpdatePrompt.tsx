import { Modal, Pressable, StyleSheet, Text, View } from "react-native";
import { PrimaryButton, ui } from "./ui";

type UpdatePromptProps = {
  visible: boolean;
  onUpdateNow: () => void;
  onLater: () => void;
};

/**
 * Non-blocking modal that announces a pre-fetched OTA bundle is ready and
 * lets the user choose to apply it now (Updates.reloadAsync) or defer until
 * next launch. Styled to match the existing dark analytics aesthetic.
 *
 * Caller is responsible for the orchestration (check → fetch → setVisible).
 * This component only renders the prompt and forwards intent.
 */
export default function UpdatePrompt({ visible, onUpdateNow, onLater }: UpdatePromptProps) {
  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      statusBarTranslucent
      onRequestClose={onLater}
    >
      <View style={styles.scrim}>
        <Pressable style={styles.scrimPressable} onPress={onLater} accessible={false} />

        <View style={styles.card}>
          <Text style={styles.eyebrow}>Software update</Text>
          <Text style={styles.title}>Update Available</Text>
          <Text style={styles.body}>
            A new version is ready. Install now to get the latest fixes.
          </Text>

          <View style={styles.actions}>
            <PrimaryButton
              label="Update Now"
              onPress={onUpdateNow}
              size="compact"
              style={styles.actionPrimary}
            />
            <PrimaryButton
              label="Later"
              onPress={onLater}
              variant="secondary"
              size="compact"
              style={styles.actionSecondary}
            />
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  scrim: {
    flex: 1,
    backgroundColor: "rgba(5, 5, 12, 0.78)",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: ui.spacing.xl,
  },
  scrimPressable: {
    ...StyleSheet.absoluteFillObject,
  },
  card: {
    width: "100%",
    maxWidth: 360,
    backgroundColor: ui.colors.surface,
    borderColor: ui.colors.border,
    borderWidth: 1,
    borderRadius: ui.radii.md,
    padding: ui.spacing.xl,
    gap: ui.spacing.sm,
  },
  eyebrow: {
    color: ui.colors.accent,
    fontSize: 10,
    letterSpacing: 1.5,
    fontWeight: "700",
    textTransform: "uppercase",
    marginBottom: ui.spacing.xs,
  },
  title: {
    color: ui.colors.text,
    fontSize: 20,
    fontWeight: "800",
  },
  body: {
    color: ui.colors.textMuted,
    fontSize: 13,
    lineHeight: 19,
    marginTop: ui.spacing.xs,
    marginBottom: ui.spacing.lg,
  },
  actions: {
    flexDirection: "row",
    gap: ui.spacing.sm,
  },
  actionPrimary: {
    flex: 1,
  },
  actionSecondary: {
    flex: 1,
  },
});
