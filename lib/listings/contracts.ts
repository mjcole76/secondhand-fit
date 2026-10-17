/**
 * Shared request/response shapes for listing creation and publishing. Imported by the route
 * handlers and the client components, so it must stay free of server-only imports.
 */

import type { CheckId, CheckReason, CheckResult, Verdict } from "@/lib/readiness/contracts";
import { gradeReason, type GradedReadiness, type ReadinessGrade } from "@/lib/readiness/grade";

import {
  SCOPE_STATEMENT_PATH,
  SCOPE_STATEMENT_VERSION,
  refusalHeadline,
  type BlockBasis,
  type BlockedCategory,
} from "./categories";

export const LISTING_LIMITS = { titleMaxChars: 80, sizeTextMaxChars: 40 } as const;

/** POST /api/listings body. */
export interface ListingCreateRequest {
  title: string;
  /** A category id from LISTING_CATEGORIES. */
  category: string;
  /** Size exactly as the seller typed it. Stored as text and never interpreted. */
  sizeText?: string;
}

export interface DraftListing {
  id: number;
  title: string;
  category: string;
  categoryLabel: string;
  sizeText: string | null;
  status: "draft";
  createdAt: string;
}

export interface ListingCreateResponse {
  listing: DraftListing;
}

/** 422 body when the category is on the refused list. Nothing is created or stored. */
export interface CategoryRefusedResponse {
  error: string;
  code: "category_blocked";
  category: { id: string; label: string };
  basis: BlockBasis;
  reason: string;
  /** In-product location of the scope statement the refusal comes from. */
  scopeUrl: string;
  scopeVersion: string;
  listingCreated: false;
}

export interface ListingCheckScore {
  id: CheckId;
  label: string;
  /** 0–100, higher is better. */
  score: number;
  verdict: Verdict;
  summary: string;
}

/** The try-on readiness grade a listing carries, with the per-check breakdown it was read from. */
export interface ListingReadiness {
  grade: ReadinessGrade;
  /** The check that decides the grade. */
  weakestCheck: CheckId;
  weakestReason: CheckReason;
  /** False when other checks have the same verdict and score, so the grade does not hang on one check alone. */
  weakestUnique: boolean;
  /** Why the grade is not higher. */
  reason: string;
  /** Names the weakest check and its score, whatever the grade. Empty when the photo was not scored. */
  weakestNote: string;
  checks: ListingCheckScore[];
  thresholdVersion: string;
}

/**
 * Builds the badge content from a graded attempt, in the reviewed copy from lib/readiness. The
 * grade itself comes from gradeReadiness; nothing here can raise or lower it.
 */
export function listingReadiness(
  graded: GradedReadiness,
  checks: readonly CheckResult[],
  thresholdVersion: string,
): ListingReadiness {
  const weakest = checks.find((c) => c.id === graded.weakestCheck);
  // Checks level with the weakest one. When there are several, no single check is singled out.
  const level = weakest ? checks.filter((c) => c.verdict === weakest.verdict && c.score === weakest.score) : [];
  const weakestNote = !weakest?.assessed
    ? ""
    : level.length === 1
      ? `Weakest check: ${weakest.label}, ${weakest.score}/100.`
      : level.length === checks.length
        ? `Every check scored ${weakest.score}/100.`
        : `Lowest score, ${weakest.score}/100, shared by: ${level.map((c) => c.label).join(", ")}.`;
  return {
    grade: graded.grade,
    weakestCheck: graded.weakestCheck,
    weakestReason: graded.weakestReason,
    weakestUnique: level.length === 1,
    reason: gradeReason(graded),
    weakestNote,
    checks: checks.map((c) => ({ id: c.id, label: c.label, score: c.score, verdict: c.verdict, summary: c.summary })),
    thresholdVersion,
  };
}

/** Where a demo listing's picture came from and the licence it is used under. */
export interface ImageProvenance {
  /** Only drawings made by this project's own code exist so far; no photograph is used. */
  kind: "drawing";
  /** Who made it and how, in plain words. */
  author: string;
  /** The source file whose code draws the picture. */
  madeBy: string;
  licence: string;
  /** Where the picture's row in the asset register is. */
  register: string;
}

/** The rejected photo a demo listing's picture is the retake of. It is never published. */
export interface RejectedFirstAttempt {
  title: string;
  image: { url: string; alt: string; width: number; height: number };
  provenance: ImageProvenance;
  /** Grade the rejected photo was given by the same code: always C. */
  readiness: ListingReadiness;
  /** Titles of the retake instructions it got, in order. */
  instructions: string[];
  /** Where the rejection and the retake can be run again without uploading anything. */
  reproduceUrl: string;
}

export interface PublishedListing {
  /** The draft's id as text, or a fixed id for a listing of the seeded demo set. */
  id: string;
  title: string;
  category: string;
  categoryLabel: string;
  /** Size exactly as the seller typed it. Shown as text and never interpreted. */
  sizeText: string | null;
  status: "published";
  /** True when the picture is one of the seeded drawings, not a seller's photograph. */
  isDemo: boolean;
  /** Stored normalised seller image, or a seeded demo image. Null only for legacy entries. */
  image: { url: string; alt: string; width: number; height: number } | null;
  /** Licence and origin of a seeded picture. Null for a seller's own photo. */
  provenance: ImageProvenance | null;
  /** For a seeded demo listing made from a retake: the rejected first attempt. Otherwise null. */
  retakeOf: RejectedFirstAttempt | null;
  readiness: ListingReadiness;
  /** Null for a listing of the seeded demo set, which is not published by anyone. */
  publishedAt: string | null;
}

/** GET /api/listings body. */
export interface ListingsResponse {
  listings: PublishedListing[];
}

/** POST /api/listings/[id]/publish body on success. */
export interface ListingPublishResponse {
  listing: PublishedListing;
}

/** 409 body when a draft cannot be published. The listing stays a draft. */
export interface PublishRefusedResponse {
  error: string;
  code: "no_readiness_run" | "readiness_not_accepted" | "photo_not_prepared";
  /** Grade of the refused attempt, when there was one. */
  grade: ReadinessGrade | null;
  published: false;
}

export function categoryRefusal(category: BlockedCategory): CategoryRefusedResponse {
  return {
    error: `${refusalHeadline(category)} ${category.reason}`,
    code: "category_blocked",
    category: { id: category.id, label: category.label },
    basis: category.basis,
    reason: category.reason,
    scopeUrl: SCOPE_STATEMENT_PATH,
    scopeVersion: SCOPE_STATEMENT_VERSION,
    listingCreated: false,
  };
}
