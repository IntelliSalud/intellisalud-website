#!/usr/bin/env node
/**
 * indexnow-submit.js — Submit URLs to IndexNow (Bing, Yandex, Seznam, Naver)
 *
 * Usage:
 *   node indexnow-submit.js              # submits every URL in sitemap.xml
 *   node indexnow-submit.js /path /path2 # submits only these URL paths
 *
 * Docs: https://www.indexnow.org/documentation
 */

const https = require('https');
const fs = require('fs');
const path = require('path');

const { domain, indexNowKey } = require('./site.config.js');

const SITEMAP = path.join(__dirname, 'public', 'sitemap.xml');
const KEY_LOCATION = `https://${domain}/${indexNowKey}.txt`;
const API_HOST = 'api.indexnow.org';

// ── Collect URLs ─────────────────────────────────────────────────────────────

function urlsFromSitemap() {
  const xml = fs.readFileSync(SITEMAP, 'utf8');
  const matches = [...xml.matchAll(/<loc>(https?:\/\/[^<]+)<\/loc>/g)];
  return matches.map(m => m[1].trim());
}

function urlsFromArgs(args) {
  return args.map(a => {
    // Accept bare paths like /blog/post or full URLs
    if (a.startsWith('http')) return a;
    return `https://${domain}${a.startsWith('/') ? '' : '/'}${a}`;
  });
}

const cliArgs = process.argv.slice(2).filter(a => !a.startsWith('--'));
const urlList = cliArgs.length > 0 ? urlsFromArgs(cliArgs) : urlsFromSitemap();

if (urlList.length === 0) {
  console.error('No URLs found. Check sitemap.xml or pass paths as arguments.');
  process.exit(1);
}

console.log(`\nIndexNow submission`);
console.log(`  host        : ${domain}`);
console.log(`  key         : ${indexNowKey}`);
console.log(`  keyLocation : ${KEY_LOCATION}`);
console.log(`  URLs        : ${urlList.length}`);
urlList.forEach(u => console.log('    ' + u));
console.log('');

// ── POST to IndexNow ─────────────────────────────────────────────────────────

const body = JSON.stringify({
  host: domain,
  key: indexNowKey,
  keyLocation: KEY_LOCATION,
  urlList,
});

const options = {
  hostname: API_HOST,
  path: '/indexnow',
  method: 'POST',
  headers: {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
  },
};

const req = https.request(options, res => {
  let data = '';
  res.on('data', chunk => (data += chunk));
  res.on('end', () => {
    const status = res.statusCode;
    console.log(`HTTP ${status} ${res.statusMessage}`);
    if (data) console.log('Response:', data);

    if (status === 200 || status === 202) {
      console.log('\n✅  Accepted — search engines will crawl the submitted URLs shortly.');
    } else if (status === 400) {
      console.error('\n❌  400 Bad Request — check that urlList is non-empty and all URLs belong to host.');
    } else if (status === 403) {
      console.error(`\n❌  403 Forbidden — key file not reachable at ${KEY_LOCATION}`);
      console.error('    Deploy the key file first, then re-run this script.');
    } else if (status === 422) {
      console.error('\n❌  422 Unprocessable — one or more URLs do not belong to ' + domain);
    } else if (status === 429) {
      console.error('\n⚠️  429 Too Many Requests — slow down; IndexNow rate-limits bulk submissions.');
    } else {
      console.error('\n⚠️  Unexpected status. Check https://www.indexnow.org/faq for details.');
    }
  });
});

req.on('error', err => {
  console.error('Request error:', err.message);
  process.exit(1);
});

req.write(body);
req.end();
