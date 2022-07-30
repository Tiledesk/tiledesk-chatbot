/* 
    Andrea Sponziello - (c) Tiledesk.com
*/

const axios = require('axios');

/**
 * Elastic (S3C) search
 */
class Elastic {

  /**
   * Constructor for Elastic object
   *
   * @example
   * const { Elastic } = require('./search');
   * 
   */

  constructor() {
  }

  doQuery(query, callback) {
    console.log("QUERY", query)
    const ticketapp_token = "aahfiudsbigshfdgiufhgisjhofshofdpgoiewurfu9845729483t9543nvc27t90vc895432986v30zz";
    const postConfig = {
      headers: { Authorization: `Bearer ${ticketapp_token}` }
    };


    const postBody = {
      "Titolare": "LINEAAMICA",
      "action": "query",
      "Ambito": "FO",
      "Cerca": query,
      "Risultati": 3
    };
    axios
    .post('http://lakb.s3c.it/s3netcm/KNOWLEDGE', postBody, postConfig)
    .then(response => {
      console.log('response.data:', response.data);
      if (callback) {
        let results = [];
        if (response.data && response.data.Query && response.data.Query.length > 0) {
          const values = response.data.Query;
          for (let i = 0; i < values.length; i++) {
            const title = values[i]['Titolo'];
            const id = values[i]['ID'];
            console.log("title:", title);
            console.log("id:", id);
            // results.push({title: title, path: 'https://lineaamica.azurewebsites.net/risultati-di-ricerca/d/' + id});
            results.push({title: title, path: 'https://lineaamica.gov.it/risultati-di-ricerca/d/' + id});
            console.log("results", results);
          }
        }
        callback(null, results);
      }
    })
    .catch(error => {
      console.error(error)
      callback(error, null);
    });
  }
}

module.exports = { Elastic };