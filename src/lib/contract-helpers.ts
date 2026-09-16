export function calculateContractEndDate(
  startDateStr?: string | null,
  contractLengthWeeks: number = 6,
): Date {
  const base = startDateStr ? new Date(startDateStr) : new Date();
  const valid = isNaN(base.getTime()) ? new Date() : base;
  const endDate = new Date(valid);
  endDate.setDate(valid.getDate() + Number(contractLengthWeeks || 6) * 7);
  return endDate;
}

export function getContractDaysRemaining(
  startDateStr?: string | null,
  contractLengthWeeks: number = 6,
  refDate: Date = new Date(),
): number {
  const endDate = calculateContractEndDate(startDateStr, contractLengthWeeks);
  const ref = new Date(refDate);
  ref.setHours(0, 0, 0, 0);
  endDate.setHours(0, 0, 0, 0);
  const diffTime = endDate.getTime() - ref.getTime();
  return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
}
