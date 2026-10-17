import type { ListingReadiness } from "@/lib/listings/contracts";

interface Props {
  readiness: ListingReadiness;
  /**
   * "listing" is the badge a published listing carries. "attempt" is the same grade shown to the
   * seller for one photo, which may have been rejected, so it does not say "ready".
   */
  variant?: "listing" | "attempt";
}

/**
 * The try-on readiness badge: the grade as a letter and in words, the reason it is not higher, and
 * the weakest check by name. The one way a listing's grade is put on screen, so a tile and the
 * listing page cannot word it differently.
 */
export function ReadinessBadge({ readiness }: Props) {
  return (
    <div className="readiness-badge">
      <p className="render-badge">
        <span className={`grade-pill grade-${readiness.grade}`} aria-hidden="true">
          {readiness.grade}
        </span>
        <strong>
          Source photo checks: grade {readiness.grade}
        </strong>
      </p>
      <details className="badge-details"><summary>Why this grade?</summary><p>{readiness.reason} {readiness.weakestNote}</p><p className="muted">Provisional photo checks. This is not a score for the garment or the generated preview.</p></details>
    </div>
  );
}
