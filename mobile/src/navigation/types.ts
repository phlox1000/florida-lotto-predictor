import type { GameType } from '@florida-lotto/shared';

export type MainTabParamList = {
  Home: undefined;
  Analyze: { focusGame?: GameType } | undefined;
  Generate: undefined;
  Track: undefined;
  Models: undefined;
};
