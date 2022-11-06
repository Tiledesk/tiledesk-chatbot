class StaticIntentsQueryAdapter {

  constructor() {
  }
  
  async getByExactMatch(text) {
    const intent_display_name = questions_intent[text];
    if (intent_display_name) {
      return intents[intent_display_name];
    }
    return null;
  }

  async getByNLP(text) {
    return getByExactMatch(text);
  }

  async getByIntentName(intentName) {
    return questions_intent[text];
  }
  
}