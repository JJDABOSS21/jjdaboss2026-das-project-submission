# API examples

Start the server with `npm start`. The API listens on port 3000 by default.
These examples use `curl` and shell variables; copy the event, tier and booking
IDs from each JSON response into the corresponding variable before continuing.
The `x-user-id` values stand in for authenticated users until Build 7.

## Create an event and ticket tier

```sh 
curl -i -X POST http://localhost:3000/api/events \
  -H 'content-type: application/json' \
  -H 'x-user-id: organizer-1' \
  -d '{"title":"Lagos Tech Meetup","city":"Lagos","venue":"Civic Centre","startsAt":"2026-12-05T17:00:00Z"}'
```

```sh
EVENT_ID='copy-event-id-from-response'
curl -i -X POST "http://localhost:3000/api/events/$EVENT_ID/tiers" \
  -H 'content-type: application/json' \
  -H 'x-user-id: organizer-1' \
  -d '{"name":"General","priceCents":2500,"capacity":100}'
```

## Publish and search

```sh
curl -i -X POST "http://localhost:3000/api/events/$EVENT_ID/publish" \
  -H 'x-user-id: organizer-1'
```

```sh
curl -i 'http://localhost:3000/api/events?q=tech&city=lagos&sort=price&onlyAvailable=true'
```

## Book, pay and cancel

Create a pending booking to pay:

```sh
TIER_ID='copy-tier-id-from-response'
curl -i -X POST http://localhost:3000/api/bookings \
  -H 'content-type: application/json' \
  -H 'x-user-id: attendee-1' \
  -d "{\"tierId\":\"$TIER_ID\",\"quantity\":2}"
```

Create a second pending booking to try cancellation:

```sh
curl -i -X POST http://localhost:3000/api/bookings \
  -H 'content-type: application/json' \
  -H 'x-user-id: attendee-1' \
  -d "{\"tierId\":\"$TIER_ID\",\"quantity\":1}"
```

Copy the first booking's reference and pay it:

```sh
BOOKING_REFERENCE='copy-first-booking-reference-from-response'
curl -i -X POST "http://localhost:3000/api/bookings/$BOOKING_REFERENCE/pay" \
  -H 'content-type: application/json' \
  -H 'x-user-id: attendee-1' \
  -d '{}'
```

Copy the second booking's reference and cancel it while it is unpaid:

```sh
PENDING_REFERENCE='copy-second-booking-reference-from-response'
curl -i -X POST "http://localhost:3000/api/bookings/$PENDING_REFERENCE/cancel" \
  -H 'x-user-id: attendee-1'
```

To exercise the mock decline, send `{"decline":true}` to the pay endpoint
instead. The booking stays pending and can be retried. The mock gateway accepts
no card number.
