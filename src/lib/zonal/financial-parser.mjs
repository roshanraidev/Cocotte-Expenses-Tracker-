// Pure parser for the live-observed single-page Financial Detail layout.
// Never includes report content in errors. Cost and Cost % are deliberately ignored.
const BRANCH = '003 – Parsons Green';
const MONTHS=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
function fail(code){throw new Error(code);}
function pounds(value){
  if(typeof value!=='string'||!/^£(?:\d{1,12}|\d{1,3}(?:,\d{3})+)\.\d{2}$/.test(value))fail('REPORT_MONEY_INVALID');
  return value.replace(/[£,]/g,'');
}
function pence(value){const [whole,fraction]=value.split('.');return BigInt(whole)*100n+BigInt(fraction);}
function close(a,b){if(a-b>1n||b-a>1n)fail('REPORT_TOTALS_MISMATCH');}
export function parseFinancialDetail(text,expectedBranch,date){
  if(expectedBranch!==BRANCH)fail('REPORT_BRANCH_UNAUTHORISED');
  if(typeof text!=='string'||text.length>500000)fail('REPORT_STRUCTURE_CHANGED');
  const lines=text.split(/\r?\n/).map(s=>s.replace(/\u00a0/g,' ').trim()).filter(Boolean);
  const start=lines.indexOf('Financial Detail');
  if(start<0||lines.lastIndexOf('Financial Detail')!==start)fail('REPORT_TITLE_MISSING');
  const report=lines.slice(start);
  if(report.filter(line=>/^Branch:/.test(line)).length!==1||!report.includes('Branch: 003 - Parsons Green'))fail('REPORT_BRANCH_MISMATCH');
  const [year,month,day]=date.split('-');
  const label=`${day} ${MONTHS[Number(month)-1]} ${year}`;
  if(report.filter(line=>/^Date Range:/.test(line)).length!==1||!report.includes(`Date Range: ${label} - ${label}`))fail('REPORT_DATE_MISMATCH');
  if(!report.some(line=>/^Page\s+1\s+of\s+1$/.test(line)))fail('REPORT_PAGINATION_UNSUPPORTED');
  const summaryEnd=report.indexOf('Sales Type');
  if(summaryEnd<0)fail('REPORT_STRUCTURE_CHANGED');
  const summary=report.slice(0,summaryEnd);
  function field(label){const at=summary.indexOf(label);if(at<0||summary.lastIndexOf(label)!==at||!summary[at+1])fail('REPORT_FIELD_MISSING');return summary[at+1];}
  const grossBefore=pounds(field('Gross Sales Incl Disc'));
  const result={branch:expectedBranch,date,currency:'GBP',gross:pounds(field('Gross Sales')),discount:pounds(field('Discount')),vat:pounds(field('VAT')),net:pounds(field('Net Sales')),food:'',drink:'',specials:'',covers:field('Covers'),transactions:field('Transaction Count')};
  if(!/^\d{1,9}$/.test(result.covers)||!/^\d{1,9}$/.test(result.transactions))fail('REPORT_COUNT_INVALID');
  if(pence(grossBefore)-pence(result.discount)!==pence(result.gross)||pence(result.gross)-pence(result.vat)!==pence(result.net))fail('REPORT_TOTALS_MISMATCH');
  const dept=report.indexOf('Sales Departments');
  if(dept<0||report.lastIndexOf('Sales Departments')!==dept)fail('REPORT_DEPARTMENTS_MISSING');
  const headings=['Sales Departments','Quantity','Gross Sales Incl Disc','Discount','Gross Sales','VAT','Net Sales','% Of Total','Cost','Cost %'];
  if(headings.some((name,i)=>report[dept+i]!==name))fail('REPORT_DEPARTMENT_LAYOUT_CHANGED');
  const seen=new Set();let row=dept+headings.length;
  while(row<report.length){
    const name=report[row];
    if(name==='Totals')break;
    const key=({Food:'food',Drink:'drink',SPECIALS:'specials'})[name];
    if(!key||seen.has(key))fail('REPORT_DEPARTMENTS_CHANGED');
    seen.add(key);result[key]=pounds(report[row+6]);row+=headings.length;
  }
  if(seen.size!==3||report[row]!=='Totals')fail('REPORT_DEPARTMENTS_MISSING');
  close(pence(pounds(report[row+6])),pence(result.net));
  close(pence(result.food)+pence(result.drink)+pence(result.specials),pence(result.net));
  return result;
}
