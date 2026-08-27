// GENERATED FILE — DO NOT EDIT.
// Source: src/config/mosaic/lob2panels.csv, src/config/mosaic/lob2maplayers.csv
// Regenerate with: npm run generate:mosaic
//
// 'all-lines' has no CSV column: it is synthesized from every row in both
// files (see ALL_LINES_* in scripts/generate-mosaic-config.mjs) so the
// catalogue view stays complete without hand-maintained cells.
import type { MapLayers } from '@/types';

export const LOB_IDS = [
  'political-violence',
  'cyber',
  'political-risk',
  'transactional-liability',
  'financial-institutions',
  'professional-liability',
  'environmental-liability',
  'specialty-casualty',
  'all-lines',
] as const;

export type LobId = (typeof LOB_IDS)[number];

export interface LobSelection<T extends string = string> {
  /** Offered and enabled by default. */
  on: readonly T[];
  /** Offered but off by default — user can turn it on. */
  avail: readonly T[];
}

export const LOB_PANELS: Record<LobId, LobSelection> = {
  'political-violence': {
    on: ['map', 'live-news', 'pipeline-status', 'threat-timeline', 'strategic-posture', 'forecast', 'intel', 'cascade', 'escalation-correlation', 'politics', 'middleeast'],
    avail: ['energy', 'world-clock', 'energy-risk-overview', 'storage-facility-map', 'fuel-shortages', 'energy-crisis', 'live-webcams', 'us', 'europe', 'africa', 'latam', 'asia', 'thinktanks', 'displacement', 'population-exposure', 'cross-source-signals', 'geo-hubs'],
  },
  'cyber': {
    on: ['map', 'live-news', 'security', 'cloud', 'service-status', 'cascade', 'security-advisories'],
    avail: ['world-clock', 'ai', 'tech', 'policy', 'crypto', 'github', 'tech-readiness', 'stablecoins', 'ai-regulation', 'crypto-news', 'defi-tokens', 'fintech', 'cross-source-signals'],
  },
  'political-risk': {
    on: ['map', 'live-news', 'energy', 'mining-news', 'critical-minerals', 'energy-complex', 'pipeline-status', 'gcc-investments', 'energy-risk-overview', 'fuel-shortages', 'energy-crisis', 'forex', 'bonds', 'centralbanks', 'economic-news', 'threat-timeline', 'strategic-posture', 'forecast', 'intel', 'escalation-correlation', 'politics', 'middleeast', 'africa', 'latam', 'gov', 'thinktanks', 'displacement', 'national-debt', 'cross-source-signals'],
    avail: ['commodity-news', 'gold-silver', 'base-metals', 'mining-companies', 'commodity-regulation', 'commodities', 'macro-signals', 'gulf-economies', 'world-clock', 'commodities-news', 'macro-tiles', 'gccNews', 'us', 'europe', 'asia', 'fao-food-price-index', 'disease-outbreaks', 'climate-news', 'geo-hubs'],
  },
  'transactional-liability': {
    on: ['map', 'live-news', 'macro-signals', 'gcc-investments', 'tech', 'startups', 'unicorns', 'ipo', 'funding', 'fin-regulation', 'institutional'],
    avail: ['renewable', 'positioning-247', 'critical-minerals', 'base-metals', 'mining-companies', 'commodity-regulation', 'commodities', 'energy-complex', 'heatmap', 'gulf-economies', 'world-clock', 'ai', 'vcblogs', 'regionalStartups', 'accelerators', 'policy', 'layoffs', 'finance', 'crypto', 'hardware', 'cloud', 'events', 'tech-readiness', 'etf-flows', 'stablecoins', 'tech-hubs', 'ai-regulation', 'markets-news', 'forex', 'bonds', 'centralbanks', 'economic-news', 'macro-tiles', 'fear-greed', 'market-breadth', 'derivatives', 'analysis', 'gccNews', 'forecast', 'politics', 'us', 'europe', 'middleeast', 'africa', 'latam', 'asia', 'gov'],
  },
  'financial-institutions': {
    on: ['map', 'live-news', 'heatmap', 'macro-signals', 'security', 'finance', 'crypto', 'ipo', 'etf-flows', 'stablecoins', 'markets-news', 'forex', 'bonds', 'centralbanks', 'economic-news', 'macro-tiles', 'fear-greed', 'market-breadth', 'derivatives', 'fintech', 'fin-regulation', 'institutional', 'national-debt'],
    avail: ['positioning-247', 'gold-silver', 'gulf-economies', 'gcc-investments', 'world-clock', 'unicorns', 'layoffs', 'funding', 'service-status', 'crypto-news', 'crypto-heatmap', 'defi-tokens', 'ai-tokens', 'other-tokens', 'aaii-sentiment', 'analysis'],
  },
  'professional-liability': {
    on: ['map', 'live-news', 'ai', 'tech', 'security', 'policy', 'cloud', 'service-status', 'ai-regulation', 'fintech', 'fin-regulation'],
    avail: ['world-clock', 'startups', 'accelerators', 'layoffs', 'hardware', 'dev', 'github', 'ipo', 'events', 'tech-readiness', 'tech-hubs', 'gov', 'disease-outbreaks', 'security-advisories'],
  },
  'environmental-liability': {
    on: ['map', 'renewable', 'live-news', 'energy', 'mining-news', 'mining-companies', 'pipeline-status', 'energy-risk-overview', 'storage-facility-map', 'climate-news', 'population-exposure'],
    avail: ['species', 'commodity-news', 'critical-minerals', 'commodity-regulation', 'commodities', 'energy-complex', 'world-clock', 'energy-crisis', 'live-webcams', 'windy-webcams', 'commodities-news', 'cascade'],
  },
  'specialty-casualty': {
    on: ['map', 'live-news', 'storage-facility-map', 'disease-outbreaks', 'population-exposure'],
    avail: ['renewable', 'energy', 'mining-news', 'mining-companies', 'pipeline-status', 'world-clock', 'fuel-shortages', 'live-webcams', 'windy-webcams', 'cascade', 'climate-news'],
  },
  'all-lines': {
    on: ['map', 'positive-feed', 'progress', 'counters', 'spotlight', 'breakthroughs', 'digest', 'species', 'renewable', 'giving', 'live-news', 'insights', 'commodity-news', 'liquidity-shifts', 'news-market-correlation', 'positioning-247', 'gold-silver', 'energy', 'mining-news', 'critical-minerals', 'base-metals', 'mining-companies', 'supply-chain', 'china-corridors', 'china-activity-nowcast', 'commodity-regulation', 'markets', 'commodities', 'energy-complex', 'pipeline-status', 'oil-inventories', 'gold-intelligence', 'heatmap', 'macro-signals', 'trade-policy', 'sanctions-pressure', 'economic', 'gulf-economies', 'gcc-investments', 'consumer-prices', 'airline-intel', 'polymarket', 'world-clock', 'monitors', 'latest-brief', 'energy-risk-overview', 'chokepoint-strip', 'storage-facility-map', 'fuel-shortages', 'energy-disruptions', 'hormuz-tracker', 'energy-crisis', 'fuel-prices', 'climate', 'live-webcams', 'windy-webcams', 'ai', 'tech', 'startups', 'vcblogs', 'regionalStartups', 'unicorns', 'accelerators', 'security', 'policy', 'layoffs', 'finance', 'crypto', 'hardware', 'cloud', 'dev', 'github', 'ipo', 'funding', 'producthunt', 'events', 'internet-disruptions', 'service-status', 'global-procurement', 'tech-readiness', 'etf-flows', 'stablecoins', 'tech-hubs', 'ai-regulation', 'stock-analysis', 'stock-backtest', 'daily-market-brief', 'markets-news', 'forex', 'fx', 'bonds', 'commodities-news', 'crypto-news', 'crypto-heatmap', 'defi-tokens', 'ai-tokens', 'other-tokens', 'centralbanks', 'economic-news', 'macro-tiles', 'fear-greed', 'aaii-sentiment', 'market-breadth', 'fsi', 'yield-curve', 'earnings-calendar', 'economic-calendar', 'cot-positioning', 'derivatives', 'fintech', 'fin-regulation', 'institutional', 'analysis', 'gccNews', 'wsb-ticker-scanner', 'threat-timeline', 'strategic-posture', 'forecast', 'cii', 'strategic-risk', 'intel', 'gdelt-intel', 'cascade', 'military-correlation', 'escalation-correlation', 'economic-correlation', 'disaster-correlation', 'politics', 'us', 'europe', 'middleeast', 'africa', 'latam', 'asia', 'gov', 'thinktanks', 'chat-analyst', 'satellite-fires', 'grocery-basket', 'bigmac', 'fao-food-price-index', 'ucdp-events', 'disease-outbreaks', 'social-velocity', 'displacement', 'climate-news', 'population-exposure', 'security-advisories', 'defense-patents', 'radiation-watch', 'thermal-escalation', 'oref-sirens', 'telegram-intel', 'national-debt', 'cross-source-signals', 'market-implications', 'regional-intelligence', 'deduction', 'geo-hubs'],
    avail: [],
  },
};

export const LOB_LAYERS: Record<LobId, LobSelection<keyof MapLayers>> = {
  'political-violence': {
    on: ['hotspots', 'conflicts', 'bases', 'cables', 'pipelines', 'military', 'protests', 'ucdpEvents', 'gpsJamming', 'ciiChoropleth'],
    avail: ['iranAttacks', 'nuclear', 'irradiators', 'radiationWatch', 'satellites', 'ais', 'tradeRoutes', 'flights', 'displacement', 'outages', 'cyberThreats', 'waterways', 'minerals', 'resilienceScore', 'sanctions', 'miningSites', 'commodityPorts', 'webcams', 'storageFacilities', 'fuelShortages', 'liveTankers'],
  },
  'cyber': {
    on: ['cables', 'datacenters', 'outages', 'cyberThreats', 'gpsJamming', 'cloudRegions'],
    avail: ['satellites', 'ciiChoropleth', 'resilienceScore', 'sanctions', 'techHQs', 'stockExchanges', 'financialCenters'],
  },
  'political-risk': {
    on: ['hotspots', 'conflicts', 'pipelines', 'tradeRoutes', 'protests', 'ucdpEvents', 'displacement', 'waterways', 'economic', 'minerals', 'ciiChoropleth', 'resilienceScore', 'sanctions', 'centralBanks', 'commodityHubs', 'gulfInvestments', 'miningSites', 'commodityPorts', 'fuelShortages', 'liveTankers'],
    avail: ['iranAttacks', 'bases', 'nuclear', 'cables', 'military', 'ais', 'climate', 'outages', 'cyberThreats', 'natural', 'gpsJamming', 'stockExchanges', 'financialCenters', 'happiness', 'processingPlants', 'diseaseOutbreaks'],
  },
  'transactional-liability': {
    on: ['economic', 'ciiChoropleth', 'sanctions', 'startupHubs', 'techHQs', 'stockExchanges', 'financialCenters', 'gulfInvestments', 'renewableInstallations'],
    avail: ['hotspots', 'conflicts', 'spaceports', 'pipelines', 'datacenters', 'tradeRoutes', 'climate', 'cyberThreats', 'waterways', 'minerals', 'resilienceScore', 'accelerators', 'cloudRegions', 'techEvents', 'centralBanks', 'commodityHubs', 'miningSites'],
  },
  'financial-institutions': {
    on: ['outages', 'cyberThreats', 'economic', 'sanctions', 'stockExchanges', 'financialCenters', 'centralBanks'],
    avail: ['conflicts', 'cables', 'datacenters', 'tradeRoutes', 'protests', 'waterways', 'ciiChoropleth', 'resilienceScore', 'startupHubs', 'cloudRegions', 'commodityHubs', 'gulfInvestments'],
  },
  'professional-liability': {
    on: ['datacenters', 'cyberThreats', 'techHQs', 'cloudRegions', 'financialCenters'],
    avail: ['spaceports', 'cables', 'outages', 'economic', 'ciiChoropleth', 'resilienceScore', 'sanctions', 'startupHubs', 'accelerators', 'techEvents', 'stockExchanges', 'diseaseOutbreaks'],
  },
  'environmental-liability': {
    on: ['nuclear', 'irradiators', 'radiationWatch', 'pipelines', 'climate', 'weather', 'natural', 'fires', 'renewableInstallations', 'miningSites', 'processingPlants', 'storageFacilities', 'liveTankers'],
    avail: ['spaceports', 'ais', 'displacement', 'minerals', 'ciiChoropleth', 'resilienceScore', 'commodityHubs', 'speciesRecovery', 'commodityPorts', 'webcams', 'diseaseOutbreaks'],
  },
  'specialty-casualty': {
    on: ['weather', 'natural', 'fires', 'processingPlants', 'diseaseOutbreaks', 'storageFacilities'],
    avail: ['hotspots', 'conflicts', 'nuclear', 'irradiators', 'radiationWatch', 'spaceports', 'pipelines', 'datacenters', 'ais', 'tradeRoutes', 'flights', 'protests', 'climate', 'waterways', 'gpsJamming', 'ciiChoropleth', 'resilienceScore', 'renewableInstallations', 'miningSites', 'commodityPorts', 'webcams', 'fuelShortages', 'liveTankers'],
  },
  'all-lines': {
    on: [],
    avail: ['iranAttacks', 'hotspots', 'conflicts', 'bases', 'nuclear', 'irradiators', 'radiationWatch', 'spaceports', 'satellites', 'cables', 'pipelines', 'datacenters', 'military', 'ais', 'tradeRoutes', 'flights', 'protests', 'ucdpEvents', 'displacement', 'climate', 'weather', 'outages', 'cyberThreats', 'natural', 'fires', 'waterways', 'economic', 'minerals', 'gpsJamming', 'ciiChoropleth', 'resilienceScore', 'dayNight', 'sanctions', 'startupHubs', 'techHQs', 'accelerators', 'cloudRegions', 'techEvents', 'stockExchanges', 'financialCenters', 'centralBanks', 'commodityHubs', 'gulfInvestments', 'positiveEvents', 'kindness', 'happiness', 'speciesRecovery', 'renewableInstallations', 'miningSites', 'processingPlants', 'commodityPorts', 'webcams', 'diseaseOutbreaks', 'storageFacilities', 'fuelShortages', 'liveTankers'],
  },
};
