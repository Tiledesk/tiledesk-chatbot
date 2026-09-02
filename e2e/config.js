'use strict';
/**
 * Where the run points. Everything is overridable by environment variable, so
 * the same suite drives staging, an on-premise install or a local dashboard.
 *
 * The defaults are the staging CDS this suite was written against:
 * https://stage.eks.tiledesk.com/cds/#/project/<project>/chatbot/<bot>/blocks
 */
const path = require('path');

const BASE_URL = (process.env.TILEDESK_BASE_URL || 'https://stage.eks.tiledesk.com')
  .replace(/\/+$/, '');
const PROJECT_ID = process.env.TILEDESK_PROJECT_ID || '6933ef86aaadea0013802b5c';
const BOT_ID = process.env.TILEDESK_BOT_ID || '6a984c524a821900143df493';

module.exports = {
  BASE_URL,
  PROJECT_ID,
  BOT_ID,

  /** The blocks canvas of the bot under test. */
  cdsBlocksUrl: `${BASE_URL}/cds/#/project/${PROJECT_ID}/chatbot/${BOT_ID}/blocks`,
  dashboardUrl: `${BASE_URL}/dashboard/#/project/${PROJECT_ID}/home`,

  /** The artefact the flow was imported from; the expectations are read off it. */
  BOT_FILE: process.env.TILEDESK_BOT_FILE
    || path.join(__dirname, '..', 'examples', 'full-flow-validation-bot.json'),

  /**
   * How long to wait for a bot reply. A block that calls out to an LLM or a
   * vendor is slow, and on staging it is slower still.
   */
  REPLY_TIMEOUT: Number(process.env.TILEDESK_REPLY_TIMEOUT || 45000),

  /** Set TILEDESK_HEADFUL=1 to watch the run. */
  HEADFUL: !!process.env.TILEDESK_HEADFUL
};
