// WHY: Boundary contract — every entry in MODULE_SETTINGS_SECTIONS must have
// a matching form component in MODULE_SETTINGS_FORMS, and vice versa.
// Catches a missed registry field or stale codegen at test time, before the
// browser silently renders a "no settings form registered" placeholder.

import { describe, it } from 'node:test';
import { strictEqual, ok } from 'node:assert';
import {
  MODULE_SETTINGS_SECTIONS,
  MODULE_SETTINGS_FORMS,
} from '../moduleSettingsSections.generated.ts';

describe('module settings forms contract', () => {
  it('every section moduleId has a registered form component', () => {
    for (const section of MODULE_SETTINGS_SECTIONS) {
      const Form = MODULE_SETTINGS_FORMS[section.moduleId];
      ok(Form, `Missing form for moduleId="${section.moduleId}" (section "${section.id}")`);
      strictEqual(typeof Form, 'object', `Form for "${section.moduleId}" must be a React lazy component (object)`);
    }
  });

  it('every form key has a matching section moduleId (no orphan forms)', () => {
    const sectionIds = new Set(MODULE_SETTINGS_SECTIONS.map((s) => s.moduleId));
    for (const formKey of Object.keys(MODULE_SETTINGS_FORMS)) {
      ok(sectionIds.has(formKey), `Orphan form registered for "${formKey}" — no matching section`);
    }
  });

  it('section/form sets are equal in size', () => {
    strictEqual(
      MODULE_SETTINGS_SECTIONS.length,
      Object.keys(MODULE_SETTINGS_FORMS).length,
      'Section count must equal form count',
    );
  });
});
