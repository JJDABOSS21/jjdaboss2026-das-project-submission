import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createAppServer } from '../src/http/app.js';

describe('REST API', () => {
  let server;
  let baseUrl;
  const paymentRequests = [];

  before(async () => {
    server = createAppServer({
      paymentGateway: {
        async charge(request) {
          paymentRequests.push(request);
          return request.decline ? { status: 'declined' } : { status: 'succeeded' };
        },
      },
    });
    await new Promise((resolve, reject) => {
      server.once('error', reject);
      server.listen(0, '127.0.0.1', resolve);
    });
    baseUrl = `http://127.0.0.1:${server.address().port}`;
  });

  after(async () => {
    await new Promise((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  });

  async function call(path, { method = 'GET', userId, body } = {}) {
    const headers = {};
    if (userId) headers['x-user-id'] = userId;
    if (body !== undefined) headers['content-type'] = 'application/json';
    const response = await fetch(`${baseUrl}${path}`, {
      method,
      headers,
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    return { status: response.status, body: await response.json() };
  }

  it('creates, publishes, searches, books, pays and cancels using real HTTP requests', async () => {
    const missingIdentity = await call('/api/events', {
      method: 'POST',
      body: { title: 'No owner', city: 'Lagos', startsAt: '2026-12-05' },
    });
    assert.equal(missingIdentity.status, 401);
    assert.equal(missingIdentity.body.error.code, 'UNAUTHENTICATED');

    const invalidEvent = await call('/api/events', {
      method: 'POST',
      userId: 'organizer-1',
      body: { title: 'Invalid date', city: 'Lagos', startsAt: '2026-02-30' },
    });
    assert.equal(invalidEvent.status, 400);
    assert.equal(invalidEvent.body.error.code, 'VALIDATION');

    const created = await call('/api/events', {
      method: 'POST',
      userId: 'organizer-1',
      body: {
        title: 'Lagos Tech Meetup',
        city: 'Lagos',
        venue: 'Civic Centre',
        startsAt: '2026-12-05T17:00:00Z',
      },
    });
    assert.equal(created.status, 201);
    const eventId = created.body.event.id;
    assert.equal(created.body.event.status, 'draft');
    assert.deepEqual((await call('/api/events')).body.events, []);

    const noTiers = await call(`/api/events/${eventId}/publish`, {
      method: 'POST',
      userId: 'organizer-1',
    });
    assert.equal(noTiers.status, 409);
    assert.equal(noTiers.body.error.code, 'INVALID_STATE');

    const invalidTier = await call(`/api/events/${eventId}/tiers`, {
      method: 'POST',
      userId: 'organizer-1',
      body: { name: 'General', priceCents: 2.5, capacity: 3 },
    });
    assert.equal(invalidTier.status, 400);
    assert.equal(invalidTier.body.error.code, 'VALIDATION');

    const tierResult = await call(`/api/events/${eventId}/tiers`, {
      method: 'POST',
      userId: 'organizer-1',
      body: { name: 'General', priceCents: 2500, capacity: 3 },
    });
    assert.equal(tierResult.status, 201);
    const tierId = tierResult.body.tier.id;
    assert.equal(tierResult.body.tier.sold, 0);

    const forbiddenPublish = await call(`/api/events/${eventId}/publish`, {
      method: 'POST',
      userId: 'someone-else',
    });
    assert.equal(forbiddenPublish.status, 403);
    assert.equal(forbiddenPublish.body.error.code, 'FORBIDDEN');

    const published = await call(`/api/events/${eventId}/publish`, {
      method: 'POST',
      userId: 'organizer-1',
    });
    assert.equal(published.body.event.status, 'published');

    const search = await call('/api/events?q=TECH&city=lagos&maxPriceCents=2500&sort=price');
    assert.equal(search.status, 200);
    assert.equal(search.body.events.length, 1);
    assert.equal(search.body.events[0].id, eventId);
    assert.equal(search.body.events[0].minPriceCents, 2500);

    const invalidSearch = await call('/api/events?from=not-a-date');
    assert.equal(invalidSearch.status, 400);
    assert.equal(invalidSearch.body.error.code, 'VALIDATION');

    const firstBooking = await call('/api/bookings', {
      method: 'POST',
      userId: 'attendee-1',
      body: { tierId, quantity: 2 },
    });
    assert.equal(firstBooking.status, 201);
    const firstReference = firstBooking.body.booking.reference;
    assert.equal(firstBooking.body.booking.amountCents, 5000);
    assert.equal(firstBooking.body.booking.status, 'pending');

    const unauthorizedPayment = await call(`/api/bookings/${firstReference}/pay`, {
      method: 'POST',
      userId: 'attendee-2',
      body: {},
    });
    assert.equal(unauthorizedPayment.status, 403);
    assert.equal(unauthorizedPayment.body.error.code, 'FORBIDDEN');

    const declined = await call(`/api/bookings/${firstReference}/pay`, {
      method: 'POST',
      userId: 'attendee-1',
      body: { decline: true },
    });
    assert.equal(declined.status, 402);
    assert.equal(declined.body.error.code, 'PAYMENT_DECLINED');

    const paid = await call(`/api/bookings/${firstReference}/pay`, {
      method: 'POST',
      userId: 'attendee-1',
      body: {},
    });
    assert.equal(paid.status, 200);
    assert.equal(paid.body.booking.status, 'paid');
    assert.deepEqual(paymentRequests, [{ decline: true }, { decline: false }]);

    const paidAgain = await call(`/api/bookings/${firstReference}/pay`, {
      method: 'POST',
      userId: 'attendee-1',
      body: {},
    });
    assert.equal(paidAgain.body.error.code, 'INVALID_TRANSITION');
    assert.equal(paymentRequests.length, 2);

    const unpaidBooking = await call('/api/bookings', {
      method: 'POST',
      userId: 'attendee-1',
      body: { tierId, quantity: 1 },
    });
    const cancelled = await call(`/api/bookings/${unpaidBooking.body.booking.reference}/cancel`, {
      method: 'POST',
      userId: 'attendee-1',
    });
    assert.equal(cancelled.status, 200);
    assert.equal(cancelled.body.booking.status, 'cancelled');

    const payCancelled = await call(`/api/bookings/${unpaidBooking.body.booking.reference}/pay`, {
      method: 'POST',
      userId: 'attendee-1',
      body: {},
    });
    assert.equal(payCancelled.body.error.code, 'INVALID_TRANSITION');

    const soldOut = await call('/api/bookings', {
      method: 'POST',
      userId: 'attendee-2',
      body: { tierId, quantity: 2 },
    });
    assert.equal(soldOut.status, 409);
    assert.equal(soldOut.body.error.code, 'SOLD_OUT');

    const forbiddenCancel = await call(`/api/bookings/${firstReference}/cancel`, {
      method: 'POST',
      userId: 'attendee-2',
    });
    assert.equal(forbiddenCancel.status, 403);
    assert.equal(forbiddenCancel.body.error.code, 'FORBIDDEN');
  });
});
