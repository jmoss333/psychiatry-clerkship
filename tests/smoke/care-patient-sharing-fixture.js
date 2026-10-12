// Explicit test-only opt-in for the retained patient-sharing feature.
// Ordinary browser tests exercise the unmodified production default (off).
import { expect } from '@playwright/test';

export function enablePatientSharingHtml(html) {
  const flag = 'var FD_CARE_PATIENT_SHARING_ENABLED=false;';
  expect(html.split(flag)).toHaveLength(2);
  return html.replace(flag, 'var FD_CARE_PATIENT_SHARING_ENABLED=true;');
}

export async function enablePatientSharing(page) {
  await page.route(url => url.pathname === '/', async route => {
    const response = await route.fetch();
    await route.fulfill({ response, body: enablePatientSharingHtml(await response.text()) });
  });
}
