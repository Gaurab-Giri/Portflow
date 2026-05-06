/**
 * Vercel serverless function to proxy NewsAPI requests.
 * Keeps API key server-side. Set NEWS_API_KEY in Vercel env vars.
 */
const NEWS_SOURCES = 'bbc-news,reuters,associated-press,the-guardian,al-jazeera-english';

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const apiKey = process.env.NEWS_API_KEY || process.env.NEXT_PUBLIC_NEWS_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'News API key not configured', articles: [] });
  }

  const category = (req.query.category || '').toLowerCase();
  const validCategories = ['technology', 'business', 'general', 'science'];
  const useCategory = validCategories.includes(category);

  const params = new URLSearchParams({
    apiKey,
    pageSize: '21',
    language: 'en',
  });

  if (useCategory) {
    params.set('category', category);
    params.set('country', 'us');
  } else {
    params.set('sources', NEWS_SOURCES);
  }

  try {
    const url = `https://newsapi.org/v2/top-headlines?${params}`;
    const resp = await fetch(url);
    const data = await resp.json();
    if (data.status === 'error') {
      return res.status(400).json({ error: data.message || 'NewsAPI error', articles: [] });
    }
    return res.status(200).json({ articles: data.articles || [] });
  } catch (err) {
    console.error('News proxy error:', err);
    return res.status(500).json({ error: 'Failed to fetch news', articles: [] });
  }
};
