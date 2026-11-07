import { newId } from '../domain/ids.js';
import { DomainError } from '../domain/errors.js';
import { parseIsoDate } from '../domain/dateUtils.js';
import { searchEvents, summarizeEvent } from '../domain/eventSearch.js';

function requireRecord(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new DomainError('VALIDATION', 'Request body must be a JSON object');
  }
}

function requireText(value, field) {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new DomainError('VALIDATION', `${field} is required`);
  }
  return value.trim();
}

function requireWholeNumber(value, field, minimum) {
  if (!Number.isInteger(value) || value < minimum) {
    throw new DomainError('VALIDATION', `${field} must be a whole number of at least ${minimum}`);
  }
  return value;
}

export function createEventService(repository) {
  return {
    async createEvent(input, organizerId) {
      requireRecord(input);
      const startsAt = new Date(parseIsoDate(input.startsAt, 'startsAt')).toISOString();
      return repository.createEvent({
        id: newId(),
        organizerId,
        title: requireText(input.title, 'Title'),
        city: requireText(input.city, 'City'),
        venue: input.venue === undefined ? '' : String(input.venue).trim(),
        startsAt,
        status: 'draft',
        tierIds: [],
      });
    },

    async addTier(eventId, input, organizerId) {
      requireRecord(input);
      const event = await repository.getEvent(eventId);
      if (!event) throw new DomainError('NOT_FOUND', 'Event not found');
      if (event.organizerId !== organizerId) {
        throw new DomainError('FORBIDDEN', 'Only the event organizer can add ticket tiers');
      }

      const tier = {
        id: newId(),
        eventId,
        name: requireText(input.name, 'Tier name'),
        priceCents: requireWholeNumber(input.priceCents, 'priceCents', 0),
        capacity: requireWholeNumber(input.capacity, 'capacity', 1),
        sold: 0,
      };
      const createdTier = await repository.createTier(tier);
      await repository.updateEvent({ ...event, tierIds: [...event.tierIds, tier.id] });
      return createdTier;
    },

    async publishEvent(eventId, organizerId) {
      const event = await repository.getEvent(eventId);
      if (!event) throw new DomainError('NOT_FOUND', 'Event not found');
      if (event.organizerId !== organizerId) {
        throw new DomainError('FORBIDDEN', 'Only the event organizer can publish it');
      }
      if ((await repository.listTiersByEvent(eventId)).length === 0) {
        throw new DomainError('INVALID_STATE', 'Add at least one ticket tier before publishing');
      }
      return repository.updateEvent({ ...event, status: 'published' });
    },

    async listEvents(criteria = {}, sortBy = 'date') {
      const events = (await repository.listEvents()).filter((event) => event.status === 'published');
      const summaries = await Promise.all(
        events.map(async (event) => summarizeEvent(event, await repository.listTiersByEvent(event.id))),
      );
      return searchEvents(summaries, criteria, sortBy);
    },
  };
}
