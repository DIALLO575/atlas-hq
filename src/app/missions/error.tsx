"use client";

import { ErrorState } from "@/components/route-states";

export default function Error({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <ErrorState reset={reset}/>;
}
