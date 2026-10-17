import type { SeededFixtureCard } from "@/components/ReadinessChecker";
import { SellerListingFlow } from "@/components/SellerListingFlow";
import { analyseFlatLay } from "@/lib/readiness/analyse";
import { SEEDED_FIXTURE_NAMES, renderSeededFixture, seededFixtureInfo } from "@/lib/readiness/seeded";

/** Outcome of each seeded example, computed here by the same scoring code the browser runs. */
function seededCards(): SeededFixtureCard[] {
  return SEEDED_FIXTURE_NAMES.map((name) => {
    const expected = analyseFlatLay(renderSeededFixture(name));
    const count = expected.instructions.length;
    return {
      ...seededFixtureInfo(name),
      expectedSummary: expected.accepted
        ? "Expected outcome: accepted."
        : `Expected outcome: rejected with ${count} retake ${count === 1 ? "instruction" : "instructions"}.`,
    };
  });
}

export default function SellNewPage() {
  return (
    <>
      <p className="eyebrow">For the next owner</p>
      <h1>Make your piece easier to picture.</h1>
      <p className="lede">
        Add the details, then check your garment photo. You’ll get clear retake guidance before any API units are spent.
      </p>
      <SellerListingFlow fixtures={seededCards()} />
    </>
  );
}
