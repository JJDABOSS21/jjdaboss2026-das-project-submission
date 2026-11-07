import { DomainError } from '../domain/errors.js';
import { createBookingService } from '../services/bookingService.js';
import { createEventService } from '../services/eventService.js';

function requireUserId(request) {
  const userId = request.headers['x-user-id'];
  if (typeof userId !== 'string' || userId.trim() === '') {
    throw new DomainError('UNAUTHENTICATED', 'The x-user-id header is required');
  }
  return userId.trim();
}

function requireObjectBody(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw new DomainError('VALIDATION', 'Request body must be a JSON object');
  }
  return body;
}

function parseCriteria(url) {
  const criteria = {};
  for (const key of ['q', 'city', 'from', 'to']) {
    if (url.searchParams.has(key)) criteria[key] = url.searchParams.get(key);
  }
  if (url.searchParams.has('maxPriceCents')) {
    const maxPriceCents = url.searchParams.get('maxPriceCents');
    criteria.maxPriceCents = maxPriceCents.trim() === '' ? Number.NaN : Number(maxPriceCents);
  }
  if (url.searchParams.has('onlyAvailable')) {
    const onlyAvailable = url.searchParams.get('onlyAvailable');
    if (onlyAvailable !== 'true' && onlyAvailable !== 'false') {
      throw new DomainError('VALIDATION', 'onlyAvailable must be true or false');
    }
    criteria.onlyAvailable = onlyAvailable === 'true';
  }
  return criteria;
}

export function registerApiRoutes(router, repository, paymentGateway) {
  const events = createEventService(repository);
  const bookings = createBookingService(repository, paymentGateway);

  router.post('/api/events', async ({ request, body }) => ({
    status: 201,
    body: { event: await events.createEvent(body, requireUserId(request)) },
  }));
  router.post('/api/events/:id/tiers', async ({ request, params, body }) => ({
    status: 201,
    body: { tier: await events.addTier(params.id, body, requireUserId(request)) },
  }));
  router.post('/api/events/:id/publish', async ({ request, params }) => ({
    body: { event: await events.publishEvent(params.id, requireUserId(request)) },
  }));
  router.get('/api/events', async ({ request }) => {
    const url = new URL(request.url, 'http://localhost');
    return {
      body: {
        events: await events.listEvents(parseCriteria(url), url.searchParams.get('sort') ?? 'date'),
      },
    };
  });
  router.post('/api/bookings', async ({ request, body }) => ({
    status: 201,
    body: { booking: await bookings.createBooking(body, requireUserId(request)) },
  }));
  router.post('/api/bookings/:reference/pay', async ({ request, params, body }) => {
    const paymentRequest = requireObjectBody(body);
    if (paymentRequest.decline !== undefined && typeof paymentRequest.decline !== 'boolean') {
      throw new DomainError('VALIDATION', 'decline must be a boolean');
    }
    return {
      body: {
        booking: await bookings.payBooking(params.reference, requireUserId(request), {
          decline: paymentRequest.decline ?? false,
        }),
      },
    };
  });
  router.post('/api/bookings/:reference/cancel', async ({ request, params }) => ({
    body: { booking: await bookings.cancelBooking(params.reference, requireUserId(request)) },
  }));
}
