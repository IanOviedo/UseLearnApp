---
name: session-slice-implementation
description: Implementation of session Redux slice for uselearn
metadata:
  type: project

Implemented a Redux Toolkit slice to manage session state: sessionId, current phase, and topic. Added reducers to start, advance, and reset a session, and integrated the slice into the store. Also updated the Redux provider wrapper to expose the store.

**Why:** Centralized session state allows React Query hooks and server actions to interact seamlessly.

**How to apply:** Import the store into your layout provider and use the dispatched actions throughout the app.

[[use-redux-provider-wrapper]]
