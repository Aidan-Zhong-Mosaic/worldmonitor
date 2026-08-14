// GENERATED FILE — DO NOT EDIT.
// Source: src/config/mosaic/lob2panels.csv, src/config/mosaic/lob2maplayers.csv
// Regenerate with: npm run generate:mosaic
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
    on: ['map', 'live-news', 'insights', 'pipeline-status', 'monitors', 'threat-timeline', 'strategic-posture', 'forecast', 'cii', 'strategic-risk', 'intel', 'gdelt-intel', 'cascade', 'military-correlation', 'escalation-correlation', 'politics', 'middleeast', 'ucdp-events', 'social-velocity', 'thermal-escalation', 'oref-sirens', 'telegram-intel', 'regional-intelligence'],
    avail: ['energy', 'supply-chain', 'china-corridors', 'sanctions-pressure', 'airline-intel', 'polymarket', 'world-clock', 'latest-brief', 'energy-risk-overview', 'chokepoint-strip', 'storage-facility-map', 'fuel-shortages', 'energy-disruptions', 'hormuz-tracker', 'energy-crisis', 'live-webcams', 'economic-correlation', 'us', 'europe', 'africa', 'latam', 'asia', 'thinktanks', 'chat-analyst', 'displacement', 'population-exposure', 'cross-source-signals', 'deduction', 'geo-hubs'],
  },
  'cyber': {
    on: ['map', 'live-news', 'insights', 'monitors', 'security', 'cloud', 'internet-disruptions', 'service-status', 'cascade', 'security-advisories'],
    avail: ['world-clock', 'latest-brief', 'ai', 'tech', 'policy', 'crypto', 'github', 'tech-readiness', 'stablecoins', 'ai-regulation', 'crypto-news', 'defi-tokens', 'fintech', 'chat-analyst', 'cross-source-signals'],
  },
  'political-risk': {
    on: ['map', 'live-news', 'insights', 'energy', 'mining-news', 'critical-minerals', 'supply-chain', 'china-corridors', 'china-activity-nowcast', 'energy-complex', 'pipeline-status', 'trade-policy', 'sanctions-pressure', 'economic', 'gcc-investments', 'polymarket', 'monitors', 'energy-risk-overview', 'chokepoint-strip', 'fuel-shortages', 'energy-disruptions', 'hormuz-tracker', 'energy-crisis', 'global-procurement', 'forex', 'fx', 'bonds', 'centralbanks', 'economic-news', 'fsi', 'threat-timeline', 'strategic-posture', 'forecast', 'cii', 'strategic-risk', 'intel', 'gdelt-intel', 'escalation-correlation', 'economic-correlation', 'politics', 'middleeast', 'africa', 'latam', 'gov', 'thinktanks', 'ucdp-events', 'social-velocity', 'displacement', 'national-debt', 'cross-source-signals', 'regional-intelligence'],
    avail: ['commodity-news', 'news-market-correlation', 'gold-silver', 'base-metals', 'mining-companies', 'commodity-regulation', 'markets', 'commodities', 'oil-inventories', 'gold-intelligence', 'macro-signals', 'gulf-economies', 'consumer-prices', 'world-clock', 'latest-brief', 'fuel-prices', 'climate', 'internet-disruptions', 'commodities-news', 'macro-tiles', 'yield-curve', 'economic-calendar', 'cot-positioning', 'gccNews', 'military-correlation', 'disaster-correlation', 'us', 'europe', 'asia', 'chat-analyst', 'grocery-basket', 'bigmac', 'fao-food-price-index', 'disease-outbreaks', 'climate-news', 'telegram-intel', 'market-implications', 'deduction', 'geo-hubs'],
  },
  'transactional-liability': {
    on: ['map', 'live-news', 'insights', 'supply-chain', 'markets', 'macro-signals', 'trade-policy', 'sanctions-pressure', 'economic', 'gcc-investments', 'monitors', 'tech', 'startups', 'unicorns', 'ipo', 'funding', 'stock-analysis', 'earnings-calendar', 'fin-regulation', 'institutional', 'cii', 'strategic-risk'],
    avail: ['renewable', 'liquidity-shifts', 'news-market-correlation', 'positioning-247', 'critical-minerals', 'base-metals', 'mining-companies', 'china-corridors', 'china-activity-nowcast', 'commodity-regulation', 'commodities', 'energy-complex', 'heatmap', 'gulf-economies', 'polymarket', 'world-clock', 'latest-brief', 'ai', 'vcblogs', 'regionalStartups', 'accelerators', 'policy', 'layoffs', 'finance', 'crypto', 'hardware', 'cloud', 'events', 'global-procurement', 'tech-readiness', 'etf-flows', 'stablecoins', 'tech-hubs', 'ai-regulation', 'stock-backtest', 'daily-market-brief', 'markets-news', 'forex', 'fx', 'bonds', 'centralbanks', 'economic-news', 'macro-tiles', 'fear-greed', 'market-breadth', 'fsi', 'yield-curve', 'economic-calendar', 'derivatives', 'analysis', 'gccNews', 'forecast', 'gdelt-intel', 'economic-correlation', 'politics', 'us', 'europe', 'middleeast', 'africa', 'latam', 'asia', 'gov', 'chat-analyst', 'defense-patents', 'market-implications'],
  },
  'financial-institutions': {
    on: ['map', 'live-news', 'insights', 'liquidity-shifts', 'news-market-correlation', 'markets', 'heatmap', 'macro-signals', 'sanctions-pressure', 'economic', 'monitors', 'security', 'finance', 'crypto', 'ipo', 'internet-disruptions', 'etf-flows', 'stablecoins', 'stock-analysis', 'daily-market-brief', 'markets-news', 'forex', 'bonds', 'centralbanks', 'economic-news', 'macro-tiles', 'fear-greed', 'market-breadth', 'fsi', 'yield-curve', 'economic-calendar', 'derivatives', 'fintech', 'fin-regulation', 'institutional', 'economic-correlation', 'national-debt', 'market-implications'],
    avail: ['positioning-247', 'gold-silver', 'china-activity-nowcast', 'gold-intelligence', 'trade-policy', 'gulf-economies', 'gcc-investments', 'world-clock', 'latest-brief', 'unicorns', 'layoffs', 'funding', 'service-status', 'stock-backtest', 'fx', 'crypto-news', 'crypto-heatmap', 'defi-tokens', 'ai-tokens', 'other-tokens', 'aaii-sentiment', 'earnings-calendar', 'cot-positioning', 'analysis', 'wsb-ticker-scanner', 'cii', 'chat-analyst'],
  },
  'professional-liability': {
    on: ['map', 'live-news', 'insights', 'monitors', 'ai', 'tech', 'security', 'policy', 'cloud', 'service-status', 'ai-regulation', 'fintech', 'fin-regulation'],
    avail: ['airline-intel', 'world-clock', 'latest-brief', 'startups', 'accelerators', 'layoffs', 'hardware', 'dev', 'github', 'ipo', 'events', 'internet-disruptions', 'tech-readiness', 'tech-hubs', 'gov', 'chat-analyst', 'disease-outbreaks', 'security-advisories', 'defense-patents'],
  },
  'environmental-liability': {
    on: ['map', 'renewable', 'live-news', 'insights', 'energy', 'mining-news', 'mining-companies', 'pipeline-status', 'monitors', 'energy-risk-overview', 'storage-facility-map', 'energy-disruptions', 'climate', 'disaster-correlation', 'satellite-fires', 'climate-news', 'population-exposure', 'radiation-watch'],
    avail: ['species', 'commodity-news', 'critical-minerals', 'commodity-regulation', 'commodities', 'energy-complex', 'oil-inventories', 'world-clock', 'latest-brief', 'energy-crisis', 'live-webcams', 'windy-webcams', 'commodities-news', 'cascade', 'chat-analyst', 'thermal-escalation'],
  },
  'specialty-casualty': {
    on: ['map', 'live-news', 'insights', 'airline-intel', 'monitors', 'storage-facility-map', 'climate', 'disaster-correlation', 'satellite-fires', 'disease-outbreaks', 'population-exposure'],
    avail: ['renewable', 'energy', 'mining-news', 'mining-companies', 'supply-chain', 'pipeline-status', 'consumer-prices', 'world-clock', 'latest-brief', 'chokepoint-strip', 'fuel-shortages', 'energy-disruptions', 'fuel-prices', 'live-webcams', 'windy-webcams', 'global-procurement', 'strategic-risk', 'cascade', 'chat-analyst', 'climate-news', 'radiation-watch'],
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
};
