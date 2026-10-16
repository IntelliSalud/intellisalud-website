/**
 * site.config.js — IntelliSalud central site constants
 *
 * IndexNow key for intellisalud.com.
 * Rules:
 *   • Must be served at https://intellisalud.com/<key>.txt
 *     with ONLY the key string as content (no newline, no BOM).
 *   • Never reuse this key on another domain.
 *   • The file public/<key>.txt is the live key file — do not rename it.
 */
module.exports = {
  domain: 'intellisalud.com',
  indexNowKey: 'e762b40af37a0ddcdac9f81363f9856f',
};
