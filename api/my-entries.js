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

  const { campaign_id: campaignId, seller_id: sellerId, authToken } = req.body || {};
  if (!campaignId || !sellerId || !authToken) {
    res.status(400).json({ error: 'Missing campaign_id, seller_id, or authToken' });
    return;
  }

  const supabaseUrl = process.env.SUPABASE_URL || '';
  const serviceKey = process.env.SUPABASE_SERVICE_KEY || process.env.SERVICE_KEY || '';
  const bucketName = process.env.SUPABASE_STORAGE_BUCKET || 'campaign-photos';

  if (!supabaseUrl || !serviceKey) {
    res.status(500).json({ error: 'Supabase configuration is missing.' });
    return;
  }

  const supabase = createClient(supabaseUrl, serviceKey);

  try {
    const { data: { user }, error: authError } = await supabase.auth.getUser(authToken);
    if (authError || !user || user.id !== String(sellerId)) {
      res.status(403).json({ error: 'Access denied' });
      return;
    }

    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single();

    if (profileError || profile?.role !== 'seller') {
      res.status(403).json({ error: 'Access denied' });
      return;
    }

    const { data: rows, error: entriesError } = await supabase
      .from('entries')
      .select('id, customer_name, comment, created_at, photo_url')
      .eq('campaign_id', campaignId)
      .eq('seller_id', user.id)
      .order('created_at', { ascending: false });

    if (entriesError) {
      res.status(500).json({ error: entriesError.message || 'Failed to fetch entries' });
      return;
    }

    const entries = [];
    for (const entry of rows || []) {
      let signedPhotoUrl = null;
      if (entry.photo_url) {
        const { data, error: signedUrlError } = await supabase.storage
          .from(bucketName)
          .createSignedUrl(entry.photo_url, 60 * 60);

        if (signedUrlError) {
          throw signedUrlError;
        }
        signedPhotoUrl = data?.signedUrl || null;
      }

      entries.push({
        id: entry.id,
        customer_name: entry.customer_name,
        comment: entry.comment,
        created_at: entry.created_at,
        photo_url: signedPhotoUrl
      });
    }

    res.status(200).json({ entries });
  } catch (error) {
    res.status(500).json({ error: error.message || 'Failed to fetch entries' });
  }
};