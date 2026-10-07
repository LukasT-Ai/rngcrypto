import { permanentRedirect } from "next/navigation"

// The daytrader bot page was retired in favour of the signal pages.
export default function Page() {
  permanentRedirect("/signals/strike")
}
