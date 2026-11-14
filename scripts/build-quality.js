import {execFileSync} from 'node:child_process';
// Never audit customer records or call a live backend from CI.
execFileSync(process.execPath,['scripts/build-pages.js'],{stdio:'inherit',env:{...process.env,VITE_SUPABASE_URL:'',SUPABASE_URL:'',VITE_SUPABASE_PUBLISHABLE_KEY:'',SUPABASE_PUBLISHABLE_KEY:'',REQUIRE_SUPABASE:'false',APP_DEMO_MODE:'false'}});
