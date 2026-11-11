'use strict';

/**
 * Small, dependency-free network blocklist for the desktop shell.
 *
 * This is a startup fallback and the popup URL check. The full EasyList /
 * EasyPrivacy engine is loaded by @ghostery/adblocker-electron; this list keeps
 * the most common ad/tracker networks blocked while that engine initializes or
 * when its filter download is unavailable.
 */
const AD_HOSTS = new Set([
  '33across.com',
  'adform.net',
  'adnxs.com',
  'adsafeprotected.com',
  'adsrvr.org',
  'amazon-adsystem.com',
  'bidswitch.net',
  'casalemedia.com',
  'criteo.com',
  'criteo.net',
  'doubleclick.net',
  'doubleverify.com',
  'googleadservices.com',
  'googlesyndication.com',
  'googletagmanager.com',
  'googletagservices.com',
  'gumgum.com',
  'media.net',
  'mgid.com',
  'moatads.com',
  'onclickads.net',
  'openx.net',
  'outbrain.com',
  'popads.net',
  'propellerads.com',
  'pubmatic.com',
  'quantserve.com',
  'revcontent.com',
  'rubiconproject.com',
  'scorecardresearch.com',
  'sharethrough.com',
  'smartadserver.com',
  'taboola.com',
  'teads.tv',
  'yieldmo.com',
  'zedo.com',
]);

const AD_PATH_PATTERNS = [
  /\/(?:adserver|adsbygoogle|gampad|pagead|popads|popunder|prebid)(?:[/?._-]|$)/i,
];

function isBlockedAdUrl(rawUrl) {
  let parsed;
  try {
    parsed = new URL(String(rawUrl));
  } catch {
    return false;
  }

  if (!['http:', 'https:'].includes(parsed.protocol)) return false;

  const host = parsed.hostname.toLowerCase().replace(/^www\./, '').replace(/\.$/, '');
  if (!host) return false;

  for (const adHost of AD_HOSTS) {
    if (host === adHost || host.endsWith(`.${adHost}`)) return true;
  }

  return AD_PATH_PATTERNS.some((pattern) => pattern.test(`${parsed.pathname}${parsed.search}`));
}

module.exports = { isBlockedAdUrl };
