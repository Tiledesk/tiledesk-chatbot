class StaticIntentsDataSource {

  constructor(intentsDataSource) {
    if (intentsDataSource) {
      this.intentsDataSource = intentsDataSource;
    }
    else {
      this.intentsDataSource = defaultIntentsSataSource;
    }
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

const defaultIntentsSataSource = {
  "intents" = {
    "intent1": {
      intent_display_name: "intent1",
      questions: [
        "intent1 question1",
        "intent1 question2"
      ],
      answer: "reply to intent1"
    },
    "intent2": {
      intent_display_name: "intent1",
      questions: [
        "intent2 question1",
        "intent2 question2"
      ],
      answer: "reply to intent2"
    },
    "intent3": {
      intent_display_name: "intent3",
      questions: [
        "intent3 question1",
        "intent3 question2"
      ],
      answer: "reply to intent3"
    }
  },
  "questions_intent": {
  
    "intent1 question1": "intent1",
    "intent1 question2": "intent1",
    
    "intent2 question1": "intent2",
    "intent2 question2": "intent2",
  
    "intent3 question1": "intent3",
    "intent3 question2": "intent3"
  }
}

    
const intents = {
  "intent1": {
    intent_display_name: "intent1",
    questions: [
      "intent1 question1",
      "intent1 question2"
    ],
    answer: "reply to intent1"
  },
  "intent2": {
    intent_display_name: "intent1",
    questions: [
      "intent2 question1",
      "intent2 question2"
    ],
    answer: "reply to intent2"
  },
  "intent3": {
    intent_display_name: "intent3",
    questions: [
      "intent3 question1",
      "intent3 question2"
    ],
    answer: "reply to intent3"
  }
}

const questions_intent = {
  
  "intent1 question1": "intent1",
  "intent1 question2": "intent1",
  
  "intent2 question1": "intent2",
  "intent2 question2": "intent2",

  "intent3 question1": "intent3",
  "intent3 question2": "intent3"
}

module.exports = { StaticIntentsDataSource }