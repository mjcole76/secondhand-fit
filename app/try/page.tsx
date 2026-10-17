import Link from "next/link";
import { cookies } from "next/headers";
import { notFound } from "next/navigation";

import { TryOnRunner } from "@/components/TryOnRunner";
import { findPublishedListing } from "@/lib/listings/published";
import { consentExpiresAt, findCurrentConsent, parseListingId } from "@/lib/tryon/consent";
import { CONSENT_SCOPE_VERSION, type ConsentStatusResponse } from "@/lib/tryon/contracts";
import { servingState } from "@/lib/tryon/guard";
import { SESSION_COOKIE, sessionKeyFromCookie } from "@/lib/tryon/session";
import { describeAdapter } from "@/lib/youcam/adapter";

export const dynamic = "force-dynamic";

export default async function TryPage({ searchParams }: { searchParams: Promise<{ listing?: string | string[] }> }) {
  const { listing: listingParam } = await searchParams;
  const listingId = parseListingId(Array.isArray(listingParam) ? listingParam[0] : listingParam);
  const listing = listingId ? findPublishedListing(listingId) : undefined;
  if (listingId === undefined || (listingId !== null && !listing)) notFound();

  const adapter = describeAdapter();
  const jar = await cookies();
  const sessionKey = sessionKeyFromCookie(jar.get(SESSION_COOKIE)?.value);
  const serving = servingState(sessionKey);
  const record = findCurrentConsent(sessionKey, listingId);
  const consent: ConsentStatusResponse = record
    ? {
        consented: true,
        scopeVersion: record.scopeVersion,
        listingId,
        acceptedAt: record.acceptedAt,
        expiresAt: consentExpiresAt(record),
      }
    : { consented: false, scopeVersion: CONSENT_SCOPE_VERSION, listingId };

  return (
    <>
      {listing ? (
        <p>
          <Link href={`/listings/${encodeURIComponent(listing.id)}`}>← Back to {listing.title}</Link>
        </p>
      ) : null}
      <p className="eyebrow">Your next secondhand find</p>
      <h1>See the possibility.</h1>
      <p className="lede">
        One piece. Your photo. An appearance preview powered by YouCam.
      </p>
      <TryOnRunner
        key={listingId ?? "standalone"}
        listingImageUrl={listing?.image?.url ?? null}
        serving={serving}
        timeoutMs={adapter.pollTimeoutMs}
        listingId={listingId}
        listingTitle={listing?.title ?? null}
        initialConsent={consent}
      />
    </>
  );
}
