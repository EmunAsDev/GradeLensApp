/*
 * GradeLens Course Test visual identity.
 *
 * A Course Test receives one stable accent color based on its
 * crs_tst_id. This intentionally does NOT use Math.random().
 *
 * Why:
 * - Math.random() would change the color after re-render/app restart.
 * - This function gives the same Course Test the same color everywhere.
 * - The Course Test list and Course Test detail header can therefore
 *   share one visual identity without adding a database column.
 *
 * All colors stay close to the GradeLens maroon / wine family and are
 * dark enough to support white text.
 */
export const COURSE_TEST_ACCENT_COLORS = [
  "#AF2532", // GradeLens maroon
  "#963743", // deep rose
  "#85404A", // muted burgundy
  "#A04745", // warm brick
  "#7E4652", // dusty wine
  "#A23D52", // cranberry
  "#76505A", // muted plum
  "#91505B", // rosewood
] as const;

export type CourseTestAccentColor = (typeof COURSE_TEST_ACCENT_COLORS)[number];

/*
 * Stable integer mixer.
 *
 * Consecutive IDs do not simply walk through the palette in order,
 * which makes the assignment feel more naturally varied while still
 * remaining deterministic.
 */
function mixCourseTestId(courseTestId: number): number {
  const safeId = Number.isFinite(courseTestId)
    ? Math.abs(Math.trunc(courseTestId))
    : 0;

  let value = safeId + 0x9e3779b9;

  value ^= value >>> 16;

  value = Math.imul(value, 0x85ebca6b);

  value ^= value >>> 13;

  value = Math.imul(value, 0xc2b2ae35);

  value ^= value >>> 16;

  return value >>> 0;
}

export function getCourseTestAccentColor(
  courseTestId: number,
): CourseTestAccentColor {
  const index =
    mixCourseTestId(courseTestId) % COURSE_TEST_ACCENT_COLORS.length;

  return COURSE_TEST_ACCENT_COLORS[index];
}

/*
 * Same initials behavior used by the Course cards:
 *
 * "First Examination - Database 1"
 * -> "FE"
 *
 * "Midterm Examination"
 * -> "ME"
 *
 * "Midterm"
 * -> "MI"
 */
export function getCourseTestInitials(
  title: string | null | undefined,
): string {
  const cleaned = title?.trim() ?? "";

  if (!cleaned) {
    return "CT";
  }

  const words = cleaned
    .replace(/[^A-Za-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter(Boolean);

  if (words.length >= 2) {
    return (words[0][0] + words[1][0]).toUpperCase();
  }

  const compact = cleaned.replace(/[^A-Za-z0-9]/g, "");

  return compact.slice(0, 2).toUpperCase() || "CT";
}
