import { describe, it, expect } from 'vitest';

import {
  DOMAIN_LABELS,
  DOMAIN_LABELS_PLURAL,
  DOMAIN_NOUNS,
  DOMAIN_DESCRIPTIONS,
  EMPTY_STATE_COPY,
  API_PREFIXES,
  ROUTE_SEGMENTS,
  NAV_ITEMS,
  ROUTE_KEYS,
  getLabel,
  getRouteSegment,
  getApiPrefix,
  getDescription,
  getEmptyStateCopy,
} from '../productVocabulary';

describe('Product Vocabulary', () => {
  it('should not contain legacy terminology in empty state copy', () => {
    const copy = JSON.stringify(EMPTY_STATE_COPY);
    expect(copy).not.toContain('agent definition');
    expect(copy).not.toContain('AgentDefinition');
    expect(copy).not.toContain('Phase ');
    expect(copy).not.toContain('legacy');
  });

  it('should have empty state copy for all core domains', () => {
    const required = ['agent', 'automation', 'run', 'output'] as const;
    for (const domain of required) {
      expect(EMPTY_STATE_COPY).toHaveProperty(domain);
      expect(EMPTY_STATE_COPY[domain]).toHaveProperty('title');
      expect(EMPTY_STATE_COPY[domain]).toHaveProperty('description');
      expect(EMPTY_STATE_COPY[domain]).toHaveProperty('cta');
    }
  });

  it('should have labels for all domain nouns', () => {
    const required = ['agent', 'automation', 'run', 'output'] as const;
    for (const domain of required) {
      expect(DOMAIN_LABELS).toHaveProperty(domain);
      expect(DOMAIN_LABELS_PLURAL).toHaveProperty(domain);
      expect(DOMAIN_DESCRIPTIONS).toHaveProperty(domain);
    }
  });

  it('should define DOMAIN_NOUNS constants', () => {
    expect(DOMAIN_NOUNS.AGENT).toBe('agent');
    expect(DOMAIN_NOUNS.AUTOMATION).toBe('automation');
    expect(DOMAIN_NOUNS.RUN).toBe('run');
    expect(DOMAIN_NOUNS.OUTPUT).toBe('output');
  });

  it('should have API prefixes for all domains', () => {
    const required = ['agent', 'automation', 'run', 'output'] as const;
    for (const domain of required) {
      expect(API_PREFIXES).toHaveProperty(domain);
      expect(API_PREFIXES[domain]).toMatch(/^\/api\/v1\//);
    }
  });

  it('should have route segments for all domains', () => {
    const required = ['agent', 'automation', 'run', 'output'] as const;
    for (const domain of required) {
      expect(ROUTE_SEGMENTS).toHaveProperty(domain);
      expect(typeof ROUTE_SEGMENTS[domain]).toBe('string');
    }
  });

  it('should not contain legacy Hand terminology in descriptions', () => {
    const allDescriptions = JSON.stringify(DOMAIN_DESCRIPTIONS).toLowerCase();
    expect(allDescriptions).not.toMatch(/\bhand\b/);
  });

  it('should have navigation items for core sections', () => {
    const navKeys = NAV_ITEMS.map((item) => item.key);
    expect(navKeys).toContain('agents');
    expect(navKeys).toContain('automations');
    expect(navKeys).toContain('runs');
    expect(navKeys).toContain('outputs');
  });

  it('should expose correct route keys', () => {
    expect(ROUTE_KEYS.AGENTS).toBe('/agents');
    expect(ROUTE_KEYS.AUTOMATIONS).toBe('/automations');
    expect(ROUTE_KEYS.RUNS).toBe('/runs');
    expect(ROUTE_KEYS.OUTPUTS).toBe('/outputs');
  });

  it('helper getLabel returns correct labels', () => {
    expect(getLabel('agent')).toBe('Agent');
    expect(getLabel('agent', true)).toBe('Agents');
    expect(getLabel('automation')).toBe('Automation');
    expect(getLabel('automation', true)).toBe('Automations');
  });

  it('helper getRouteSegment returns correct segments', () => {
    expect(getRouteSegment('agent')).toBe('agents');
    expect(getRouteSegment('automation')).toBe('automations');
  });

  it('helper getApiPrefix returns correct API paths', () => {
    expect(getApiPrefix('agent')).toBe('/api/v1/agents');
    expect(getApiPrefix('run')).toBe('/api/v1/runs');
  });

  it('helper getDescription returns non-empty descriptions', () => {
    expect(getDescription('agent').length).toBeGreaterThan(0);
    expect(getDescription('automation').length).toBeGreaterThan(0);
  });

  it('helper getEmptyStateCopy returns valid copy', () => {
    const copy = getEmptyStateCopy('agent');
    expect(copy.title).toBeTruthy();
    expect(copy.description).toBeTruthy();
    expect(copy.cta).toBeTruthy();
  });
});
