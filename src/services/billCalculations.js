/**
 * services/billCalculations.js
 *
 * Pure calculation functions for Form J (purchase) and Form I (sale) bills.
 * No side effects, no state, no API calls — just math.
 * Easy to unit test.
 */

// ── Form J (Purchase Bill) calculations ───────────────────────────────────────

/**
 * Calculate gross amount for a purchase bill
 * gross = weight (quintals) × rate (₹/quintal)
 */
export function calcGross(weight, rate) {
  return (parseFloat(weight) || 0) * (parseFloat(rate) || 0);
}

/**
 * Calculate labour/utarai amount
 * In scan mode: anya_kharcha covers all deductions, labour = 0
 * In manual mode: labour = bags × labour_rate per bag
 */
export function calcLabour(bags, labourRate, anyaKharcha) {
  if (parseFloat(anyaKharcha) > 0) return 0; // scan mode
  return (parseFloat(bags) || 0) * (parseFloat(labourRate) || 0);
}

/**
 * Calculate total deductions for a purchase bill
 * deductions = labour + cess + transport + anya_kharcha
 */
export function calcTotalDeductions({ bags, labourRate, cess, transport, anyaKharcha }) {
  const labour    = calcLabour(bags, labourRate, anyaKharcha);
  const cessAmt   = parseFloat(cess)         || 0;
  const transAmt  = parseFloat(transport)    || 0;
  const anyaAmt   = parseFloat(anyaKharcha)  || 0;
  return labour + cessAmt + transAmt + anyaAmt;
}

/**
 * Calculate net payable to farmer
 * net = gross - total_deductions
 */
export function calcNetPayable(weight, rate, deductionsTotal) {
  return calcGross(weight, rate) - (parseFloat(deductionsTotal) || 0);
}

/**
 * Calculate final payment after loan recovery
 * final = net_payable - loan_recovered
 */
export function calcFinalPayment(netPayable, loanRecovered) {
  return (parseFloat(netPayable) || 0) - (parseFloat(loanRecovered) || 0);
}

/**
 * Get all Form J calculated values in one call
 */
export function calcFormJ({ bags, weight, rate, labourRate, cess, transport, anyaKharcha, loanRecovered }) {
  const gross            = calcGross(weight, rate);
  const labour_amount    = calcLabour(bags, labourRate, anyaKharcha);
  const total_deductions = calcTotalDeductions({ bags, labourRate, cess, transport, anyaKharcha });
  const net_payable      = gross - total_deductions;
  const final_payment    = calcFinalPayment(net_payable, loanRecovered);
  return { gross, labour_amount, total_deductions, net_payable, final_payment };
}

// ── Form I (Sale Bill) calculations ──────────────────────────────────────────

/**
 * Calculate Form I total bill for buyer
 * total = gross + mpc_amount + auc_amount + labour_amount + gst_amount
 */
export function calcFormI({ weight, rate, bags, mpc_rate, auc_rate, labour_rate, gst_rate }) {
  const gross         = (parseFloat(weight) || 0) * (parseFloat(rate) || 0);
  const mpc_amount    = gross * ((parseFloat(mpc_rate) || 0) / 100);
  const auc_amount    = gross * ((parseFloat(auc_rate) || 0) / 100);
  const labour_amount = (parseFloat(bags) || 0) * (parseFloat(labour_rate) || 0);
  const subtotal      = gross + mpc_amount + auc_amount + labour_amount;
  const gst_amount    = subtotal * ((parseFloat(gst_rate) || 0) / 100);
  const total_bill    = subtotal + gst_amount;

  return { gross, mpc_amount, auc_amount, labour_amount, subtotal, gst_amount, total_bill };
}

// ── Validation ────────────────────────────────────────────────────────────────

/**
 * Validate Form J fields before saving
 * Returns array of error messages (empty = valid)
 */
export function validateFormJ({ party_id, commodity, bags, weight, rate }) {
  const errors = [];
  if (!party_id)                    errors.push("Kisan chunein");
  if (!commodity)                   errors.push("Fasal chunein");
  if (!bags || parseFloat(bags) <= 0)    errors.push("Bori sahi nahi");
  if (!weight || parseFloat(weight) <= 0) errors.push("Wazan sahi nahi");
  if (!rate || parseFloat(rate) <= 0)    errors.push("Bhao sahi nahi");
  return errors;
}

/**
 * Cross-validate scanned values vs calculated values
 * Returns mismatch warnings (empty = all match)
 */
export function validateScanMismatch({ gross_calculated, gross_from_form, net_calculated, net_from_form }) {
  const warnings = [];
  const tolerance = 0.01; // 1%

  if (gross_from_form && gross_calculated > 0) {
    const diff = Math.abs(gross_calculated - parseFloat(gross_from_form)) / gross_calculated;
    if (diff > tolerance) warnings.push("gross");
  }

  if (net_from_form && net_calculated > 0) {
    const diff = Math.abs(net_calculated - parseFloat(net_from_form)) / net_calculated;
    if (diff > tolerance) warnings.push("net");
  }

  return warnings;
}
