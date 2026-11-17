// Local operator discovery only: metadata, never credentials or report figures.
export async function inspectReportControls(page) {
  const context = new URL(page.url());
  if(context.origin!=='https://mm.zonalconnect.com') return {code:'EXTERNAL_AUTH_STOP'};
  const catalogue = /\/reportbrowser\/reports\/reportframe\.aspx$/i.test(context.pathname);
  const links = catalogue ? await page.getByRole('link').evaluateAll(es=>es.map(e=>({label:e.textContent?.trim().replace(/\s+/g,' ')})).filter(e=>e.label && /financial|detail/i.test(e.label)&&e.label.length<100)) : [];
  const controls = await page.locator('input:not([type=hidden]):not([type=password]), select, button').evaluateAll(es=>es.map(e=>({tag:e.tagName,type:e.getAttribute('type'),id:/^[A-Za-z0-9_:$-]{1,100}$/.test(e.id)?e.id:undefined,name:/^[A-Za-z0-9_:$-]{1,100}$/.test(e.getAttribute('name')??'')?e.getAttribute('name'):undefined,label:e.labels?.[0]?.textContent?.trim().replace(/\s+/g,' ').slice(0,80)})).filter(e=>!/(user|password|token|session)/i.test(e.id??'')));
  const branchAvailable = await page.locator('option').filter({hasText:/003.*Parsons Green/i}).count()>0;
  return { catalogue, financialLinks:links, controls, branchAvailable, frameCount:page.frames().length };
}
export async function reportDiscoveryAction(page,command){
  page=page.context().pages().at(-1) ?? page;
  if(command==='catalogue') return await inspectReportControls(page);
  if(command==='controls') {
    const dates={};
    for(const label of ['Start Date','End Date','Group By']) {
      const field=page.getByLabel(label,{exact:true});
      if(await field.count()===1)dates[label]=(await field.locator('option').allTextContents()).slice(0,4);
    }
    return {dates,controls:await inspectReportControls(page)};
  }
  if(command==='open-detail') {
    const link=page.getByRole('link',{name:'Financial Detail.',exact:true});
    if(await link.count()!==1)return {code:'EXACT_REPORT_LINK_UNVERIFIED'};
    await link.click();await page.waitForTimeout(2000);
    page=page.context().pages().at(-1) ?? page;
    await page.waitForLoadState('domcontentloaded',{timeout:15000});
    return await inspectReportControls(page);
  }
  return {code:'UNKNOWN_COMMAND'};
}
