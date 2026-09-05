export interface ReviewResult {
  intervalDays: number;
  repetitions: number;
  easeFactor: number;
  nextReviewDate: Date;
}

export function calculateNextReview(
  currentInterval: number,
  currentRepetitions: number,
  currentEaseFactor: number,
  score: number, // 0 to 5
  now: Date = new Date()
): ReviewResult {
  let intervalDays: number;
  let repetitions: number;
  let easeFactor: number;

  if (score >= 3) {
    if (currentRepetitions === 0) {
      intervalDays = 1;
    } else if (currentRepetitions === 1) {
      intervalDays = 6;
    } else {
      intervalDays = Math.round(currentInterval * currentEaseFactor);
    }
    repetitions = currentRepetitions + 1;
  } else {
    intervalDays = 1;
    repetitions = 0;
  }
  easeFactor = currentEaseFactor + (0.1 - (5 - score) * (0.08 + (5 - score) * 0.02));

  if (easeFactor < 1.3) {
    easeFactor = 1.3;
  }

  const nextReviewDate = new Date(now.getTime());
  nextReviewDate.setDate(nextReviewDate.getDate() + intervalDays);

  return {
    intervalDays,
    repetitions,
    easeFactor,
    nextReviewDate
  };
}
