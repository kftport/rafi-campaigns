const { createClient } = require('@supabase/supabase-js');
const JSZip = require('jszip');
const ExcelJS = require('exceljs');

function sanitizeFileName(value) {
  return String(value || 'customer')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, '-')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/[.]+$/g, '')
    .replace(/^-+|-+$/g, '') || 'customer';
}

function getStoragePath(photoUrl) {
  if (!photoUrl) {
    return null;
  }

  const trimmed = String(photoUrl).trim();
  if (!trimmed) {
    return null;
  }

  const normalized = decodeURIComponent(trimmed.split('?')[0]);

  const publicPrivatePatterns = [
    /\/object\/(?:public|private|authenticated)\/[^/]+\/(.+)$/i,
    /\/object\/sign\/[^/]+\/(.+)$/i
  ];

  for (const pattern of publicPrivatePatterns) {
    const match = normalized.match(pattern);
    if (match && match[1]) {
      return match[1].replace(/^\//, '');
    }
  }

  if (/^https?:\/\//i.test(trimmed)) {
    try {
      const parsed = new URL(trimmed);
      const pathname = parsed.pathname.replace(/^\//, '');
      const match = pathname.match(/^storage\/v1\/object\/(?:public|private|authenticated|sign)\/[^/]+\/(.+)$/i);
      if (match && match[1]) {
        return decodeURIComponent(match[1].replace(/^\//, ''));
      }
      return decodeURIComponent(pathname);
    } catch (error) {
      return decodeURIComponent(normalized);
    }
  }

  return decodeURIComponent(normalized);
}

function getExtensionFromUrl(photoUrl, fallback = 'jpg') {
  const trimmed = String(photoUrl || '').trim();
  if (!trimmed) {
    return `.${fallback}`;
  }

  const match = trimmed.match(/\.([a-zA-Z0-9]+)(?:[?#].*)?$/);
  if (match && match[1]) {
    return `.${match[1].toLowerCase()}`;
  }

  return `.${fallback}`;
}

function buildUniquePhotoName(customerName, usedNames, extension) {
  const baseName = sanitizeFileName(customerName || 'customer');
  let candidate = `${baseName}${extension}`;
  let occurrence = 2;

  while (usedNames.has(candidate)) {
    candidate = `${baseName} (${occurrence})${extension}`;
    occurrence += 1;
  }

  usedNames.add(candidate);
  return candidate;
}

function sanitizeExcelSheetName(name) {
  return String(name || 'campaign').replace(/[\\/:*?\[\]]/g, '-').slice(0, 31) || 'campaign';
}

function formatGreekDate(value) {
  if (!value) {
    return '—';
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return '—';
  }

  return date.toLocaleDateString('el-GR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric'
  });
}

function sanitizeCampaignFilename(value) {
  return sanitizeFileName(value)
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/\.+$/g, '') || 'campaign';
}

module.exports = async function handler(req, res) {
  console.log('[export] request start', {
    method: req.method,
    originalUrl: req.originalUrl,
    body: req.body || {},
    query: req.query || {}
  });

  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    console.log('[export] OPTIONS request received, returning 204');
    res.status(204).end();
    return;
  }

  if (req.method !== 'GET' && req.method !== 'POST') {
    console.log('[export] unsupported method', req.method);
    res.status(405).json({ error: 'Μη επιτρεπτή μέθοδος.' });
    return;
  }

  const body = req.body || {};
  const query = req.query || {};
  const campaignId = body.campaign_id || body.campaignId || query.campaign_id || query.campaignId;
  const userId = body.userId || body.user_id || query.userId || query.user_id;

  console.log('[export] parsed request params', { campaignId, userId });

  if (!campaignId) {
    console.error('[export] missing campaign_id');
    res.status(400).json({ error: 'Λείπει το campaign_id.' });
    return;
  }

  if (!userId) {
    console.error('[export] missing userId');
    res.status(400).json({ error: 'Λείπει το userId.' });
    return;
  }

  const supabaseUrl = process.env.SUPABASE_URL || '';
  const serviceKey = process.env.SUPABASE_SERVICE_KEY || process.env.SERVICE_KEY || '';

  console.log('[export] supabase config present', { hasSupabaseUrl: Boolean(supabaseUrl), hasServiceKey: Boolean(serviceKey) });

  if (!supabaseUrl || !serviceKey) {
    console.error('[export] missing Supabase environment config');
    res.status(500).json({ error: 'Το Supabase service key / config λείπουν.' });
    return;
  }

  const supabase = createClient(supabaseUrl, serviceKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false
    }
  });

  try {
    console.log('[export] querying profile', { userId });
    const { data: profileData, error: profileError } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', userId)
      .single();

    console.log('[export] profile lookup result', { profileData, profileError: profileError && { message: profileError.message, code: profileError.code } });

    if (profileError || !profileData || profileData.role !== 'supervisor') {
      console.error('[export] profile authorization failed', { profileError, profileData });
      res.status(403).json({ error: 'Δεν έχετε δικαίωμα για εξαγωγή πακέτου.' });
      return;
    }

    console.log('[export] querying campaign', { campaignId });
    const { data: campaignData, error: campaignError } = await supabase
      .from('campaigns')
      .select('id, name')
      .eq('id', campaignId)
      .single();

    console.log('[export] campaign lookup result', { campaignData, campaignError: campaignError && { message: campaignError.message, code: campaignError.code } });

    if (campaignError || !campaignData) {
      console.error('[export] campaign not found', { campaignError, campaignId });
      res.status(404).json({ error: 'Η καμπάνια δεν βρέθηκε.' });
      return;
    }

    console.log('[export] querying entries', { campaignId });
    const { data: entriesData, error: entriesError } = await supabase
      .from('entries')
      .select('id, customer_name, seller_id, photo_url, comment, created_at')
      .eq('campaign_id', campaignId)
      .order('created_at', { ascending: false });

    console.log('[export] entries lookup result', {
      count: entriesData ? entriesData.length : 0,
      entriesError: entriesError && { message: entriesError.message, code: entriesError.code }
    });

    if (entriesError) {
      console.error('[export] failed to load entries', entriesError);
      res.status(500).json({ error: entriesError.message || 'Δεν μπόρεσε να φορτωθούν οι εγγραφές της καμπάνιας.' });
      return;
    }

    const zip = new JSZip();
    const usedPhotoNames = new Set();
    const rows = [];

    for (const entry of entriesData || []) {
      console.log('[export] processing entry', {
        entryId: entry.id,
        customerName: entry.customer_name,
        sellerId: entry.seller_id,
        photoUrl: entry.photo_url
      });

      const { data: sellerData, error: sellerError } = await supabase
        .from('profiles')
        .select('full_name')
        .eq('id', entry.seller_id)
        .single();

      const sellerName = sellerError || !sellerData ? '—' : sellerData.full_name || '—';
      const storagePath = getStoragePath(entry.photo_url);

      console.log('[export] storage path resolved', {
        entryId: entry.id,
        originalPhotoUrl: entry.photo_url,
        storagePath
      });

      if (!storagePath) {
        console.warn('[export] skipping entry because no storage path', { entryId: entry.id, photoUrl: entry.photo_url });
        rows.push({
          customer_name: entry.customer_name || '—',
          seller_name: sellerName,
          created_at: formatGreekDate(entry.created_at),
          comment: entry.comment || '—',
          photo_filename: ''
        });
        continue;
      }

      console.log('[export] downloading photo from storage', { entryId: entry.id, bucket: 'campaign-photos', storagePath });
      const { data: photoBlob, error: photoError } = await supabase.storage
        .from('campaign-photos')
        .download(storagePath);

      console.log('[export] photo download result', {
        entryId: entry.id,
        storagePath,
        photoError: photoError && { message: photoError.message, status: photoError.status },
        hasBlob: Boolean(photoBlob),
        blobSize: photoBlob ? photoBlob.size : null
      });

      if (photoError || !photoBlob) {
        console.error('[export] photo download failed for entry', {
          entryId: entry.id,
          storagePath,
          error: photoError && { message: photoError.message, status: photoError.status }
        });
        rows.push({
          customer_name: entry.customer_name || '—',
          seller_name: sellerName,
          created_at: formatGreekDate(entry.created_at),
          comment: entry.comment || '—',
          photo_filename: ''
        });
        continue;
      }

      const extension = getExtensionFromUrl(entry.photo_url, 'jpg');
      const photoFileName = buildUniquePhotoName(entry.customer_name, usedPhotoNames, extension);
      const photoBuffer = Buffer.from(await photoBlob.arrayBuffer());
      zip.file(photoFileName, photoBuffer);
      console.log('[export] photo file added to zip', { entryId: entry.id, photoFileName, bytes: photoBuffer.length });

      rows.push({
        customer_name: entry.customer_name || '—',
        seller_name: sellerName,
        created_at: formatGreekDate(entry.created_at),
        comment: entry.comment || '—',
        photo_filename: photoFileName
      });
    }

    console.log('[export] rows prepared for Excel', { rowCount: rows.length });

    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet(sanitizeExcelSheetName(campaignData.name || 'campaign'));
    worksheet.columns = [
      { header: 'Επωνυμία', key: 'customer_name', width: 28 },
      { header: 'Πωλητής (full_name)', key: 'seller_name', width: 24 },
      { header: 'Ημερομηνία', key: 'created_at', width: 18 },
      { header: 'Σχόλιο', key: 'comment', width: 40 },
      { header: 'Αρχείο φωτό', key: 'photo_filename', width: 32 }
    ];

    rows.forEach((row) => {
      worksheet.addRow({
        customer_name: row.customer_name,
        seller_name: row.seller_name,
        created_at: row.created_at,
        comment: row.comment,
        photo_filename: row.photo_filename
      });
    });

    const excelBuffer = await workbook.xlsx.writeBuffer();
    const safeCampaignName = sanitizeCampaignFilename(campaignData.name || 'campaign');
    const zipFileName = `campaign-${safeCampaignName}.zip`;
    const excelFileName = `campaign-${safeCampaignName}.xlsx`;

    zip.file(excelFileName, excelBuffer);
    console.log('[export] excel written to zip', { excelFileName, bytes: excelBuffer.length });

    const zipBuffer = await zip.generateAsync({
      type: 'nodebuffer',
      compression: 'DEFLATE',
      compressionOptions: { level: 9 }
    });

    console.log('[export] zip generated successfully', { zipFileName, bytes: zipBuffer.length });

    const asciiFallbackName = 'campaign-export.zip';
    const encodedUtf8FileName = encodeURIComponent(zipFileName)
      .replace(/%20/g, ' ')
      .replace(/%2B/g, '+');

    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="${asciiFallbackName}"; filename*=UTF-8''${encodedUtf8FileName}`);
    res.send(zipBuffer);
    console.log('[export] zip sent to client', { zipFileName, asciiFallbackName, encodedUtf8FileName });
  } catch (error) {
    console.error('[export] fatal exception', error);
    res.status(500).json({
      error: error.message || 'Δεν ήταν δυνατή η εξαγωγή του πακέτου της καμπάνιας.'
    });
  }
};
