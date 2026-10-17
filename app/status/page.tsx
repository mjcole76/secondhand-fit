import { cookies } from "next/headers";

import { ModeBanner } from "@/components/ModeBanner";
import { servingState } from "@/lib/tryon/guard";
import { SESSION_COOKIE, sessionKeyFromCookie } from "@/lib/tryon/session";
import { describeAdapter, refreshFeatureCost } from "@/lib/youcam/adapter";
import { ledgerSummary } from "@/lib/youcam/ledger";

export const dynamic = "force-dynamic";

export default async function StatusPage() {
  await refreshFeatureCost();
  const adapter = describeAdapter();
  const ledger = ledgerSummary();
  const jar = await cookies();
  const serving = servingState(sessionKeyFromCookie(jar.get(SESSION_COOKIE)?.value));
  const fallbackReasons = Object.entries(ledger.fallbackReasons);

  return (
    <>
      <h1>Status</h1>
      <p className="lede">
        How the next try-on will be served, the unit budget and the pinned adapter facts. No secrets are shown here.
      </p>

      <ModeBanner heading="Mode" mode={serving.mode} detail={serving.detail} legend />

      <section className="card">
        <h2>Unit budget</h2>
        <dl className="kv">
          <dt>Band</dt>
          <dd>{ledger.band}</dd>
          <dt>Budget</dt>
          <dd>{ledger.budget} units</dd>
          <dt>Spent (estimate)</dt>
          <dd>
            {ledger.spent} units{ledger.baseline > 0 ? `, of which ${ledger.baseline} from before this process` : ""}
          </dd>
          <dt>Remaining (estimate)</dt>
          <dd>{ledger.remainingEstimate} units</dd>
          <dt>Calls this process</dt>
          <dd>
            live {ledger.liveCalls} · cached {ledger.cacheCalls} · precomputed {ledger.precomputedCalls} · mock{" "}
            {ledger.mockCalls}
          </dd>
          <dt>Precomputed runs by reason</dt>
          <dd>
            {fallbackReasons.length > 0
              ? fallbackReasons.map(([reason, count]) => `${reason} ${count}`).join(" · ")
              : "none yet"}
          </dd>
          <dt>Reservations handed back</dt>
          <dd>{ledger.releasedCalls} (the API errored before a task existed, so no unit was spent)</dd>
        </dl>
        <p className="muted">
          The budget is checked before every try-on, and a try-on that would go over it is served as a precomputed
          example without an API call. Spend is an estimate until observed unit cost is captured from live task
          responses. The ledger is in-memory until the database lands, so it resets when the server restarts; spend
          from before a restart only counts if the operator enters it as the baseline.
        </p>
      </section>

      <section className="card">
        <h2>Fair-use cap for this browser session</h2>
        <dl className="kv">
          <dt>Cap</dt>
          <dd>
            {serving.session.cap} try-on renders in any {serving.session.windowHours} hours
          </dd>
          <dt>Used</dt>
          <dd>{serving.session.used}</dd>
          <dt>Left</dt>
          <dd>{serving.session.remaining}</dd>
        </dl>
        <p className="muted">
          Counted with an anonymous cookie that is set when a try-on is run; only a hash of it is kept. Past the cap a
          precomputed example is shown and labelled as not live.
        </p>
      </section>

      <section className="card">
        <h2>Adapter pins</h2>
        <dl className="kv">
          <dt>Provider</dt>
          <dd>{adapter.provider}</dd>
          <dt>Base URL</dt>
          <dd>{adapter.baseUrl}</dd>
          <dt>API version</dt>
          <dd>{adapter.apiVersion}</dd>
          <dt>Authentication</dt>
          <dd>{adapter.auth}</dd>
          <dt>Endpoints</dt>
          <dd>
            {adapter.endpoints.map((e) => (
              <span key={e.name}>
                {e.name}: <code>{`${e.method} ${e.path}`}</code>
                <br />
              </span>
            ))}
          </dd>
          <dt>Feature slug</dt>
          <dd>{adapter.feature}</dd>
          <dt>Garment category</dt>
          <dd>
            {adapter.category} (one of {adapter.categories.join(", ")})
            {adapter.categoryNote ? ` — ${adapter.categoryNote}` : ""}
          </dd>
          <dt>Input limits</dt>
          <dd>{adapter.inputLimits} Checked before any request is sent.</dd>
          <dt>Provider error codes with their own message</dt>
          <dd>{adapter.errorCodes.join(", ")}</dd>
          <dt>Poll timeout</dt>
          <dd>{Math.round(adapter.pollTimeoutMs / 1000)} s</dd>
          <dt>Per-request timeout</dt>
          <dd>{Math.round(adapter.requestTimeoutMs / 1000)} s</dd>
          <dt>Estimated units per render</dt>
          <dd>{adapter.estimatedUnitCost} (YOUCAM_VTO_UNIT_COST, used by the budget guard)</dd>
          <dt>Unit cost reported by the API</dt>
          <dd>
            {adapter.featureCost.state === "ok" ? `${adapter.featureCost.units} — ` : ""}
            {adapter.featureCost.detail}
            {adapter.featureCost.checkedAt ? ` (checked ${adapter.featureCost.checkedAt})` : ""}
          </dd>
          <dt>Credentials configured</dt>
          <dd>{adapter.credentialsConfigured ? "yes" : "no"}</dd>
          <dt>Live render confirmed</dt>
          <dd>{adapter.liveRenderConfirmed ? "yes" : "not yet"}</dd>
        </dl>
        <p className="muted">{adapter.verificationNote}</p>
      </section>

      <section className="card">
        <h2>Observed live responses</h2>
        {adapter.observedResponses.length === 0 ? (
          <p className="muted">
            None in this server process yet. After one live try-on on /try, the shape of each YouCam API response
            appears here, ready to compare with the pins above and to replace the fixture of the same name in
            lib/youcam/fixtures/.
          </p>
        ) : (
          <>
            <p className="muted">
              The latest response of each kind, with strings replaced by their length except short enum-like words.
              No credential, file id, task id or URL is shown. Held in memory, so a restart clears it.
            </p>
            {adapter.observedResponses.map((o) => (
              <details key={o.fixture}>
                <summary>
                  {o.fixture}.json — HTTP {o.httpStatus}, {o.observedAt}
                </summary>
                <pre>{JSON.stringify(o.shape, null, 2)}</pre>
              </details>
            ))}
          </>
        )}
      </section>
    </>
  );
}
