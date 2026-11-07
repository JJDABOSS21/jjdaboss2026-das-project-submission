function copy(value) {
  return value === undefined ? undefined : structuredClone(value);
}

export function createMemoryRepository() {
  const events = new Map();
  const tiers = new Map();
  const bookings = new Map();
  const bookingReferences = new Map();

  return {
    async createEvent(event) {
      events.set(event.id, copy(event));
      return copy(event);
    },
    async getEvent(id) {
      return copy(events.get(id));
    },
    async listEvents() {
      return [...events.values()].map(copy);
    },
    async updateEvent(event) {
      if (!events.has(event.id)) return undefined;
      events.set(event.id, copy(event));
      return copy(event);
    },
    async createTier(tier) {
      tiers.set(tier.id, copy(tier));
      return copy(tier);
    },
    async getTier(id) {
      return copy(tiers.get(id));
    },
    async listTiersByEvent(eventId) {
      return [...tiers.values()].filter((tier) => tier.eventId === eventId).map(copy);
    },
    async updateTier(tier) {
      if (!tiers.has(tier.id)) return undefined;
      tiers.set(tier.id, copy(tier));
      return copy(tier);
    },
    async createBooking(booking) {
      bookings.set(booking.id, copy(booking));
      bookingReferences.set(booking.reference, booking.id);
      return copy(booking);
    },
    async getBookingByReference(reference) {
      const id = bookingReferences.get(reference);
      return copy(bookings.get(id));
    },
    async updateBooking(booking) {
      if (!bookings.has(booking.id)) return undefined;
      bookings.set(booking.id, copy(booking));
      return copy(booking);
    },
  };
}
