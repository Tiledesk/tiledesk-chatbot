'use strict';

const axios = require('axios');
const uuidv4 = require('uuid/v4');

class AnalyticsClient {

  /**
   * Fire-and-forget analytics event publisher.
   * Publishes to tiledesk-analytics ingest endpoint (POST /events).
   * Is a complete no-op when ANALYTICS_INGEST_URL is not set.
   *
   * @param {string} eventType  - e.g. 'chatbot.intent_matched'
   * @param {string} projectId  - Tiledesk project ID
   * @param {Object} payload    - event-specific payload (must match contracts schema)
   */
  static track(eventType, projectId, payload) {
    // Read env vars at call time so tests (and runtime reconfig) can override them.
    const ingestUrl = process.env.ANALYTICS_INGEST_URL;
    if (!ingestUrl) return;

    const event = {
      event_id:       uuidv4(),
      event_type:     eventType,
      timestamp:      new Date().toISOString(),
      id_project:     projectId,
      source_service: 'tiledesk-chatbot',
      event_version:  '1.0',
      payload:        payload
    };

    const headers = { 'Content-Type': 'application/json' };
    const apiKey = process.env.ANALYTICS_INGEST_API_KEY;
    if (apiKey) {
      headers['X-Api-Key'] = apiKey;
    }

    axios.post(
      ingestUrl + '/events',
      event,
      { headers, timeout: 3000 }
    ).catch(() => {
      // fire-and-forget: swallow all errors, never propagate to chatbot
    });
  }
}

module.exports = { AnalyticsClient };
