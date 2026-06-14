const router = require('express').Router();
const pool   = require('../db/pool');
const auth   = require('../middleware/auth');

// Turns a hostname / referrer URL into a friendly source label
function sourceLabel(referrer) {
  if (!referrer) return 'Direct / unknown';
  try {
    const host = new URL(referrer).hostname.replace(/^www\./, '');
    if (host.includes('instagram')) return 'Instagram';
    if (host.includes('tiktok'))    return 'TikTok';
    if (host.includes('twitter') || host.includes('x.com')) return 'Twitter / X';
    if (host.includes('youtube'))  return 'YouTube';
    if (host.includes('facebook')) return 'Facebook';
    if (host.includes('google'))   return 'Google';
    if (host.includes('spotify'))  return 'Spotify';
    return host;
  } catch {
    return 'Direct / unknown';
  }
}

// Fill in any missing days in a date range with 0 counts.
// `valueKey` is the property name used in both the input rows and the output objects.
function fillDays(rows, days, valueKey = 'views') {
  const map = new Map(rows.map(r => [
    (r.date instanceof Date ? r.date.toISOString().slice(0,10) : String(r.date)),
    parseInt(r[valueKey] ?? r.count ?? r.views ?? 0)
  ]));
  const out = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date();
    d.setUTCDate(d.getUTCDate() - i);
    const key = d.toISOString().slice(0, 10);
    out.push({ date: key, [valueKey]: map.get(key) || 0 });
  }
  return out;
}

// GET /api/analytics — dashboard stats (pro/merch only)
router.get('/', auth, async (req, res) => {
  try {
    if (req.user.tier === 'free')
      return res.status(403).json({ error: 'Analytics available on Pro and Creator plans.' });

    const userId = req.user.id;

    // Total page views
    const { rows: totalViews } = await pool.query(
      'SELECT COUNT(*) AS total FROM page_views WHERE user_id = $1', [userId]
    );

    // Views last 30 days by day (filled with zeroes for gaps)
    const { rows: viewsRaw } = await pool.query(
      `SELECT DATE(viewed_at) AS date, COUNT(*) AS views
       FROM page_views
       WHERE user_id = $1 AND viewed_at > NOW() - INTERVAL '30 days'
       GROUP BY DATE(viewed_at)
       ORDER BY date`, [userId]
    );
    const viewsByDay = fillDays(viewsRaw, 30);

    // Views this week vs. previous week (for trend %)
    const { rows: views7d } = await pool.query(
      `SELECT COUNT(*) AS total FROM page_views
       WHERE user_id = $1 AND viewed_at > NOW() - INTERVAL '7 days'`, [userId]
    );
    const { rows: viewsPrev7d } = await pool.query(
      `SELECT COUNT(*) AS total FROM page_views
       WHERE user_id = $1
         AND viewed_at <= NOW() - INTERVAL '7 days'
         AND viewed_at >  NOW() - INTERVAL '14 days'`, [userId]
    );

    // Top links by clicks
    const { rows: topLinks } = await pool.query(
      `SELECT l.id, l.label, l.url, l.icon, COUNT(lc.id) AS clicks
       FROM links l
       LEFT JOIN link_clicks lc ON lc.link_id = l.id
       WHERE l.user_id = $1
       GROUP BY l.id, l.label, l.url, l.icon
       ORDER BY clicks DESC`, [userId]
    );

    // Total clicks across all links
    const totalClicks = topLinks.reduce((sum, l) => sum + parseInt(l.clicks), 0);

    // Click-through rate
    const views = parseInt(totalViews[0].total);
    const ctr = views > 0 ? Math.round((totalClicks / views) * 1000) / 10 : 0;

    // Top traffic sources (last 30 days)
    const { rows: referrerRows } = await pool.query(
      `SELECT referrer FROM page_views
       WHERE user_id = $1 AND viewed_at > NOW() - INTERVAL '30 days'`, [userId]
    );
    const sourceCounts = {};
    for (const r of referrerRows) {
      const label = sourceLabel(r.referrer);
      sourceCounts[label] = (sourceCounts[label] || 0) + 1;
    }
    const topSources = Object.entries(sourceCounts)
      .map(([source, count]) => ({ source, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);

    // Week-over-week trend %
    const prev = parseInt(viewsPrev7d[0].total);
    const cur  = parseInt(views7d[0].total);
    const trendPct = prev > 0 ? Math.round(((cur - prev) / prev) * 1000) / 10 : (cur > 0 ? 100 : 0);

    // Presave campaign stats (if a campaign has ever been created)
    let presave = null;
    const { rows: campaignRows } = await pool.query(
      'SELECT id, title, active, release_date FROM presave_campaigns WHERE user_id = $1', [userId]
    );
    if (campaignRows[0]) {
      const campaign = campaignRows[0];

      const { rows: byPlatform } = await pool.query(
        `SELECT platform, COUNT(*) AS count FROM presave_actions
         WHERE campaign_id = $1 GROUP BY platform`, [campaign.id]
      );
      const spotifyCount = parseInt(byPlatform.find(r => r.platform === 'spotify')?.count || 0);
      const appleCount   = parseInt(byPlatform.find(r => r.platform === 'apple')?.count || 0);
      const total = spotifyCount + appleCount;

      const { rows: byDayRaw } = await pool.query(
        `SELECT DATE(created_at) AS date, COUNT(*) AS count FROM presave_actions
         WHERE campaign_id = $1 AND created_at > NOW() - INTERVAL '30 days'
         GROUP BY DATE(created_at) ORDER BY date`, [campaign.id]
      );

      presave = {
        title:          campaign.title,
        active:         campaign.active,
        releaseDate:    campaign.release_date,
        total,
        spotify:        spotifyCount,
        apple:          appleCount,
        byDay:          fillDays(byDayRaw, 30, 'count'),
        conversionRate: views > 0 ? Math.round((total / views) * 1000) / 10 : 0,
      };
    }

    res.json({
      totalViews:  views,
      views7d:     cur,
      viewsPrev7d: prev,
      trendPct,
      totalClicks,
      ctr,
      viewsByDay,
      topLinks,
      topSources,
      presave,
    });
  } catch (err) {
    console.error('Analytics error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
