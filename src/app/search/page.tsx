import { requireUser } from "@/lib/auth";
import SearchClient from "@/app/search/search-client";

export const dynamic = "force-dynamic";

export default async function SearchPage() {
  await requireUser();
  return <SearchClient />;
}
