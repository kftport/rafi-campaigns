const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();
const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_KEY;
console.log('URL set:', !!url, 'KEY set:', !!key);
const supabase = createClient(url, key, {
  auth: { persistSession: false, autoRefreshToken: false }
});
(async () => {
  const { data: campaigns, error: cErr } = await supabase
    .from('campaigns')
    .select('id,name')
    .order('created_at', { ascending: false })
    .limit(10);
  console.log('campaigns query error:', cErr && cErr.message);
  console.log('campaigns:', campaigns && campaigns.map(c => ({ id: c.id, name: c.name })));

  const { data: profiles, error: pErr } = await supabase
    .from('profiles')
    .select('id,role,full_name')
    .limit(10);
  console.log('profiles query error:', pErr && pErr.message);
  console.log('profiles:', profiles && profiles.map(p => ({ id: p.id, role: p.role, full_name: p.full_name })));
})();
