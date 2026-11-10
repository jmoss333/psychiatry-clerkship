/** Whether a derived shipped listing contains the question-bank input. */
export function shipsQuestionBank(shipped, questionBankPath) {
  const pages = shipped && typeof shipped === 'object' && Array.isArray(shipped.pages)
    ? shipped.pages : [];
  return pages.some(page => page && typeof page === 'object'
    && (page.source === questionBankPath
      || (Array.isArray(page.extraSources) && page.extraSources.includes(questionBankPath))));
}
