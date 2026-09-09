// Small shared helpers for money / date math used across every module.
// Every "payment-like" row (plot installment, colony expense, land/shop/
// commercial-plot payment) shares the same shape:
//   { amount, dueDate, paidDate, direction, notes }
// - paidDate set   -> money has actually moved, counts toward totals.
// - paidDate empty -> it's still a promise/plan for the future (dueDate),
//                     shows up as "upcoming" / "overdue" but not yet in totals.

function isSettled(row) {
  return Boolean(row.paidDate);
}

function isOverdue(row) {
  if (isSettled(row)) return false;
  if (!row.dueDate) return false;
  return new Date(row.dueDate) < startOfToday();
}

function startOfToday() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

function sumAmount(rows) {
  return rows.reduce((total, row) => total + (Number(row.amount) || 0), 0);
}

function settledRows(rows, direction) {
  return rows.filter((row) => isSettled(row) && (!direction || row.direction === direction));
}

function pendingRows(rows, direction) {
  return rows.filter((row) => !isSettled(row) && (!direction || row.direction === direction));
}

function round2(n) {
  return Math.round((Number(n) || 0) * 100) / 100;
}

module.exports = { isSettled, isOverdue, sumAmount, settledRows, pendingRows, round2, startOfToday };
