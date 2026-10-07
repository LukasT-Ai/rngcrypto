import { permanentRedirect } from "next/navigation"

// The Strike agent dashboard was retired; its signals live on the Strike signals page.
export default function Page() {
  permanentRedirect("/signals/strike")
}
