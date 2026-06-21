/**
 * /api/webhook.js
 *
 * Meta WhatsApp webhook — two jobs:
 *   GET  — verify webhook (Meta calls this once during setup)
 *   POST — receive incoming messages and reply
 *
 * ENV vars needed in Vercel dashboard:
 *   WHATSAPP_TOKEN        — access token from Meta API Setup
 *   WHATSAPP_PHONE_ID     — Phone Number ID from Meta API Setup
 *   WHATSAPP_VERIFY_TOKEN — any random string you choose (e.g. "mandi123")
 *   FIREBASE_PROJECT_ID   — from Firebase console
 *   FIREBASE_CLIENT_EMAIL — from Firebase service account
 *   FIREBASE_PRIVATE_KEY  — from Firebase service account (with \n)
 */

import { getConversationState, saveConversationState, savePartyToFirebase } from "./wa-helpers.js";
import { handleMessage } from "./wa-conversation.js";

export default async function handler(req, res) {

  // ── GET: Webhook verification ─────────────────────────────────────────────
  if (req.method === "GET") {
    const mode      = req.query["hub.mode"];
    const token     = req.query["hub.verify_token"];
    const challenge = req.query["hub.challenge"];

    if (mode === "subscribe" && token === process.env.WHATSAPP_VERIFY_TOKEN) {
      console.log("Webhook verified ✅");
      return res.status(200).send(challenge);
    }
    return res.status(403).json({ error: "Forbidden" });
  }

  // ── POST: Incoming message ────────────────────────────────────────────────
  if (req.method === "POST") {
    try {
      const body = req.body;

      // Extract message from Meta's payload
      const entry   = body?.entry?.[0];
      const changes = entry?.changes?.[0];
      const value   = changes?.value;
      const message = value?.messages?.[0];

      // Ignore non-message webhooks (status updates etc)
      if (!message) return res.status(200).json({ status: "ok" });

      const from = message.from;                          // sender's phone e.g. "919876543210"
      const text = message.text?.body?.trim() || "";      // message text

      console.log(`Message from ${from}: ${text}`);

      // Get current conversation state for this user
      const state = await getConversationState(from);

      // Process message and get reply + new state
      const { reply, newState, partyData } = await handleMessage(text, state, from);

      // If party is complete — save to Firebase
      if (partyData) {
        await savePartyToFirebase(from, partyData);
      }

      // Save updated conversation state
      await saveConversationState(from, newState);

      // Send reply back to user
      await sendWhatsAppMessage(from, reply);

      return res.status(200).json({ status: "ok" });
    } catch (err) {
      console.error("Webhook error:", err);
      return res.status(500).json({ error: err.message });
    }
  }

  return res.status(405).json({ error: "Method not allowed" });
}

// ── Send WhatsApp message via Meta API ───────────────────────────────────────

async function sendWhatsAppMessage(to, text) {
  const url = `https://graph.facebook.com/v19.0/${process.env.WHATSAPP_PHONE_ID}/messages`;

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${process.env.WHATSAPP_TOKEN}`,
      "Content-Type":  "application/json",
    },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      to,
      type: "text",
      text: { body: text },
    }),
  });

  if (!response.ok) {
    const err = await response.json();
    throw new Error(`WhatsApp send failed: ${JSON.stringify(err)}`);
  }

  return response.json();
}
