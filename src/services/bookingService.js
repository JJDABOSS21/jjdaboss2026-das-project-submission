import { DomainError } from '../domain/errors.js';
import { assertTransition } from '../domain/bookingStateMachine.js';
import { newId, referenceCode } from '../domain/ids.js';

export const MAX_TICKETS_PER_BOOKING = 10;

function requireRecord(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new DomainError('VALIDATION', 'Request body must be a JSON object');
  }
}

async function newReference(repository) {
  let reference = referenceCode();
  while (await repository.getBookingByReference(reference)) reference = referenceCode();
  return reference;
}

export function createBookingService(repository, paymentGateway) {
  return {
    async createBooking(input, userId) {
      requireRecord(input);
      const { tierId, quantity } = input;
      if (typeof tierId !== 'string' || tierId.trim() === '') {
        throw new DomainError('VALIDATION', 'tierId is required');
      }
      if (!Number.isInteger(quantity) || quantity < 1 || quantity > MAX_TICKETS_PER_BOOKING) {
        throw new DomainError('VALIDATION', `quantity must be between 1 and ${MAX_TICKETS_PER_BOOKING}`);
      }

      const tier = await repository.getTier(tierId);
      if (!tier) throw new DomainError('NOT_FOUND', 'Ticket tier not found');
      const event = await repository.getEvent(tier.eventId);
      if (!event) throw new DomainError('NOT_FOUND', 'Event not found');
      if (event.status !== 'published') {
        throw new DomainError('INVALID_STATE', 'Tickets can only be booked for published events');
      }

      const seatsLeft = tier.capacity - tier.sold;
      if (seatsLeft < quantity) {
        const message = seatsLeft === 0
          ? `${tier.name} is sold out`
          : `Only ${seatsLeft} ticket(s) left in ${tier.name}`;
        throw new DomainError('SOLD_OUT', message, { seatsLeft });
      }

      const booking = {
        id: newId(),
        reference: await newReference(repository),
        userId,
        tierId,
        quantity,
        amountCents: tier.priceCents * quantity,
        status: 'pending',
        createdAt: new Date().toISOString(),
      };
      await repository.updateTier({ ...tier, sold: tier.sold + quantity });
      return repository.createBooking(booking);
    },

    async payBooking(reference, userId, { decline = false } = {}) {
      const booking = await repository.getBookingByReference(reference);
      if (!booking) throw new DomainError('NOT_FOUND', 'Booking not found');
      if (booking.userId !== userId) {
        throw new DomainError('FORBIDDEN', 'Only the person who made the booking can pay for it');
      }
      assertTransition(booking.status, 'paid');

      const result = await paymentGateway.charge({ decline });
      if (result.status === 'declined') {
        throw new DomainError('PAYMENT_DECLINED', 'The mock payment was declined');
      }
      if (result.status !== 'succeeded') {
        throw new DomainError('PAYMENT_FAILED', 'The mock payment did not return a valid result');
      }
      return repository.updateBooking({ ...booking, status: 'paid' });
    },

    async cancelBooking(reference, userId) {
      const booking = await repository.getBookingByReference(reference);
      if (!booking) throw new DomainError('NOT_FOUND', 'Booking not found');
      if (booking.userId !== userId) {
        throw new DomainError('FORBIDDEN', 'Only the person who made the booking can cancel it');
      }
      if (booking.status !== 'pending') {
        throw new DomainError('INVALID_STATE', 'Only unpaid bookings can be cancelled');
      }
      assertTransition(booking.status, 'cancelled');

      const tier = await repository.getTier(booking.tierId);
      if (!tier) throw new DomainError('NOT_FOUND', 'Ticket tier not found');
      await repository.updateTier({ ...tier, sold: tier.sold - booking.quantity });
      return repository.updateBooking({ ...booking, status: 'cancelled' });
    },
  };
}
