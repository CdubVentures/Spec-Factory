import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { createStorage } from '../../../../s3/storage.js';
import {
  buildProductReviewPayload,
  buildFieldState,
} from '../../domain/reviewGridData.js';
import {
  buildComponentReviewPayloads,
  buildEnumReviewPayloads,
} from '../../domain/componentReviewData.js';

export {
  buildProductReviewPayload,
  buildFieldState,
  buildComponentReviewPayloads,
};

export const CATEGORY = 'mouse';

export const FIELD_RULES_FIELDS = {
  weight: { required_level: 'required', contract: { type: 'number', unit: 'g', shape: 'scalar', range: { min: 20, max: 300 } } },
  sensor: { required_level: 'required', contract: { type: 'string', shape: 'scalar' }, component: { type: 'sensor', source: 'component_db.sensor' }, enum: { policy: 'open_prefer_known' } },
  switch_type: { required_level: 'expected', contract: { type: 'string', shape: 'scalar' }, component: { type: 'switch', source: 'component_db.switch' }, enum: { policy: 'open_prefer_known' } },
  encoder: { required_level: 'optional', contract: { type: 'string', shape: 'scalar' }, component: { type: 'encoder', source: 'component_db.encoder' }, enum: { policy: 'open_prefer_known' } },
  dpi: { required_level: 'required', contract: { type: 'integer', unit: 'dpi', shape: 'scalar', range: { min: 50, max: 100000 } } },
  connection: { required_level: 'required', contract: { type: 'string', shape: 'scalar' }, enum: { policy: 'closed' }, enum_name: 'connection' },
  cable_type: { required_level: 'optional', contract: { type: 'string', shape: 'scalar' }, enum: { policy: 'open_prefer_known' }, enum_name: 'cable_type' },
  coating: { required_level: 'optional', output_shape: 'list', contract: { type: 'string', shape: 'list' }, enum: { policy: 'open_prefer_known' }, enum_name: 'coating' },
  shell_material: { required_level: 'optional', contract: { type: 'string', shape: 'scalar' }, component: { type: 'material', source: 'component_db.material' }, enum: { policy: 'open_prefer_known' } },
};

const SENSOR_ITEMS = [
  { name: 'PAW3950', maker: 'PixArt', aliases: ['3950', 'PixArt 3950'], links: ['https://pixart.com/paw3950'], properties: { dpi_max: '35000', ips: '750', acceleration: '50' } },
  { name: 'HERO26K', maker: 'Logitech', aliases: ['HERO 26K', 'HERO'], links: [], properties: { dpi_max: '25600', ips: '400', acceleration: '40' } },
  { name: 'PMW3360', maker: 'PixArt', aliases: ['3360'], links: [], properties: { dpi_max: '12000', ips: '250', acceleration: '50' } },
  { name: 'PMW3395', maker: 'PixArt', aliases: ['3395', 'PAW3395'], links: [], properties: { dpi_max: '26000', ips: '650', acceleration: '50' } },
  { name: 'PMW3389', maker: 'PixArt', aliases: ['3389'], links: [], properties: { dpi_max: '16000', ips: '400', acceleration: '50' } },
];

const SWITCH_ITEMS = [
  { name: 'Razer Optical Gen-3', maker: 'Razer', aliases: ['Optical Gen 3'], links: [], properties: { actuation_force: '45', lifespan: '90M' } },
  { name: 'Omron D2FC-F-K', maker: 'Omron', aliases: ['D2FC', 'Omron D2FC'], links: [], properties: { actuation_force: '75', lifespan: '50M' } },
  { name: 'Huano Blue Shell', maker: 'Huano', aliases: ['Huano Blue'], links: [], properties: { actuation_force: '65', lifespan: '20M' } },
  { name: 'Kailh GM 8.0', maker: 'Kailh', aliases: ['GM8', 'GM 8.0'], links: [], properties: { actuation_force: '55', lifespan: '80M' } },
  { name: 'TTC Gold', maker: 'TTC', aliases: ['TTC Gold V2'], links: [], properties: { actuation_force: '60', lifespan: '100M' } },
];

const ENCODER_ITEMS = [
  { name: 'TTC Gold Encoder', maker: 'TTC', aliases: ['TTC Encoder'], links: [], properties: { steps: '24', tactility: 'medium' } },
  { name: 'ALPS Encoder', maker: 'ALPS', aliases: ['ALPS'], links: [], properties: { steps: '24', tactility: 'firm' } },
];

const MATERIAL_ITEMS = [
  { name: 'PTFE', maker: '', aliases: ['Teflon'], links: [], properties: { friction: 'low', durability: 'high' } },
  { name: 'Carbon Fiber', maker: '', aliases: ['CF', 'Carbon'], links: [], properties: { weight_class: 'light', durability: 'very_high' } },
];

export const KNOWN_VALUE_ENUMS = {
  connection: { policy: 'closed', values: ['Wired', 'Wireless', '2.4GHz', 'Bluetooth'] },
  cable_type: { policy: 'open', values: ['USB-C', 'Micro-USB', 'Paracord', 'Rubber'] },
  coating: { policy: 'open', values: ['Matte', 'Glossy', 'Textured', 'Rubberized'] },
};

export const DEFAULT_REVIEW_SUMMARY = Object.freeze({
  missing_required_fields: Object.freeze([]),
  fields_below_pass_target: Object.freeze([]),
  critical_fields_below_pass_target: Object.freeze([]),
});

export const PRODUCTS = {
  'mouse-razer-viper-v3-pro': {
    identity: { brand: 'Razer', model: 'Viper V3 Pro' },
    fields: { weight: '49', sensor: 'PAW3950', switch_type: 'Razer Optical Gen-3', encoder: 'TTC Gold Encoder', dpi: '35000', connection: '2.4GHz', cable_type: 'USB-C', coating: 'Matte', shell_material: 'unk' },
    provenance: {
      weight: { value: '49', confidence: 0.95 }, sensor: { value: 'PAW3950', confidence: 0.98 },
      switch_type: { value: 'Razer Optical Gen-3', confidence: 0.90 }, encoder: { value: 'TTC Gold Encoder', confidence: 0.75 },
      dpi: { value: '35000', confidence: 0.98 }, connection: { value: '2.4GHz', confidence: 0.98 },
      cable_type: { value: 'USB-C', confidence: 0.95 }, coating: { value: 'Matte', confidence: 0.80 },
      shell_material: { value: 'unk', confidence: 0 },
    },
    candidates: {
      weight: [
        { candidate_id: 'razer-w1', value: '49', score: 0.95, host: 'razer.com', source_host: 'razer.com', method: 'dom', source_method: 'dom', tier: 1, source_tier: 1 },
        { candidate_id: 'razer-w2', value: '49g', score: 0.85, host: 'rtings.com', source_host: 'rtings.com', method: 'scrape', source_method: 'scrape', tier: 2, source_tier: 2 },
        { candidate_id: 'razer-w3', value: '48', score: 0.60, host: 'amazon.com', source_host: 'amazon.com', method: 'llm', source_method: 'llm', tier: 3, source_tier: 3 },
      ],
      sensor: [
        { candidate_id: 'razer-s1', value: 'PAW3950', score: 0.98, host: 'razer.com', source_host: 'razer.com', method: 'dom', source_method: 'dom', tier: 1, source_tier: 1 },
        { candidate_id: 'razer-s2', value: 'PixArt PAW3950', score: 0.80, host: 'techpowerup.com', source_host: 'techpowerup.com', method: 'scrape', source_method: 'scrape', tier: 2, source_tier: 2 },
      ],
      switch_type: [
        { candidate_id: 'razer-sw1', value: 'Razer Optical Gen-3', score: 0.90, host: 'razer.com', source_host: 'razer.com', method: 'dom', source_method: 'dom', tier: 1, source_tier: 1 },
      ],
      encoder: [
        { candidate_id: 'razer-e1', value: 'TTC Gold Encoder', score: 0.75, host: 'techpowerup.com', source_host: 'techpowerup.com', method: 'scrape', source_method: 'scrape', tier: 2, source_tier: 2 },
      ],
      dpi: [
        { candidate_id: 'razer-d1', value: '35000', score: 0.98, host: 'razer.com', source_host: 'razer.com', method: 'dom', source_method: 'dom', tier: 1, source_tier: 1 },
        { candidate_id: 'razer-d2', value: '30000', score: 0.70, host: 'rtings.com', source_host: 'rtings.com', method: 'scrape', source_method: 'scrape', tier: 2, source_tier: 2 },
      ],
      connection: [
        { candidate_id: 'razer-cn1', value: '2.4GHz', score: 0.98, host: 'razer.com', source_host: 'razer.com', method: 'dom', source_method: 'dom', tier: 1, source_tier: 1 },
        { candidate_id: 'razer-cn2', value: 'Wireless', score: 0.80, host: 'rtings.com', source_host: 'rtings.com', method: 'scrape', source_method: 'scrape', tier: 2, source_tier: 2 },
      ],
      cable_type: [
        { candidate_id: 'razer-cb1', value: 'USB-C', score: 0.95, host: 'razer.com', source_host: 'razer.com', method: 'dom', source_method: 'dom', tier: 1, source_tier: 1 },
      ],
      coating: [
        { candidate_id: 'razer-ct1', value: 'Matte', score: 0.80, host: 'rtings.com', source_host: 'rtings.com', method: 'scrape', source_method: 'scrape', tier: 2, source_tier: 2 },
      ],
    },
    override: {
      weight: { override_value: '48', override_source: 'manual_entry', set_at: '2026-02-15T10:00:00.000Z' },
    },
  },
  'mouse-logitech-g502-x': {
    identity: { brand: 'Logitech', model: 'G502 X' },
    fields: { weight: '89', sensor: 'HERO26K', switch_type: 'Omron D2FC-F-K', encoder: 'ALPS Encoder', dpi: '25600', connection: 'Wired', cable_type: 'USB-C', coating: 'Textured', shell_material: 'unk' },
    provenance: {
      weight: { value: '89', confidence: 0.92 }, sensor: { value: 'HERO26K', confidence: 0.95 },
      switch_type: { value: 'Omron D2FC-F-K', confidence: 0.85 }, encoder: { value: 'ALPS Encoder', confidence: 0.70 },
      dpi: { value: '25600', confidence: 0.98 }, connection: { value: 'Wired', confidence: 0.99 },
      cable_type: { value: 'USB-C', confidence: 0.95 }, coating: { value: 'Textured', confidence: 0.75 },
      shell_material: { value: 'unk', confidence: 0 },
    },
    candidates: {
      weight: [
        { candidate_id: 'logi-w1', value: '89', score: 0.92, host: 'logitech.com', source_host: 'logitech.com', method: 'dom', source_method: 'dom', tier: 1, source_tier: 1 },
        { candidate_id: 'logi-w2', value: '89g', score: 0.80, host: 'pcgamer.com', source_host: 'pcgamer.com', method: 'scrape', source_method: 'scrape', tier: 2, source_tier: 2 },
      ],
      sensor: [
        { candidate_id: 'logi-s1', value: 'HERO26K', score: 0.95, host: 'logitech.com', source_host: 'logitech.com', method: 'dom', source_method: 'dom', tier: 1, source_tier: 1 },
      ],
      switch_type: [
        { candidate_id: 'logi-sw1', value: 'Omron D2FC-F-K', score: 0.85, host: 'logitech.com', source_host: 'logitech.com', method: 'dom', source_method: 'dom', tier: 1, source_tier: 1 },
        { candidate_id: 'logi-sw2', value: 'Omron D2FC', score: 0.70, host: 'overclock.net', source_host: 'overclock.net', method: 'llm', source_method: 'llm', tier: 3, source_tier: 3 },
      ],
      encoder: [
        { candidate_id: 'logi-e1', value: 'ALPS Encoder', score: 0.70, host: 'teardown.com', source_host: 'teardown.com', method: 'scrape', source_method: 'scrape', tier: 3, source_tier: 3 },
      ],
      dpi: [
        { candidate_id: 'logi-d1', value: '25600', score: 0.98, host: 'logitech.com', source_host: 'logitech.com', method: 'dom', source_method: 'dom', tier: 1, source_tier: 1 },
      ],
      connection: [
        { candidate_id: 'logi-cn1', value: 'Wired', score: 0.99, host: 'logitech.com', source_host: 'logitech.com', method: 'dom', source_method: 'dom', tier: 1, source_tier: 1 },
      ],
      cable_type: [
        { candidate_id: 'logi-cb1', value: 'USB-C', score: 0.95, host: 'logitech.com', source_host: 'logitech.com', method: 'dom', source_method: 'dom', tier: 1, source_tier: 1 },
      ],
      coating: [
        { candidate_id: 'logi-ct1', value: 'Textured', score: 0.75, host: 'pcgamer.com', source_host: 'pcgamer.com', method: 'scrape', source_method: 'scrape', tier: 2, source_tier: 2 },
      ],
    },
    override: {
      dpi: { override_value: '25600', override_source: 'candidate_selection', candidate_id: 'logi-d1', overridden_at: '2026-02-15T11:00:00.000Z', source: { host: 'logitech.com', method: 'dom', tier: 1 }, override_provenance: { url: 'https://logitech.com/g502x', quote: 'Max DPI: 25,600' } },
    },
  },
  'mouse-zowie-ec2-c': {
    identity: { brand: 'Zowie', model: 'EC2-C' },
    fields: { weight: '73', sensor: 'PMW3360', switch_type: 'Huano Blue Shell', encoder: 'unk', dpi: '3200', connection: 'Wired', cable_type: 'Paracord', coating: 'Matte', shell_material: 'unk' },
    provenance: {
      weight: { value: '73', confidence: 0.90 }, sensor: { value: 'PMW3360', confidence: 0.88 },
      switch_type: { value: 'Huano Blue Shell', confidence: 0.82 }, encoder: { value: 'unk', confidence: 0 },
      dpi: { value: '3200', confidence: 0.95 }, connection: { value: 'Wired', confidence: 0.99 },
      cable_type: { value: 'Paracord', confidence: 0.85 }, coating: { value: 'Matte', confidence: 0.80 },
      shell_material: { value: 'unk', confidence: 0 },
    },
    candidates: {
      weight: [
        { candidate_id: 'zowie-w1', value: '73', score: 0.90, host: 'zowie.benq.com', source_host: 'zowie.benq.com', method: 'dom', source_method: 'dom', tier: 1, source_tier: 1 },
        { candidate_id: 'zowie-w2', value: '73g', score: 0.80, host: 'rtings.com', source_host: 'rtings.com', method: 'scrape', source_method: 'scrape', tier: 2, source_tier: 2 },
        { candidate_id: 'zowie-w3', value: '74', score: 0.55, host: 'reddit.com', source_host: 'reddit.com', method: 'llm', source_method: 'llm', tier: 3, source_tier: 3 },
      ],
      sensor: [
        { candidate_id: 'zowie-s1', value: 'PMW3360', score: 0.88, host: 'zowie.benq.com', source_host: 'zowie.benq.com', method: 'dom', source_method: 'dom', tier: 1, source_tier: 1 },
        { candidate_id: 'zowie-s2', value: '3360', score: 0.65, host: 'reddit.com', source_host: 'reddit.com', method: 'llm', source_method: 'llm', tier: 3, source_tier: 3 },
      ],
      switch_type: [
        { candidate_id: 'zowie-sw1', value: 'Huano Blue Shell', score: 0.82, host: 'zowie.benq.com', source_host: 'zowie.benq.com', method: 'dom', source_method: 'dom', tier: 1, source_tier: 1 },
      ],
      dpi: [
        { candidate_id: 'zowie-d1', value: '3200', score: 0.95, host: 'zowie.benq.com', source_host: 'zowie.benq.com', method: 'dom', source_method: 'dom', tier: 1, source_tier: 1 },
      ],
      connection: [
        { candidate_id: 'zowie-cn1', value: 'Wired', score: 0.99, host: 'zowie.benq.com', source_host: 'zowie.benq.com', method: 'dom', source_method: 'dom', tier: 1, source_tier: 1 },
      ],
      cable_type: [
        { candidate_id: 'zowie-cb1', value: 'Paracord', score: 0.85, host: 'zowie.benq.com', source_host: 'zowie.benq.com', method: 'dom', source_method: 'dom', tier: 1, source_tier: 1 },
      ],
      coating: [
        { candidate_id: 'zowie-ct1', value: 'Matte', score: 0.80, host: 'zowie.benq.com', source_host: 'zowie.benq.com', method: 'dom', source_method: 'dom', tier: 1, source_tier: 1 },
      ],
    },
    override: {
      sensor: { override_value: 'PMW3360', override_source: 'candidate_selection', candidate_id: 'zowie-s1', overridden_at: '2026-02-15T12:00:00.000Z', source: { host: 'zowie.benq.com', method: 'dom', tier: 1 }, override_provenance: { url: 'https://zowie.benq.com/ec2-c', quote: 'Sensor: PMW 3360' } },
    },
  },
  'mouse-pulsar-x2-v3': {
    identity: { brand: 'Pulsar', model: 'X2 V3' },
    fields: { weight: '52', sensor: 'PAW3950', switch_type: 'Kailh GM 8.0', encoder: 'TTC Gold Encoder', dpi: '26000', connection: '2.4GHz', cable_type: 'USB-C', coating: 'Matte', shell_material: 'PTFE' },
    provenance: {
      weight: { value: '52', confidence: 0.93 }, sensor: { value: 'PAW3950', confidence: 0.96 },
      switch_type: { value: 'Kailh GM 8.0', confidence: 0.88 }, encoder: { value: 'TTC Gold Encoder', confidence: 0.72 },
      dpi: { value: '26000', confidence: 0.96 }, connection: { value: '2.4GHz', confidence: 0.97 },
      cable_type: { value: 'USB-C', confidence: 0.93 }, coating: { value: 'Matte', confidence: 0.85 },
      shell_material: { value: 'PTFE', confidence: 0.70 },
    },
    candidates: {
      weight: [
        { candidate_id: 'pulsar-w1', value: '52', score: 0.93, host: 'pulsar.gg', source_host: 'pulsar.gg', method: 'dom', source_method: 'dom', tier: 1, source_tier: 1 },
        { candidate_id: 'pulsar-w2', value: '51', score: 0.75, host: 'rtings.com', source_host: 'rtings.com', method: 'scrape', source_method: 'scrape', tier: 2, source_tier: 2 },
      ],
      sensor: [
        { candidate_id: 'pulsar-s1', value: 'PAW3950', score: 0.96, host: 'pulsar.gg', source_host: 'pulsar.gg', method: 'dom', source_method: 'dom', tier: 1, source_tier: 1 },
        { candidate_id: 'pulsar-s2', value: 'PixArt PAW3950', score: 0.82, host: 'techpowerup.com', source_host: 'techpowerup.com', method: 'scrape', source_method: 'scrape', tier: 2, source_tier: 2 },
      ],
      switch_type: [
        { candidate_id: 'pulsar-sw1', value: 'Kailh GM 8.0', score: 0.88, host: 'pulsar.gg', source_host: 'pulsar.gg', method: 'dom', source_method: 'dom', tier: 1, source_tier: 1 },
      ],
      encoder: [
        { candidate_id: 'pulsar-e1', value: 'TTC Gold Encoder', score: 0.72, host: 'pulsar.gg', source_host: 'pulsar.gg', method: 'dom', source_method: 'dom', tier: 1, source_tier: 1 },
      ],
      dpi: [
        { candidate_id: 'pulsar-d1', value: '26000', score: 0.96, host: 'pulsar.gg', source_host: 'pulsar.gg', method: 'dom', source_method: 'dom', tier: 1, source_tier: 1 },
      ],
      connection: [
        { candidate_id: 'pulsar-cn1', value: '2.4GHz', score: 0.97, host: 'pulsar.gg', source_host: 'pulsar.gg', method: 'dom', source_method: 'dom', tier: 1, source_tier: 1 },
      ],
      cable_type: [
        { candidate_id: 'pulsar-cb1', value: 'USB-C', score: 0.93, host: 'pulsar.gg', source_host: 'pulsar.gg', method: 'dom', source_method: 'dom', tier: 1, source_tier: 1 },
      ],
      coating: [
        { candidate_id: 'pulsar-ct1', value: 'Matte', score: 0.85, host: 'pulsar.gg', source_host: 'pulsar.gg', method: 'dom', source_method: 'dom', tier: 1, source_tier: 1 },
      ],
      shell_material: [
        { candidate_id: 'pulsar-sm1', value: 'PTFE', score: 0.70, host: 'pulsar.gg', source_host: 'pulsar.gg', method: 'dom', source_method: 'dom', tier: 1, source_tier: 1 },
      ],
    },
    override: null,
  },
  'mouse-endgame-gear-op1we': {
    identity: { brand: 'Endgame Gear', model: 'OP1we' },
    fields: { weight: '59', sensor: 'PMW3395', switch_type: 'Kailh GM 8.0', encoder: 'unk', dpi: '26000', connection: '2.4GHz', cable_type: 'USB-C', coating: 'Matte', shell_material: 'Carbon Fiber' },
    provenance: {
      weight: { value: '59', confidence: 0.91 }, sensor: { value: 'PMW3395', confidence: 0.94 },
      switch_type: { value: 'Kailh GM 8.0', confidence: 0.86 }, encoder: { value: 'unk', confidence: 0 },
      dpi: { value: '26000', confidence: 0.96 }, connection: { value: '2.4GHz', confidence: 0.97 },
      cable_type: { value: 'USB-C', confidence: 0.93 }, coating: { value: 'Matte', confidence: 0.82 },
      shell_material: { value: 'Carbon Fiber', confidence: 0.68 },
    },
    candidates: {
      weight: [
        { candidate_id: 'eg-w1', value: '59', score: 0.91, host: 'endgamegear.com', source_host: 'endgamegear.com', method: 'dom', source_method: 'dom', tier: 1, source_tier: 1 },
      ],
      sensor: [
        { candidate_id: 'eg-s1', value: 'PMW3395', score: 0.94, host: 'endgamegear.com', source_host: 'endgamegear.com', method: 'dom', source_method: 'dom', tier: 1, source_tier: 1 },
      ],
      switch_type: [
        { candidate_id: 'eg-sw1', value: 'Kailh GM 8.0', score: 0.86, host: 'endgamegear.com', source_host: 'endgamegear.com', method: 'dom', source_method: 'dom', tier: 1, source_tier: 1 },
        { candidate_id: 'eg-sw2', value: 'Kailh GM8', score: 0.60, host: 'reddit.com', source_host: 'reddit.com', method: 'llm', source_method: 'llm', tier: 3, source_tier: 3 },
      ],
      dpi: [
        { candidate_id: 'eg-d1', value: '26000', score: 0.96, host: 'endgamegear.com', source_host: 'endgamegear.com', method: 'dom', source_method: 'dom', tier: 1, source_tier: 1 },
      ],
      connection: [
        { candidate_id: 'eg-cn1', value: '2.4GHz', score: 0.97, host: 'endgamegear.com', source_host: 'endgamegear.com', method: 'dom', source_method: 'dom', tier: 1, source_tier: 1 },
      ],
      cable_type: [
        { candidate_id: 'eg-cb1', value: 'USB-C', score: 0.93, host: 'endgamegear.com', source_host: 'endgamegear.com', method: 'dom', source_method: 'dom', tier: 1, source_tier: 1 },
      ],
      coating: [
        { candidate_id: 'eg-ct1', value: 'Matte', score: 0.82, host: 'endgamegear.com', source_host: 'endgamegear.com', method: 'dom', source_method: 'dom', tier: 1, source_tier: 1 },
      ],
      shell_material: [
        { candidate_id: 'eg-sm1', value: 'Carbon Fiber', score: 0.68, host: 'endgamegear.com', source_host: 'endgamegear.com', method: 'dom', source_method: 'dom', tier: 1, source_tier: 1 },
      ],
    },
    override: {
      switch_type: { override_value: 'Kailh GM 8.0', override_source: 'candidate_selection', candidate_id: 'eg-sw1', overridden_at: '2026-02-15T13:00:00.000Z', source: { host: 'endgamegear.com', method: 'dom', tier: 1 }, override_provenance: { url: 'https://endgamegear.com/op1we', quote: 'Switches: Kailh GM 8.0' } },
    },
  },
};

function cloneJson(value) {
  if (value === undefined) {
    return undefined;
  }
  return JSON.parse(JSON.stringify(value));
}

function cloneArray(values = []) {
  return [...values];
}

function cloneRecordOfArrays(record = {}) {
  return Object.fromEntries(
    Object.entries(record).map(([key, values]) => [key, cloneArray(values)]),
  );
}

export function buildReviewSummary(overrides = {}) {
  return {
    missing_required_fields: cloneArray(
      overrides.missing_required_fields ?? DEFAULT_REVIEW_SUMMARY.missing_required_fields,
    ),
    fields_below_pass_target: cloneArray(
      overrides.fields_below_pass_target ?? DEFAULT_REVIEW_SUMMARY.fields_below_pass_target,
    ),
    critical_fields_below_pass_target: cloneArray(
      overrides.critical_fields_below_pass_target
      ?? DEFAULT_REVIEW_SUMMARY.critical_fields_below_pass_target,
    ),
  };
}

export function buildCandidateRow(overrides = {}) {
  const host = overrides.source_host ?? overrides.host ?? 'example.com';
  const method = overrides.source_method ?? overrides.method ?? 'dom';
  const tier = overrides.source_tier ?? overrides.tier ?? 1;
  return {
    candidate_id: 'candidate-1',
    value: '59',
    score: 0.7,
    host,
    source_host: host,
    method,
    source_method: method,
    tier,
    source_tier: tier,
    ...cloneJson(overrides),
  };
}

export function buildFieldStateScenario({
  productId = null,
  field = 'weight',
  candidates,
  normalizedFields,
  provenance,
  summary,
} = {}) {
  const product = productId ? PRODUCTS[productId] : null;
  return {
    field,
    candidates: cloneJson(candidates ?? product?.candidates ?? {}),
    normalized: {
      fields: cloneJson(normalizedFields ?? product?.fields ?? {}),
    },
    provenance: cloneJson(provenance ?? product?.provenance ?? {}),
    summary: buildReviewSummary(summary),
  };
}

export function buildKnownValueFieldMap(overrides = {}) {
  return {
    connection: cloneArray(overrides.connection ?? KNOWN_VALUE_ENUMS.connection.values),
    cable_type: cloneArray(overrides.cable_type ?? KNOWN_VALUE_ENUMS.cable_type.values),
    coating: cloneArray(overrides.coating ?? KNOWN_VALUE_ENUMS.coating.values),
  };
}

export function buildEnumSuggestionsSeed({ fields = {}, suggestions = [] } = {}) {
  return {
    ...(Object.keys(fields).length > 0 ? { fields: cloneRecordOfArrays(fields) } : {}),
    ...(suggestions.length > 0 ? { suggestions: cloneJson(suggestions) } : {}),
  };
}

export function buildWorkbookMapSeed({
  manualEnumValues = {},
  manualEnumTimestamps = {},
} = {}) {
  return {
    manualEnumValues: cloneRecordOfArrays(manualEnumValues),
    manualEnumTimestamps: { ...manualEnumTimestamps },
  };
}

export function buildComponentOverridePayload(overrides = {}) {
  return cloneJson(overrides) || {};
}

export function findComponentItem(payload, name) {
  return payload.items.find((item) => item.name === name);
}

export function findEnumField(payload, fieldKey) {
  return payload.fields.find((field) => field.field === fieldKey);
}

export function findEnumValue(payload, fieldKey, value) {
  return findEnumField(payload, fieldKey)?.values.find((entry) => entry.value === value);
}

function makeStorage(tempRoot) {
  return createStorage({
    localMode: true,
    localInputRoot: path.join(tempRoot, 'fixtures'),
    localOutputRoot: path.join(tempRoot, 'out'),
    s3InputPrefix: 'specs/inputs',
    s3OutputPrefix: 'specs/outputs',
  });
}

async function writeJson(filePath, value) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, JSON.stringify(value, null, 2), 'utf8');
}

async function seedFieldRules(helperRoot, category) {
  const generatedRoot = path.join(helperRoot, category, '_generated');
  await writeJson(path.join(generatedRoot, 'field_rules.json'), { category, fields: FIELD_RULES_FIELDS });
  await writeJson(path.join(generatedRoot, 'known_values.json'), { category, fields: {} });
  await writeJson(path.join(generatedRoot, 'parse_templates.json'), { category, templates: {} });
  await writeJson(path.join(generatedRoot, 'cross_validation_rules.json'), { category, rules: [] });
  await writeJson(path.join(generatedRoot, 'key_migrations.json'), { version: '1.0.0', previous_version: '1.0.0', bump: 'patch', summary: { added_count: 0, removed_count: 0, changed_count: 0 }, key_map: {}, migrations: [] });
  await writeJson(path.join(generatedRoot, 'ui_field_catalog.json'), {
    category,
    fields: Object.keys(FIELD_RULES_FIELDS).map((key) => ({ key, group: 'specs' })),
  });
}

async function seedComponentDb(helperRoot, category, componentType, items) {
  const dbDir = path.join(helperRoot, category, '_generated', 'component_db');
  await writeJson(path.join(dbDir, `${componentType}.json`), { component_type: componentType, items });
}

async function seedAllComponentDbs(helperRoot, category) {
  await seedComponentDb(helperRoot, category, 'sensor', SENSOR_ITEMS);
  await seedComponentDb(helperRoot, category, 'switch', SWITCH_ITEMS);
  await seedComponentDb(helperRoot, category, 'encoder', ENCODER_ITEMS);
  await seedComponentDb(helperRoot, category, 'material', MATERIAL_ITEMS);
}

export async function seedKnownValues(helperRoot, category, fields) {
  const kvPath = path.join(helperRoot, category, '_generated', 'known_values.json');
  await writeJson(kvPath, { category, fields });
}

export async function seedEnumSuggestions(helperRoot, category, suggestions) {
  const suggestionsPath = path.join(helperRoot, category, '_suggestions', 'enums.json');
  await writeJson(suggestionsPath, suggestions);
}

export async function seedWorkbookMap(helperRoot, category, manualEnumValues, manualEnumTimestamps = {}) {
  const mapPath = path.join(helperRoot, category, '_control_plane', 'field_studio_map.json');
  await writeJson(mapPath, { manual_enum_values: manualEnumValues, manual_enum_timestamps: manualEnumTimestamps });
}

export async function seedComponentOverride(helperRoot, category, componentType, name, override) {
  const overrideDir = path.join(helperRoot, category, '_overrides', 'components');
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  await writeJson(path.join(overrideDir, `${componentType}_${slug}.json`), { componentType, name, ...override });
}

async function seedProductOverride(helperRoot, category, productId, overrides) {
  const overridePath = path.join(helperRoot, category, '_overrides', `${productId}.overrides.json`);
  await writeJson(overridePath, { product_id: productId, overrides });
}

async function seedComponentReviewSuggestions(helperRoot, category, items) {
  const reviewPath = path.join(helperRoot, category, '_suggestions', 'component_review.json');
  await writeJson(reviewPath, { items });
}

async function seedLatestArtifacts(storage, category, productId, product) {
  const latestBase = storage.resolveOutputKey(category, productId, 'latest');
  await storage.writeObject(`${latestBase}/normalized.json`, Buffer.from(JSON.stringify({
    identity: product.identity,
    fields: product.fields,
  }, null, 2)), { contentType: 'application/json' });
  await storage.writeObject(`${latestBase}/provenance.json`, Buffer.from(JSON.stringify(product.provenance, null, 2)), { contentType: 'application/json' });
  await storage.writeObject(`${latestBase}/summary.json`, Buffer.from(JSON.stringify({
    confidence: 0.85,
    coverage_overall_percent: 80,
    missing_required_fields: Object.entries(product.fields).filter(([, value]) => value === 'unk').map(([key]) => key),
    fields_below_pass_target: [],
    critical_fields_below_pass_target: [],
    field_reasoning: {},
  }, null, 2)), { contentType: 'application/json' });
  await storage.writeObject(`${latestBase}/candidates.json`, Buffer.from(JSON.stringify(product.candidates || {}, null, 2)), { contentType: 'application/json' });
}

async function seedAllProducts(storage, helperRoot, category) {
  for (const [productId, product] of Object.entries(PRODUCTS)) {
    await seedLatestArtifacts(storage, category, productId, product);
    if (product.override) {
      await seedProductOverride(helperRoot, category, productId, product.override);
    }
  }
}

export function buildFieldRulesForSeed() {
  const componentDBs = {};
  const itemsByType = { sensor: SENSOR_ITEMS, switch: SWITCH_ITEMS, encoder: ENCODER_ITEMS, material: MATERIAL_ITEMS };
  for (const [typeKey, dbItems] of Object.entries(itemsByType)) {
    const entries = {};
    const index = new Map();
    for (const item of dbItems) {
      entries[item.name] = { ...item, canonical_name: item.name };
      index.set(item.name.toLowerCase(), entries[item.name]);
      index.set(item.name.toLowerCase().replace(/\s+/g, ''), entries[item.name]);
      for (const alias of item.aliases || []) {
        index.set(String(alias).toLowerCase(), entries[item.name]);
        index.set(String(alias).toLowerCase().replace(/\s+/g, ''), entries[item.name]);
      }
    }
    componentDBs[typeKey] = { entries, __index: index };
  }

  return {
    rules: { fields: FIELD_RULES_FIELDS },
    componentDBs,
    knownValues: { enums: KNOWN_VALUE_ENUMS },
  };
}

export async function createFullFixture(tempRoot) {
  const storage = makeStorage(tempRoot);
  const config = {
    categoryAuthorityRoot: path.join(tempRoot, 'category_authority'),
    localOutputRoot: path.join(tempRoot, 'out'),
    specDbDir: path.join(tempRoot, '.specfactory_tmp'),
  };

  await seedFieldRules(config.categoryAuthorityRoot, CATEGORY);
  await seedAllComponentDbs(config.categoryAuthorityRoot, CATEGORY);
  await seedKnownValues(config.categoryAuthorityRoot, CATEGORY, {
    connection: KNOWN_VALUE_ENUMS.connection.values,
    cable_type: KNOWN_VALUE_ENUMS.cable_type.values,
    coating: KNOWN_VALUE_ENUMS.coating.values,
  });
  await seedWorkbookMap(config.categoryAuthorityRoot, CATEGORY, {
    cable_type: ['Braided'],
    coating: ['Soft-touch'],
  });
  await seedAllProducts(storage, config.categoryAuthorityRoot, CATEGORY);
  await seedComponentReviewSuggestions(config.categoryAuthorityRoot, CATEGORY, [
    { component_type: 'sensor', matched_component: 'PAW3950', product_id: 'mouse-razer-viper-v3-pro', status: 'pending_ai', raw_query: 'PAW3950', match_type: 'exact', combined_score: 0.95, product_attributes: { dpi_max: '35000', sensor_brand: 'PixArt' }, created_at: '2026-02-15T10:00:00.000Z' },
    { component_type: 'sensor', matched_component: 'PAW3950', product_id: 'mouse-pulsar-x2-v3', status: 'pending_ai', raw_query: 'PAW3950', match_type: 'exact', combined_score: 0.92, product_attributes: { dpi_max: '26000', sensor_brand: 'PixArt' }, created_at: '2026-02-15T11:00:00.000Z' },
    { component_type: 'switch', matched_component: 'Kailh GM 8.0', product_id: 'mouse-pulsar-x2-v3', status: 'pending_ai', raw_query: 'Kailh GM8.0', match_type: 'exact', combined_score: 0.88, product_attributes: { switch_brand: 'Kailh' }, created_at: '2026-02-15T10:00:00.000Z' },
    { component_type: 'switch', matched_component: 'Kailh GM 8.0', product_id: 'mouse-endgame-gear-op1we', status: 'pending_ai', raw_query: 'Kailh GM8.0', match_type: 'exact', combined_score: 0.86, product_attributes: { switch_brand: 'Kailh' }, created_at: '2026-02-15T12:00:00.000Z' },
    { component_type: 'sensor', matched_component: 'HERO26K', product_id: 'mouse-logitech-g502-x', status: 'pending_ai', raw_query: 'HERO26K', match_type: 'exact', combined_score: 0.95, product_attributes: { dpi_max: '25600', sensor_brand: 'Logitech' }, created_at: '2026-02-15T10:00:00.000Z' },
  ]);

  return { storage, config };
}

async function withSeededSpecDb(config, run) {
  const { SpecDb } = await import('../../../../db/specDb.js');
  const { seedSpecDb } = await import('../../../../db/seed.js');
  const dbDir = path.join(config.specDbDir, CATEGORY);
  await fs.mkdir(dbDir, { recursive: true });
  const dbPath = path.join(
    dbDir,
    `enum-review-${Date.now()}-${Math.random().toString(16).slice(2)}.sqlite`,
  );
  const db = new SpecDb({ dbPath, category: CATEGORY });
  try {
    const fieldRules = buildFieldRulesForSeed();
    const seedResult = await seedSpecDb({
      db,
      config,
      category: CATEGORY,
      fieldRules,
      logger: null,
    });
    return await run({ db, seedResult, fieldRules });
  } finally {
    try {
      db.close();
    } catch {
      // best effort
    }
  }
}

export async function buildEnumPayloadFromSpecDb(config) {
  return withSeededSpecDb(config, async ({ db }) => buildEnumReviewPayloads({
    config,
    category: CATEGORY,
    specDb: db,
  }));
}

export async function withSeededSpecDbFixture(run, tempPrefix = 'review-db-') {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), tempPrefix));
  try {
    const fixture = await createFullFixture(tempRoot);
    return await withSeededSpecDb(
      fixture.config,
      async ({ db, seedResult, fieldRules }) => run({
        tempRoot,
        ...fixture,
        db,
        seedResult,
        fieldRules,
      }),
    );
  } finally {
    await fs.rm(tempRoot, { recursive: true, force: true });
  }
}

export async function withReviewFixture(run, tempPrefix = 'review-eco-') {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), tempPrefix));
  try {
    const fixture = await createFullFixture(tempRoot);
    return await run({ tempRoot, ...fixture });
  } finally {
    await fs.rm(tempRoot, { recursive: true, force: true });
  }
}
