import { test } from 'node:test';
import assert from 'node:assert/strict';

function configure(t, url, key, legacy = false) {
  const names = ['VITE_SUPABASE_URL', 'VITE_SUPABASE_PUBLISHABLE_KEY', 'SUPABASE_URL', 'SUPABASE_PUBLISHABLE_KEY'];
  const previous = Object.fromEntries(names.map(name => [name, process.env[name]]));
  names.forEach(name => { delete process.env[name]; });
  const prefix = legacy ? '' : 'VITE_';
  if (url !== undefined) process.env[prefix + 'SUPABASE_URL'] = url;
  if (key !== undefined) process.env[prefix + 'SUPABASE_PUBLISHABLE_KEY'] = key;
  t.after(() => {
    for (const [name, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[name]; else process.env[name] = value;
    }
  });
}

test('optional Supabase module imports without credentials and reports missing configuration only when requested', async t => {
  configure(t, undefined, undefined);
  const { getSupabaseClient } = await import('../server/supabase-client.js?test=missing');
  assert.equal(typeof getSupabaseClient, 'function');
  assert.throws(getSupabaseClient, /Missing Supabase environment variables: VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY/);
});

test('Supabase retains compatibility with the original server variable names', async t => {
  configure(t, 'https://configuration-test.supabase.co', 'sb_publishable_configuration_test_only', true);
  const { getSupabaseClient } = await import('../server/supabase-client.js?test=legacy');
  assert.equal(typeof getSupabaseClient().from, 'function');
});

test('Supabase rejects a malformed project URL before any connection is attempted', async t => {
  configure(t, 'not-a-url', 'sb_publishable_configuration_test_only');
  const { getSupabaseClient } = await import('../server/supabase-client.js?test=invalid-url');
  assert.throws(getSupabaseClient, /Invalid supabaseUrl/);
});

test('Supabase client reuses configured instance without network requests or persisted authentication', async t => {
  configure(t, 'https://configuration-test.supabase.co', 'sb_publishable_configuration_test_only');
  const previousFetch = globalThis.fetch;
  let requests = 0;
  globalThis.fetch = async () => { requests++; throw new Error('Unexpected network request in a configuration test.'); };
  t.after(() => { globalThis.fetch = previousFetch; });
  const { getSupabaseClient } = await import('../server/supabase-client.js?test=configured');
  const client = getSupabaseClient();
  assert.equal(getSupabaseClient(), client);
  assert.equal(typeof client.from, 'function');
  const { data, error } = await client.auth.getSession();
  assert.equal(error, null); assert.equal(data.session, null);
  assert.equal(requests, 0);
});
