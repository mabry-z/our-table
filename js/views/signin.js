import { esc, head } from '../ui.js';

export function vSignin(S, mode) {
  return `<div style="margin-top:12vh">${head('Our table', 'Welcome home')}</div>`
    + `<form class="cd" id="signin" style="padding:16px" novalidate>`
    + `<label class="ey" for="em">Email</label><input class="in" id="em" name="email" type="email" autocomplete="username" style="margin:6px 0 12px" value="${esc(S.email)}">`
    + `<label class="ey" for="pw">Password</label><input class="in" id="pw" name="password" type="password" autocomplete="current-password" style="margin:6px 0 8px">`
    + `<button class="big dk" type="submit"${S.busy ? ' disabled' : ''}>${S.busy ? 'Signing in' : 'Sign in'}</button>`
    + `<div class="err">${esc(S.signErr)}</div></form>`
    + `<div class="mu" style="text-align:center;margin:12px 8px">One shared plan and list for our household.</div>`
    + (mode === 'sample'
      ? `<div class="cd ghost" style="text-align:center"><div class="mu" style="margin-bottom:8px">No database connected yet.</div><button class="ib" data-a="sample" style="padding:8px 14px">Continue with sample data</button></div>`
      : '');
}

export function vNoHousehold(user) {
  return `<div style="margin-top:12vh">${head('Our table', 'Almost there')}</div>`
    + `<div class="cd" style="text-align:center">Your account (${esc(user?.email)}) isn't linked to the household yet.`
    + `<div class="mu" style="margin-top:6px">Run supabase/setup-members.sql with both emails, then reload.</div></div>`
    + `<button class="ib" data-a="signout" style="display:block;margin:12px auto">Sign out</button>`;
}
