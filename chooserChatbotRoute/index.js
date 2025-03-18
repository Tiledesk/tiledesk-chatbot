const express = require('express');
const router = express.Router();
const bodyParser = require('body-parser');
const { TiledeskClient } = require('@tiledesk/tiledesk-client');
let axios = require('axios');
const { LanguageChooser } = require('./LanguageChooser');

const app = express();

router.use(bodyParser.json({ limit: '50mb' }));
router.use(bodyParser.urlencoded({ extended: true, limit: '50mb' }));

// *******************************************************************
// ************** SELECT LANGUAGE FOR RESOLUTION BOTS ****************
// *******************************************************************

APIURL = "https://api.tiledesk.com/v3"; //process.env.API_ENDPOINT;

router.post('/lang_select', (req, res) => {
    if (req && req.body && req.body.payload && req.body.payload.message && req.body.payload.message.request && req.body.payload.message.request.snapshot) {
        delete req.body.payload.message.request.snapshot;
    }

    let intent = req.body.payload.intent.intent_display_name;
    let user_lang = req.body.payload.message.request.language;
    if (intent === 'start') {

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

        // now searching for a bot supporting the user language
        getBotIdByLang(APIURL, projectId, token, user_lang, (err, bot) => {
            if (err) {
                res.json({
                    text: "An error occurred while searching a suitable chatbot for your language 🙁 Please contact the Administrator: " + err
                });
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
                }
                else {
                    res.json({
                        text: "*Language Chooser Chatbot* didn't find a suitable chatbot 🙁 Please contact the Administrator"
                    });
                }
            }
        });
    }
    else {
        res.json({ text: "It looks like your *Language Chooser Chatbot* is misconfigured (missing 'start' intent?)" });
    }
});

function getBotIdByLang(API_URL, projectId, token, lang_iso, callback) {
    const tdclient = new TiledeskClient({ projectId: projectId, token: token, APIURL: API_URL, APIKEY: "___", log: true });
    tdclient.getAllBots((err, bots) => {
        if (err) {
            console.error("Error chooser:", err);
            callback(err, null);
            return;
        }
        chooser = new LanguageChooser();
        let bot;
        try {
            bot = chooser.findIn(bots, lang_iso);
            callback(null, bot);
        }
        catch (err) {
            console.error("Error LanguageChooser:", err);
            callback(err, null);
        }

    });
}

module.exports = { router: router };