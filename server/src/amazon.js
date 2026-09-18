import axios from 'axios';

const domains = { US: 'www.amazon.com', CA: 'www.amazon.ca', UK: 'www.amazon.co.uk', DE: 'www.amazon.de', FR: 'www.amazon.fr', IT: 'www.amazon.it', ES: 'www.amazon.es', JP: 'www.amazon.co.jp' };
export async function fetchAmazonImage(marketplace, asin) {
  const domain = domains[marketplace];
  if (!domain) throw new Error('暂不支持站点 ' + marketplace + ' 的自动图片获取');
  const response = await axios.get('https://' + domain + '/dp/' + encodeURIComponent(asin), { timeout: 15000, headers: { 'User-Agent': 'Mozilla/5.0 (compatible; AMZManagement/1.0)', 'Accept-Language': 'en-US,en;q=0.9' } });
  const html = response.data;
  const match = html.match(/<meta[^>]+(?:property|name)=["'](?:og:image|twitter:image)["'][^>]+content=["']([^"']+)["']/i) || html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["'](?:og:image|twitter:image)["']/i);
  if (!match) throw new Error('未能从商品页面读取首图，请手工填写图片链接');
  return { imageUrl: match[1].replace(/&amp;/g, '&'), source: 'amazon-page' };
}
