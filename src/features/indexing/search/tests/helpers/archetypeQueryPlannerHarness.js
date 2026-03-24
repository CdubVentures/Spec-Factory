export {
  classifySourceArchetypes,
  computeArchetypeCoverage,
  allocateArchetypeBudget,
  emitArchetypeQueries,
  classifyFieldSearchWorthiness,
  identifyUncoveredFields,
  emitHardFieldQueries,
  intentFingerprint,
  buildArchetypeSummary,
  buildCoverageAnalysis,
  isZeroYieldHost,
} from '../../archetypeQueryPlanner.js';

// Shared fixtures for archetypeQueryPlanner test slices.

export function makeSourceRegistry() {
  return {
    rtings_com: {
      display_name: 'RTINGS',
      tier: 'tier2_lab',
      base_url: 'https://www.rtings.com',
      content_types: ['review', 'benchmark'],
      field_coverage: {
        high: ['click_latency', 'sensor_latency', 'weight', 'shape'],
        medium: ['polling_rate', 'dpi', 'sensor', 'battery_hours'],
        low: []
      },
      discovery: {
        source_type: 'lab_review',
        priority: 98,
        enabled: true
      }
    },
    techpowerup_com: {
      display_name: 'TechPowerUp',
      tier: 'tier2_lab',
      base_url: 'https://www.techpowerup.com',
      content_types: ['review'],
      field_coverage: {
        high: ['sensor', 'lift', 'encoder', 'switch'],
        medium: ['weight', 'dpi', 'polling_rate', 'mcu'],
        low: []
      },
      discovery: {
        source_type: 'lab_review',
        priority: 94,
        enabled: true
      }
    },
    amazon_com: {
      display_name: 'Amazon',
      tier: 'tier3_retailer',
      base_url: 'https://www.amazon.com',
      content_types: ['product_page'],
      field_coverage: {
        high: ['weight', 'lngth', 'width', 'height'],
        medium: ['connection', 'sensor', 'battery_hours', 'colors'],
        low: []
      },
      discovery: {
        source_type: 'retailer',
        priority: 45,
        enabled: true
      }
    },
    eloshapes_com: {
      display_name: 'EloShapes',
      tier: 'tier3_database',
      base_url: 'https://www.eloshapes.com',
      content_types: ['spec_database'],
      field_coverage: {
        high: ['lngth', 'width', 'height', 'weight', 'shape'],
        medium: ['sensor', 'dpi', 'connection', 'grip'],
        low: []
      },
      discovery: {
        source_type: 'spec_database',
        priority: 60,
        enabled: true
      }
    },
    reddit_com: {
      display_name: 'Reddit',
      tier: 'tier4_community',
      base_url: 'https://www.reddit.com',
      content_types: ['discussion'],
      field_coverage: {
        high: [],
        medium: [],
        low: ['shape', 'grip', 'weight']
      },
      discovery: {
        source_type: 'community',
        priority: 20,
        enabled: true
      }
    },
    pcpartpicker_com: {
      display_name: 'PCPartPicker',
      tier: 'tier5_aggregator',
      base_url: 'https://pcpartpicker.com',
      content_types: ['product_page'],
      field_coverage: {
        high: [],
        medium: ['sensor', 'connection', 'price_range'],
        low: []
      },
      discovery: {
        source_type: 'aggregator',
        priority: 35,
        enabled: true
      }
    }
  };
}

export function makeSourceHosts() {
  return [
    { host: 'razer.com', tierName: 'manufacturer', role: 'manufacturer' },
    { host: 'rtings.com', tierName: 'lab', role: 'lab' },
    { host: 'techpowerup.com', tierName: 'lab', role: 'lab' },
    { host: 'amazon.com', tierName: 'retailer', role: 'retailer' },
    { host: 'eloshapes.com', tierName: 'database', role: 'database' }
  ];
}

export function makeManufacturerHosts() {
  return ['razer.com'];
}

export function makeIdentity() {
  return { brand: 'Razer', model: 'Viper V3 Pro', variant: '' };
}

export function makeFieldRules() {
  return {
    click_latency: {
      required_level: 'critical',
      search_hints: {
        query_terms: ['click latency ms', 'end to end latency'],
        domain_hints: ['rtings.com'],
        preferred_content_types: ['lab_review', 'benchmark']
      }
    },
    sensor: {
      required_level: 'required',
      search_hints: {
        query_terms: ['optical sensor model', 'sensor IC'],
        preferred_content_types: ['teardown_review', 'lab_review']
      }
    },
    weight: {
      required_level: 'expected',
      search_hints: {
        query_terms: ['weight grams'],
        domain_hints: ['razer.com'],
        preferred_content_types: ['spec']
      }
    },
    coating: {
      required_level: 'optional',
      search_hints: {
        query_terms: [],
        preferred_content_types: ['review']
      }
    },
    discontinued: {
      required_level: 'optional',
      search_hints: { query_terms: [] }
    },
    mcu: {
      required_level: 'expected',
      search_hints: {
        query_terms: ['microcontroller', 'MCU chip'],
        preferred_content_types: ['teardown_review']
      }
    },
    encoder: {
      required_level: 'expected',
      search_hints: {
        query_terms: ['scroll wheel encoder'],
        preferred_content_types: ['teardown_review']
      }
    },
    dpi: {
      required_level: 'expected',
      search_hints: {
        query_terms: ['max dpi', 'cpi'],
        preferred_content_types: ['spec']
      }
    },
    polling_rate: {
      required_level: 'critical',
      search_hints: {
        query_terms: ['polling rate hz'],
        preferred_content_types: ['spec']
      }
    },
    colors: {
      required_level: 'optional',
      search_hints: {
        query_terms: ['available colors'],
        preferred_content_types: ['product_page']
      }
    },
    battery_hours: {
      required_level: 'expected',
      search_hints: {
        query_terms: ['battery life hours'],
        preferred_content_types: ['spec']
      }
    },
    price_range: {
      required_level: 'optional',
      search_hints: {
        query_terms: ['price', 'MSRP'],
        preferred_content_types: ['product_page']
      }
    },
    feet_material: {
      required_level: 'optional',
      search_hints: { query_terms: [] }
    }
  };
}

// ── classifySourceArchetypes ──
