// Synthetic-only browser fixtures. These are never written to a repository.
export function syntheticMedicationSnapshot() {
  const records = ['one', 'two'].map(id => ({
    id: `synthetic-${id}`, generic: `Synthetic medication ${id}`, safetyLevel: 'high',
    rxcui: '123', dailymedSetId: 'synthetic-label', labelVersionDate: '2026-01-01',
    boxedWarning: { present: false }, dosing: { forms: ['Synthetic form'], titration: 'Fictional test text; not clinical guidance.' },
    mechanism: { t1: 'Synthetic saved judgment.' }, attendingAsks: ['Which synthetic field is revealed?'],
    retrieval: [{ id: 'ask-one', askIndex: 0, revealFrom: ['mechanism.t1'] }],
    provenance: { fieldClasses: { mechanism: 'J', dosing: 'J', boxedWarning: 'L' }, authoredFields: ['mechanism', 'dosing'] },
    facultyReview: { status: 'pending' },
  }));
  const receipt = { rxnorm: { rxcui: '123' }, reference: { setId: 'synthetic-label', effectiveDate: '2026-01-01', boxedWarningPresent: false, dailymedResolves: true }, problems: [] };
  return { head: 'a'.repeat(40), needsSync: false,
    registry: { sha: 'b'.repeat(40), json: { schemaVersion: 1, records } },
    receipt: { sha: 'c'.repeat(40), json: { agents: Object.fromEntries(records.map(r => [r.id, structuredClone(receipt)])) } },
  };
}
