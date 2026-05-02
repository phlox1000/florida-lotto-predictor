/**
 * Premium dark analytics shell — used by home dashboard and future screen polish.
 */
export const colors = {
  bg: '#0b0f14',
  bgElevated: '#111827',
  border: '#1f2937',
  text: '#f1f5f9',
  textMuted: '#94a3b8',
  textSubtle: '#64748b',
  accent: '#3b82f6',
  accentDim: 'rgba(59, 130, 246, 0.12)',
  success: '#22c55e',
  successDim: 'rgba(34, 197, 94, 0.12)',
  warning: '#f59e0b',
  warningDim: 'rgba(245, 158, 11, 0.12)',
  danger: '#f87171',
} as const;

export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 20, xxl: 24 } as const;

export const radii = { sm: 8, md: 12, lg: 16, full: 9999 } as const;
