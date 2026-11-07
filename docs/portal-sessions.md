# Independent customer, administrator and kitchen sign-ins

The three portals now keep separate Supabase SDK sessions in the same browser/profile. Signing in or out of one portal does not change either of the other two. Tabs within the same portal share its sign-in and sign out together.

On a shared computer, sign out of each portal you signed into before leaving it.

| Portal | Page | Account access |
| --- | --- | --- |
| Customer | `/` and `/orders/` | Guest checkout or a customer account |
| Administrator | `/admin/` | An account with the protected administrator role |
| Kitchen | `/kitchen/` | A chef or administrator account |

Open a staff page to reach its own sign-in, or choose **Customer**, **Administrator**, or **Kitchen display** on the account page. This chooses a sign-in destination; it does not assign a role. Staff signup is not offered, and normal signup continues to create only customer accounts. An administrator can sign into both staff portals independently with the same credentials. Opening the other portal requires its own sign-in once if it is not already signed in.

## Apply the frontend update

Hard-refresh every already-open portal tab once after deployment so it loads the new authentication code. Existing customer/guest sessions keep their original SDK storage key and Auth user UUID, preserving accessible guest history. Legacy staff sessions are moved to the matching staff portal only after the database verifies their role; a newer portal login is never overwritten. Only migration metadata identifying the old Auth session family is retained to prevent a stale pre-update tab from silently restoring it after logout. No order records are changed or deleted.

This update needs no new SQL, credentials or Supabase Auth settings. It does not recover a guest session that the previous shared-login behaviour already replaced. Clearing browser site data or signing into another customer account still removes access to that guest session. Staff portal sign-ins no longer do so.

## Implementation and access boundaries

`session-scope.js` selects a portal from the page, a validated login return path, or the account page's portal parameter. Customer/order pages always use the customer session, regardless of a supplied portal query. The customer key stays compatible with the previous SDK default; staff keys are distinct per project, site base path and portal. SDK BroadcastChannel and refresh operations therefore stay within that portal.

Password sign-in first uses a nonpersistent SDK client to verify credentials and read `my_role`. Only a permitted account is persisted in the destination portal, so an unsuccessful staff login cannot replace a guest/customer or another staff login. An ordinary account-page sign-in with staff credentials routes to that account's staff portal without overwriting a current customer session. All normal application RPCs use the current portal's caller JWT. Database roles, confirmed-account requirements, RLS and checked RPCs remain the access boundary; changing a URL or storage key cannot grant staff permissions.

Logout uses Supabase's local-session scope for that portal's independently created Auth session. The same account signed into both staff portals has distinct sessions, so logout in one does not revoke the other's refresh token. All tabs sharing the signed-out portal hide their protected content and return to its sign-in.

The existing `/auth/` confirmation/recovery callback remains unchanged. Before requesting an account email, the browser records only the selected portal name; the latest PKCE email callback uses that portal's SDK verifier and session storage. Open the link in the same browser/profile that requested it, and use the most recently requested email flow. The hint selects storage only and never supplies an account identity or role. Expired links remain in their portal, and password recovery does not overwrite the other portals' sessions.

## Verification

Browser regressions use the official SDK with isolated Auth/REST fixtures, unique Auth session families, refresh-token rotation and local-session revocation. They open customer, chef and admin pages in one browser context, exercise sign-in/out and reloads, track a guest order, confirm same-portal logout propagation, verify independent admin access to the kitchen, reject disallowed staff login, migrate an older staff session and complete a kitchen password-recovery callback. Pure tests check path/return validation and storage-key separation. These checks do not create live accounts/orders or send real emails.
