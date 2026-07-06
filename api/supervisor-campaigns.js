const { createClient } = require('@supabase/supabase-js');

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }

  if (req.method !== 'GET' && req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const { userId } = req.body || {};
  if (!userId) {
    res.status(400).json({ error: 'Missing userId' });
    return;
  }

  const supabaseUrl = process.env.SUPABASE_URL || '';
  const serviceKey = process.env.SUPABASE_SERVICE_KEY || process.env.SERVICE_KEY || '';

  if (!supabaseUrl || !serviceKey) {
    res.status(500).json({ error: 'Supabase configuration is missing.' });
    return;
  }

  const supabase = createClient(supabaseUrl, serviceKey);

  try {
    const { data: profileData, error: profileError } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', userId)
      .single();

    if (profileError || !profileData || profileData.role !== 'supervisor') {
      res.status(403).json({ error: 'Access denied' });
      return;
    }

    const { data: campaignsData, error: campaignsError } = await supabase
      .from('campaigns')
      .select('id, name, instruction, deadline, created_at')
      .order('created_at', { ascending: false });

    if (campaignsError) {
      res.status(500).json({ error: campaignsError.message || 'Failed to fetch campaigns' });
      return;
    }

    const campaigns = [];

    for (const campaign of campaignsData || []) {
      const { count, error: countError } = await supabase
        .from('entries')
        .select('*', { count: 'exact', head: true })
        .eq('campaign_id', campaign.id);

      if (countError) {
        res.status(500).json({ error: countError.message || 'Failed to count entries' });
        return;
      }

      campaigns.push({
        id: campaign.id,
        name: campaign.name,
        instruction: campaign.instruction,
        deadline: campaign.deadline,
        created_at: campaign.created_at,
        entries_count: count || 0
      });
    }

    res.status(200).json({ campaigns });
  } catch (error) {
    res.status(500).json({ error: error.message || 'Failed to fetch supervisor campaigns' });
  }
};
