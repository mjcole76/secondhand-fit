import { SERVING_MODE_ORDER, SERVING_MODES, type ServingMode } from "@/lib/tryon/contracts";

interface Props {
  /** Leading word: "Mode" for how the next try-on will be served, "Source" for a result on screen. */
  heading: string;
  mode: ServingMode;
  detail?: string;
  /** Lists all four modes under the banner and marks the current one in words. */
  legend?: boolean;
}

/** Names the serving mode — live, cached, precomputed or mock — in text, never by colour alone. */
export function ModeBanner({ heading, mode, detail, legend = false }: Props) {
  const tone = mode === "live" ? "ok" : mode === "precomputed" ? "warn" : "info";
  return (
    <div className={`banner ${tone}`} role="status">
      <p>
        {heading}: {SERVING_MODES[mode].label}
      </p>
      {detail ? <p className="banner-detail">{detail}</p> : null}
      {legend ? (
        <ul className="mode-legend" aria-label="All serving modes">
          {SERVING_MODE_ORDER.map((m) => (
            <li key={m} aria-current={m === mode ? "true" : undefined}>
              <strong>
                {SERVING_MODES[m].name}
                {m === mode ? " (current)" : ""}
              </strong>{" "}
              — {SERVING_MODES[m].meaning}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
