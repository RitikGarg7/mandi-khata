/**
 * screens/Khata.jsx
 *
 * Party ledger screen — pure UI using useKhata hook.
 * Shows: balance, payment buttons, ledger entries, party info.
 * Byaaj amount is tappable → opens ByaajTrailPopover.
 */

import React, { useState } from 'react';
import { useKhata } from "../hooks/useKhata";
import { Shell, C, Card, TopBar, Btn, Field, Tag, fmt } from "../components/ui";
import PinConfirm from "../components/PinConfirm";
import { PAYMENT_TYPE_LABELS } from "../constants/index";

export default function Khata({ party, onBack }) {
  const k = useKhata(party);

  if (!party) return (
    <Shell>
      <TopBar title="Khata" onBack={onBack} />
      <p style={{ textAlign: "center", padding: 40, color: C.inkLight }}>Party nahi mili.</p>
    </Shell>
  );

  const isFarmer = party.type === "Farmer";
  const accent   = isFarmer ? C.pink : C.saffron;

  return (
    <Shell>
      {/* PIN confirm dialog */}
      {k.pinAction && (
        <PinConfirm
          prompt={k.pinAction === "delete" ? "Delete ke liye PIN" : "Edit ke liye PIN"}
          onConfirm={() => {
            const a = k.pinAction;
            k.setPinAction(null);
            a === "delete" ? k.handleDeleteEntry() : k.openEditEntry();
          }}
          onCancel={() => k.setPinAction(null)}
        />
      )}

      {/* Byaaj trail popover */}
      {k.showInterest && (
        <ByaajTrailPopover
          party={party}
          entryTrails={k.interestTrail}
          accruedInterest={k.accruedInterest}
          mode={k.interestMode}
          onModeChange={k.setInterestMode}
          onClose={() => k.setShowInterest(false)}
        />
      )}

      {/* Entry detail bottom sheet */}
      {k.selEntry && (
        <EntryDetailSheet
          entry={k.selEntry}
          accent={accent}
          onClose={() => k.setSelEntry(null)}
          onEdit={() => k.setPinAction("edit")}
          onDelete={() => k.setPinAction("delete")}
        />
      )}

      {/* ── HEADER ── */}
      <div style={{ background: accent }}>
        <TopBar title="Khata" onBack={onBack} bg="transparent" />
        <div style={{ padding: "10px 16px 20px" }}>
          <p style={{ color: "rgba(255,255,255,0.75)", fontSize: 12 }}>
            {isFarmer ? "👨‍🌾 Kisan" : "🏭 Buyer"} · {party.place} · {party.phone || "—"}
          </p>
          <h3 style={{ fontFamily: "'Baloo 2'", fontWeight: 800, fontSize: 22, color: C.white, marginTop: 4 }}>
            {party.name}
          </h3>

          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginTop: 8 }}>
            <div>
              <p style={{ color: "rgba(255,255,255,0.75)", fontSize: 11 }}>Current Balance</p>
              <p style={{ fontFamily: "'Baloo 2'", fontWeight: 800, fontSize: 28, color: C.white }}>
                ₹{fmt(k.displayBal)}
              </p>

              {/* Byaaj — tappable to open trail popover */}
              {k.accruedInterest > 0 && k.farmerOwes && (
                <button
                  onClick={() => k.setShowInterest(true)}
                  style={{ background: "rgba(255,255,255,0.15)", border: "1px solid rgba(255,255,255,0.3)",
                    borderRadius: 20, padding: "3px 10px", marginTop: 4, cursor: "pointer",
                    display: "flex", alignItems: "center", gap: 6 }}>
                  <span style={{ color: "rgba(255,255,255,0.9)", fontSize: 12 }}>
                    + ₹{fmt(k.accruedInterest)} byaaj
                  </span>
                  <span style={{ color: "rgba(255,255,255,0.6)", fontSize: 10 }}>tap karein →</span>
                </button>
              )}
              {k.arhtiyaOwes && party.interest_rate > 0 && (
                <p style={{ color: "rgba(255,255,255,0.75)", fontSize: 11, marginTop: 4 }}>
                  ✓ Byaaj free (farmer ka paisa hai)
                </p>
              )}
            </div>

            <Tag color={C.white} bg="rgba(255,255,255,0.2)">
              {k.displayBal === 0 ? "✓ Saaf"
                : k.arhtiyaOwes ? "Humara dena baaki"
                : isFarmer ? "Loan baaki" : "Lena baaki"}
            </Tag>
          </div>

          {/* Action buttons */}
          <button onClick={() => k.setShowPay(v => !v)}
            style={{ marginTop: 14, background: "rgba(255,255,255,0.18)",
              border: "1.5px solid rgba(255,255,255,0.35)", borderRadius: 10,
              padding: "10px 0", color: C.white, fontSize: 13, fontWeight: 600,
              width: "100%", cursor: "pointer" }}>
            💳 Payment Record Karein
          </button>
          {isFarmer && (
            <button onClick={() => k.setShowNakad(v => !v)}
              style={{ marginTop: 8, background: "rgba(255,255,255,0.12)",
                border: "1.5px solid rgba(255,255,255,0.25)", borderRadius: 10,
                padding: "10px 0", color: C.white, fontSize: 13, fontWeight: 600,
                width: "100%", cursor: "pointer" }}>
              💵 Nakad Dena (Cash Advance)
            </button>
          )}
        </div>
      </div>

      <div style={{ padding: "14px 14px 100px" }}>
        {k.error && (
          <div style={{ background: "#FDF0EE", border: `1px solid ${C.red}`, borderRadius: 10,
            padding: "10px 14px", marginBottom: 12, fontSize: 13, color: C.red, fontWeight: 600 }}>
            ⚠️ {k.error}
          </div>
        )}

        {/* Payment form */}
        {k.showPay && (
          <Card style={{ marginBottom: 14, border: `1.5px solid ${accent}` }}>
            <p style={{ fontSize: 13, fontWeight: 700, marginBottom: 12 }}>
              {k.editingPay ? "Payment Edit Karein" : "Payment / Receipt Record Karein"}
            </p>
            <Field label="Type" value={k.pay.type}
              onChange={v => { k.sp("type", v); k.sp("bank_party_id", ""); }}
              options={Object.entries(PAYMENT_TYPE_LABELS).map(([value, label]) => ({ value, label }))} />
            <Field label="Raqam" value={k.pay.amount} onChange={v => k.sp("amount", v)}
              type="number" prefix="₹" required />
            {["bank_receipt", "bank_payment"].includes(k.pay.type) && (
              <Field label="Bank Account" value={k.pay.bank_party_id}
                onChange={v => k.sp("bank_party_id", v)}
                placeholder="Bank chunein (optional)"
                options={k.bankAccounts.map(b => ({ value: b.id, label: b.name }))} />
            )}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              <Field label="Cheque / Ref" value={k.pay.reference}
                onChange={v => k.sp("reference", v)} placeholder="Optional" />
              <Field label="Tarikh" value={k.pay.date}
                onChange={v => k.sp("date", v)} type="date" />
            </div>
            <Field label="Narration" value={k.pay.narration}
              onChange={v => k.sp("narration", v)} placeholder="Koi baat likhein..." />
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
              <Btn variant="secondary" onClick={k.resetPayForm}>Raddh</Btn>
              <Btn onClick={k.handlePaySave} disabled={k.busy}>{k.busy ? "..." : "Save"}</Btn>
            </div>
          </Card>
        )}

        {/* Nakad Dena form */}
        {k.showNakad && (
          <Card style={{ marginBottom: 14, border: `1.5px solid ${accent}` }}>
            <p style={{ fontSize: 13, fontWeight: 700, marginBottom: 4 }}>💵 Nakad Dena — Cash Advance</p>
            <p style={{ fontSize: 11, marginBottom: 10,
              color: k.bal > 0 ? C.green : C.red }}>
              {k.bal > 0
                ? `✓ Farmer ka balance: ₹${fmt(k.bal)} — is amount tak interest free`
                : `⚠ Farmer pehle se ₹${fmt(Math.abs(k.bal))} mein udhar — aur dene par byaaj lagega`}
            </p>
            <Field label="Raqam (₹)" value={k.nakadAmt} onChange={k.setNakadAmt}
              type="number" prefix="₹" required />
            <Field label="Tarikh" value={k.nakadDate} onChange={k.setNakadDate} type="date" />
            <Field label="Note (optional)" value={k.nakadNote} onChange={k.setNakadNote}
              placeholder="Koi baat likhein..." />
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginTop: 4 }}>
              <Btn variant="secondary" onClick={() => k.setShowNakad(false)}>Raddh</Btn>
              <Btn onClick={k.handleNakadSave} disabled={k.busy || !k.nakadAmt}>
                {k.busy ? "..." : "✓ Save"}
              </Btn>
            </div>
          </Card>
        )}

        {/* Account statement */}
        <p style={{ fontSize: 11, fontWeight: 700, color: C.inkLight,
          textTransform: "uppercase", letterSpacing: 0.6, marginBottom: 10 }}>
          Account Statement
        </p>

        {k.ledgerWithBal.length === 0 ? (
          <Card>
            <p style={{ textAlign: "center", color: C.inkLight, fontSize: 13, padding: "16px 0" }}>
              Koi entries nahi
            </p>
          </Card>
        ) : (
          <Card style={{ padding: 0, overflow: "hidden" }}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 80px 80px",
              padding: "9px 14px", background: C.cream, borderBottom: `1px solid ${C.border}` }}>
              {["Vivaran", "Debit", "Credit"].map(h => (
                <span key={h} style={{ fontSize: 10, fontWeight: 700, color: C.inkLight,
                  textAlign: h !== "Vivaran" ? "right" : "left" }}>{h}</span>
              ))}
            </div>

            {k.ledgerWithBal.map((e, i) => {
              const isOpening = e.source_type === "opening";
              return (
                <div key={e.id}
                  onClick={() => !isOpening && k.setSelEntry(e)}
                  style={{ display: "grid", gridTemplateColumns: "1fr 80px 80px",
                    padding: "11px 14px", alignItems: "center",
                    cursor: isOpening ? "default" : "pointer",
                    background: isOpening ? C.goldLight : "transparent",
                    borderBottom: i < k.ledgerWithBal.length - 1 ? `1px solid ${C.border}` : "none" }}>
                  <div>
                    <div style={{ fontSize: 12, fontWeight: isOpening ? 700 : 500,
                      color: isOpening ? C.gold : C.ink }}>
                      {e.narration}
                    </div>
                    <div style={{ fontSize: 10, color: C.inkLight, marginTop: 2 }}>{e.date}</div>
                  </div>
                  <div style={{ textAlign: "right", fontFamily: "'Baloo 2'", fontSize: 12, color: C.red }}>
                    {e.debit > 0 ? `₹${fmt(e.debit)}` : "—"}
                  </div>
                  <div style={{ textAlign: "right", fontFamily: "'Baloo 2'", fontSize: 12, color: C.green }}>
                    {e.credit > 0 ? `₹${fmt(e.credit)}` : "—"}
                  </div>
                </div>
              );
            })}

            <div style={{ padding: "11px 14px", background: C.cream,
              borderTop: `2px solid ${C.border}`, display: "flex", justifyContent: "space-between" }}>
              <span style={{ fontWeight: 700, fontSize: 13 }}>Closing Balance</span>
              <span style={{ fontFamily: "'Baloo 2'", fontWeight: 800, fontSize: 15, color: accent }}>
                ₹{fmt(k.displayBal)}
              </span>
            </div>
          </Card>
        )}

        {/* Party info */}
        <div style={{ marginTop: 14, padding: "12px 14px", background: C.cream,
          borderRadius: 10, border: `1px solid ${C.border}` }}>
          <p style={{ fontSize: 11, color: C.inkLight, marginBottom: 6 }}>Party Info</p>
          {party.gstin && <p style={{ fontSize: 12 }}>GSTIN: {party.gstin}</p>}
          {party.opening_balance > 0 && (
            <p style={{ fontSize: 12 }}>
              Opening Balance: ₹{fmt(party.opening_balance)}
              {party.opening_balance_date && (
                ` · ${new Date(party.opening_balance_date).toLocaleDateString("en-IN",
                  { day: "numeric", month: "short", year: "numeric" })}`
              )}
            </p>
          )}
          {party.interest_rate > 0 && (
            <p style={{ fontSize: 12, marginTop: 2 }}>
              Byaaj dar: {party.interest_rate}% / saal
              {k.accruedInterest > 0 && k.farmerOwes && ` · Abhi tak: ₹${fmt(k.accruedInterest)}`}
              {k.arhtiyaOwes && " · Abhi byaaj nahi"}
            </p>
          )}
          {party.notes && <p style={{ fontSize: 12, marginTop: 4, color: C.inkMid }}>{party.notes}</p>}
        </div>
      </div>
    </Shell>
  );
}

// ── Byaaj Trail Popover ───────────────────────────────────────────────────────

function ByaajTrailPopover({ party, entryTrails: segments, accruedInterest, mode, onModeChange, onClose }) {
  const annualRate    = party.interest_rate || 0;
  const totalInterest = segments
    .filter(s => !s.isCompounding && !s.isEvent)
    .reduce((sum, s) => sum + (s.interest || 0), 0);

  const fmtDate = (d) => new Date(d).toLocaleDateString("en-IN",
    { day: "numeric", month: "short", year: "numeric" });
  // Subtract 1 day for display — end date is exclusive in calculation
  // e.g. period ends "1 Apr" displays as "31 Mar" (inclusive)
  const fmtEndDate = (d) => {
    const date = new Date(d);
    date.setDate(date.getDate() - 1);
    return date.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
  };

  // Dot styles for timeline
  const bigDot  = (color) => ({
    position: "absolute", left: -17, top: 4,
    width: 10, height: 10, borderRadius: "50%",
    background: color, border: `2px solid ${C.white}`,
  });
  const smallDot = {
    position: "absolute", left: -14, top: 6,
    width: 4, height: 4, borderRadius: "50%",
    background: C.border,
  };

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)",
      zIndex: 200, display: "flex", flexDirection: "column", justifyContent: "flex-end" }}
      onClick={onClose}>
      <div style={{ background: C.white, borderRadius: "20px 20px 0 0",
        maxHeight: "88vh", display: "flex", flexDirection: "column" }}
        onClick={e => e.stopPropagation()}>

        {/* Handle */}
        <div style={{ padding: "12px 0 4px", textAlign: "center", flexShrink: 0 }}>
          <div style={{ width: 40, height: 4, borderRadius: 2,
            background: C.border, margin: "0 auto" }} />
        </div>

        {/* Header */}
        <div style={{ padding: "8px 20px 14px",
          borderBottom: `1px solid ${C.border}`, flexShrink: 0 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
            <div>
              <p style={{ fontSize: 15, fontWeight: 700, color: C.ink, margin: 0 }}>
                Byaaj Trail
              </p>
              <p style={{ fontSize: 12, color: C.inkLight, margin: "4px 0 10px" }}>
                {party.name} · {annualRate}% / saal
              </p>
              {/* 360 / 365 toggle */}
              <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                {["365", "360"].map(m => (
                  <button key={m} onClick={() => onModeChange(m)}
                    style={{ padding: "3px 12px", borderRadius: 20, fontSize: 12,
                      fontWeight: 600, cursor: "pointer", border: "none",
                      background: mode === m ? C.saffron : C.cream,
                      color:      mode === m ? C.white   : C.inkMid }}>
                    {m} din
                  </button>
                ))}
                <span style={{ fontSize: 11, color: C.inkLight }}>
                  {mode === "365" ? "Exact calendar" : "Har mahina = 30 din"}
                </span>
              </div>
            </div>
            <div style={{ textAlign: "right", flexShrink: 0 }}>
              <p style={{ fontSize: 11, color: C.inkLight, margin: 0 }}>Kul Byaaj</p>
              <p style={{ fontFamily: "'Baloo 2'", fontWeight: 800,
                fontSize: 22, color: C.red, margin: "2px 0 0" }}>
                ₹{fmt(totalInterest)}
              </p>
            </div>
          </div>
        </div>

        {/* Timeline */}
        <div style={{ overflowY: "auto", padding: "20px 20px 32px" }}>
          {segments.length === 0 ? (
            <p style={{ textAlign: "center", color: C.inkLight,
              padding: "24px 0", fontSize: 13 }}>
              Abhi tak koi byaaj nahi
            </p>
          ) : (
            <div style={{ position: "relative", paddingLeft: 20 }}>
              {/* Vertical line */}
              <div style={{ position: "absolute", left: 6, top: 8, bottom: 24,
                width: 2, background: C.border, zIndex: 0 }} />

              {segments.map((seg, i) => {
                if (seg.isEvent) {
                  const isLoan = seg.eventType === "loan";
                  return (
                    <div key={i} style={{ position: "relative", marginBottom: 20 }}>
                      <div style={bigDot(isLoan ? C.red : C.green)} />
                      <p style={{ fontSize: 11, color: C.inkLight, margin: "0 0 2px" }}>
                        {fmtDate(seg.fromDate)}
                      </p>
                      <p style={{ fontSize: 13, fontWeight: 600,
                        color: C.ink, margin: 0 }}>
                        {seg.eventLabel}
                      </p>
                      {isLoan && (
                        <p style={{ fontSize: 11, color: C.inkLight, margin: "2px 0 0" }}>
                          Byaaj agla din se shuru
                        </p>
                      )}
                    </div>
                  );
                }

                if (seg.isCompounding) {
                  return (
                    <div key={i} style={{ position: "relative", marginBottom: 20 }}>
                      <div style={bigDot("#EF9F27")} />
                      <p style={{ fontSize: 11, color: C.inkLight, margin: "0 0 2px" }}>
                        {fmtDate(seg.fromDate)}
                      </p>
                      <div style={{ display: "flex", justifyContent: "space-between",
                        alignItems: "center" }}>
                        <p style={{ fontSize: 13, fontWeight: 600,
                          color: "#BA7517", margin: 0 }}>
                          Compound hua
                        </p>
                        <p style={{ fontSize: 12, color: C.inkMid, margin: 0 }}>
                          Naya: ₹{fmt(seg.newPrincipal)}
                        </p>
                      </div>
                      <p style={{ fontSize: 11, color: C.inkLight, margin: "2px 0 0" }}>
                        ₹{fmt(seg.addedInterest)} byaaj principal mein joda
                      </p>
                    </div>
                  );
                }

                // Interest period
                return (
                  <div key={i} style={{ position: "relative", marginBottom: 20 }}>
                    <div style={smallDot} />
                    <div style={{ display: "flex", justifyContent: "space-between",
                      alignItems: "flex-start" }}>
                      <div>
                        <p style={{ fontSize: 12, color: C.inkMid, margin: 0 }}>
                          {fmtDate(seg.fromDate)} → {fmtEndDate(seg.toDate)}
                        </p>
                        <p style={{ fontSize: 11, color: C.inkLight, margin: "2px 0 0" }}>
                          ₹{fmt(seg.principal)} × {annualRate}% × {seg.days} din / {mode}
                        </p>
                      </div>
                      <p style={{ fontFamily: "'Baloo 2'", fontWeight: 700,
                        fontSize: 14, color: C.red, margin: 0,
                        flexShrink: 0, marginLeft: 12 }}>
                        +₹{fmt(seg.interest)}
                      </p>
                    </div>
                  </div>
                );
              })}

              {/* End dot */}
              <div style={{ position: "relative" }}>
                <div style={bigDot(C.inkMid)} />
                <p style={{ fontSize: 11, color: C.inkLight, margin: "0 0 2px" }}>Aaj</p>
                <p style={{ fontSize: 13, fontWeight: 600, color: C.ink, margin: 0 }}>
                  Kul Baaki
                </p>
              </div>
            </div>
          )}

          {/* Summary */}
          {segments.length > 0 && (
            <div style={{ marginTop: 20, borderTop: `1px solid ${C.border}`,
              paddingTop: 14 }}>
              <div style={{ display: "flex", justifyContent: "space-between",
                marginBottom: 6 }}>
                <span style={{ fontSize: 13, color: C.inkLight }}>Principal</span>
                <span style={{ fontSize: 13, color: C.ink }}>
                  ₹{fmt(party.opening_balance)}
                </span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between",
                marginBottom: 10 }}>
                <span style={{ fontSize: 13, color: C.inkLight }}>
                  Kul Byaaj ({mode} din)
                </span>
                <span style={{ fontSize: 13, fontWeight: 600, color: C.red }}>
                  +₹{fmt(totalInterest)}
                </span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span style={{ fontSize: 15, fontWeight: 700, color: C.ink }}>
                  Kul Baaki
                </span>
                <span style={{ fontFamily: "'Baloo 2'", fontWeight: 800,
                  fontSize: 16, color: C.red }}>
                  ₹{fmt(parseFloat(party.opening_balance || 0) + totalInterest)}
                </span>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}


// ── Entry detail bottom sheet ─────────────────────────────────────────────────

function EntryDetailSheet({ entry, accent, onClose, onEdit, onDelete }) {
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)",
      zIndex: 100 }} onClick={onClose}>
      <div style={{ position: "absolute", bottom: 0, left: 0, right: 0,
        background: C.white, borderRadius: "20px 20px 0 0", padding: "24px 18px 36px" }}
        onClick={e => e.stopPropagation()}>
        <p style={{ fontSize: 13, fontWeight: 700, marginBottom: 14 }}>Payment Details</p>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 16 }}>
          {[
            ["Tarikh", entry.date],
            ["Type", entry.narration],
            ["Debit", entry.debit > 0 ? `₹${fmt(entry.debit)}` : "—"],
            ["Credit", entry.credit > 0 ? `₹${fmt(entry.credit)}` : "—"],
          ].map(([label, val]) => (
            <div key={label} style={{ background: C.cream, borderRadius: 8, padding: "8px 12px" }}>
              <div style={{ fontSize: 10, color: C.inkLight }}>{label}</div>
              <div style={{ fontSize: 13, fontWeight: 600 }}>{val}</div>
            </div>
          ))}
        </div>
        {entry.source_type === "payment" && (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <button onClick={onEdit}
              style={{ padding: "12px 0", background: accent, color: C.white,
                border: "none", borderRadius: 10, fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
              ✏️ Edit
            </button>
            <button onClick={onDelete}
              style={{ padding: "12px 0", background: "#FDF0EE", color: C.red,
                border: `1.5px solid ${C.red}`, borderRadius: 10, fontSize: 13,
                fontWeight: 700, cursor: "pointer" }}>
              🗑️ Delete
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
