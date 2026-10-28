import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  createStore,
  createEvent,
  addTier,
  publishEvent,
  listEventSummaries,
  bookTickets,
  cancelBooking,
  joinWaitlist,
  offerNextOnWaitlist,
  findBookingByReference,
  seatsLeft,
} from '../src/domain/inventory.js';
import { DomainError } from '../src/domain/errors.js';

const throwsCode = (fn, code) =>
  assert.throws(fn, (error) => error instanceof DomainError && error.code === code);

describe('inventory', () => {
  let store;
  let event;
  let tier;

  beforeEach(() => {
    store = createStore();
    event = createEvent(store, {
      title: 'Test Event',
      city: 'Lagos',
      startsAt: '2026-12-05T17:00:00Z',
      organizerId: 'org-1',
    });
    tier = addTier(store, event.id, { name: 'General', priceCents: 2500, capacity: 3 });
  });

  describe('creating events and tiers', () => {
    it('saves a new event as a draft with an id and hides it from the public list', () => {
      const created = createEvent(store, {
        title: 'New Event',
        city: 'Abuja',
        venue: 'City Hall',
        startsAt: '2026-12-05',
        organizerId: 'org-2',
      });

      assert.ok(created.id);
      assert.equal(created.title, 'New Event');
      assert.equal(created.city, 'Abuja');
      assert.equal(created.venue, 'City Hall');
      assert.equal(created.startsAt, '2026-12-05T00:00:00.000Z');
      assert.equal(created.status, 'draft');
      assert.ok(!listEventSummaries(store).some((summary) => summary.id === created.id));
      assert.ok(listEventSummaries(store, { publishedOnly: false }).some((summary) => summary.id === created.id));
    });

    it('starts the fixture event as a draft', () => {
      assert.equal(event.status, 'draft');
    });

    it('rejects missing event fields and invalid calendar dates without saving anything', () => {
      const eventCount = store.events.size;
      throwsCode(() => createEvent(store, { title: ' ', city: 'x', startsAt: '2026-12-05' }), 'VALIDATION');
      throwsCode(() => createEvent(store, { title: 'x', city: ' ', startsAt: '2026-12-05' }), 'VALIDATION');
      throwsCode(() => createEvent(store, { title: 'x', city: 'x', startsAt: 'nope' }), 'VALIDATION');
      throwsCode(() => createEvent(store, { title: 'x', city: 'x', startsAt: '2026-02-30' }), 'VALIDATION');
      assert.equal(store.events.size, eventCount);
    });

    it('validates whole-cent prices and positive capacities', () => {
      throwsCode(() => addTier(store, event.id, { name: 'x', priceCents: 19.99, capacity: 5 }), 'VALIDATION');
      throwsCode(() => addTier(store, event.id, { name: 'x', priceCents: 100, capacity: 0 }), 'VALIDATION');
    });

    it('rejects a missing event when adding a tier', () => {
      throwsCode(() => addTier(store, 'missing-event', { name: 'General', priceCents: 100, capacity: 1 }), 'NOT_FOUND');
    });

    it('saves new tiers with zero sold and their full capacity available', () => {
      const newEvent = createEvent(store, { title: 'Another Event', city: 'Abuja', startsAt: '2026-12-06' });
      const newTier = addTier(store, newEvent.id, { name: 'General', priceCents: 500000, capacity: 100 });
      assert.equal(newTier.sold, 0);
      assert.equal(seatsLeft(newTier), 100);
    });

    it('cannot publish an event with no tiers and lists a valid published event publicly', () => {
      const empty = createEvent(store, { title: 'Empty', city: 'Abuja', startsAt: '2026-12-06' });
      throwsCode(() => publishEvent(store, empty.id), 'INVALID_STATE');
      assert.equal(publishEvent(store, event.id).status, 'published');
      assert.ok(listEventSummaries(store).some((summary) => summary.id === event.id));
      assert.ok(!listEventSummaries(store).some((summary) => summary.id === empty.id));
    });
  });

  describe('booking', () => {
    it('reduces the seats left and prices in whole cents', () => {
      publishEvent(store, event.id);
      const booking = bookTickets(store, tier.id, 'ada', 2);
      assert.equal(booking.amountCents, 5000);
      assert.equal(booking.status, 'pending');
      assert.equal(seatsLeft(tier), 1);
    });

    it('rejects a booking bigger than the seats left, and changes nothing', () => {
      bookTickets(store, tier.id, 'ada', 2);
      throwsCode(() => bookTickets(store, tier.id, 'bayo', 2), 'SOLD_OUT');
      assert.equal(seatsLeft(tier), 1);
    });

    it('lets the last ticket be booked, then reports sold out', () => {
      bookTickets(store, tier.id, 'ada', 3);
      assert.equal(seatsLeft(tier), 0);
      throwsCode(() => bookTickets(store, tier.id, 'bayo', 1), 'SOLD_OUT');
    });

    it('validates the quantity', () => {
      for (const bad of [0, -1, 1.5, 11, '2', undefined]) {
        throwsCode(() => bookTickets(store, tier.id, 'ada', bad), 'VALIDATION');
      }
    });

    it('finds a booking by its reference code', () => {
      const booking = bookTickets(store, tier.id, 'ada', 1);
      assert.match(booking.reference, /^[A-Z2-9]{8}$/);
      assert.equal(findBookingByReference(store, booking.reference), booking);
      assert.equal(findBookingByReference(store, 'NOPE0000'), undefined);
    });
  });

  describe('cancelling', () => {
    it('gives the seats back', () => {
      const booking = bookTickets(store, tier.id, 'ada', 2);
      cancelBooking(store, booking.reference);
      assert.equal(seatsLeft(tier), 3);
      assert.equal(booking.status, 'cancelled');
    });

    it('cannot be done twice (seats are released once)', () => {
      const booking = bookTickets(store, tier.id, 'ada', 2);
      cancelBooking(store, booking.reference);
      throwsCode(() => cancelBooking(store, booking.reference), 'INVALID_STATE');
      assert.equal(seatsLeft(tier), 3);
    });
  });

  describe('waitlist', () => {
    it('only opens when the tier cannot satisfy the request', () => {
      throwsCode(() => joinWaitlist(store, tier.id, 'ada', 1), 'NOT_SOLD_OUT');
      bookTickets(store, tier.id, 'bayo', 3);
      assert.deepEqual(joinWaitlist(store, tier.id, 'ada', 1), { position: 1 });
      assert.deepEqual(joinWaitlist(store, tier.id, 'chidi', 1), { position: 2 });
    });

    it('offers seats first come, first served', () => {
      const booking = bookTickets(store, tier.id, 'bayo', 3);
      joinWaitlist(store, tier.id, 'ada', 1);
      joinWaitlist(store, tier.id, 'chidi', 1);
      assert.equal(offerNextOnWaitlist(store, tier.id), undefined, 'no seats yet');
      cancelBooking(store, booking.reference);
      assert.equal(offerNextOnWaitlist(store, tier.id).userId, 'ada');
      assert.equal(offerNextOnWaitlist(store, tier.id).userId, 'chidi');
    });
  });
});
