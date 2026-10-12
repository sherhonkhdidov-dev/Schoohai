export type HomeworkResult = {
  isHomeworkPhoto: boolean;
  stars: number;
  exercisesExpected: number | null;
  exercisesDone: number;
  allDone: boolean;
  understood: boolean;
  mistakes: string[];
  copyRisk: number;
  copyReasons: string[];
  feedback: string[];
};

export type HandwritingResult = {
  isHandwriting: boolean;
  score: number;
  legibility: number;
  evenness: number;
  tips: { letter: string; tip: string }[];
  summary: string;
};

export type Task = { id: string; subject: string; text: string; at: number };
export type HwLog = { at: number; stars: number; seconds: number };
export type HelpRequest = { id: string; child: string; subject: string; taskText: string; mistakes: string[]; at: number; videoId?: string; answeredAt?: number };

/* ---- check history ---- */
export type HistoryHw = {
  id: string; subject: string | null; stars: number; allDone: boolean; understood: boolean;
  exercisesDone: number; exercisesExpected: number | null; copyRisk: number; seconds: number;
  mistakes: string[]; feedback: string[]; at: string;
};
export type HistoryHand = { id: string; score: number; summary: string; at: string };
export type HistoryReview = { id: string; verdict: string; risk: number; summary: string; reasons: string[]; at: string };
export type HistoryData = { child: string; homework: HistoryHw[]; handwriting: HistoryHand[]; reviews: HistoryReview[] };
