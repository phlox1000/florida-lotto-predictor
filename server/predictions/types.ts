export interface HistoryDraw {
  mainNumbers: number[];
  specialNumbers: number[];
  drawDate: number;
}

export interface DataCheck {
  sufficient: boolean;
  available: number;
  required: number;
}
