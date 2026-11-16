/** Locked taxonomy (spec §2). Breaking is a flag, not a category. */
export const CATEGORIES = [
  'Geopolitics', 'India', 'USA', 'Canada', 'Portland', 'Football',
  'Books', 'Work', 'Science', 'Other',
] as const;

export type Category = (typeof CATEGORIES)[number];

export const BREAKING = 'Breaking';

/** Clef choice criteria: keys are clef labels, values describe them. */
export const CLEF_CRITERIA: Record<string, string> = {
  geopolitics: 'International relations, war, diplomacy, trade between nations, global politics',
  india: 'India-specific news, Indian politics, economy, society',
  usa: 'United States national news, US politics, policy, economy',
  canada: 'Canada-specific news',
  portland: 'Portland, Oregon local news',
  football: 'Association football (soccer) only; no other sports',
  books: 'Books, literary fiction, publishing, authors, reviews',
  work: 'Software engineering, distributed systems, cloud infrastructure, programming',
  science: 'Scientific research, health, environment, space, technology science',
  other: 'Anything else, including non-football sports',
};

export const CLEF_TO_CATEGORY: Record<string, Category> = {
  geopolitics: 'Geopolitics', india: 'India', usa: 'USA', canada: 'Canada',
  portland: 'Portland', football: 'Football', books: 'Books', work: 'Work',
  science: 'Science', other: 'Other',
};

export const SECTION_ORDER = [BREAKING, ...CATEGORIES] as const;
