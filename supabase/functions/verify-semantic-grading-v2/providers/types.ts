export interface SemanticGradingQuestion {
  id: string;
  studentAnswer: string;
  correctAnswer: string;
  question?: string;
}

export interface SemanticGradingResult {
  id: string;
  isCorrect: boolean;
  reason: string;
}

export interface SemanticGradingProvider {
  name: string;
  gradeSemantics(questions: SemanticGradingQuestion[], prompt: string): Promise<SemanticGradingResult[]>;
}
