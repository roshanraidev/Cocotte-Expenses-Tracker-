// Server worker only. Login selectors verified against the public UI, 4 Nov 2026.
// No raw exceptions, page text, screenshots, storage state or cookies leave this module.
export const LOGIN_URL = 'https://mm.zonalconnect.com/Portal/login/Login';
export const ORIGIN = new URL(LOGIN_URL).origin;
export const LOGIN_SELECTORS = Object.freeze({ username: '#Content_LoginUser_UserName', password: '#Content_LoginUser_password', submit: '#Content_LoginUser_btnLogin', validation: '#ValidationResults' });
const FAILURE = Object.freeze({ code: 'LOGIN_UNVERIFIED' });
/** @returns {Promise<import('./worker.ts').LoginResult>} */
export async function inspectLoginState(page) {
  const location = new URL(page.url());
  if (location.origin !== ORIGIN) return { code: 'ACCESS_CONTROL' };
  // Detection only: never interact with a challenge or guess its solution.
  const challenge = page.locator('iframe[src*="recaptcha"], iframe[src*="hcaptcha"], input[autocomplete="one-time-code"], input[name*="otp" i], input[name*="verification" i]');
  if (await challenge.filter({ visible: true }).count()) return { code: 'ACCESS_CONTROL' };
  if (await page.getByText(/captcha|multi.factor|two.factor|verification code|verify your identity|too many attempts|too many requests|access denied|account locked/i).filter({ visible: true }).count()) return { code: 'ACCESS_CONTROL' };
  if (await page.locator(LOGIN_SELECTORS.validation).isVisible() && (await page.locator(LOGIN_SELECTORS.validation).innerText()).trim()) return { code: 'LOGIN_REJECTED' };
  const loginVisible = await page.locator(LOGIN_SELECTORS.password).isVisible();
  // A redirect alone is not authentication evidence. Verify sign-out controls or
  // the live-observed protected dashboard and its loaded Reports navigation.
  const signOut = page.getByRole('link', { name: /^(log\s*out|sign\s*out)$/i }).or(page.getByRole('button', { name: /^(log\s*out|sign\s*out)$/i }));
  // Verified live UI: after login Zonal opens /portal/messages/Dashboard and
  // builds its protected Reports navigation through GetMenuTabs (XHR POST).
  const protectedDashboard = /^\/portal\/messages\/dashboard(?:\.aspx)?\/?$/i.test(location.pathname)
    && await page.getByRole('link', { name: 'Reports', exact: true }).filter({ visible: true }).count() > 0
    && await page.getByText('Dashboard', { exact: true }).filter({ visible: true }).count() > 0;
  if (!loginVisible && (await signOut.filter({ visible: true }).count() > 0 || protectedDashboard)) return {
    code: 'AUTHENTICATED',
    discovery: {
      financialDetailVisible: await page.getByText('Financial Detail', { exact: true }).first().isVisible(),
      requestedBranchVisible: await page.getByText(/^003\s*[–-]\s*Parsons Green$/).first().isVisible(),
    },
  };
  return FAILURE;
}
/**
 * @param {(stage: string, reason: string) => void} diagnostic
 * @returns {Promise<import('./worker.ts').LoginResult>}
 */
export async function loginSession(page, credentials, diagnostic = () => {}) {
  diagnostic('LOGIN_PAGE', 'STARTED');
  const response = await page.goto(LOGIN_URL, { waitUntil: 'domcontentloaded', timeout: 15000 });
  if ([401, 403, 429].includes(response?.status() ?? 0)) return { code: 'ACCESS_CONTROL' };
  if ((response?.status() ?? 0) >= 500) return { code: 'BROWSER_FAILED' };
  diagnostic('LOGIN_PAGE', 'OK');
  const before = await inspectLoginState(page);
  if (before.code === 'ACCESS_CONTROL') return before;
  if (!await page.locator(LOGIN_SELECTORS.username).isVisible() || !await page.locator(LOGIN_SELECTORS.password).isVisible() || !await page.locator(LOGIN_SELECTORS.submit).isVisible()) return { code: 'REPORT_CHANGED' };
  diagnostic('LOGIN_FORM', 'OK');
  await page.locator(LOGIN_SELECTORS.username).fill(credentials.username);
  await page.locator(LOGIN_SELECTORS.password).fill(credentials.password);
  // One authorised login attempt, no retries. Click only the verified Login control.
  diagnostic('LOGIN_SUBMIT', 'STARTED');
  await page.locator(LOGIN_SELECTORS.submit).click();
  diagnostic('LOGIN_VERIFY', 'STARTED');
  for (let attempt = 0; attempt < 40; attempt++) {
    const state = await inspectLoginState(page);
    if (state.code !== 'LOGIN_UNVERIFIED') { diagnostic('LOGIN_VERIFY', state.code); return state; }
    await page.waitForTimeout(300);
  }
  diagnostic('LOGIN_VERIFY', 'SUCCESS_MARKER_MISSING');
  return FAILURE;
}
