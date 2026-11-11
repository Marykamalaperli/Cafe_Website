# Administrator dates and reports

Overview and Orders open on the current Bangalore day. The date/period controls filter order counts, collected order revenue, popular dishes, activity and the order list together. Reports offer daily, calendar-week (Monday–Sunday), calendar-month and all-time views. Choose any date in a week/month to view that complete period. Back to today restores the live daily view; navigating back to Overview also restores today. Refresh starts on today, and live polling recalculates the current Bangalore date after midnight.

Revenue retains the existing collected-order definition: totals, including delivery fees, for orders placed in the selected period that currently have collected status. Cancelled and unfinished orders contribute no revenue. This is not a bank-receipt ledger or revenue grouped by collection/payment timestamp. Empty days show zero. Records are retained; filtering does not delete orders or change customer/chef permissions. Menu availability and pending payment actions remain operational rather than historical.

This frontend update uses the existing administrator-scoped operations response and requires no new SQL. Browser tests use isolated Auth/order fixtures, including midnight boundaries, historical dates, weekly/monthly/all-time totals, return to today, and narrow layouts.
