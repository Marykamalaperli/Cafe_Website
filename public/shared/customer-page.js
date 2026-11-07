import { wireCustomerNavigation } from './customer-nav.js?v=customer-nav-1';
import { wireCustomerBag } from './customer-bag.js?v=customer-nav-1';
import { mountRoleNavigation } from './ui.js?v=customer-nav-1';

wireCustomerNavigation();
wireCustomerBag();
// Photo credits are public; an account lookup failure must never hide the credits.
mountRoleNavigation('customer', false).catch(() => {});
