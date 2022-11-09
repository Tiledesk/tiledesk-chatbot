class StaticIntentsDataSource {

  constructor(intents) {
    if (intents) {
      this.data = intents;
    }
  }
  
  // let faqs = await this.intentsDataSource.getByExactMatch(message.text);
  // let faq = await this.intentsDataSource.getByIntentDisplayName(display_name);
  // let intents = await this.intentsFinder.find(message.text);

  async getByExactMatch(text) {
    const intent_display_name = this.data.questions_intent[text];
    if (intent_display_name) {
      return this.data.intents[intent_display_name];
    }
    return null;
  }

  /**
   * intentsFinder Adapter
   * @param {String} text 
   * @returns the matching intents array
   */
  async find(text) {
    return this.data.intents_nlp[text];
  }

  async getByIntentDisplayName(intentName) {
    return this.data.intents[intentName];
  }
  
}

// const defaultIntentsDataSource = {
//   "intents": {
//     "intent1": {
//       intent_display_name: "intent1",
//       questions: [
//         "intent1 question1",
//         "intent1 question2"
//       ],
//       answer: "reply to intent1"
//     },
//     "intent2": {
//       intent_display_name: "intent1",
//       questions: [
//         "intent2 question1",
//         "intent2 question2"
//       ],
//       answer: "reply to intent2"
//     },
//     "intent3": {
//       intent_display_name: "intent3",
//       questions: [
//         "intent3 question1",
//         "intent3 question2"
//       ],
//       answer: "reply to intent3"
//     }
//   },
//   "questions_intent": {
  
//     "intent1 question1": "intent1",
//     "intent1 question2": "intent1",
    
//     "intent2 question1": "intent2",
//     "intent2 question2": "intent2",
  
//     "intent3 question1": "intent3",
//     "intent3 question2": "intent3"
//   },
//   "intents_nlp" : {
//       "query1": {
//           "name": "intent1"
//       },
//       "query2": {
//           "name": "intent2"
//       }
//   }
// }

module.exports = { StaticIntentsDataSource }