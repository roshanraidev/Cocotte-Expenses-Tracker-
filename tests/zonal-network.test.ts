import { describe, expect, it } from 'vitest';
import { allowZonalRequest } from '@/lib/zonal/network-policy.mjs';
const root = 'https://mm.zonalconnect.com';
describe('Zonal browser UI request policy', () => {
  it.each(['/ReportBrowser/webservice/webservice.asmx/GetListReportsByClass','/ReportBrowser/webservice/webservice.asmx/GetGridReports','/ReportBrowser/webservice/webservice.asmx/GetListReportsByReportsFolderID','/ReportBrowser/webservice/webservice.asmx/GetFolderParents','/Portal/webservice/webservice.asmx/LoadLogin','/Portal//Controls/AjaxFunctions.aspx/GetMenuTabs','/portal/messages/Dashboard.aspx/GetMessagesForUserList','/portal/messages/Dashboard.aspx/ListAllMetricsForUser','/portal/messages/Dashboard.aspx/GetMetricsForUser','/Portal/webservice/webservice.asmx/GetFavourites'])('allows the observed read-only UI XHR: %s', path=>{
    expect(allowZonalRequest(new URL(path,root),'POST','xhr')).toBe(true);
  });
  it('allows the verified login document POST, but not arbitrary XHR login calls',()=>{
    expect(allowZonalRequest(new URL('/Portal/login/Login',root),'POST','document')).toBe(true);
    expect(allowZonalRequest(new URL('/Portal/login/Login',root),'POST','xhr')).toBe(false);
  });
  it.each(['/Portal/orders/Save','/Portal/webservice/webservice.asmx/SetFavourites','/Portal/Controls/AjaxFunctions.aspx/DeleteMenuTabs'])('blocks all unrecognised writes: %s',path=>{
    expect(allowZonalRequest(new URL(path,root),'POST','xhr')).toBe(false);
    expect(allowZonalRequest(new URL(path,root),'DELETE','xhr')).toBe(false);
  });
  it('never follows a cross-origin authentication document or permits external POSTs',()=>{
    expect(allowZonalRequest(new URL('https://identity.example.test/login'),'GET','document')).toBe(false);
    expect(allowZonalRequest(new URL('https://cdnjs.cloudflare.com/data'),'POST','xhr')).toBe(false);
    expect(allowZonalRequest(new URL('https://cdnjs.cloudflare.com/auth'),'GET','document')).toBe(false);
  });
  it('allows only fixed static origins and static resource types',()=>{
    expect(allowZonalRequest(new URL('https://fonts.googleapis.com/css'),'GET','stylesheet')).toBe(true);
    expect(allowZonalRequest(new URL('https://unknown.example.test/script.js'),'GET','script')).toBe(false);
    expect(allowZonalRequest(new URL('https://fonts.googleapis.com/api'),'GET','xhr')).toBe(false);
  });
  it('allows only the observed read-only ReportViewer parameter/run postback',()=>{
    const url=new URL('/ReportBrowser/reports/ReportContent.aspx',root);
    expect(allowZonalRequest(url,'POST','document')).toBe(true);
    expect(allowZonalRequest(url,'POST','xhr')).toBe(true);
    expect(allowZonalRequest(url,'DELETE','document')).toBe(false);
    expect(allowZonalRequest(new URL('/ReportBrowser/reports/ReportContent.aspx/Save',root),'POST','xhr')).toBe(false);
  });

});
