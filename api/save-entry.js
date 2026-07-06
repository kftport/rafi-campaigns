const { createClient } = require('@supabase/supabase-js');

function sanitizeFileName(fileName) {
  return String(fileName || 'upload')
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
    userId,
    campaignId,
    customerName,
    photoBase64,
    photoFileName,
    photoMimeType,
    comment
  } = req.body || {};

  if (!userId || !campaignId || !customerName || (!photoBase64 && !req.body?.photoUrl)) {
    res.status(400).json({ error: 'Missing required fields' });
    return;
  }

  const supabaseUrl = process.env.SUPABASE_URL || '';
  const serviceKey = process.env.SUPABASE_SERVICE_KEY || '';
  const bucketName = process.env.SUPABASE_STORAGE_BUCKET || 'campaign-photos';

  if (!supabaseUrl || !serviceKey) {
    res.status(500).json({ error: 'Supabase configuration is missing.' });
    return;
  }

  const supabase = createClient(supabaseUrl, serviceKey);

  try {
    let photoUrl = req.body?.photoUrl || null;

    if (photoBase64) {
      const safeFileName = sanitizeFileName(photoFileName || 'upload.jpg');
      const filePath = `campaigns/${campaignId}/${Date.now()}-${safeFileName}`;
      const buffer = Buffer.from(photoBase64, 'base64');

      try {
        await supabase.storage.from(bucketName).upload(filePath, buffer, {
          contentType: photoMimeType || 'image/jpeg',
          upsert: true
        });
      } catch (storageError) {
        if (storageError?.status === 404 || /bucket/i.test(storageError?.message || '')) {
          await supabase.storage.createBucket(bucketName, { public: false });
          await supabase.storage.from(bucketName).upload(filePath, buffer, {
            contentType: photoMimeType || 'image/jpeg',
            upsert: true
          });
        } else {
          throw storageError;
        }
      }

      photoUrl = filePath;
    }

    if (!photoUrl) {
      res.status(400).json({ error: 'Unable to build a photo URL.' });
      return;
    }

    const { error } = await supabase.from('entries').insert({
      campaign_id: campaignId,
      seller_id: userId,
      customer_name: customerName,
      photo_url: photoUrl,
      comment: comment || null
    });

    if (error) {
      res.status(500).json({ error: error.message || 'Failed to save entry' });
      return;
    }

    res.status(200).json({ success: true, message: 'Η εγγραφή αποθηκεύτηκε' });
  } catch (error) {
    res.status(500).json({ error: error.message || 'Failed to save entry' });
  }
};
