/**
 * Warnings that describe an unavailable reference catalog are useful for
 * support and audit records, but do not require an action from the person
 * completing a checklist. Keep them out of the conversational UI while
 * preserving the original validation response for technical consumers.
 */
export type ValidationWarningForPresentation = {
  ruleCode?: unknown;
};

export const isCatalogNotConfiguredWarning = (
  warning: ValidationWarningForPresentation | null | undefined,
): boolean => {
  const ruleCode = typeof warning?.ruleCode === 'string'
    ? warning.ruleCode.trim().toUpperCase()
    : '';

  return /^CATALOG-[A-Z0-9][A-Z0-9_-]*-NOT-CONFIGURED$/.test(ruleCode);
};

export const warningsForUserPresentation = <T extends ValidationWarningForPresentation>(
  warnings: readonly T[] | null | undefined,
): T[] => (warnings || []).filter((warning) => !isCatalogNotConfiguredWarning(warning));
