export function reportErrorMessage(code:string|null){
 const messages:Record<string,string>={
 REPORT_SUMMARY_MISSING:'Zonal rendered the report header but no sales summary. No zero sales have been inferred.',
 REPORT_UNCLASSIFIED_DEPARTMENT:'Miscellaneous has nonzero net sales and no verified food/drink classification. Manual review is required.',
 REPORT_DEPARTMENTS_CHANGED:'An unexpected or duplicate department row was found.',
 REPORT_DEPARTMENTS_MISSING:'A required Food, Drink or Specials department is missing.',
 REPORT_DEPARTMENT_LAYOUT_CHANGED:'The report department columns have changed.',
 REPORT_TOTALS_MISMATCH:'The report totals do not reconcile.',
 REPORT_DATE_MISMATCH:'The rendered report date differs from the requested reporting date.',
 REPORT_RENDER_TIMEOUT:'Zonal did not render the requested report within the bounded timeout.',
 REPORT_INVALID:'The report failed validation. Older records do not contain a more specific parser code; inspect before retrying.'
 };
 return code?messages[code]??code:'Report unavailable';
}
