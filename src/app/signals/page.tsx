import { redirect } from "next/navigation"

// The generic signals page was retired in favour of the venue pages; Strike carries the full market set.
export default function SignalsPage() {
  redirect("/signals/strike")
}
