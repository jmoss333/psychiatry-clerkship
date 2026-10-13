export function careDirectoryFixture() {
  const categories=[['aftercare','Aftercare'],['crisis','Crisis services'],['peer_support','Peer support'],
    ['basic_needs','Basic needs'],['community_services','Community services'],['housing_shelters','Housing & shelters'],
    ['recovery_meetings','Recovery meetings'],['telehealth_providers','Telehealth']];
  return {schemaVersion:1,generatedAt:'2026-10-12T00:00:00Z',sourceHash:'a'.repeat(64),
    categories:categories.map(([id,label])=>({id,label,available:true,count:id==='aftercare'?12:0,excluded:0})),
    regionOptions:['Statewide','Greater Portland','Southern Maine','NH','VT/Other NE'],
    records:Array.from({length:12},(_,i)=>({id:'sample-'+i,category:'aftercare',name:'Example Support '+String(i+1).padStart(2,'0'),
      description:'Counseling and recovery support.',details:'Adults · English',area:'Southern Maine',regions:['Southern Maine'],
      phone:i===1?'':'207-700-0123',contactHref:i===1?'':'tel:2077000123',website:i===1?'':'https://example.org/',
      verifiedDate:'2026-01-01',reviewAfter:'2026-06-30',verificationRequired:i===1}))};
}
export async function pinCareDirectory(page, feed=careDirectoryFixture()) {
  await page.route('**/care-directory.v1.json',route=>route.fulfill({contentType:'application/json',body:JSON.stringify(feed)}));
}
