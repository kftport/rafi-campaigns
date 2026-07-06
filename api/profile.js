const { createClient } = require('@supabase/supabase-js');

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }

  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const { userId } = req.body || {};
  if (!userId) {
    res.status(400).json({ error: 'Missing userId' });
    return;
  }

  const supabase = createClient(process.env.SUPABASE_URL || '', process.env.SUPABASE_SERVICE_KEY || '');

  try {
    const { data, error } = await supabase.from('profiles').select('role').eq('id', userId).single();

    if (error) {
      res.status(404).json({ error: error.message });
      return;
    }

    res.status(200).json({ role: data?.role || null });
  } catch (error) {
    res.status(500).json({ error: error.message || 'Failed to fetch profile role' });
  }
};
