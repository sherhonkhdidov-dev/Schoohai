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
