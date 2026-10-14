// Page count of a PDF written by Chromium's own Skia/PDF backend (what page.pdf() produces), read from the bytes with no
// dependency. It THROWS rather than guess, because a count that is wrong in the same direction as the bug it checks is worse
// than none:
//  * it counts page objects (/Type /Page, not /Pages) and requires that to equal the page tree's root /Count. The tree is
//    nested every 8 pages (a 12-page file lists /Count 8, 4, then 12, children first), so reading the FIRST /Count returns 8 for
//    any file of 9 or more pages. Taking the largest /Count is correct for the root only because it is the total.
//  * it refuses object streams (a future Skia that compresses page dictionaries would hide the objects it counts);
//  * it refuses a producer it has not been checked against.
export function pdfPageCount(buffer) {
  const text = Buffer.from(buffer).toString('latin1');
  if (!text.startsWith('%PDF-')) throw new Error('pdfPageCount: not a PDF');
  if (/\/ObjStm/.test(text)) throw new Error('pdfPageCount: the file uses object streams, so page objects cannot be counted from bytes');
  if (!/\/Producer\s*\(Skia\/PDF/.test(text)) throw new Error('pdfPageCount: not written by Skia/PDF, which is the only producer this was checked against');
  const pages = (text.match(/\/Type\s*\/Page(?![A-Za-z])/g) || []).length;
  const counts = [...text.matchAll(/\/Count\s+(\d+)/g)].map(m => Number(m[1]));
  const root = counts.length ? Math.max(...counts) : 0;
  if (!pages) throw new Error('pdfPageCount: no page objects found');
  if (pages !== root) throw new Error(`pdfPageCount: ${pages} page objects but the page tree says ${root}`);
  return pages;
}
