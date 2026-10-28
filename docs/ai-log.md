# AI log

Every time you give an AI tool a significant prompt, add an entry. Three lines each.
"Nothing was wrong" is allowed, but it is rarely true. Your instructor will read this.

## Build 2

### Prompt 1: Build 2 prompt (docs/build-2.md)
- **What I asked:**Write a custom, stable mergeSort routine within src/domain/sorting.js without leveraging standard Array.prototype.sort. It must guarantee pure input safe and return standalone arrays.
Develop inventory state routines (publishEvent and listEventSummaries) verifying that an event with no ticket tiers throws an INVALID_STATE error when published, and ensuring that draft records are filtered properly out of public summary queries.
Establish a domain searching pipeline inside src/domain/eventSearch.js using pure functional paradigms. This module needs to support flexible filtration flags (q, city, from, to, maxPriceCents, onlyAvailable) with explicit VALIDATION errors for corrupt inputs, along with a sortEvents method utilizing your mergeSort logic with dynamic tie-breaking mechanics.
Supply automated testing verification scripts in the test/ space running via native node:test frameworks covering standard execution logic, performance rules, stability boundaries, and error codes (INVALID_STATE, VALIDATION, NOT_FOUND).
Wire up the project execution layer by mapping an "npm test" command configuration to the workspace package.json file.
- **What came back:**• A standard domain exception class blueprint handling codes like VALIDATION and INVALID_STATE.A pure, custom divide-and-conquer stable merge sort routine. The implementation uses a non-shifting tracking index and structural copies to prevent array mutations.publishEvent which enforces tier checking rules, alongside listEventSummaries which derives computed properties (such as the minimum price tier and remaining seat totals) while honoring the publishedOnly draft safety rule.
 Offers decoupled functional lookup pipelines. Case-insensitive string inspections manage text filters safely, and date bounds handle exact matching logic (including complete calendar days for dates structured as YYYY-MM-DD).
 A rigorous, structured validation harness that runs natively without package bloat. It verifies correct error code triggers, query parameters, tie-breakers, and data immutability.
An upgraded application manifest that sets up standard test runtime operations via the npm test script interface.
- **What was wrong (or "nothing"):**The Helper was unsure about no remaining rules . Left pre-existing changes to build-2.md, index.html.

### Prompt 2:
- **What I asked:**
- **What came back:**
- **What was wrong (or "nothing"):**

## Build 3

### Prompt 1: Build 3 prompt (docs/build-3.md)
- **What I asked:** Add the architecture diagrams, booking state machine, Node HTTP router/server, configuration, startup script, and tests.
- **What came back:** A layered architecture document, explicit booking transitions, static-file HTTP server, `/health` route, startup configuration, and `node:test` coverage.
- **What was wrong (or "nothing"):** The first server draft relied on an implicit response/request property for HEAD handling and had redundant error-status logic; both were simplified. Added a regression test proving static requests cannot escape `public/`.
