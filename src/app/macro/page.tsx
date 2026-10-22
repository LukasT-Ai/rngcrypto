import { permanentRedirect } from "next/navigation"

// Macro now lives in the Macro tab of the signals page.
export default function Page() {
  permanentRedirect("https://cloveup.com/patch")
}
