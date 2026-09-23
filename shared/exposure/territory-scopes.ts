/**
 * Territory scopes — every value of `parallel_syndicate_rbs_report.territory`,
 * resolved once into structure the matcher and the map can use.
 *
 * Source: the 177 distinct values in the RBS snapshot of run_date 2026-07-09.
 * RBS territory is a controlled vocabulary, not free text: 164 values are single
 * ISO country names, three are worldwide wordings, and ten carry no usable
 * geography. Resolving them here, reviewably, replaces parsing prose at runtime.
 *
 * Rules
 *   - Keys are the RBS strings EXACTLY, including their spellings ("Isle Of Man",
 *     "Libyan Arab Jamahiriya", "UK" alongside "United Kingdom"). Do not tidy them.
 *   - Codes are ISO 3166-1 alpha-2, matching the rest of this repo (CURATED_COUNTRIES).
 *   - `caveats` are shown to the underwriter. They never affect matching.
 *   - `needsReview: true` means RBS does not say where the cover is. The matcher
 *     never treats these as covered; the panel must show them as needing review
 *     rather than as unaffected.
 *
 * Adding a value: when RBS gains a territory not listed here, resolveTerritory()
 * returns a needs-review scope naming the missing string. Add one line below.
 */

export interface TerritoryScope {
  /** Cover applies everywhere except `excluded`. */
  worldwide: boolean;
  /** Countries covered, ISO alpha-2. Empty when `worldwide` is true. */
  included: readonly string[];
  /** Countries contractually excluded, ISO alpha-2. */
  excluded: readonly string[];
  /** Nuance for the card. Display only. */
  caveats: readonly string[];
  /** RBS does not say where this cover applies. */
  needsReview: boolean;
}

const country = (code: string): TerritoryScope => ({
  worldwide: false, included: [code], excluded: [], caveats: [], needsReview: false,
});

const unresolved = (why: string): TerritoryScope => ({
  worldwide: false, included: [], excluded: [], caveats: [why], needsReview: true,
});

export const TERRITORY_SCOPES: Readonly<Record<string, TerritoryScope>> = {
  // ── Worldwide wordings ───────────────────────────────────────────────────
  // A deliberate US-exposure gradient. The third abbreviates "exclusion" to
  // "exclsn"; a regex parser misses it and reports US cover on policies that
  // contractually exclude the USA. Encoded by hand for that reason.
  'Worldwide with USA exclusions but no USA exposure': {
    worldwide: true, included: [], excluded: ['US'],
    caveats: ['USA contractually excluded; underwriter states no USA exposure'],
    needsReview: false,
  },
  'Worldwide with USA exclsn inc. only min USA expos.': {
    worldwide: true, included: [], excluded: ['US'],
    caveats: ['USA excluded; only minimal USA exposure stated'],
    needsReview: false,
  },
  'Worldwide inc. significant USA exposure': {
    worldwide: true, included: [], excluded: [],
    caveats: ['Significant USA exposure'],
    needsReview: false,
  },

  // ── Region ───────────────────────────────────────────────────────────────
  'South America': {
    worldwide: false, included: ['AR', 'BO', 'BR', 'CL', 'CO', 'EC', 'GY', 'PY', 'PE', 'SR', 'UY', 'VE'], excluded: [],
    caveats: ['Region resolved to the 12 sovereign states; French Guiana and the Falklands not included'],
    needsReview: false,
  },

  // ── No usable geography ──────────────────────────────────────────────────
  'As per Dec':                unresolved('Territory is set out in the declaration, which RBS does not hold'),
  'Multi-Country Grade A':     unresolved('Multi-country cover (grade A); countries not listed in RBS'),
  'Multi-Country Grade B':     unresolved('Multi-country cover (grade B); countries not listed in RBS'),
  'Multi-Country Grade C':     unresolved('Multi-country cover (grade C); countries not listed in RBS'),
  'Multi-Country Grade D':     unresolved('Multi-country cover (grade D); countries not listed in RBS'),
  'Multi-Country Grade E':     unresolved('Multi-country cover (grade E); countries not listed in RBS'),
  'NON REPORTING TERRITORIES': unresolved('Recorded as non-reporting territories; no countries listed'),
  'European Currency Unit':    unresolved('Not a territory — likely a data entry error'),
  '""':                        unresolved('Territory recorded as empty quotes in RBS'),
  '':                          unresolved('Territory blank in RBS'),

  // ── Single countries ─────────────────────────────────────────────────────
  'Afghanistan':                                 country('AF'),
  'Albania':                                     country('AL'),
  'Algeria':                                     country('DZ'),
  'Angola':                                      country('AO'),
  'Argentina':                                   country('AR'),
  'Armenia':                                     country('AM'),
  'Aruba':                                       country('AW'),
  'Australia':                                   country('AU'),
  'Austria':                                     country('AT'),
  'Azerbaijan':                                  country('AZ'),
  'Bahamas':                                     country('BS'),
  'Bahrain':                                     country('BH'),
  'Bangladesh':                                  country('BD'),
  'Barbados':                                    country('BB'),
  'Belarus':                                     country('BY'),
  'Belgium':                                     country('BE'),
  'Belize':                                      country('BZ'),
  'Benin':                                       country('BJ'),
  'Bermuda':                                     country('BM'),
  'Bolivia':                                     country('BO'),  // ISO: Bolivia, Plurinational State of
  'Botswana':                                    country('BW'),
  'Brazil':                                      country('BR'),
  'British Virgin Islands':                      country('VG'),  // ISO: Virgin Islands, British
  'Bulgaria':                                    country('BG'),
  'Burkina Faso':                                country('BF'),
  'Burundi':                                     country('BI'),
  'Cameroon':                                    country('CM'),
  'Canada':                                      country('CA'),
  'Cayman Islands':                              country('KY'),
  'Chile':                                       country('CL'),
  'China':                                       country('CN'),
  'Colombia':                                    country('CO'),
  'Congo':                                       country('CG'),
  'Costa Rica':                                  country('CR'),
  'Croatia':                                     country('HR'),
  'Cyprus':                                      country('CY'),
  'Czech Republic':                              country('CZ'),  // ISO: Czechia
  'Democratic Republic of the Congo (was Zaire)':country('CD'),  // ISO: Congo, The Democratic Republic of the
  'Denmark':                                     country('DK'),
  'Djibouti':                                    country('DJ'),
  'Dominican Republic':                          country('DO'),
  'Ecuador':                                     country('EC'),
  'Egypt':                                       country('EG'),
  'El Salvador':                                 country('SV'),
  'Estonia':                                     country('EE'),
  'Ethiopia':                                    country('ET'),
  'Finland':                                     country('FI'),
  'France':                                      country('FR'),
  'Gabon':                                       country('GA'),
  'Georgia':                                     country('GE'),
  'Germany':                                     country('DE'),
  'Ghana':                                       country('GH'),
  'Gibraltar':                                   country('GI'),
  'Greece':                                      country('GR'),
  'Guam':                                        country('GU'),
  'Guatemala':                                   country('GT'),
  'Guernsey':                                    country('GG'),
  'Guinea':                                      country('GN'),
  'Guyana':                                      country('GY'),
  'Haiti':                                       country('HT'),
  'Honduras':                                    country('HN'),
  'Hong Kong':                                   country('HK'),
  'Hungary':                                     country('HU'),
  'Iceland':                                     country('IS'),
  'India':                                       country('IN'),
  'Indonesia':                                   country('ID'),
  'Iraq':                                        country('IQ'),
  'Ireland':                                     country('IE'),
  'Isle Of Man':                                 country('IM'),  // ISO: Isle of Man
  'Israel':                                      country('IL'),
  'Italy':                                       country('IT'),
  'Ivory Coast':                                 country('CI'),  // ISO: Côte d'Ivoire
  'Japan':                                       country('JP'),
  'Jersey':                                      country('JE'),
  'Jordan':                                      country('JO'),
  'Kazakhstan':                                  country('KZ'),
  'Kenya':                                       country('KE'),
  'Kosovo':                                      country('XK'),  // XK is user-assigned, not official ISO — used by the EU and IMF
  'Kuwait':                                      country('KW'),
  'Lebanon':                                     country('LB'),
  'Liberia':                                     country('LR'),
  'Libyan Arab Jamahiriya':                      country('LY'),  // ISO: Libya
  'Luxembourg':                                  country('LU'),
  'Macao':                                       country('MO'),
  'Macedonia (The Former Yugoslav Republic Of)': country('MK'),  // ISO: North Macedonia
  'Madagascar':                                  country('MG'),
  'Malawi':                                      country('MW'),
  'Malaysia':                                    country('MY'),
  'Maldives':                                    country('MV'),
  'Mali':                                        country('ML'),
  'Malta':                                       country('MT'),
  'Martinique':                                  country('MQ'),
  'Mauritania':                                  country('MR'),
  'Mauritius':                                   country('MU'),
  'Mexico':                                      country('MX'),
  'Moldova':                                     country('MD'),  // ISO: Moldova, Republic of
  'Monaco':                                      country('MC'),
  'Mongolia':                                    country('MN'),
  'Montenegro':                                  country('ME'),
  'Morocco':                                     country('MA'),
  'Mozambique':                                  country('MZ'),
  'Myanmar':                                     country('MM'),
  'Namibia':                                     country('NA'),
  'Nepal':                                       country('NP'),
  'Netherlands':                                 country('NL'),
  'New Caledonia':                               country('NC'),
  'New Zealand':                                 country('NZ'),
  'Nicaragua':                                   country('NI'),
  'Nigeria':                                     country('NG'),
  'Norway':                                      country('NO'),
  'Oman':                                        country('OM'),
  'Pakistan':                                    country('PK'),
  'Panama':                                      country('PA'),
  'Papua New Guinea':                            country('PG'),
  'Paraguay':                                    country('PY'),
  'Peru':                                        country('PE'),
  'Philippines':                                 country('PH'),
  'Poland':                                      country('PL'),
  'Portugal':                                    country('PT'),
  'Puerto Rico':                                 country('PR'),
  'Qatar':                                       country('QA'),
  'Republic Of Korea':                           country('KR'),  // ISO: Korea, Republic of
  'Reunion':                                     country('RE'),  // ISO: Réunion
  'Romania':                                     country('RO'),
  'Russian Federation':                          country('RU'),
  'Rwanda':                                      country('RW'),
  'Saudi Arabia':                                country('SA'),
  'Senegal':                                     country('SN'),
  'Serbia':                                      country('RS'),
  'Seychelles':                                  country('SC'),
  'Sierra Leone':                                country('SL'),
  'Singapore':                                   country('SG'),
  'Slovakia':                                    country('SK'),
  'Slovenia':                                    country('SI'),
  'Somalia':                                     country('SO'),
  'South Africa':                                country('ZA'),
  'South Sudan':                                 country('SS'),
  'Spain':                                       country('ES'),
  'Sri Lanka':                                   country('LK'),
  'Sudan':                                       country('SD'),
  'Suriname':                                    country('SR'),
  'Sweden':                                      country('SE'),
  'Switzerland':                                 country('CH'),
  'Taiwan, Province of China':                   country('TW'),
  'Thailand':                                    country('TH'),
  'Togo':                                        country('TG'),
  'Trinidad & Tobago':                           country('TT'),  // ISO: Trinidad and Tobago
  'Tunisia':                                     country('TN'),
  'Turkey':                                      country('TR'),  // ISO: Türkiye
  'Turkmenistan':                                country('TM'),
  'U.S. Virgin Islands':                         country('VI'),  // ISO: Virgin Islands, U.S.
  'Uganda':                                      country('UG'),
  'UK':                                          country('GB'),  // duplicate spelling of United Kingdom
  'Ukraine':                                     country('UA'),
  'United Arab Emirates':                        country('AE'),
  'United Kingdom':                              country('GB'),
  'United Republic of Tanzania':                 country('TZ'),  // ISO: Tanzania, United Republic of
  'United States':                               country('US'),
  'Uruguay':                                     country('UY'),
  'Uzbekistan':                                  country('UZ'),
  'Vietnam':                                     country('VN'),  // ISO: Viet Nam
  'Yemen':                                       country('YE'),
  'Zambia':                                      country('ZM'),
  'Zimbabwe':                                    country('ZW'),
};

/**
 * Look up a raw RBS territory. Never throws and never guesses: an unknown value
 * comes back as needs-review, naming the string so it can be added above.
 */
export function resolveTerritory(raw: string | null | undefined): TerritoryScope {
  const key = raw ?? '';
  return TERRITORY_SCOPES[key]
    ?? unresolved(`Territory "${key}" is not in the reviewed list — add it to TERRITORY_SCOPES`);
}

const REGION_NAMES: Intl.DisplayNames | null =
  typeof Intl !== 'undefined' && typeof Intl.DisplayNames === 'function'
    ? new Intl.DisplayNames(['en'], { type: 'region' })
    : null;

/**
 * English name for an ISO alpha-2 code ("NG" → "Nigeria"), for text an
 * underwriter reads. Uses the runtime's own region names, so there is no table
 * to maintain. Falls back to the code if the runtime cannot name it.
 */
export function countryName(code: string): string {
  try {
    return REGION_NAMES?.of(code) ?? code;
  } catch {
    return code;
  }
}
