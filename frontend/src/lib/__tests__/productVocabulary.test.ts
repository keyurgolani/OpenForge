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
    const required = ['profile', 'workflow', 'mission', 'run', 'artifact'] as const;
    for (const domain of required) {
      expect(EMPTY_STATE_COPY).toHaveProperty(domain);
      expect(EMPTY_STATE_COPY[domain]).toHaveProperty('title');
      expect(EMPTY_STATE_COPY[domain]).toHaveProperty('description');
      expect(EMPTY_STATE_COPY[domain]).toHaveProperty('cta');
    }
  });

  it('should have labels for all domain nouns', () => {
    const required = ['profile', 'workflow', 'mission', 'trigger', 'run', 'artifact'] as const;
    for (const domain of required) {
      expect(DOMAIN_LABELS).toHaveProperty(domain);
      expect(DOMAIN_LABELS_PLURAL).toHaveProperty(domain);
      expect(DOMAIN_DESCRIPTIONS).toHaveProperty(domain);
    }
  });

  it('should define DOMAIN_NOUNS constants', () => {
    expect(DOMAIN_NOUNS.PROFILE).toBe('profile');
    expect(DOMAIN_NOUNS.WORKFLOW).toBe('workflow');
    expect(DOMAIN_NOUNS.MISSION).toBe('mission');
    expect(DOMAIN_NOUNS.TRIGGER).toBe('trigger');
    expect(DOMAIN_NOUNS.RUN).toBe('run');
    expect(DOMAIN_NOUNS.ARTIFACT).toBe('artifact');
  });

  it('should have API prefixes for all domains', () => {
    const required = ['profile', 'workflow', 'mission', 'trigger', 'run', 'artifact'] as const;
    for (const domain of required) {
      expect(API_PREFIXES).toHaveProperty(domain);
      expect(API_PREFIXES[domain]).toMatch(/^\/api\/v1\//);
    }
  });

  it('should have route segments for all domains', () => {
    const required = ['profile', 'workflow', 'mission', 'trigger', 'run', 'artifact'] as const;
    for (const domain of required) {
      expect(ROUTE_SEGMENTS).toHaveProperty(domain);
      expect(typeof ROUTE_SEGMENTS[domain]).toBe('string');
    }
  });

  it('should not contain legacy Hand terminology in descriptions', () => {
    const allDescriptions = JSON.stringify(DOMAIN_DESCRIPTIONS).toLowerCase();
    // Allow "handle" and "handler" but not bare "hand" as a product concept
    expect(allDescriptions).not.toMatch(/\bhand\b/);
  });

  it('should have navigation items for core sections', () => {
    const navKeys = NAV_ITEMS.map((item) => item.key);
    expect(navKeys).toContain('profiles');
    expect(navKeys).toContain('workflows');
    expect(navKeys).toContain('missions');
    expect(navKeys).toContain('runs');
    expect(navKeys).toContain('artifacts');
    expect(navKeys).toContain('catalog');
  });

  it('should expose correct route keys', () => {
    expect(ROUTE_KEYS.PROFILES).toBe('/profiles');
    expect(ROUTE_KEYS.WORKFLOWS).toBe('/workflows');
    expect(ROUTE_KEYS.MISSIONS).toBe('/missions');
    expect(ROUTE_KEYS.RUNS).toBe('/runs');
    expect(ROUTE_KEYS.ARTIFACTS).toBe('/artifacts');
    expect(ROUTE_KEYS.CATALOG).toBe('/catalog');
  });

  it('helper getLabel returns correct labels', () => {
    expect(getLabel('profile')).toBe('Profile');
    expect(getLabel('profile', true)).toBe('Profiles');
    expect(getLabel('mission')).toBe('Mission');
    expect(getLabel('mission', true)).toBe('Missions');
  });

  it('helper getRouteSegment returns correct segments', () => {
    expect(getRouteSegment('profile')).toBe('profiles');
    expect(getRouteSegment('workflow')).toBe('workflows');
  });

  it('helper getApiPrefix returns correct API paths', () => {
    expect(getApiPrefix('profile')).toBe('/api/v1/profiles');
    expect(getApiPrefix('run')).toBe('/api/v1/runs');
  });

  it('helper getDescription returns non-empty descriptions', () => {
    expect(getDescription('profile').length).toBeGreaterThan(0);
    expect(getDescription('workflow').length).toBeGreaterThan(0);
  });

  it('helper getEmptyStateCopy returns valid copy', () => {
    const copy = getEmptyStateCopy('profile');
    expect(copy.title).toBeTruthy();
    expect(copy.description).toBeTruthy();
    expect(copy.cta).toBeTruthy();
  });
});
