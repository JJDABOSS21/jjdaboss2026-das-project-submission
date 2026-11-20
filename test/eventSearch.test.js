import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import {
  createStore,
  createEvent,
  addTier,
  publishEvent,
  bookTickets,
  listEventSummaries,
} from '../src/domain/inventory.js';
import { filterEvents, sortEvents, searchEvents } from '../src/domain/eventSearch.js';
import { DomainError } from '../src/domain/errors.js';

const titles = (events) => events.map((e) => e.title);
const assertCode = (fn, code) =>
  assert.throws(fn, (error) => error instanceof DomainError && error.code === code);

describe('event search', () => {
  let summaries;

  before(() => {
    const store = createStore();
    const make = (title, city, startsAt, tiers, { publish = true } = {}) => {
      const event = createEvent(store, { title, city, venue: `${city} Hall`, startsAt, organizerId: 'org' });
      const created = tiers.map((t) => addTier(store, event.id, t));
      if (publish) publishEvent(store, event.id);
      return { event, created };
    };

    make('Jazz Night', 'Lagos', '2026-12-10T19:00:00Z', [{ name: 'GA', priceCents: 3000, capacity: 50 }]);
    make('Tech Summit', 'Abuja', '2026-12-05T09:00:00Z', [
      { name: 'GA', priceCents: 10000, capacity: 100 },
      { name: 'VIP', priceCents: 25000, capacity: 10 },
    ]);
    make('Food Fair', 'Lagos', '2026-12-05T12:00:00Z', [{ name: 'Entry', priceCents: 0, capacity: 500 }]);
    const sold = make('Sold Out Gig', 'Ibadan', '2026-12-20T20:00:00Z', [
      { name: 'GA', priceCents: 5000, capacity: 2 },
    ]);
    bookTickets(store, sold.created[0].id, 'u1', 2);
    make('Secret Draft', 'Lagos', '2026-12-01T10:00:00Z', [{ name: 'GA', priceCents: 100, capacity: 5 }], {
      publish: false,
    });

    summaries = listEventSummaries(store);
  });

  it('hides drafts from the public list', () => {
    assert.equal(summaries.length, 4);
    assert.ok(!titles(summaries).includes('Secret Draft'));
  });

  it('summarises price and seats across tiers', () => {
    const summit = summaries.find((e) => e.title === 'Tech Summit');
    assert.equal(summit.minPriceCents, 10000);
    assert.equal(summit.seatsLeft, 110);
  });

  describe('filtering', () => {
    it('by city, ignoring case', () => {
      assert.deepEqual(titles(filterEvents(summaries, { city: 'lagos' })).sort(), ['Food Fair', 'Jazz Night']);
    });

    it('by text in the title or venue', () => {
      assert.deepEqual(titles(filterEvents(summaries, { q: 'SUMMIT' })), ['Tech Summit']);
      assert.deepEqual(titles(filterEvents(summaries, { q: 'ibadan hall' })), ['Sold Out Gig']);
    });

    it('by maximum price, including free events', () => {
      assert.deepEqual(titles(filterEvents(summaries, { maxPriceCents: 3000 })).sort(), ['Food Fair', 'Jazz Night']);
      assert.deepEqual(titles(filterEvents(summaries, { maxPriceCents: 0 })), ['Food Fair']);

      const noTier = { ...summaries[0], id: 'no-tier', title: 'No Tier', minPriceCents: null };
      assert.ok(!filterEvents([...summaries, noTier], { maxPriceCents: 3000 }).includes(noTier));
      assert.equal(sortEvents([...summaries, noTier], 'price').at(-1), noTier);
    });

    it('by date range, where a date-only "to" includes the whole day', () => {
      const result = filterEvents(summaries, { from: '2026-12-05', to: '2026-12-05' });
      assert.deepEqual(titles(result).sort(), ['Food Fair', 'Tech Summit']);
      const eventAtFivePm = {
        ...summaries[0],
        id: 'five-pm',
        title: 'Evening Event',
        startsAt: '2026-12-05T17:00:00.000Z',
      };
      assert.ok(filterEvents([eventAtFivePm], { from: '2026-12-05', to: '2026-12-05' }).includes(eventAtFivePm));
    });

    it('can hide sold-out events', () => {
      assert.ok(!titles(filterEvents(summaries, { onlyAvailable: true })).includes('Sold Out Gig'));
    });

    it('rejects nonsense input', () => {
      assertCode(() => filterEvents(summaries, { from: 'yesterday-ish' }), 'VALIDATION');
      assertCode(() => filterEvents(summaries, { from: '2026-02-30' }), 'VALIDATION');
      assertCode(() => filterEvents(summaries, { maxPriceCents: 2.5 }), 'VALIDATION');
      assertCode(() => filterEvents(summaries, { maxPriceCents: -5 }), 'VALIDATION');
    });

    it('returns an empty list for empty input', () => {
      assert.deepEqual(filterEvents([], { q: 'event' }), []);
    });
  });

  describe('sorting', () => {
    it('by date (default), earliest first', () => {
      assert.deepEqual(titles(sortEvents(summaries)), ['Tech Summit', 'Food Fair', 'Jazz Night', 'Sold Out Gig']);
    });

    it('breaks exact date ties by title and then id', () => {
      const sameTime = [
        { id: 'b', title: 'Beta', startsAt: '2026-12-05T17:00:00.000Z' },
        { id: 'z', title: 'Alpha', startsAt: '2026-12-05T17:00:00.000Z' },
        { id: 'a', title: 'Alpha', startsAt: '2026-12-05T17:00:00.000Z' },
      ];
      assert.deepEqual(
        sortEvents(sameTime).map((event) => event.id),
        ['a', 'z', 'b'],
      );
    });

    it('by price, cheapest first', () => {
      assert.deepEqual(titles(sortEvents(summaries, 'price')), ['Food Fair', 'Jazz Night', 'Sold Out Gig', 'Tech Summit']);
    });

    it('by availability, most seats first', () => {
      assert.deepEqual(titles(sortEvents(summaries, 'availability')), [
        'Food Fair',
        'Tech Summit',
        'Jazz Night',
        'Sold Out Gig',
      ]);
    });

    it('does not change the input and rejects unknown sort keys', () => {
      const before = structuredClone(summaries);
      const filtered = filterEvents(summaries, { city: 'lagos' });
      assert.notStrictEqual(filtered, summaries);
      sortEvents(summaries, 'price');
      assert.deepEqual(summaries, before);
      assert.deepEqual(filtered, before.filter((event) => event.city === 'Lagos'));
      assertCode(() => sortEvents(summaries, 'constructor'), 'VALIDATION');
    });

    it('returns an empty list for empty input', () => {
      assert.deepEqual(sortEvents([], 'availability'), []);
    });
  });

  it('searchEvents filters then sorts', () => {
    const result = searchEvents(summaries, { city: 'Lagos' }, 'price');
    assert.deepEqual(titles(result), ['Food Fair', 'Jazz Night']);
    assertCode(() => searchEvents(summaries, { to: '2026-02-30' }, 'price'), 'VALIDATION');
    assertCode(() => searchEvents(summaries, {}, 'unknown'), 'VALIDATION');
  });
});
