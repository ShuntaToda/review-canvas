/**
 * この画面をどう開いたか（"navigate"・"reload"・"back_forward" など。Navigation Timing の type）。
 * 読めないブラウザでは undefined
 */
export const readNavigationType = (): string | undefined => {
  const [entry] = performance.getEntriesByType("navigation");
  if (entry === undefined) return undefined;
  return entry instanceof PerformanceNavigationTiming ? entry.type : undefined;
};
