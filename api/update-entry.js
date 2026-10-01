const { createClient } = require('@supabase/supabase-js');

function sanitizeFileName(fileName) {
  return String(fileName || 'photo.jpg')
    .replace(/\\/g, '/')
    .split('/')
    .pop()
    .replace(/[^a-zA-Z0-9._-]/g, '-');
}

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

  const {
    entry_id: entryId,
    userId,
    authToken,
    customer_name: customerName,
    comment,
    photoBase64,
    photoFileName,
    photoMimeType
  } = req.body || {};

  if (!entryId || !authToken || typeof customerName !== 'string' || !customerName.trim()) {
    res.status(400).json({ error: 'Missing entry_id, authToken, or customer_name' });
    return;
  }

  const supabaseUrl = process.env.SUPABASE_URL || '';
  const serviceKey = process.env.SUPABASE_SERVICE_KEY || process.env.SERVICE_KEY || '';
  const bucketName = process.env.SUPABASE_STORAGE_BUCKET || 'campaign-photos';

  if (!supabaseUrl || !serviceKey) {
    res.status(500).json({ error: 'Supabase configuration is missing.' });
    return;
  }

  const supabase = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false }
  });

  try {
    const { data: { user }, error: authError } = await supabase.auth.getUser(authToken);
    if (authError || !user || (userId && user.id !== String(userId))) {
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

    const { data: entry, error: entryError } = await supabase
      .from('entries')
      .select('id, seller_id, campaign_id')
      .eq('id', entryId)
      .single();

    if (entryError || !entry) {
      res.status(404).json({ error: 'Η εγγραφή δεν βρέθηκε.' });
      return;
    }

    if (String(entry.seller_id) !== String(user.id)) {
      res.status(403).json({ error: 'Δεν μπορείτε να επεξεργαστείτε εγγραφή άλλου πωλητή.' });
      return;
    }

    const updates = {
      customer_name: customerName.trim(),
      comment: typeof comment === 'string' && comment.trim() ? comment.trim() : null
    };
    let uploadedPhotoPath = null;

    if (photoBase64) {
      const safeFileName = sanitizeFileName(photoFileName || 'photo.jpg');
      uploadedPhotoPath = `campaigns/${entry.campaign_id}/${Date.now()}-${Math.random().toString(36).slice(2)}-${safeFileName}`;
      const photoBuffer = Buffer.from(photoBase64, 'base64');
      const { error: uploadError } = await supabase.storage
        .from(bucketName)
        .upload(uploadedPhotoPath, photoBuffer, {
          contentType: photoMimeType || 'image/jpeg',
          upsert: false
        });

      if (uploadError) {
        res.status(500).json({ error: uploadError.message || 'Δεν ήταν δυνατή η αποθήκευση της φωτογραφίας.' });
        return;
      }

      updates.photo_url = uploadedPhotoPath;
    }

    const { error: updateError } = await supabase
      .from('entries')
      .update(updates)
      .eq('id', entryId)
      .eq('seller_id', user.id);

    if (updateError) {
      if (uploadedPhotoPath) {
        await supabase.storage.from(bucketName).remove([uploadedPhotoPath]);
      }
      res.status(500).json({ error: updateError.message || 'Δεν ήταν δυνατή η ενημέρωση της εγγραφής.' });
      return;
    }

    res.status(200).json({ success: true, message: 'Οι αλλαγές αποθηκεύτηκαν.' });
  } catch (error) {
    res.status(500).json({ error: error.message || 'Δεν ήταν δυνατή η ενημέρωση της εγγραφής.' });
  }
};
