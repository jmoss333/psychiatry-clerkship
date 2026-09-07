// Shared user-visible closure flow for local standardized-patient previews.
export async function endEncounter(page) {
  await page.locator('#conversation-end').click();
  const finish = page.getByRole('button', {name:'Finish visit and give handoff',exact:true});
  if (await finish.isVisible()) await finish.click();
}
