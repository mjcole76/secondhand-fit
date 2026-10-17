/**
 * Garment categories a listing can be created under, and the ones that are refused.
 *
 * Single source for the category picker on /sell/new, the server-side refusal in
 * POST /api/listings and POST /api/readiness, and the scope statement published on /methods.
 * Imported by browser and server code, so it must stay free of server-only imports.
 */

/** Bumped whenever the refused list or its wording changes. */
export const SCOPE_STATEMENT_VERSION = "2026-10-01.v1";

/** Where the scope statement is published in-product. */
export const SCOPE_STATEMENT_PATH = "/methods#scope";

/**
 * Why a category is refused. "product_policy" is a deliberate exclusion; "not_supported" is a
 * category the try-on does not handle yet (the adapter sends upper-body garments only).
 */
export type BlockBasis = "product_policy" | "not_supported";

export interface OpenCategory {
  id: string;
  label: string;
  examples: string;
  blocked: false;
}

export interface BlockedCategory {
  id: string;
  label: string;
  examples: string;
  blocked: true;
  basis: BlockBasis;
  /** Plain-language explanation shown with the refusal and on the scope statement. */
  reason: string;
}

export type ListingCategory = OpenCategory | BlockedCategory;

const NOT_SUPPORTED_REASON =
  "The try-on currently handles upper-body garments only, so no preview can be made for this category.";

export const LISTING_CATEGORIES: readonly ListingCategory[] = [
  { id: "tops", label: "Tops and T-shirts", examples: "T-shirts, polo shirts, long-sleeved tops", blocked: false },
  { id: "shirts", label: "Shirts and blouses", examples: "button-up shirts, blouses", blocked: false },
  { id: "knitwear", label: "Knitwear and sweatshirts", examples: "jumpers, cardigans, hoodies", blocked: false },
  { id: "outerwear", label: "Jackets and coats", examples: "jackets, blazers, coats", blocked: false },
  {
    id: "intimates",
    label: "Intimates",
    examples: "underwear, bras, lingerie, shapewear",
    blocked: true,
    basis: "product_policy",
    reason:
      "A try-on preview for underwear or lingerie would mean generating an image of a buyer wearing it from their photo. Secondhand Fit does not generate those images, so this category is refused.",
  },
  {
    id: "swim",
    label: "Swimwear",
    examples: "swimsuits, bikinis, swim shorts",
    blocked: true,
    basis: "product_policy",
    reason:
      "A try-on preview for swimwear would mean generating an image of a buyer wearing it from their photo. Secondhand Fit does not generate those images, so this category is refused.",
  },
  {
    id: "bottoms",
    label: "Trousers, skirts and shorts",
    examples: "jeans, trousers, skirts, shorts",
    blocked: true,
    basis: "not_supported",
    reason: NOT_SUPPORTED_REASON,
  },
  {
    id: "dresses",
    label: "Dresses and jumpsuits",
    examples: "dresses, jumpsuits, dungarees",
    blocked: true,
    basis: "not_supported",
    reason: NOT_SUPPORTED_REASON,
  },
  {
    id: "footwear_accessories",
    label: "Shoes, bags and accessories",
    examples: "shoes, bags, hats, scarves, jewellery",
    blocked: true,
    basis: "not_supported",
    reason: NOT_SUPPORTED_REASON,
  },
];

export const OPEN_CATEGORIES = LISTING_CATEGORIES.filter((c): c is OpenCategory => !c.blocked);
export const BLOCKED_CATEGORIES = LISTING_CATEGORIES.filter((c): c is BlockedCategory => c.blocked);

/**
 * Whether the refused list has been checked against the YouCam API and Perfect Corp. terms.
 * UNVERIFIED: the terms have not been read for restricted garment categories yet. When they have,
 * add any excluded category above with basis "product_policy", flip `verified`, and bump
 * SCOPE_STATEMENT_VERSION.
 */
export const PROVIDER_TERMS_CHECK = {
  verified: false,
  note: "The refused list has not yet been checked against the YouCam API and Perfect Corp. terms of service. Any garment category those terms exclude will be added to it.",
} as const;

export function findCategory(id: string): ListingCategory | undefined {
  return LISTING_CATEGORIES.find((c) => c.id === id);
}

/** Heading line of a refusal, e.g. "Swimwear cannot be listed." */
export function refusalHeadline(category: BlockedCategory): string {
  return `${category.label} cannot be listed${category.basis === "not_supported" ? " yet" : ""}.`;
}
