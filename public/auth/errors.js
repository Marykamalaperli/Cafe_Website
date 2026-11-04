// Public Auth errors are reduced to useful, fixed messages. Never display raw
// provider responses, email addresses, credentials or database error details.
export function signupErrorMessage(error = {}) {
 const code = typeof error.code === 'string' ? error.code : '';
 const reference = /^[a-z0-9_]{1,64}$/i.test(code) ? ` Reference: ${code}.` : Number.isInteger(error.status) && error.status >= 400 && error.status <= 599 ? ` Reference: HTTP ${error.status}.` : '';
 const messages = {
  email_address_not_authorized: 'Confirmation emails are restricted to approved recipients. BitesBro needs its signup email service configured before this address can be used.',
  email_address_invalid: 'Enter a valid email address with an inbox you can access.',
  over_email_send_rate_limit: 'The confirmation email limit has been reached. Please wait before trying again.',
  over_request_rate_limit: 'Too many account requests were made. Please wait before trying again.',
  weak_password: 'That password does not meet the account security requirements. Choose a longer, unique password.',
  signup_disabled: 'New account creation is currently disabled. Please contact BitesBro.',
  email_provider_disabled: 'Email account creation is currently unavailable. Please contact BitesBro.',
  user_already_exists: 'An account already exists for this email. Try signing in or resetting your password.',
  email_exists: 'An account already exists for this email. Try signing in or resetting your password.',
  captcha_failed: 'The security check could not be completed. Please try again or contact BitesBro.',
  captcha_protection: 'The security check could not be completed. Please try again or contact BitesBro.'
 };
 if (messages[code]) return messages[code] + reference;
 // Some Auth versions use unexpected_failure for these server-side failures.
 // Classify only known messages; do not echo their raw text or response body.
 if (/error sending (?:confirmation|verification) email/i.test(error.message || '')) {
  return 'The confirmation email could not be sent. Please try again later or contact BitesBro.' + reference;
 }
 if (/database error (?:saving|creating) (?:new )?user/i.test(error.message || '')) {
  return 'Account setup could not be saved. BitesBro needs to check its account database configuration.' + reference;
 }
 if (['AuthRetryableFetchError', 'TypeError', 'TimeoutError', 'AbortError'].includes(error.name) && !error.status) {
  return 'The account service could not be reached. Check your connection and try again.';
 }
 if (error.status === 429) return 'Too many account requests were made. Please wait before trying again.' + reference;
 return 'Account creation could not be completed. Please try again later or contact BitesBro.' + reference;
}
