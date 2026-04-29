import { NextRequest, NextResponse } from "next/server"

export async function POST(req: NextRequest) {
  try {
    const { email } = await req.json()

    if (!email || !email.includes("@")) {
      return NextResponse.json({ error: "Invalid email" }, { status: 400 })
    }

    const BEEHIIV_API_KEY = process.env.BEEHIIV_API_KEY
    const BEEHIIV_PUBLICATION_ID = process.env.BEEHIIV_PUBLICATION_ID

    if (!BEEHIIV_API_KEY || !BEEHIIV_PUBLICATION_ID) {
      // Fallback: log subscription for now
      console.log(`[Newsletter] New subscriber: ${email}`)
      return NextResponse.json({ success: true, message: "Subscribed (pending Beehiiv setup)" })
    }

    const res = await fetch(
      `https://api.beehiiv.com/v2/publications/${BEEHIIV_PUBLICATION_ID}/subscriptions`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${BEEHIIV_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          email,
          reactivate_existing: true,
          send_welcome_email: true,
        }),
      }
    )

    if (!res.ok) {
      const err = await res.text()
      console.error("[Newsletter] Beehiiv error:", err)
      return NextResponse.json({ error: "Subscription failed" }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error("[Newsletter] Error:", err)
    return NextResponse.json({ error: "Server error" }, { status: 500 })
  }
}
