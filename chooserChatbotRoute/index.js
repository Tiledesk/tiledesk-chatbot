const express = require('express');
const router = express.Router();
const bodyParser = require('body-parser');
const { TiledeskClient } = require('@tiledesk/tiledesk-client');
let axios = require('axios');

const app = express();

router.use(bodyParser.json({ limit: '50mb' }));
router.use(bodyParser.urlencoded({ extended: true, limit: '50mb' }));

// *******************************************************************
// ************** SELECT LANGUAGE FOR RESOLUTION BOTS ****************
// *******************************************************************

APIURL = process.env.API_ENDPOINT;

router.post('/lang_select', (req, res) => {
    console.log("REQ.BODY", req.body)
    let intent = req.body.payload.intent.intent_display_name;
    let user_lang = req.body.payload.message.request.language;
    if (intent === 'start') {
        console.log("intent start")
        const projectId = req.body.payload.bot.id_project;
        const token = req.body.token;
        const requestId = req.body.payload.message.request.request_id;
        const tdclient = new TiledeskClient(
            {
                projectId: projectId,
                token: token,
                APIURL: APIURL,
                APIKEY: "___"
            }
        );

        console.log("tdclient:", tdclient);

        

        // now searching for a bot supporting the user language
        getBotIdByLang(APIURL, projectId, token, user_lang, (err, bot) => {
            if (err) {
                tdclient.sendSupportMessage(requestId,
                    {
                        text: "No chatbot found 🙁 Contact the Administrator: " + err
                    }
                );
            }
            else {
                if (bot && bot.name) {
                    let message = {  // repling with an hidden message
                        text: `\\_tdreplacebot ${bot.name}
\\_tdIntent start`,
                        attributes: {
                          subtype: 'info'
                        }
                      }
                      res.json(message);
                    // tdclient.sendSupportMessage(
                    //     requestId,
                    //     {
                    //         text: "/start"
                    //     }
                    // );
                    

                    //   tdclient.changeBot(requestId, botId, (err) => {
                    //     console.log("bot changed to", botId);
                    //   });
                }
            }
        });
    }
    else {
        res.json({ text: "I don't understand" });
    }
});

function getBotIdByLang(API_URL, projectId, token, lang_iso, callback) {
    const tdclient = new TiledeskClient({ projectId: projectId, token: token, APIURL: API_URL, APIKEY: "___", log: false });
    tdclient.getAllBots((err, bots) => {
        console.log("bots:", bots);
        if (err) {
            callback(err, null);
            return;
        }
        let selected_bot = null;
        let pivot_bot = null;
        let first_bot = null;
        for (i = 0; i < bots.length; i++) {
            const bot = bots[i];
            if (bot.language && bot.name != "_tdLanguageChooser") {
                console.log("bot.language:", bot.language);
                console.log("bot.name:", bot.name);
                console.log("lang_iso:", lang_iso);
                if (bot.language === lang_iso) {
                    console.log("Bot found:", bot.name, bot._id);
                    selected_bot = bot;
                    break;
                }
                if (bot.language === pivot_lang) {
                    pivot_bot = bot;
                }
                if (bot.description && bot.description.indexOf("#botpivot") >= 0) {
                    console.log("bot pivot found:", bot);
                    pivot_bot = bot;
                }
                if (first_bot === null) {
                    first_bot = bot;
                }
            }
        }
        if (selected_bot) {
            callback(null, selected_bot);
        }
        else if (pivot_bot) {
            callback(null, pivot_bot);
        }
        else {
            callback(null, first_bot);
        }
        
    });
}

module.exports = { router: router };