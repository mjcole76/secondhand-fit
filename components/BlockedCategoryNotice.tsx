import Link from "next/link";

import { SCOPE_STATEMENT_PATH, refusalHeadline, type BlockedCategory } from "@/lib/listings/categories";

interface Props {
  category: BlockedCategory;
  id?: string;
}

/** Refusal shown at listing creation when the chosen category is on the refused list. */
export function BlockedCategoryNotice({ category, id }: Props) {
  return (
    <div id={id} className="banner bad" role="alert">
      <p>{refusalHeadline(category)}</p>
      <p className="banner-detail">{category.reason}</p>
      <p className="banner-detail">
        No listing is created and no photo is requested for this category.{" "}
        <Link href={SCOPE_STATEMENT_PATH}>Read the scope statement</Link>
      </p>
    </div>
  );
}
