// Exercises the real browser login state machine using synthetic reports only.
// All traffic is fulfilled locally by Playwright; no Zonal credentials are used.
import { chromium, expect } from '@playwright/test';
import { LOGIN_URL, loginSession } from '../../src/lib/zonal/browser-session.mjs';
const browser = await chromium.launch({ headless: true, ...(process.env.ZONAL_BROWSER_CHANNEL === 'chrome' ? { channel: 'chrome' } : {}) });
try {
  for (const outcome of ['verified', 'dashboard', 'public-menu', 'rejected', 'challenge', 'unknown'] as const) {
    const page = await browser.newPage();
    let submissions = 0;
    await page.route('**/*', async route => {
      if (route.request().method() === 'POST') {
        submissions++;
        if (outcome === 'dashboard') return route.fulfill({contentType:'text/html',body:'<script>location.replace("/portal/messages/Dashboard")</script>'});
        await route.fulfill({ contentType: 'text/html', body: outcome === 'public-menu' ? '<h1>Dashboard</h1><a href="/reports">Reports</a>' : outcome === 'verified' ? '<a href="/logout">Logout</a><h1>Financial Detail</h1><p>003 – Parsons Green</p>' : outcome === 'rejected' ? '<div id="ValidationResults">Invalid login</div>' : '<h1>Unknown destination</h1>' });
      } else {
        if (outcome === 'dashboard' && new URL(route.request().url()).pathname === '/portal/messages/Dashboard') return route.fulfill({contentType:'text/html',body:'<h1>Dashboard</h1><a href="/reports">Reports</a>'});
        await route.fulfill({ contentType: 'text/html', body: `<form method="post" action="${LOGIN_URL}"><input id="Content_LoginUser_UserName" name="username"><input id="Content_LoginUser_password" name="password" type="password"><a href="#" id="Content_LoginUser_btnLogin" onclick="this.closest('form').submit();return false">Login</a></form>${outcome === 'challenge' ? '<input autocomplete="one-time-code">' : ''}` });
      }
    });
    const result = await loginSession(page, { username: 'synthetic-fixture', password: 'synthetic-fixture-only' });
    expect(result.code).toBe({ verified: 'AUTHENTICATED', dashboard: 'AUTHENTICATED', 'public-menu': 'LOGIN_UNVERIFIED', rejected: 'LOGIN_REJECTED', challenge: 'ACCESS_CONTROL', unknown: 'LOGIN_UNVERIFIED' }[outcome]);
    expect(submissions).toBe(outcome === 'challenge' ? 0 : 1);
    await page.close();
  }
  console.log('Browser fixture checks passed: login verified/rejected/ambiguous, protected dashboard without logout link, public-menu rejection, security challenge stop, no retries. No live credentials or reports used.');
} finally { await browser.close(); }
