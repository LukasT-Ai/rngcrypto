import { permanentRedirect } from "next/navigation"

// The Ascend agent dashboard was retired; its signals live on the Ascend signals page.
export default function Page() {
  permanentRedirect("/signals/ascend")
}
