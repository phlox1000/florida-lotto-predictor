export const colors = {
  background: '#08090b',
  backgroundRaised: '#0d1117',
  surface: '#12161d',
  surfaceRaised: '#171c24',
  surfaceMuted: '#0f131a',
  border: '#2a313c',
  borderMuted: '#1f2630',
  text: '#f4f7fa',
  textMuted: '#a7b2c0',
  textSubtle: '#6f7f91',
  accent: '#5ad4c8',
  accentStrong: '#8cefe7',
  accentSoft: 'rgba(90, 212, 200, 0.14)',
  success: '#7dd3a8',
  successSoft: 'rgba(125, 211, 168, 0.12)',
  warning: '#e8c66f',
  warningSoft: 'rgba(232, 198, 111, 0.12)',
  danger: '#f08282',
  dangerSoft: 'rgba(240, 130, 130, 0.12)',
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
  sm: 6,
  md: 8,
  lg: 10,
  pill: 999,
};

export const typography = {
  eyebrow: {
    fontSize: 11,
    letterSpacing: 0.6,
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
};
