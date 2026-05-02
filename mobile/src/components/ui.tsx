import { useEffect, useRef, type ReactNode } from 'react';
import {
  ActivityIndicator,
  Animated,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type DimensionValue,
  type StyleProp,
  type TextStyle,
  type ViewStyle,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Ionicons from '@expo/vector-icons/Ionicons';
import { colors, radii, spacing, typography } from '../theme';

type Tone = 'neutral' | 'accent' | 'success' | 'warning' | 'danger';

// ─── Screen ─────────────────────────────────────────────────────────────────

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

// ─── Card ────────────────────────────────────────────────────────────────────

type CardProps = {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
};

export function Card({ children, style }: CardProps) {
  return <View style={[styles.card, style]}>{children}</View>;
}

// ─── TerminalLabel ───────────────────────────────────────────────────────────
// Bloomberg-style section category label: small-caps, letter-spaced, top border

type TerminalLabelProps = {
  children: string;
  style?: StyleProp<TextStyle>;
};

export function TerminalLabel({ children, style }: TerminalLabelProps) {
  return <Text style={[styles.terminalLabel, style]}>{children}</Text>;
}

// ─── SectionHeader ───────────────────────────────────────────────────────────

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

// ─── PrimaryButton ───────────────────────────────────────────────────────────

type ButtonProps = {
  label: string;
  onPress?: () => void;
  disabled?: boolean;
  loading?: boolean;
  variant?: 'primary' | 'secondary';
  size?: 'regular' | 'compact';
  style?: StyleProp<ViewStyle>;
};

export function PrimaryButton({
  label,
  onPress,
  disabled = false,
  loading = false,
  variant = 'primary',
  size = 'regular',
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
        size === 'compact' ? styles.buttonCompact : null,
        variant === 'secondary' ? styles.buttonSecondary : styles.buttonPrimary,
        isDisabled ? styles.buttonDisabled : null,
        pressed && !isDisabled ? styles.buttonPressed : null,
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator size="small" color={colors.background} />
      ) : (
        <Text style={[
          styles.buttonText,
          size === 'compact' ? styles.buttonTextCompact : null,
          variant === 'secondary' ? styles.buttonTextSecondary : null,
        ]}>
          {label}
        </Text>
      )}
    </Pressable>
  );
}

// ─── Chip ────────────────────────────────────────────────────────────────────

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

// ─── InstrumentTab ───────────────────────────────────────────────────────────

type InstrumentTabProps = {
  label: string;
  selected: boolean;
  onPress: () => void;
  isLast?: boolean;
};

export function InstrumentTab({ label, selected, onPress, isLast = false }: InstrumentTabProps) {
  return (
    <Pressable
      accessibilityRole="tab"
      onPress={onPress}
      style={[
        styles.instrTab,
        selected ? styles.instrTabActive : null,
        isLast ? null : styles.instrTabDivider,
      ]}
    >
      <Text style={[styles.instrTabText, selected ? styles.instrTabTextActive : null]}>
        {label}
      </Text>
    </Pressable>
  );
}

// ─── StatusPill ──────────────────────────────────────────────────────────────

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

// ─── NumberChip ──────────────────────────────────────────────────────────────

type NumberChipProps = {
  value: string | number;
  muted?: boolean;
  large?: boolean;
};

export function NumberChip({ value, muted = false, large = false }: NumberChipProps) {
  return (
    <View style={[styles.numberChip, muted ? styles.numberChipMuted : null, large ? styles.numberChipLarge : null]}>
      <Text style={[
        styles.numberText,
        muted ? styles.numberTextMuted : null,
        large ? styles.numberTextLarge : null,
      ]}>
        {value}
      </Text>
    </View>
  );
}

// ─── MetricRow ───────────────────────────────────────────────────────────────

type MetricRowProps = {
  label: string;
  value: string;
  valueStyle?: StyleProp<TextStyle>;
  valueTone?: 'default' | 'positive' | 'negative' | 'accent';
};

export function MetricRow({ label, value, valueStyle, valueTone = 'default' }: MetricRowProps) {
  const toneColor =
    valueTone === 'positive' ? colors.success :
    valueTone === 'negative' ? colors.danger :
    valueTone === 'accent' ? colors.accent :
    colors.text;

  return (
    <View style={styles.metricRow}>
      <Text style={styles.metricLabel}>{label}</Text>
      <Text style={[styles.metricValue, { color: toneColor }, valueStyle]}>{value}</Text>
    </View>
  );
}

// ─── AllocationBar ───────────────────────────────────────────────────────────
// Confidence score shown as a proportional fill bar (trading signal style)

type AllocationBarProps = {
  score: number;
  maxScore?: number;
  label?: string;
  showValue?: boolean;
};

export function AllocationBar({ score, maxScore = 100, label, showValue = true }: AllocationBarProps) {
  const pct = Math.min(1, Math.max(0, score / maxScore));
  const displayValue = score >= 10 ? score.toFixed(0) : score.toFixed(1);

  return (
    <View style={styles.allocContainer}>
      {label ? <Text style={styles.allocLabel}>{label}</Text> : null}
      <View style={styles.allocRow}>
        <View style={styles.allocTrack}>
          <View style={[styles.allocFill, { width: `${Math.round(pct * 100)}%` as any }]} />
        </View>
        {showValue ? <Text style={styles.allocValue}>{displayValue}</Text> : null}
      </View>
    </View>
  );
}

// ─── SkeletonBlock ───────────────────────────────────────────────────────────
// Animated pulsing placeholder — replaces spinners during data load

type SkeletonBlockProps = {
  height?: number;
  width?: DimensionValue;
  style?: StyleProp<ViewStyle>;
};

export function SkeletonBlock({ height = 14, width, style }: SkeletonBlockProps) {
  const anim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(anim, { toValue: 1, duration: 700, useNativeDriver: false }),
        Animated.timing(anim, { toValue: 0, duration: 700, useNativeDriver: false }),
      ])
    ).start();
    return () => anim.stopAnimation();
  }, [anim]);

  const backgroundColor = anim.interpolate({
    inputRange: [0, 1],
    outputRange: [colors.surfaceRaised, colors.border],
  });

  return (
    <Animated.View
      style={[
        { height, borderRadius: radii.sm, backgroundColor },
        width ? { width } : { alignSelf: 'stretch' },
        style,
      ]}
    />
  );
}

// Preset card-shaped skeleton for loading screens
export function SkeletonCard() {
  return (
    <View style={[styles.card, { gap: spacing.md }]}>
      <SkeletonBlock height={10} width="35%" />
      <SkeletonBlock height={18} width="60%" />
      <SkeletonBlock height={10} width="80%" />
      <SkeletonBlock height={10} width="50%" />
    </View>
  );
}

// ─── EmptyState ──────────────────────────────────────────────────────────────
// Bloomberg-style "no data" — clinical, not apologetic

type EmptyStateProps = {
  icon?: keyof typeof Ionicons.glyphMap;
  headline: string;
  description?: string;
  action?: string;
  onAction?: () => void;
};

export function EmptyState({ icon = 'analytics-outline', headline, description, action, onAction }: EmptyStateProps) {
  return (
    <View style={styles.emptyContainer}>
      <Ionicons name={icon} size={28} color={colors.textSubtle} style={styles.emptyIcon} />
      <Text style={styles.emptyHeadline}>{headline}</Text>
      {description ? <Text style={styles.emptyDescription}>{description}</Text> : null}
      {action && onAction ? (
        <PrimaryButton
          label={action}
          onPress={onAction}
          size="compact"
          style={styles.emptyAction}
        />
      ) : null}
    </View>
  );
}

// ─── StateBlock ──────────────────────────────────────────────────────────────

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

// ─── FeatureRow ──────────────────────────────────────────────────────────────

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

// ─── ModelSignalCard ──────────────────────────────────────────────────────────
// Bloomberg signal intelligence panel — one model's full ranked output

type ModelPerformance = {
  recentAccuracy: number | null;
  totalPredictions: number | null;
  winRate: number | null;
  trend: 'up' | 'down' | 'neutral' | null;
};

type ModelSignalCardProps = {
  rank: number;
  modelId: string;
  modelDescription: string;
  picks: number[];
  specialNumbers?: number[];
  confidenceScore: number;
  maxScore: number;
  performance: ModelPerformance | null;
  isSaved: boolean;
  isExpanded: boolean;
  onSave: () => void;
  onShare: () => void;
  onToggleExpand: () => void;
};

const SIGNAL_TREND_COLORS = {
  up: '#00ff88',
  down: '#ff4444',
  neutral: '#8888aa',
} as const;

const SIGNAL_TREND_ICONS = {
  up: '↑ Up',
  down: '↓ Down',
  neutral: '— Flat',
} as const;

export function ModelSignalCard({
  rank,
  modelId,
  modelDescription,
  picks,
  specialNumbers,
  confidenceScore,
  maxScore,
  performance,
  isSaved,
  isExpanded,
  onSave,
  onShare,
  onToggleExpand,
}: ModelSignalCardProps) {
  const rankDotColor =
    rank === 1 ? colors.success :
    rank === 2 ? colors.accent :
    rank === 3 ? colors.textMuted :
    colors.textSubtle;

  const trend = performance?.trend ?? null;
  const trendColor = trend ? SIGNAL_TREND_COLORS[trend] : colors.textSubtle;
  const trendLabel = trend ? SIGNAL_TREND_ICONS[trend] : '—';

  const fmtScore = confidenceScore >= 10
    ? confidenceScore.toFixed(0)
    : confidenceScore.toFixed(1);

  return (
    <View style={[styles.signalCard, isExpanded ? styles.signalCardExpanded : null]}>

      {/* Tappable header: rank · name · trend dot · score */}
      <Pressable onPress={onToggleExpand} style={styles.signalCardHeader}>
        <View style={styles.signalCardTitleGroup}>
          <View style={[styles.signalCardDot, { backgroundColor: rankDotColor }]} />
          <Text style={styles.signalCardRank}>#{rank}</Text>
          <Text style={styles.signalCardName} numberOfLines={1}>{modelId}</Text>
        </View>
        <View style={styles.signalCardHeaderRight}>
          <View style={[styles.signalTrendDot, { backgroundColor: trendColor }]} />
          <Text style={styles.signalCardScore}>{fmtScore}</Text>
        </View>
      </Pressable>

      {/* Pick numbers */}
      <View style={styles.signalPickRow}>
        {picks.map(n => (
          <NumberChip key={`${modelId}-m-${n}`} value={n} />
        ))}
      </View>

      {specialNumbers && specialNumbers.length > 0 ? (
        <View style={styles.signalSpecialRow}>
          <Text style={styles.signalSpecialLabel}>Special</Text>
          <View style={styles.signalPickRowCompact}>
            {specialNumbers.map(n => (
              <NumberChip key={`${modelId}-s-${n}`} value={n} muted />
            ))}
          </View>
        </View>
      ) : null}

      {/* Confidence bar */}
      <AllocationBar score={confidenceScore} maxScore={maxScore} label="Confidence" />

      {/* Expanded: description + performance grid */}
      {isExpanded ? (
        <View style={styles.signalExpandedBody}>
          {modelDescription ? (
            <Text style={styles.signalDescription}>{modelDescription}</Text>
          ) : null}

          <TerminalLabel>Performance</TerminalLabel>

          {performance ? (
            <View style={styles.signalPerfGrid}>
              <View style={styles.signalPerfItem}>
                <Text style={styles.signalPerfLabel}>Accuracy</Text>
                <Text style={styles.signalPerfValue}>
                  {performance.recentAccuracy !== null
                    ? performance.recentAccuracy.toFixed(2)
                    : '—'}
                </Text>
              </View>
              <View style={styles.signalPerfItem}>
                <Text style={styles.signalPerfLabel}>Predictions</Text>
                <Text style={styles.signalPerfValue}>
                  {performance.totalPredictions !== null
                    ? String(performance.totalPredictions)
                    : '—'}
                </Text>
              </View>
              <View style={styles.signalPerfItem}>
                <Text style={styles.signalPerfLabel}>Win Rate</Text>
                <Text style={styles.signalPerfValue}>
                  {performance.winRate !== null
                    ? `${performance.winRate.toFixed(1)}%`
                    : '—'}
                </Text>
              </View>
              <View style={styles.signalPerfItem}>
                <Text style={styles.signalPerfLabel}>Trend</Text>
                <Text style={[styles.signalPerfValue, { color: trendColor }]}>
                  {trendLabel}
                </Text>
              </View>
            </View>
          ) : (
            <Text style={styles.signalPerfNull}>No performance data yet</Text>
          )}

          {/* Collapse affordance */}
          <Pressable onPress={onToggleExpand} style={styles.signalCollapse}>
            <Text style={styles.signalCollapseText}>Show Less ▲</Text>
          </Pressable>
        </View>
      ) : null}

      {/* Action row */}
      <View style={styles.signalCardActions}>
        <PrimaryButton
          label={isSaved ? 'Saved' : 'Save'}
          onPress={onSave}
          disabled={isSaved}
          size="compact"
          style={styles.signalCardAction}
        />
        <PrimaryButton
          label="Share"
          onPress={onShare}
          size="compact"
          variant="secondary"
          style={styles.signalCardAction}
        />
      </View>
    </View>
  );
}

// ─── Exports ─────────────────────────────────────────────────────────────────

export const ui = {
  colors,
  spacing,
  radii,
};

// ─── Tone map ────────────────────────────────────────────────────────────────

const toneStyles = {
  neutral: {
    pill: { backgroundColor: colors.surfaceRaised, borderColor: colors.border },
    text: { color: colors.textMuted },
    state: { backgroundColor: colors.surfaceRaised, borderColor: colors.border },
  },
  accent: {
    pill: { backgroundColor: colors.accentSoft, borderColor: colors.accent },
    text: { color: colors.accent },
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

// ─── Styles ──────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  // Screen
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

  // Card — 1px border, 8px radius, 16px padding per spec
  card: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radii.md,
    padding: spacing.lg,
  },

  // TerminalLabel — Bloomberg section category label
  terminalLabel: {
    fontSize: 10,
    letterSpacing: 1.5,
    textTransform: 'uppercase',
    color: colors.textMuted,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: spacing.sm,
    marginBottom: spacing.md,
    fontWeight: '700',
  },

  // SectionHeader
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
    fontSize: 10,
    letterSpacing: 1.5,
    fontWeight: '700',
    textTransform: 'uppercase',
    color: colors.textMuted,
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

  // Button
  button: {
    minHeight: 46,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radii.md,
    paddingHorizontal: spacing.lg,
    borderWidth: 1,
  },
  buttonCompact: {
    minHeight: 34,
    paddingHorizontal: spacing.md,
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
    letterSpacing: 0.5,
  },
  buttonTextCompact: {
    fontSize: 12,
  },
  buttonTextSecondary: {
    color: colors.text,
  },

  // InstrumentTab — Bloomberg terminal ticker tab
  instrTab: {
    backgroundColor: colors.surface,
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  instrTabActive: {
    backgroundColor: '#0a1628',
    borderBottomColor: colors.accent,
  },
  instrTabDivider: {
    borderRightWidth: 1,
    borderRightColor: colors.border,
  },
  instrTabText: {
    color: colors.textMuted,
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  instrTabTextActive: {
    color: colors.accent,
  },

  // Chip — filter chips keep pill radius; game tabs can override
  chip: {
    minHeight: 32,
    justifyContent: 'center',
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceRaised,
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
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  chipTextSelected: {
    color: colors.accent,
  },

  // StatusPill
  statusPill: {
    borderRadius: radii.sm,
    borderWidth: 1,
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
  },
  statusText: {
    fontSize: 10,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    fontFamily: 'monospace',
  },

  // NumberChip — monospace, data terminal style
  numberChip: {
    minWidth: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radii.sm,
    backgroundColor: colors.surfaceRaised,
    borderColor: colors.border,
    borderWidth: 1,
  },
  numberChipMuted: {
    backgroundColor: colors.surfaceMuted,
    borderColor: colors.border,
  },
  numberChipLarge: {
    minWidth: 48,
    height: 48,
    borderRadius: radii.sm,
  },
  numberText: {
    color: colors.accent,
    fontSize: 15,
    fontWeight: '700',
    fontFamily: 'monospace',
  },
  numberTextMuted: {
    color: colors.textMuted,
  },
  numberTextLarge: {
    fontSize: 20,
  },

  // MetricRow — value in monospace
  metricRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: spacing.md,
    marginTop: spacing.md,
    gap: spacing.lg,
  },
  metricLabel: {
    ...typography.caption,
    color: colors.textSubtle,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    fontSize: 10,
  },
  metricValue: {
    color: colors.text,
    fontSize: 13,
    fontWeight: '700',
    fontFamily: 'monospace',
    textAlign: 'right',
    flexShrink: 1,
  },

  // AllocationBar
  allocContainer: {
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: spacing.md,
    marginTop: spacing.md,
  },
  allocLabel: {
    fontSize: 10,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    color: colors.textSubtle,
    fontWeight: '700',
    marginBottom: spacing.xs,
  },
  allocRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  allocTrack: {
    flex: 1,
    height: 4,
    backgroundColor: colors.surfaceRaised,
    borderRadius: 2,
    overflow: 'hidden',
  },
  allocFill: {
    height: '100%',
    backgroundColor: colors.accent,
    borderRadius: 2,
  },
  allocValue: {
    color: colors.accent,
    fontSize: 12,
    fontFamily: 'monospace',
    fontWeight: '700',
    minWidth: 32,
    textAlign: 'right',
  },

  // Empty state
  emptyContainer: {
    alignItems: 'center',
    paddingVertical: spacing.xl,
    paddingHorizontal: spacing.lg,
  },
  emptyIcon: {
    marginBottom: spacing.md,
    opacity: 0.6,
  },
  emptyHeadline: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: spacing.xs,
  },
  emptyDescription: {
    color: colors.textMuted,
    fontSize: 12,
    lineHeight: 18,
    textAlign: 'center',
  },
  emptyAction: {
    marginTop: spacing.lg,
    minWidth: 140,
  },

  // StateBlock
  stateBlock: {
    borderWidth: 1,
    borderRadius: radii.md,
    padding: spacing.lg,
  },
  stateTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  stateTitle: {
    fontSize: 13,
    fontWeight: '700',
    flexShrink: 1,
  },
  stateBody: {
    ...typography.body,
    color: colors.textMuted,
    marginTop: spacing.sm,
    fontSize: 12,
  },

  // ModelSignalCard
  signalCard: {
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: spacing.lg,
    gap: spacing.md,
  },
  signalCardExpanded: {
    backgroundColor: colors.surfaceRaised,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    borderTopWidth: 1,
    padding: spacing.lg,
    marginTop: spacing.sm,
  },
  signalCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  signalCardTitleGroup: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  signalCardDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  signalCardRank: {
    color: colors.textMuted,
    fontSize: 11,
    fontFamily: 'monospace',
    fontWeight: '700',
  },
  signalCardName: {
    color: colors.text,
    flex: 1,
    fontSize: 13,
    fontWeight: '700',
  },
  signalCardHeaderRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  signalTrendDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  signalCardScore: {
    color: colors.accent,
    fontSize: 16,
    fontFamily: 'monospace',
    fontWeight: '900',
    minWidth: 32,
    textAlign: 'right',
  },
  signalPickRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  signalPickRowCompact: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  signalSpecialRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.md,
  },
  signalSpecialLabel: {
    fontSize: 10,
    letterSpacing: 1.2,
    fontWeight: '700',
    textTransform: 'uppercase',
    color: colors.textSubtle,
  },
  signalExpandedBody: {
    gap: spacing.md,
    marginTop: spacing.sm,
  },
  signalDescription: {
    color: colors.textMuted,
    fontSize: 12,
    lineHeight: 18,
  },
  signalPerfGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  signalPerfItem: {
    flexBasis: '46%',
    flexGrow: 1,
    backgroundColor: colors.background,
    borderRadius: radii.sm,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
  },
  signalPerfLabel: {
    fontSize: 10,
    letterSpacing: 1,
    fontWeight: '700',
    textTransform: 'uppercase',
    color: colors.textSubtle,
    marginBottom: spacing.xs,
  },
  signalPerfValue: {
    color: colors.accent,
    fontSize: 14,
    fontFamily: 'monospace',
    fontWeight: '700',
  },
  signalPerfNull: {
    color: colors.textSubtle,
    fontSize: 11,
    fontStyle: 'italic',
  },
  signalCollapse: {
    alignItems: 'center',
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    marginTop: spacing.sm,
  },
  signalCollapseText: {
    color: colors.textMuted,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  signalCardActions: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  signalCardAction: {
    flex: 1,
  },

  // FeatureRow
  featureRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: spacing.md,
    marginTop: spacing.md,
  },
  featureText: {
    flex: 1,
  },
  featureTitle: {
    color: colors.text,
    fontSize: 13,
    fontWeight: '700',
  },
  featureDetail: {
    ...typography.caption,
    color: colors.textMuted,
    marginTop: spacing.xs,
  },
});
