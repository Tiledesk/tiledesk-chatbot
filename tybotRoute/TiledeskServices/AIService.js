const Utils = require('./utils')
class AiService {

    constructor(options){
        this.APIURL = options.API_ENDPOINT
        this.TOKEN = options.TOKEN
        this.PROJECT_ID = options.PROJECT_ID
    }

    async speechToText(url){
        return new Promise((resolve, reject)=> {
          const HTTPREQUEST = {
              url: `${this.APIURL}/${this.PROJECT_ID}/llm/transcription`,
              headers: {
                'Content-Type' : 'application/json',
                'Authorization': Utils.fixToken(this.TOKEN)
              },
              json: {
                url: url
              },
              method: 'POST',
              httpsOptions: this.httpsOptions
          };
          Utils.myrequest(
            HTTPREQUEST,
            function(err, resbody) {
                if (err) {
                  reject(err)
                }
                else {
                  resolve(resbody)
                }
            }, this.LOG
          );
        }); 
      }




}

module.exports= AiService