'use strict';

const axios = require('axios');
const { v4: uuidv4 } = require('uuid');
const winston = require('./utils/winston');

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
    if (!ingestUrl) {
      winston.debug("(AnalyticsClient) ANALYTICS_INGEST_URL not set; skipping event_type=" + eventType);
      return;
    }

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

    // [analytics-debug] Log the POST and its outcome so dropped/rejected events
    // (e.g. ingest 422 validation failures, 503 broker-down) are visible in the
    // chatbot logs instead of being silently swallowed.
    winston.debug("(AnalyticsClient) POST /events event_type=" + eventType + " event_id=" + event.event_id, payload);

    axios.post(
      ingestUrl + '/events',
      event,
      { headers, timeout: 3000 }
    ).then((res) => {
      winston.debug("(AnalyticsClient) event accepted event_type=" + eventType + " event_id=" + event.event_id + " status=" + res.status);
    }).catch((err) => {
      // fire-and-forget: never propagate to chatbot, but log so drops are visible.
      const status = err.response ? err.response.status : undefined;
      const body = err.response ? err.response.data : undefined;
      winston.warn("(AnalyticsClient) event REJECTED/FAILED event_type=" + eventType +
        " event_id=" + event.event_id +
        " status=" + status +
        " error=" + (err.message || err) +
        " response=" + (body ? JSON.stringify(body) : '<none>'));
    });
  }
}

module.exports = { AnalyticsClient };
