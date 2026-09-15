const httpUtils = require("../utils/HttpUtils");
const API_ENDPOINT = process.env.API_ENDPOINT;

class AiService {

    constructor(){}

    async speechToText(url, id_project, token){
      return new Promise((resolve, reject)=> {
        const HTTPREQUEST = {
            url: `${API_ENDPOINT}/${id_project}/llm/transcription`,
            headers: {
              'Content-Type' : 'application/json',
              'Authorization': httpUtils.fixToken(token)
            },
            json: {
              url: url
            },
            method: 'POST',
            httpsOptions: this.httpsOptions
        };
        httpUtils.request(
          HTTPREQUEST,
          function(err, resbody) {
              if (err) {
                reject(err)
              }
              else {
                resolve(resbody)
              }
          }
        );
      }); 
    }

    async textToSpeech(voiceSettings, id_project, token){
      return new Promise((resolve, reject)=> {
        const HTTPREQUEST = {
          url: `${API_ENDPOINT}/${id_project}/llm/speech`,
          headers: {
            'Content-Type' : 'application/json',
            'Authorization': httpUtils.fixToken(token)
          },
          json: {
            text: voiceSettings.text,
            provider: voiceSettings.provider,
            model: voiceSettings.model,
            voice: voiceSettings.voice,
            language: voiceSettings.language,
          },
          method: 'POST',
          httpsOptions: this.httpsOptions
        };
        httpUtils.request(
          HTTPREQUEST,
          function(err, resbody) {
              if (err) {
                reject(err)
              }
              else {
                resolve(resbody)
              }
          }
        );
      })
    }




}
const aiService = new AiService();  
module.exports= aiService;