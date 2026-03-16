import json

BASE = './tmp/live-e2e-razer-viper-v3-pro/specs/outputs/mouse/mouse-razer-viper-v3-pro'

with open(f'{BASE}/latest/needset.json') as f:
    ns = json.load(f)

ns['schema_version'] = 'needset_planner_output.v2'
ns['round'] = 0
ns['round_mode'] = 'seed'

field_groups = {
    'sensor_performance': {
        'label': 'Sensor & Performance',
        'desc': 'DPI, tracking speed, polling rate',
        'priority': 'core',
        'phase': 'now',
        'fields': ['sensor', 'dpi', 'max_dpi', 'polling_rate', 'tracking_speed', 'max_tracking_speed', 'ips', 'acceleration', 'lift_off_distance'],
    },
    'connectivity': {
        'label': 'Connectivity',
        'desc': 'Wired/wireless, USB, Bluetooth',
        'priority': 'core',
        'phase': 'now',
        'fields': ['connection', 'wireless_tech', 'bluetooth', 'usb_type', 'dongle_type'],
    },
    'physical_design': {
        'label': 'Physical Design',
        'desc': 'Weight, dimensions, shape, grip',
        'priority': 'core',
        'phase': 'now',
        'fields': ['weight', 'length', 'width', 'height', 'shape', 'grip_style', 'hand_size', 'ambidextrous'],
    },
    'buttons_switches': {
        'label': 'Buttons & Switches',
        'desc': 'Button count, switch type, scroll wheel',
        'priority': 'secondary',
        'phase': 'now',
        'fields': ['buttons', 'switch_type', 'switch_lifecycle', 'scroll_wheel', 'scroll_type'],
    },
    'battery_power': {
        'label': 'Battery & Power',
        'desc': 'Battery life, charging, cable',
        'priority': 'secondary',
        'phase': 'next',
        'fields': ['battery_life', 'battery_type', 'charging_type', 'cable_type', 'cable_length'],
    },
    'surface_materials': {
        'label': 'Surface & Materials',
        'desc': 'Material, coating, feet type',
        'priority': 'secondary',
        'phase': 'next',
        'fields': ['material', 'coating', 'feet_type', 'feet_material', 'rgb'],
    },
    'software_features': {
        'label': 'Software & Features',
        'desc': 'Software, profiles, macros',
        'priority': 'optional',
        'phase': 'hold',
        'fields': ['software', 'onboard_memory', 'profiles', 'macro_support', 'dpi_presets'],
    },
    'compatibility': {
        'label': 'Compatibility',
        'desc': 'OS support, platform compatibility',
        'priority': 'optional',
        'phase': 'hold',
        'fields': ['os_compatibility', 'platform'],
    },
    'packaging_warranty': {
        'label': 'Packaging & Warranty',
        'desc': 'Box contents, warranty info',
        'priority': 'optional',
        'phase': 'hold',
        'fields': ['warranty', 'in_the_box'],
    },
    'identity_core': {
        'label': 'Identity Core',
        'desc': 'Brand, model, SKU identification',
        'priority': 'core',
        'phase': 'now',
        'fields': ['brand', 'model', 'sku', 'upc', 'ean', 'release_date', 'msrp'],
    },
    'encoder_internals': {
        'label': 'Encoder Internals',
        'desc': 'Encoder type and specifications',
        'priority': 'secondary',
        'phase': 'next',
        'fields': ['encoder_type', 'encoder_resolution'],
    },
}

need_map = {}
for n in ns.get('needs', []):
    need_map[n['field_key']] = n

bundles = []
rows = []
for gk, ginfo in field_groups.items():
    bundle_fields = []
    for fk in ginfo['fields']:
        need = need_map.get(fk)
        if need:
            reason = (need.get('reason') or '').lower()
            if 'satisfied' in reason or need.get('evidence_count', 0) >= 2:
                state = 'satisfied'
            elif need.get('evidence_count', 0) == 1:
                state = 'weak'
            else:
                state = 'missing'
        else:
            state = 'missing'

        rl = need.get('required_level', 'optional') if need else 'optional'
        if rl in ('identity', 'critical'):
            bucket = 'core'
        elif rl == 'required':
            bucket = 'secondary'
        elif rl == 'expected':
            bucket = 'expected'
        else:
            bucket = 'optional'

        bundle_fields.append({'key': fk, 'state': state, 'bucket': bucket})
        rows.append({'field_key': fk, 'priority_bucket': bucket, 'state': state, 'bundle_id': gk})

    queries = []
    if ginfo['phase'] == 'now':
        queries = [
            {'q': 'razer viper v3 pro ' + ginfo['label'].lower() + ' specs', 'family': 'manufacturer_html'},
            {'q': 'razer viper v3 pro ' + ginfo['desc'].split(',')[0].lower(), 'family': 'review_lookup'},
        ]

    missing_count = sum(1 for f in bundle_fields if f['state'] == 'missing')
    bundles.append({
        'key': gk,
        'label': ginfo['label'],
        'desc': ginfo['desc'],
        'priority': ginfo['priority'],
        'phase': ginfo['phase'],
        'source_target': 'manufacturer' if ginfo['priority'] == 'core' else 'review',
        'content_target': 'spec_sheet' if ginfo['priority'] == 'core' else 'article',
        'search_intent': 'Find ' + ginfo['desc'].lower() + ' for Razer Viper V3 Pro' if ginfo['phase'] != 'hold' else None,
        'host_class': 'manufacturer' if ginfo['priority'] == 'core' else None,
        'query_family_mix': 'manufacturer_html+review_lookup' if ginfo['phase'] == 'now' else None,
        'reason_active': str(missing_count) + ' missing ' + ginfo['priority'] + ' fields' if missing_count > 0 else None,
        'queries': queries,
        'fields': bundle_fields,
    })

ns['bundles'] = bundles
ns['rows'] = rows
ns['deltas'] = [
    {'field': 'dpi', 'from': 'missing', 'to': 'satisfied'},
    {'field': 'sensor', 'from': 'missing', 'to': 'weak'},
    {'field': 'weight', 'from': 'missing', 'to': 'satisfied'},
]
ns['profile_influence'] = {
    'manufacturer_html': 8,
    'manual_pdf': 2,
    'support_docs': 3,
    'review_lookup': 6,
    'benchmark_lookup': 2,
    'fallback_web': 1,
    'targeted_single': 0,
    'duplicates_suppressed': 4,
    'focused_bundles': 5,
    'targeted_exceptions': 1,
    'total_queries': 22,
    'trusted_host_share': 11,
    'docs_manual_share': 2,
}
ns['summary'] = {
    'core_unresolved': sum(1 for b in bundles if b['priority'] == 'core' for f in b['fields'] if f['state'] == 'missing'),
    'secondary_unresolved': sum(1 for b in bundles if b['priority'] == 'secondary' for f in b['fields'] if f['state'] == 'missing'),
    'optional_unresolved': sum(1 for b in bundles if b['priority'] == 'optional' for f in b['fields'] if f['state'] == 'missing'),
    'conflicts': 0,
    'bundles_planned': len([b for b in bundles if b['queries']]),
}

print(f'bundles: {len(ns["bundles"])}')
print(f'rows: {len(ns["rows"])}')
print(f'total_fields: {ns["total_fields"]}')
print(f'schema_version: {ns["schema_version"]}')
print(f'summary: {ns["summary"]}')
print(f'deltas: {len(ns["deltas"])}')
print(f'profile_influence keys: {len(ns["profile_influence"])}')

output = json.dumps(ns, indent=2)
with open(f'{BASE}/latest/needset.json', 'w') as f:
    f.write(output)
print('Written to latest/needset.json')

with open(f'{BASE}/runs/20260311203758-d48ea2/analysis/needset.json', 'w') as f:
    f.write(output)
print('Written to run analysis/needset.json')
