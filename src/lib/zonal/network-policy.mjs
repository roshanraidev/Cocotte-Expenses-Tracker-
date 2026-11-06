import { LOGIN_URL, ORIGIN } from './browser-session.mjs';
// Observed browser-initiated UI bootstrap reads, never called directly by Cocotte.
export const READ_ONLY_UI_POSTS = new Set([
  '/reportbrowser/webservice/webservice.asmx/getlistreportsbyreportsfolderid',
  '/reportbrowser/webservice/webservice.asmx/getfolderparents',
  '/reportbrowser/webservice/webservice.asmx/getlistreportsbyclass',
  '/reportbrowser/webservice/webservice.asmx/getgridreports',
  '/portal/controls/ajaxfunctions.aspx/getmenutabs',
  '/portal/webservice/webservice.asmx/loadlogin',
  '/portal/webservice/webservice.asmx/getfavourites',
  '/portal/messages/dashboard.aspx/getmessagesforuserlist',
  '/portal/messages/dashboard.aspx/listallmetricsforuser',
  '/portal/messages/dashboard.aspx/getmetricsforuser',
]);
const STATIC_ORIGINS = new Set(['https://fonts.googleapis.com','https://fonts.gstatic.com','https://ajax.googleapis.com','https://code.jquery.com','https://cdnjs.cloudflare.com','https://ajax.aspnetcdn.com']);
export function allowZonalRequest(url, method, resourceType) {
  if(url.origin !== ORIGIN) return method==='GET' && STATIC_ORIGINS.has(url.origin) && ['script','stylesheet','font'].includes(resourceType);
  if(!['GET','HEAD','POST'].includes(method)) return false;
  if(method==='POST') {
    const path=url.pathname.toLowerCase().replace(/\/+/g,'/');
    // Observed WebForms ReportViewer page: parameter postbacks and View Report only.
    if(path==='/reportbrowser/reports/reportcontent.aspx') return ['document','xhr'].includes(resourceType);
    if(path===new URL(LOGIN_URL).pathname.toLowerCase()) return resourceType==='document';
    return resourceType==='xhr' && READ_ONLY_UI_POSTS.has(path);
  }
  return true;
}
