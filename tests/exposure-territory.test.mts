import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  countryName,
  matchPolicy,
  normalizePolicy,
  scopeCovers,
  type WorldEvent,
} from '../shared/exposure/exposure-core.ts';
import { resolveTerritory, TERRITORY_SCOPES } from '../shared/exposure/territory-scopes.ts';

const ISO2 = /^[A-Z]{2}$/;

describe('territory scopes table', () => {
  it('holds only well-formed entries', () => {
    for (const [raw, s] of Object.entries(TERRITORY_SCOPES)) {
      for (const c of [...s.included, ...s.excluded]) assert.match(c, ISO2, `${raw}: bad code ${c}`);
      if (s.worldwide) assert.equal(s.included.length, 0, `${raw}: worldwide with an included list`);
      if (s.needsReview) {
        assert.equal(s.included.length + s.excluded.length, 0, `${raw}: needs review yet names countries`);
        assert.ok(s.caveats.length > 0, `${raw}: needs review without saying why`);
      } else {
        assert.ok(s.worldwide || s.included.length > 0, `${raw}: resolved but covers nowhere`);
      }
    }
  });
});

describe('the three RBS worldwide wordings', () => {
  const cases: Array<[string, boolean]> = [
    ['Worldwide with USA exclusions but no USA exposure', false],
    // Regression: the old regex parser missed "exclsn" and reported USA cover
    // on 1,748 policies that contractually exclude the USA.
    ['Worldwide with USA exclsn inc. only min USA expos.', false],
    ['Worldwide inc. significant USA exposure', true],
  ];
  for (const [wording, coversUS] of cases) {
    it(`${wording} → USA ${coversUS ? 'covered' : 'excluded'}, rest of world covered`, () => {
      const s = resolveTerritory(wording);
      assert.equal(s.needsReview, false);
      assert.equal(scopeCovers(s, 'US'), coversUS);
      assert.equal(scopeCovers(s, 'NG'), true);
    });
  }
});

describe('resolveTerritory', () => {
  it('resolves RBS country spellings to ISO codes', () => {
    assert.deepEqual(resolveTerritory('Nigeria').included, ['NG']);
    assert.deepEqual(resolveTerritory('UK').included, ['GB']);
    assert.deepEqual(resolveTerritory('Democratic Republic of the Congo (was Zaire)').included, ['CD']);
    assert.deepEqual(resolveTerritory('Congo').included, ['CG']);
  });

  it('never guesses: unknown, blank and null all come back as needs review', () => {
    for (const raw of ['Atlantis', '', null, undefined]) {
      const s = resolveTerritory(raw);
      assert.equal(s.needsReview, true);
      assert.equal(scopeCovers(s, 'US'), false);
    }
    assert.match(resolveTerritory('Atlantis').caveats[0] ?? '', /Atlantis/);
  });
});

describe('countryName', () => {
  it('turns codes into names an underwriter reads', () => {
    assert.equal(countryName('NG'), 'Nigeria');
    assert.equal(countryName('GB'), 'United Kingdom');
  });
});

describe('territorial-scope matcher', () => {
  const event: WorldEvent = {
    id: 't', headline: 'test', peril: 'Terrorism', triggersClasses: ['War and Terrorism'],
    countries: ['CO'], entities: [], sectors: [], occurredAt: '2026-06-15',
    sourceUrl: '', sourcePanel: 'intel',
  };
  const policy = (territory: string) => normalizePolicy({
    'Class of Business': 'Political Violence', Class: 'War and Terrorism', Territory: territory,
    'Inception Date': '01/01/2026', 'Expiry Date': '31/12/2026',
    'Policy Status': 'Bound', 'XFI-Policy Line Status': 'Signed',
  }, 'T-1');

  it('matches a single-country policy to an event in that country', () => {
    // Regression: the old parser knew only US and UK, so a Colombia policy
    // could never match a Colombia event.
    assert.equal(matchPolicy(policy('Colombia'), event).matched, true);
  });

  it('does not match an event outside the territory', () => {
    assert.equal(matchPolicy(policy('Chile'), event).matched, false);
  });

  it('does not match a US event on a policy that excludes the USA', () => {
    const m = matchPolicy(policy('Worldwide with USA exclsn inc. only min USA expos.'), { ...event, countries: ['US'] });
    assert.equal(m.matched, false);
    assert.match(m.reasons.find((r) => r.test === 'Country within territorial scope')?.detail ?? '', /EXCLUDED/);
  });

  it('never matches a territory RBS cannot place', () => {
    assert.equal(matchPolicy(policy('As per Dec'), event).matched, false);
  });
});
