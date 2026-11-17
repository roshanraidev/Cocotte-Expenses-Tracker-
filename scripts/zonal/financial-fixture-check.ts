// Synthetic browser fixture only: no Zonal traffic, credentials or financial data.
import { chromium,expect } from '@playwright/test';
import { setFinancialParameters,dateOptionPattern } from '../../src/lib/zonal/financial-detail.mjs';
const browser=await chromium.launch({headless:true});
try{
 for(const date of ['2026-11-03','2026-11-05']){
  const page=await browser.newPage();
  await page.setContent(`<div id="ctl00_Content_rptViewer">
    <button id="fixture_ctl07_ctl01" type="button" onclick="const d=document.getElementById('fixture_ctl07_divDropDown');d.hidden=!d.hidden">Profit Centre</button>
    <div id="fixture_ctl07_divDropDown" hidden><label><input id="branch3" type="checkbox">003 - Parsons Green</label><label><input id="branch4" type="checkbox" checked>004 - Other</label></div>
    <label for="start">Start Date</label><select id="start"><option value="3">03 Nov 2026 (Tue)</option><option value="4" selected>04 Nov 2026 (Wed)</option><option value="5">05 Nov 2026 (Thu)</option></select>
    <label for="end">End Date</label><select id="end"><option value="">Select</option><option value="4">04 Nov 2026 (Wed)</option><option value="5">05 Nov 2026 (Thu)</option></select>
    <input type="submit" value="View Report" onclick="window.reportWasRequested=true">
  </div>`);
  await page.evaluate(()=>{
    const start=document.getElementById('start') as HTMLSelectElement;
    start.addEventListener('change',()=>setTimeout(()=>{
      const end=document.getElementById('end') as HTMLSelectElement;
      end.replaceChildren(new Option('Select',''));
      for(const n of [3,4,5].filter(n=>n>=Number(start.value)))end.add(new Option(`0${n} Nov 2026 (${({3:'Tue',4:'Wed',5:'Thu'} as Record<number,string>)[n]})`,String(n)));
    },200));
  });
  await setFinancialParameters(page,date);
  await expect(page.locator('#branch3')).toBeChecked();await expect(page.locator('#branch4')).not.toBeChecked();
  await expect(page.locator('#end option:checked')).toHaveText(dateOptionPattern(date));
  expect(await page.evaluate(()=>Boolean((window as unknown as {reportWasRequested:boolean}).reportWasRequested))).toBe(true);
  await page.close();
 }
 console.log('Financial parameter fixtures passed: branch isolation, earlier/later dates, cascading End Date refresh, no real traffic.');
}finally{await browser.close();}
