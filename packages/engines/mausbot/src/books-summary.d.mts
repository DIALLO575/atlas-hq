type BookSession = { day: string; seconds: number };
type BookState = { position?: number; pages_read?: number | null };
type SummaryBook = { status?: string; book_reading_state?: BookState[] };
export function calculateBooksSummary(input: {
  today: string;
  sessions: BookSession[];
  books: SummaryBook[];
  goalMinutes?: number;
}): {
  today: string;
  goalMinutes: number;
  goalSeconds: number;
  todaySeconds: number;
  sevenDaySeconds: number;
  dailySeconds: Record<string, number>;
  totalBooks: number;
  finishedBooks: number;
  pagesPerHour: number;
  streakDays: number;
};
