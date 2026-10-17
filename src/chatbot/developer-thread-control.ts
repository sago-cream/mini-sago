/** Exact host commands also work while the coding worker is busy or offline. */
export function endDeveloperThreadTarget(
  request: string,
  currentThreadId: string,
) {
  const match = request
    .trim()
    .match(
      /^(?:(?:please\s+)?(?:end|close|finish)\s+(?:(?:this|the)\s+)?(?:dev(?:elopment)?|coding)\s+thread|(?:結束|結束掉|關閉)(?:這個|這串|此)?(?:開發|程式開發)討論串)(?:\s+(<#\d{17,20}>|\d{17,20}|https:\/\/discord\.com\/channels\/\d{17,20}\/\d{17,20}(?:\/\d{17,20})?))?[.!。！\s]*$/iu,
    );
  if (!match) return undefined;
  const target = match[1];
  if (!target) return currentThreadId;
  if (target.startsWith("https:")) return target.split("/")[5];
  return target.replace(/[<#>]/gu, "");
}
