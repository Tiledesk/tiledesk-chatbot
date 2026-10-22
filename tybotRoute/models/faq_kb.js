var mongoose = require('mongoose');
var Schema = mongoose.Schema;

var Faq_kbSchema = new Schema({
  name: {
    type: String,
    required: true,
    index:true
  },
  description: {
    type: String
  },
  url: { 
    type: String
  },
  webhook_url: {
    type: String
  },
  webhook_enabled: { 
    type: Boolean,
    required: false,
    default: false,
  },
  id_project: {
    type: String,
    required: true,
    index: true
  },
  type: {
    type: String,
    default: 'internal',
    index: true
  },
  trashed: {
    type: Boolean,
    index: true
  },
  secret: {
    type: String,
    required: true,
    //default: uuidv4(),
    select: false
  },
  language: {
    type: String,
    required: false,
    default: 'en'
  },
  public: {
    type: Boolean,
    index: true
  },
  certified: {
    type: Boolean,
    index: true
  },
  mainCategory: {
    type: String,
    required: false
  },
  bigImage: {
    type: String,
    required: false
  },
  tags: {
    type: Array,
    required: false
  },
  templateFeatures: {
    type: Array,
    required: false
  },
  attributes: {
    type: Object,
  },
  /** 'v3' for an agent of the Design Studio V3 (a field of the bot since 15/10/2026, no longer `attributes.dsVersion`). */
  ds_version: {
    type: String,
    required: false
  },
  /** V3 agents: the connectors list the engine executes the flow from (ConnectorsV3). The server
   *  stores it unselected by default, so the data source asks for it explicitly. */
  connectors: {
    type: Object,
    required: false
  },
  createdBy: {
    type: String,
    required: true
  },
  score: {
    type: Number,
    required: false,
    index: true,
    default: 0
  },
},{
  timestamps: true
}
);

Faq_kbSchema.index({name: 'text', description: 'text', "tags": 'text'},  
 {"name":"faqkb_fulltext","default_language": "none","language_override": "language"}); // schema level

var faq_kb = mongoose.model('faq_kb', Faq_kbSchema);

module.exports = faq_kb
