/**
 * Draft listings: one row per accepted "listing details" step.
 *
 * In-memory for now (resets when the server process restarts), like lib/readiness/runs.ts. The
 * Prisma-backed Listing table replaces the storage in a later build step. A refused category
 * never reaches this store.
 */

import type { OpenCategory } from "./categories";
import type { DraftListing } from "./contracts";

const MAX_DRAFTS = 500;

type DraftStore = { drafts: DraftListing[]; nextId: number };
const g = globalThis as unknown as { __draftListings?: DraftStore };

function store(): DraftStore {
  if (!g.__draftListings) g.__draftListings = { drafts: [], nextId: 1 };
  return g.__draftListings;
}

export function createDraftListing(input: {
  title: string;
  category: OpenCategory;
  sizeText: string | null;
}): DraftListing {
  const s = store();
  const draft: DraftListing = {
    id: s.nextId++,
    title: input.title,
    category: input.category.id,
    categoryLabel: input.category.label,
    sizeText: input.sizeText,
    status: "draft",
    createdAt: new Date().toISOString(),
  };
  s.drafts.push(draft);
  if (s.drafts.length > MAX_DRAFTS) s.drafts.splice(0, s.drafts.length - MAX_DRAFTS);
  return draft;
}

export function findDraftListing(id: number): DraftListing | undefined {
  return store().drafts.find((d) => d.id === id);
}

export function listDraftListings(): readonly DraftListing[] {
  return store().drafts;
}
