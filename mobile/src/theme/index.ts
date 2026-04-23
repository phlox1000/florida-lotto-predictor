export const colors = {
  // Backgrounds
  background: '#0a0a0f',
  backgroundRaised: '#111118',
  surface: '#111118',
  surfaceRaised: '#1a1a24',
  surfaceMuted: '#0a0a0f',

  // Borders
  border: '#2a2a3a',
  borderMuted: '#2a2a3a',

  // Text
  text: '#e8e8f0',
  textMuted: '#8888aa',
  textSubtle: '#555570',

  // Primary accent — cyan (data, active states)
  accent: '#00d4ff',
  accentStrong: '#33ddff',
  accentSoft: 'rgba(0, 212, 255, 0.10)',

  // Secondary accent — gold (highlights, wins)
  gold: '#ffd700',
  goldSoft: 'rgba(255, 215, 0, 0.10)',

  // Semantic
  success: '#00ff88',
  successSoft: 'rgba(0, 255, 136, 0.08)',
  warning: '#ffd700',
  warningSoft: 'rgba(255, 215, 0, 0.10)',
  danger: '#ff4444',
  dangerSoft: 'rgba(255, 68, 68, 0.10)',

  white: '#ffffff',
};

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 28,
  xxxl: 36,
};

export const radii = {
  sm: 4,   // data elements
  md: 8,   // cards
  lg: 8,   // same as cards
  pill: 999,
};

export const typography = {
  eyebrow: {
    fontSize: 10,
    letterSpacing: 1.5,
    fontWeight: '700' as const,
    textTransform: 'uppercase' as const,
  },
  title: {
    fontSize: 30,
    fontWeight: '800' as const,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700' as const,
  },
  body: {
    fontSize: 14,
    lineHeight: 20,
  },
  caption: {
    fontSize: 12,
    lineHeight: 17,
  },
  mono: {
    fontFamily: 'monospace' as const,
  },
};
