const express = require('express');
const cors = require('cors');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });

const configHandler = require('./api/config');
const profileHandler = require('./api/profile');
const myCampaignsHandler = require('./api/my-campaigns');
const myEntriesHandler = require('./api/my-entries');
const saveEntryHandler = require('./api/save-entry');
const updateEntryHandler = require('./api/update-entry');
const supervisorCampaignsHandler = require('./api/supervisor-campaigns');
const campaignEntriesHandler = require('./api/campaign-entries');
const exportCampaignHandler = require('./api/export-campaign');

const app = express();

app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.static(path.join(__dirname, 'public')));

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

app.options('/api/config', configHandler);
app.get('/api/config', configHandler);

app.options('/api/profile', profileHandler);
app.post('/api/profile', profileHandler);

app.options('/api/my-campaigns', myCampaignsHandler);
app.post('/api/my-campaigns', myCampaignsHandler);

app.options('/api/my-entries', myEntriesHandler);
app.post('/api/my-entries', myEntriesHandler);

app.options('/api/save-entry', saveEntryHandler);
app.post('/api/save-entry', saveEntryHandler);

app.options('/api/update-entry', updateEntryHandler);
app.post('/api/update-entry', updateEntryHandler);

app.options('/api/supervisor-campaigns', supervisorCampaignsHandler);
app.post('/api/supervisor-campaigns', supervisorCampaignsHandler);
app.get('/api/supervisor-campaigns', supervisorCampaignsHandler);

app.options('/api/campaign-entries', campaignEntriesHandler);
app.post('/api/campaign-entries', campaignEntriesHandler);
app.get('/api/campaign-entries', campaignEntriesHandler);

app.options('/api/export-campaign', exportCampaignHandler);
app.post('/api/export-campaign', exportCampaignHandler);
app.get('/api/export-campaign', exportCampaignHandler);

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

const port = process.env.PORT || 3000;

app.listen(port, () => {
  console.log(`Server listening on port ${port}`);
});
