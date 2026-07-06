const { createClient } = require('@supabase/supabase-js');

function extractStoragePath(photoUrl) {
  if (!photoUrl) {
    return null;
  }

  const trimmed = String(photoUrl).trim();
  if (!trimmed) {
    return null;
  }

  if (/\/object\/public\//.test(trimmed)) {
    const parts = trimmed.split('/object/public/');
    if (parts[1]) {
      const pathAfterBucket = parts[1].split('/').slice(1).join('/');
      return pathAfterBucket;
    }
  }

  if (/^https?:\/\//i.test(trimmed)) {
    try {
      const parsed = new URL(trimmed);
      return parsed.pathname.replace(/^\//, '');
    } catch (error) {
      return trimmed;
    }
  }

  return trimmed;
}

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

  const { userId, campaignId } = req.body || {};
  if (!userId || !campaignId) {
    res.status(400).json({ error: 'Missing userId or campaignId' });
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

    const { data: entriesData, error: entriesError } = await supabase
      .from('entries')
      .select('id, campaign_id, seller_id, customer_name, photo_url, comment, created_at')
      .eq('campaign_id', campaignId)
      .order('created_at', { ascending: false });

    if (entriesError) {
      res.status(500).json({ error: entriesError.message || 'Failed to fetch entries' });
      return;
    }

    const entries = [];

    for (const entry of entriesData || []) {
      const { data: profile, error: profileLookupError } = await supabase
        .from('profiles')
        .select('full_name')
        .eq('id', entry.seller_id)
        .single();

      if (profileLookupError) {
        continue;
      }

      let signedUrl = null;
      if (entry.photo_url) {
        const photoPath = extractStoragePath(entry.photo_url);
        if (photoPath) {
          const { data, error: signedUrlError } = await supabase.storage
            .from('campaign-photos')
            .createSignedUrl(photoPath, 60 * 60);

          if (!signedUrlError && data?.signedUrl) {
            signedUrl = data.signedUrl;
          }
        }
      }

      entries.push({
        id: entry.id,
        customer_name: entry.customer_name,
        comment: entry.comment,
        created_at: entry.created_at,
        seller_name: profile?.full_name || '—',
        photo_url: signedUrl
      });
    }

    res.status(200).json({ entries });
  } catch (error) {
    res.status(500).json({ error: error.message || 'Failed to fetch campaign entries' });
  }
};
