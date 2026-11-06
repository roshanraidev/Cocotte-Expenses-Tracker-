// Selectors observed from the authorised Financial Detail. ReportViewer UI.
export const REPORT_NAME = 'Financial Detail.';
export const REPORT_ROOT = '#ctl00_Content_rptViewer';
/** @param {(stage:string,reason:string)=>void} diagnostic */
export async function openFinancialDetail(page, diagnostic = () => {}) {
  diagnostic('REPORT_NAVIGATION','STARTED');
  await page.getByRole('link',{name:'Reports',exact:true}).click();
  await page.getByRole('link',{name:'Financial',exact:true}).waitFor({state:'visible',timeout:15000});
  await page.getByRole('link',{name:'Financial',exact:true}).click();
  await page.getByRole('link',{name:REPORT_NAME,exact:true}).waitFor({state:'visible',timeout:15000});
  await page.getByRole('link',{name:REPORT_NAME,exact:true}).click();
  page=page.context().pages().at(-1) ?? page;
  await page.getByLabel('Start Date',{exact:true}).waitFor({state:'visible',timeout:15000});
  diagnostic('REPORT_NAVIGATION','OK');
  return page;
}
const months=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
export function dateOptionPattern(date) {
  const [year,month,day]=date.split('-');
  return new RegExp(`^${Number(day).toString().padStart(2,'0')}\\s+${months[Number(month)-1]}\\s+${year}\\s+\\([A-Za-z]{3}\\)$`);
}
export async function selectReportDate(page,label,date) {
  const field=page.getByLabel(label,{exact:true});
  const option=field.locator('option').filter({hasText:dateOptionPattern(date)});
  if(await option.count()!==1)throw new Error('DATE_UNAVAILABLE');
  const value=await option.getAttribute('value');
  if(value===null)throw new Error('DATE_UNAVAILABLE');
  if(await field.inputValue()!==value)await field.selectOption(value);
}
/** @param {(stage:string,reason:string)=>void} diagnostic */
export async function setFinancialParameters(page,date,diagnostic=()=>{}) {
  diagnostic('REPORT_BRANCH','STARTED');
  const popup=page.locator(`${REPORT_ROOT} button[id$="_ctl07_ctl01"]`);
  await popup.click();
  const branch=page.getByLabel('003 - Parsons Green',{exact:true});
  await branch.waitFor({state:'visible',timeout:10000});
  // Uncheck any other profit centres in this parameter scope, never select them.
  const checks=page.locator(`${REPORT_ROOT} [id$="_ctl07_divDropDown"] input[type=checkbox]`);
  const branchId=await branch.getAttribute('id');
  for(const checkbox of await checks.all()) if(await checkbox.getAttribute('id')!==branchId && await checkbox.isChecked()) await checkbox.uncheck();
  await branch.check();
  if(await page.locator(`${REPORT_ROOT} [id$="_ctl07_divDropDown"] input[type=checkbox]:checked`).count()!==1)throw new Error('BRANCH_SCOPE');
  await popup.click();
  diagnostic('REPORT_BRANCH','OK');
  diagnostic('REPORT_START_DATE','STARTED');
  await selectReportDate(page,'Start Date',date);
  await page.getByLabel('End Date',{exact:true}).locator('option').nth(1).filter({hasText:dateOptionPattern(date)}).waitFor({state:'attached',timeout:15000});
  diagnostic('REPORT_START_DATE','OK');
  diagnostic('REPORT_END_DATE','STARTED');
  await selectReportDate(page,'End Date',date);
  diagnostic('REPORT_END_DATE','OK');
  diagnostic('REPORT_RUN','STARTED');
  const submit=page.locator(`${REPORT_ROOT} input[type=submit]`);
  if(await submit.count()!==1)throw new Error('REPORT_STRUCTURE');
  await submit.click();
  diagnostic('REPORT_RUN','OK');
}
