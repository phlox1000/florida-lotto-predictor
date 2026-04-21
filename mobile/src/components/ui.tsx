import type { ReactNode } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type TextStyle,
  type ViewStyle,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, radii, spacing, typography } from '../theme';

type Tone = 'neutral' | 'accent' | 'success' | 'warning' | 'danger';

type ScreenProps = {
  eyebrow?: string;
  title: string;
  subtitle?: string;
  children: ReactNode;
  footer?: ReactNode;
};

export function Screen({ eyebrow, title, subtitle, children, footer }: ScreenProps) {
  return (
    <SafeAreaView style={styles.screen}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.header}>
          {eyebrow ? <Text style={styles.eyebrow}>{eyebrow}</Text> : null}
          <Text style={styles.title}>{title}</Text>
          {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
        </View>

        <View style={styles.stack}>{children}</View>

        {footer ? <View style={styles.footer}>{footer}</View> : null}
      </ScrollView>
    </SafeAreaView>
  );
}

type CardProps = {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
};

export function Card({ children, style }: CardProps) {
  return <View style={[styles.card, style]}>{children}</View>;
}

type SectionHeaderProps = {
  eyebrow?: string;
  title: string;
  caption?: string;
  right?: ReactNode;
};

export function SectionHeader({ eyebrow, title, caption, right }: SectionHeaderProps) {
  return (
    <View style={styles.sectionHeader}>
      <View style={styles.sectionHeaderText}>
        {eyebrow ? <Text style={styles.sectionEyebrow}>{eyebrow}</Text> : null}
        <Text style={styles.sectionTitle}>{title}</Text>
        {caption ? <Text style={styles.sectionCaption}>{caption}</Text> : null}
      </View>
      {right ? <View style={styles.sectionRight}>{right}</View> : null}
    </View>
  );
}

type ButtonProps = {
  label: string;
  onPress?: () => void;
  disabled?: boolean;
  loading?: boolean;
  variant?: 'primary' | 'secondary';
  style?: StyleProp<ViewStyle>;
};

export function PrimaryButton({
  label,
  onPress,
  disabled = false,
  loading = false,
  variant = 'primary',
  style,
}: ButtonProps) {
  const isDisabled = disabled || loading || !onPress;

  return (
    <Pressable
      accessibilityRole="button"
      disabled={isDisabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        variant === 'secondary' ? styles.buttonSecondary : styles.buttonPrimary,
        isDisabled ? styles.buttonDisabled : null,
        pressed && !isDisabled ? styles.buttonPressed : null,
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator size="small" color={colors.background} />
      ) : (
        <Text style={[styles.buttonText, variant === 'secondary' ? styles.buttonTextSecondary : null]}>
          {label}
        </Text>
      )}
    </Pressable>
  );
}

type ChipProps = {
  label: string;
  selected?: boolean;
  onPress?: () => void;
};

export function Chip({ label, selected = false, onPress }: ChipProps) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [
        styles.chip,
        selected ? styles.chipSelected : null,
        pressed ? styles.chipPressed : null,
      ]}
    >
      <Text style={[styles.chipText, selected ? styles.chipTextSelected : null]}>{label}</Text>
    </Pressable>
  );
}

type StatusPillProps = {
  label: string;
  tone?: Tone;
};

export function StatusPill({ label, tone = 'neutral' }: StatusPillProps) {
  return (
    <View style={[styles.statusPill, toneStyles[tone].pill]}>
      <Text style={[styles.statusText, toneStyles[tone].text]}>{label}</Text>
    </View>
  );
}

type NumberChipProps = {
  value: string | number;
  muted?: boolean;
};

export function NumberChip({ value, muted = false }: NumberChipProps) {
  return (
    <View style={[styles.numberChip, muted ? styles.numberChipMuted : null]}>
      <Text style={[styles.numberText, muted ? styles.numberTextMuted : null]}>{value}</Text>
    </View>
  );
}

type MetricRowProps = {
  label: string;
  value: string;
  valueStyle?: StyleProp<TextStyle>;
};

export function MetricRow({ label, value, valueStyle }: MetricRowProps) {
  return (
    <View style={styles.metricRow}>
      <Text style={styles.metricLabel}>{label}</Text>
      <Text style={[styles.metricValue, valueStyle]}>{value}</Text>
    </View>
  );
}

type StateBlockProps = {
  title: string;
  body?: string;
  tone?: Tone;
  loading?: boolean;
};

export function StateBlock({ title, body, tone = 'neutral', loading = false }: StateBlockProps) {
  return (
    <View style={[styles.stateBlock, toneStyles[tone].state]}>
      <View style={styles.stateTitleRow}>
        {loading ? <ActivityIndicator size="small" color={colors.accent} /> : null}
        <Text style={[styles.stateTitle, toneStyles[tone].text]}>{title}</Text>
      </View>
      {body ? <Text style={styles.stateBody}>{body}</Text> : null}
    </View>
  );
}

type FeatureRowProps = {
  title: string;
  detail: string;
  meta?: string;
};

export function FeatureRow({ title, detail, meta }: FeatureRowProps) {
  return (
    <View style={styles.featureRow}>
      <View style={styles.featureText}>
        <Text style={styles.featureTitle}>{title}</Text>
        <Text style={styles.featureDetail}>{detail}</Text>
      </View>
      {meta ? <StatusPill label={meta} tone="neutral" /> : null}
    </View>
  );
}

export const ui = {
  colors,
  spacing,
  radii,
};

const toneStyles = {
  neutral: {
    pill: { backgroundColor: colors.surfaceRaised, borderColor: colors.border },
    text: { color: colors.textMuted },
    state: { backgroundColor: colors.surfaceMuted, borderColor: colors.borderMuted },
  },
  accent: {
    pill: { backgroundColor: colors.accentSoft, borderColor: colors.accent },
    text: { color: colors.accentStrong },
    state: { backgroundColor: colors.accentSoft, borderColor: colors.accent },
  },
  success: {
    pill: { backgroundColor: colors.successSoft, borderColor: colors.success },
    text: { color: colors.success },
    state: { backgroundColor: colors.successSoft, borderColor: colors.success },
  },
  warning: {
    pill: { backgroundColor: colors.warningSoft, borderColor: colors.warning },
    text: { color: colors.warning },
    state: { backgroundColor: colors.warningSoft, borderColor: colors.warning },
  },
  danger: {
    pill: { backgroundColor: colors.dangerSoft, borderColor: colors.danger },
    text: { color: colors.danger },
    state: { backgroundColor: colors.dangerSoft, borderColor: colors.danger },
  },
};

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.background,
  },
  scroll: {
    flex: 1,
  },
  content: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.xl,
    paddingBottom: spacing.xxxl,
  },
  header: {
    marginBottom: spacing.xl,
  },
  eyebrow: {
    ...typography.eyebrow,
    color: colors.accent,
    marginBottom: spacing.sm,
  },
  title: {
    ...typography.title,
    color: colors.text,
  },
  subtitle: {
    ...typography.body,
    color: colors.textMuted,
    marginTop: spacing.sm,
  },
  stack: {
    gap: spacing.lg,
  },
  footer: {
    marginTop: spacing.xl,
  },
  card: {
    backgroundColor: colors.surface,
    borderColor: colors.borderMuted,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radii.lg,
    padding: spacing.lg,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: spacing.md,
    marginBottom: spacing.lg,
  },
  sectionHeaderText: {
    flex: 1,
  },
  sectionRight: {
    alignItems: 'flex-end',
  },
  sectionEyebrow: {
    ...typography.eyebrow,
    color: colors.textSubtle,
    marginBottom: spacing.xs,
  },
  sectionTitle: {
    ...typography.sectionTitle,
    color: colors.text,
  },
  sectionCaption: {
    ...typography.caption,
    color: colors.textMuted,
    marginTop: spacing.xs,
  },
  button: {
    minHeight: 46,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radii.md,
    paddingHorizontal: spacing.lg,
    borderWidth: StyleSheet.hairlineWidth,
  },
  buttonPrimary: {
    backgroundColor: colors.accent,
    borderColor: colors.accent,
  },
  buttonSecondary: {
    backgroundColor: colors.surfaceRaised,
    borderColor: colors.border,
  },
  buttonPressed: {
    opacity: 0.84,
  },
  buttonDisabled: {
    opacity: 0.45,
  },
  buttonText: {
    color: colors.background,
    fontSize: 15,
    fontWeight: '800',
  },
  buttonTextSecondary: {
    color: colors.text,
  },
  chip: {
    minHeight: 36,
    justifyContent: 'center',
    borderRadius: radii.pill,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    backgroundColor: colors.surfaceMuted,
    paddingHorizontal: spacing.md,
  },
  chipSelected: {
    backgroundColor: colors.accentSoft,
    borderColor: colors.accent,
  },
  chipPressed: {
    opacity: 0.82,
  },
  chipText: {
    color: colors.textMuted,
    fontSize: 13,
    fontWeight: '700',
  },
  chipTextSelected: {
    color: colors.accentStrong,
  },
  statusPill: {
    borderRadius: radii.pill,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
  },
  statusText: {
    fontSize: 11,
    fontWeight: '800',
    textTransform: 'uppercase',
  },
  numberChip: {
    minWidth: 34,
    height: 34,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radii.sm,
    backgroundColor: colors.backgroundRaised,
    borderColor: colors.border,
    borderWidth: StyleSheet.hairlineWidth,
  },
  numberChipMuted: {
    backgroundColor: colors.surfaceMuted,
  },
  numberText: {
    color: colors.text,
    fontSize: 15,
    fontWeight: '800',
  },
  numberTextMuted: {
    color: colors.accentStrong,
  },
  metricRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.borderMuted,
    paddingTop: spacing.md,
    marginTop: spacing.md,
    gap: spacing.lg,
  },
  metricLabel: {
    ...typography.caption,
    color: colors.textSubtle,
  },
  metricValue: {
    color: colors.text,
    fontSize: 13,
    fontWeight: '700',
    textAlign: 'right',
    flexShrink: 1,
  },
  stateBlock: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radii.md,
    padding: spacing.lg,
  },
  stateTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  stateTitle: {
    fontSize: 14,
    fontWeight: '800',
  },
  stateBody: {
    ...typography.body,
    color: colors.textMuted,
    marginTop: spacing.sm,
  },
  featureRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.borderMuted,
    paddingTop: spacing.md,
    marginTop: spacing.md,
  },
  featureText: {
    flex: 1,
  },
  featureTitle: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '800',
  },
  featureDetail: {
    ...typography.caption,
    color: colors.textMuted,
    marginTop: spacing.xs,
  },
});
