import { permanentRedirect } from "next/navigation"

// The Hyperliquid agent dashboard was retired; HYPE is covered on the Strike signals page.
export default function Page() {
  permanentRedirect("/signals/strike")
}
