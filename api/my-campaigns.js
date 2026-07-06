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

  const { userId, authToken } = req.body || {};
  const resolvedUserId = userId || null;

  if (!resolvedUserId && !authToken) {
    res.status(400).json({ error: 'Missing userId or authToken' });
    return;
  }

  const supabase = createClient(process.env.SUPABASE_URL || '', process.env.SUPABASE_SERVICE_KEY || '');

  try {
    let sellerId = resolvedUserId;

    if (!sellerId && authToken) {
      const { data: { user }, error: userError } = await supabase.auth.getUser(authToken);
      if (userError || !user) {
        res.status(401).json({ error: 'Invalid auth token' });
        return;
      }
      sellerId = user.id;
    }

    const { data, error } = await supabase
      .from('campaign_sellers')
      .select('campaigns(id, name, instruction, deadline)')
      .eq('seller_id', sellerId);

    if (error) {
      res.status(500).json({ error: error.message || 'Failed to fetch campaigns' });
      return;
    }

    const campaigns = (data || [])
      .map((entry) => entry.campaigns)
      .filter(Boolean)
      .map((campaign) => ({
        id: campaign.id,
        name: campaign.name,
        instruction: campaign.instruction,
        deadline: campaign.deadline
      }));

    res.status(200).json({ campaigns });
  } catch (error) {
    res.status(500).json({ error: error.message || 'Failed to fetch campaigns' });
  }
};
