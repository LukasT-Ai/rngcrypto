import { permanentRedirect } from "next/navigation"

// News now lives in the Macro tab of the signals page.
export default function Page() {
  permanentRedirect("/signals/strike#macro")
}
